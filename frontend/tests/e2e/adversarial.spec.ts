// Independent adversarial review of the studio and the generated pages in a real browser.
// `test.fail` marks a CONFIRMED defect (strict xfail: it passes only while the defect is present; once
// fixed it fails and the marker must be removed). Tests named "held" are claims attacked that survived.
// Runs against the local production preview, or the live site when E2E_BASE_URL is set. Most checks run
// in one project only to keep the suite fast. Ids match the review report.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Frame, type Page, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const only = (project: string) => test.skip(test.info().project.name !== project, `runs in ${project} only`);

async function openStudio(page: Page, hash = "") {
  await page.goto(`./${hash}`);
  await expect(page.locator(".mm-stage-status")).toContainText(/exported page itself|reduced motion/, { timeout: 15_000 });
}

async function previewFrame(page: Page): Promise<Frame> {
  const handle = await page.locator(".mm-stage .mm-frame iframe").elementHandle();
  const frame = await handle!.contentFrame();
  await frame!.waitForLoadState();
  return frame!;
}

/** Text, hover and focus contrast of everything visible on a generated page, measured from computed styles. */
const MEASURE = () => {
  type C = { r: number; g: number; b: number; a: number };
  const parse = (c: string): C | null => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const [r = 0, g = 0, b = 0, a = 1] = (m[1] as string).split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = (c: C) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a: C, b: C) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const bgOf = (el: Element | null): C => {
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const label = (el: Element) => `${el.tagName.toLowerCase()}.${el.className || ""} "${(el.textContent ?? "").trim().slice(0, 24)}"`;
  const textFails = (root: ParentNode) => [...root.querySelectorAll("body *")].filter((el) => {
    if (el.closest("svg")) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    return [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
  }).flatMap((el) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || Number(s.opacity) === 0) return [];
    const v = ratio(parse(s.color)!, bgOf(el));
    return v < 4.5 ? [`${label(el)} ${v.toFixed(2)}`] : [];
  });
  const borderFail = (el: Element) => {
    const s = getComputedStyle(el);
    const c = parse(s.borderTopColor);
    if (!c || c.a === 0 || s.borderTopStyle === "none" || parseFloat(s.borderTopWidth) === 0) return null;
    const bg = parse(s.backgroundColor);
    // A filled button needs its fill or its edge to stand out from the page (WCAG 1.4.11).
    const v = Math.max(ratio(c, bgOf(el.parentElement)), bg && bg.a > 0 ? ratio(bg, bgOf(el.parentElement)) : 0);
    return v < 3 ? `${label(el)} edge ${v.toFixed(2)}` : null;
  };
  const ringFail = (el: Element) => {
    const s = getComputedStyle(el);
    if (s.outlineStyle === "none" || parseFloat(s.outlineWidth) === 0) return `${label(el)} no ring`;
    const v = ratio(parse(s.outlineColor)!, bgOf(el.parentElement));
    return v < 3 ? `${label(el)} ring ${v.toFixed(2)}` : null;
  };
  (window as unknown as Record<string, unknown>).__mms = { textFails, borderFail, ringFail, label };
};

/** Composes and builds pages with the engine in a separate Node process (the same build the studio runs). */
function buildPages(specs: unknown[]): string[] {
  const engine = resolve(process.cwd(), "src/engine");
  const url = (f: string) => JSON.stringify(pathToFileURL(join(engine, f)).href);
  const code = `
    const { compose } = await import(${url("compose.ts")});
    const { build } = await import(${url("build-core.js")});
    const { createHash } = await import("node:crypto");
    let input = ""; for await (const c of process.stdin) input += c;
    const out = [];
    for (const s of JSON.parse(input)) out.push((await build(compose(s).files, async (t) => createHash("sha256").update(t, "utf8").digest("base64")))["dist/index.html"]);
    process.stdout.write(JSON.stringify(out));`;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code], { input: JSON.stringify(specs), cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 }).toString()) as string[];
}

const SAMPLE_SPEC = () => JSON.parse(readFileSync(resolve(process.cwd(), "../fixtures/requests/sample.json"), "utf8")).spec;

// =================================================================================================
// Confirmed defects (strict xfail)
// =================================================================================================

test("MMS-01: one long word in a brief field (a German compound item title) makes the generated page scroll sideways at 390 px", async ({ page }) => {
  only("mobile-390");
  await openStudio(page);
  const word = "Donaudampfschifffahrtsgesellschaftskapitän"; // 42 characters, within the 48-character limit
  await page.getByLabel("Title", { exact: true }).first().fill(word);
  await expect.poll(async () => (await previewFrame(page)).evaluate(() => document.querySelector(".item h3")?.textContent), { timeout: 10_000 }).toBe(word);
  const frame = await previewFrame(page);
  expect(await frame.evaluate(() => innerWidth)).toBe(390);
  const overflow = await frame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the 390 px page must not scroll horizontally").toBeLessThanOrEqual(0);
});

// Fixed (was strict xfail).
test("MMS-02: the history review table says 'not recorded' for overflow, keyboard and reduced motion although review.json records them", async ({ page }) => {
  only("desktop-1440");
  const snap = await (await page.request.get("./data/snapshot.json")).json();
  const review = await (await page.request.get(`./data/runs/${snap.latest_run_id}/review.json`)).json();
  // The run did record all three (these hold).
  expect(review.widths.every((w: Record<string, unknown>) => typeof w.overflow_px === "number" && typeof w.details_keyboard_ok === "number")).toBe(true);
  expect(typeof review.flags.reduced_motion).toBe("boolean");
  await page.goto("./#/history");
  const table = page.getByRole("region", { name: "Review results" });
  await expect(table.locator("tbody tr")).toHaveCount(review.widths.length);
  await expect(table).not.toContainText("not recorded", { timeout: 2000 });
});

// Fixed (was strict xfail).
test("MMS-03: 'Next: <step>' moves keyboard focus to a heading that is scrolled thousands of pixels out of view", async ({ page }) => {
  only("mobile-390");
  await openStudio(page);
  await page.getByRole("link", { name: "Next: Palette" }).focus();
  await page.keyboard.press("Enter");
  const heading = page.getByRole("heading", { level: 2, name: "Palette" });
  await expect(heading).toBeFocused();
  const box = await heading.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
  expect(box.bottom > 0 && box.top < box.vh, `focused heading at top=${Math.round(box.top)} of a ${box.vh} px viewport`).toBe(true);
});

// Fixed (was strict xfail).
test("MMS-04: the announcement line renders on Studio and Shopfront pages but its field is offered only for Launch", async ({ page }) => {
  only("desktop-1440");
  await openStudio(page);
  const frame = await previewFrame(page);
  await expect(frame.locator(".note")).toHaveText("Booking surveys for spring planting now");
  // The text is on the page; there must be a control to change or remove it.
  await expect(page.getByLabel("Announcement")).toHaveCount(1, { timeout: 2000 });
});

// Fixed (was strict xfail).
test("MMS-06: where the stage is shown first (768 px), its controls come after the whole control column in tab order", async ({ page }) => {
  only("tablet-768");
  await openStudio(page);
  const visual = await page.evaluate(() => ({ stage: document.querySelector(".mm-stage")!.getBoundingClientRect().top, steps: document.querySelector(".mm-steps")!.getBoundingClientRect().top }));
  expect(visual.stage).toBeLessThan(visual.steps); // the stage is above the steps on screen
  let firstStep = -1;
  let firstStage = -1;
  // Fixed (was strict xfail): the loop runs until both regions are reached, so a stage that is reached
  // first (the fixed order) is compared with the step list instead of leaving firstStep at -1.
  for (let i = 0; i < 120 && (firstStage < 0 || firstStep < 0); i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => (document.activeElement?.closest(".mm-steps") ? "steps" : document.activeElement?.closest(".mm-stage") ? "stage" : ""));
    if (where === "steps" && firstStep < 0) firstStep = i;
    if (where === "stage") firstStage = i;
  }
  expect(firstStage, "stage controls should be reached before the step list that sits below them").toBeLessThan(firstStep);
});

// Fixed (was strict xfail).
test("MMS-07: studio controls are 36 to 41 px tall on the 390 px touch layout, below the 44 px the design contract promises", async ({ page }) => {
  only("mobile-390");
  await openStudio(page, "#/studio/components");
  const small = await page.evaluate(() => [...document.querySelectorAll(".mm-segmented button, .mm-btn, .mm-switch")]
    .map((el) => ({ text: (el.textContent ?? "").trim().slice(0, 20), h: Math.round(el.getBoundingClientRect().height) }))
    .filter((x) => x.h > 0 && x.h < 44));
  expect(small).toEqual([]);
});

// Fixed (was strict xfail).
test("MMS-08: segmented control groups (buttons, surfaces, corners, header, mode, template, device) have no visible label", async ({ page }) => {
  only("desktop-1440");
  await openStudio(page, "#/studio/components");
  const groups = await page.locator(".mm-panel .mm-segmented").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(groups).toEqual(["Buttons", "Surfaces", "Corners", "Header"]);
  for (const name of groups) await expect(page.locator(".mm-panel").getByText(name, { exact: true })).toBeVisible({ timeout: 1000 });
});

// Fixed (was strict xfail).
test("MMS-09: a malformed deep link (#/history/%E0) throws in the router and blanks the whole site", async ({ page }) => {
  only("desktop-1440");
  await page.goto("./#/history/%E0");
  await expect(page.getByRole("link", { name: "Minimal Motion Studio" })).toBeVisible({ timeout: 4000 });
});

test("MMS-10: the 'Still' preset says nothing moves on press, but the button still jumps and shrinks when pressed", async ({ page }) => {
  only("desktop-1440");
  await openStudio(page, "#/studio/motion");
  await page.locator(".mm-preset", { hasText: "Still" }).click();
  await expect.poll(async () => (await previewFrame(page)).evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--m-preset").trim())).toBe("still");
  const frame = await previewFrame(page);
  const cta = frame.locator(".hero .btn");
  await cta.hover();
  await page.mouse.down();
  const transform = await cta.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.up();
  expect(transform).toBe("none");
});

// Fixed (was strict xfail).
test("MMS-16: at 1100 px and below the history run list scrolls (overflow auto) and clips the run link's focus ring on three sides", async ({ page }) => {
  only("tablet-768");
  await page.goto("./#/history");
  const link = page.locator(".mm-run-list a").first();
  await expect(link).toBeVisible();
  for (let i = 0; i < 15 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  const r = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    const ring = parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset);
    const a = el.getBoundingClientRect();
    // The nearest ancestor that clips (any overflow other than visible).
    let clip: Element | null = el.parentElement;
    while (clip && getComputedStyle(clip).overflowX === "visible" && getComputedStyle(clip).overflowY === "visible") clip = clip.parentElement;
    const c = (clip ?? document.documentElement).getBoundingClientRect();
    return { clipped: a.left - ring < c.left || a.top - ring < c.top || a.right + ring > c.right || a.bottom + ring > c.bottom, ring, clipper: clip?.tagName };
  });
  expect(r.clipped, `a ${r.ring} px ring clipped by ${r.clipper}`).toBe(false);
});

// =================================================================================================
// Claims that held
// =================================================================================================

test("held: preview and history frames are opaque-origin sandboxes; preview scripts cannot reach the studio, storage or the network", async ({ page }) => {
  only("desktop-1440");
  await openStudio(page);
  await expect(page.locator(".mm-stage .mm-frame iframe")).toHaveAttribute("sandbox", "allow-scripts");
  const frame = await previewFrame(page);
  const probe = await frame.evaluate(async () => {
    const attempt = async (f: () => unknown) => { try { await f(); return "allowed"; } catch (e) { return (e as Error).name; } };
    return {
      origin: location.origin,
      parentDom: await attempt(() => (window.parent as Window).document.title),
      storage: await attempt(() => window.localStorage.length),
      cookie: await attempt(() => document.cookie),
      fetch: await attempt(() => fetch("https://example.com/")),
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? "",
      scripts: document.scripts.length,
      handlers: [...document.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.name)).filter((n) => n.startsWith("on")).length,
    };
  });
  expect(probe.origin).toBe("null");
  expect(probe.parentDom).toBe("SecurityError");
  expect(probe.storage).toBe("SecurityError");
  expect(probe.cookie).toBe("SecurityError");
  expect(probe.fetch).not.toBe("allowed");
  expect(probe.csp).toMatch(/^default-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'; script-src 'sha256-[A-Za-z0-9+/=]+'; img-src data:; base-uri 'none'; form-action 'none'$/);
  expect(probe.scripts).toBe(1);
  expect(probe.handlers).toBe(0);
  await page.goto("./#/history");
  await expect(page.locator(".mm-plinth iframe")).toHaveAttribute("sandbox", "allow-scripts");
});

test("held: hostile palettes render every visible text, hover, edge and focus pairing at or above WCAG minimums, light and dark", async ({ browser }) => {
  only("desktop-1440");
  test.setTimeout(120_000);
  const base = SAMPLE_SPEC();
  const cases: [string, string, string, Record<string, string>][] = [
    ["studio", "solid", "flat", { mode: "light", canvas: "#808080", ink: "#818181", accent: "#7f7f7f", support: "#808081" }],
    ["shopfront", "outline", "raised", { mode: "dark", canvas: "#f0f0f0", ink: "#00ff00", accent: "#ff00ff", support: "#00ffff" }],
    ["launch", "underline", "outlined", { mode: "light", canvas: "#000000", ink: "#ffffff", accent: "#000000", support: "#ffffff" }],
    ["studio", "pill", "outlined", { mode: "dark", canvas: "#777777", ink: "#767676", accent: "#787878", support: "#777777" }],
    ["shopfront", "solid", "flat", { mode: "light", canvas: "#ffff00", ink: "#ffff00", accent: "#ff0000", support: "#0000ff" }],
    ["launch", "outline", "raised", { mode: "dark", canvas: "#ffffff", ink: "#ffffff", accent: "#ffffff", support: "#ffffff" }],
    ["shopfront", "underline", "outlined", { mode: "dark", canvas: "#1e1916", ink: "#1e1916", accent: "#5a171b", support: "#1e1916" }],
    ["launch", "pill", "flat", { mode: "light", canvas: "#00ffff", ink: "#ff00ff", accent: "#00ff00", support: "#ff0000" }],
  ];
  const specs = cases.map(([template, button, surface, palette]) => ({ ...base, template, palette, components: { ...base.components, button, surface } }));
  const pages = buildPages(specs);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const failures: string[] = [];
  for (const [i, html] of pages.entries()) {
    const page = await context.newPage();
    await page.setContent(html);
    await page.evaluate(MEASURE);
    const tag = cases[i]!.slice(0, 3).join("/");
    const axe = await new AxeBuilder({ page: page as never }).withTags(["wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    failures.push(...axe.violations.map((v) => `${tag} axe ${v.id}`));
    failures.push(...(await page.evaluate(() => (window as any).__mms.textFails(document))).map((f: string) => `${tag} text ${f}`));
    for (const sel of [".hero .btn", ".band .btn", ".panel .btn", ".nav a", ".foot a"]) {
      const loc = page.locator(sel).first();
      if (!(await loc.count())) continue;
      await loc.hover();
      const r = await loc.evaluate((el) => {
        const m = (window as any).__mms;
        return [...m.textFails(el.parentElement), m.borderFail(el)].filter(Boolean);
      });
      failures.push(...r.map((f: string) => `${tag} hover ${sel} ${f}`));
    }
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab"); // keyboard modality, so programmatic focus is :focus-visible
    for (const sel of ["a.skip", ".nav a", ".hero .btn", ".band .btn", ".panel .btn", "summary", ".foot a"]) {
      const loc = page.locator(sel).first();
      if (!(await loc.count())) continue;
      await loc.focus();
      const f = await loc.evaluate((el) => (window as any).__mms.ringFail(el));
      if (f) failures.push(`${tag} focus ${f}`);
    }
    await page.close();
  }
  await context.close();
  expect(failures).toEqual([]);
});

test("held: reduced motion means no animation in the studio, in the preview for such visitors, and in the reduced-motion preview", async ({ browser }) => {
  only("desktop-1440");
  const reduce = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const a = await reduce.newPage();
  await openStudio(a, "#/studio/motion");
  await a.getByRole("link", { name: "Type", exact: true }).click();
  expect(await a.evaluate(() => document.getAnimations().filter((x) => x.playState === "running").length)).toBe(0);
  const fa = await previewFrame(a);
  await fa.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await a.waitForTimeout(300);
  expect(await fa.evaluate(() => document.getAnimations().length)).toBe(0);
  await reduce.close();

  const normal = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const b = await normal.newPage();
  await openStudio(b);
  const before = await (await previewFrame(b)).evaluate(() => document.documentElement.outerHTML);
  await b.getByRole("switch", { name: "Reduced motion" }).check();
  await expect(b.locator(".mm-stage-status")).toContainText("reduced motion");
  const fb = await previewFrame(b);
  await expect.poll(() => fb.evaluate(() => document.documentElement.dataset.motion ?? "")).toBe("reduce");
  await fb.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await b.waitForTimeout(300);
  expect(await fb.evaluate(() => document.getAnimations().length)).toBe(0);
  const after = await fb.evaluate(() => document.documentElement.outerHTML);
  expect(after.replace(' data-motion="reduce"', "")).toBe(before); // the same page, only the flag differs
  await normal.close();
});

test("held: every focusable studio control shows a visible, unobscured focus indicator; the file import opens by keyboard", async ({ page }) => {
  only("desktop-1440");
  await openStudio(page, "#/studio/motion");
  const bad: string[] = [];
  let stops = 0;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el.tagName === "IFRAME") return null;
      const shown = el.matches(".mm-preset input") ? el.closest(".mm-preset")! : el;
      const s = getComputedStyle(shown);
      const b = el.getBoundingClientRect();
      const ring = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2;
      return { name: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30), ring, inView: b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth };
    });
    if (!r) continue;
    stops++;
    if (!r.ring || !r.inView) bad.push(JSON.stringify(r));
  }
  expect(stops).toBeGreaterThan(30);
  expect(bad).toEqual([]);
  const importButton = page.getByRole("button", { name: "Import a brief" });
  await importButton.focus();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), page.keyboard.press("Enter")]);
  expect(chooser.isMultiple()).toBe(false);
});

test("held: generated pages at 390 px keep every link and question at least 44 x 44 px with no sideways scroll (example content)", async ({ page }) => {
  only("mobile-390");
  await openStudio(page);
  for (const template of ["Studio", "Shopfront", "Launch"]) {
    await page.locator(".mm-stage").getByRole("button", { name: template, exact: true }).click();
    await expect.poll(async () => (await previewFrame(page)).evaluate(() => document.documentElement.dataset.template)).toBe(template.toLowerCase());
    // The preview document can be replaced between finding the frame and evaluating in it; retry only that race.
    const evaluateSettled = async <T,>(fn: () => T): Promise<T> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await (await previewFrame(page)).evaluate(fn);
        } catch (err) {
          if (attempt >= 4 || !/Execution context was destroyed|Frame was detached/.test(String(err))) throw err;
          await page.waitForTimeout(150);
        }
      }
    };
    const r = await evaluateSettled(() => ({
      width: innerWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      small: [...document.querySelectorAll("a, summary")].filter((el) => !el.matches(".skip")).map((el) => {
        const b = el.getBoundingClientRect();
        return { t: (el.textContent ?? "").trim().slice(0, 20), w: Math.round(b.width), h: Math.round(b.height) };
      }).filter((x) => x.h < 44 || x.w < 44),
    }));
    expect(r.width).toBe(390);
    expect(r.overflow, template).toBeLessThanOrEqual(0);
    expect(r.small, template).toEqual([]);
  }
});
