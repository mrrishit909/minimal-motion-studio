import AxeBuilder from "@axe-core/playwright";
import { expect, type Frame, type Page, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const EVIDENCE = process.env.E2E_EVIDENCE_DIR ?? "../evidence/e2e";
const SCREENS = join(EVIDENCE, "screens");
mkdirSync(SCREENS, { recursive: true });

async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity), null, { timeout: 3000 }).catch(() => {});
}

async function shot(page: Page, name: string, fullPage = false) {
  await settle(page);
  await page.screenshot({ path: join(SCREENS, `${test.info().project.name}-${name}.jpg`), type: "jpeg", quality: 70, fullPage });
}

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("dialog", (d) => { problems.push(`dialog: ${d.message()}`); void d.dismiss(); });
  page.on("response", (r) => {
    const url = new URL(r.url());
    if (r.status() >= 400 && url.origin === new URL(page.url() || r.url()).origin) problems.push(`HTTP ${r.status()} ${url.pathname}`);
  });
  return problems;
}

async function noOverflow(page: Page) {
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll, "page must not scroll horizontally").toBeLessThanOrEqual(inner + 1);
}

async function axe(page: Page) {
  await settle(page);
  // The preview frame holds the generated page; the engine's own review audits that page separately.
  const results = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude(".mm-frame iframe").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} (${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 160)})`).join("; ")}`)).toEqual([]);
}

const stageFrame = (page: Page) => page.locator(".mm-stage .mm-frame iframe");

/** The preview document (opaque origin, but Playwright can still drive it). */
async function previewFrame(page: Page): Promise<Frame> {
  const handle = await stageFrame(page).elementHandle();
  const frame = await handle!.contentFrame();
  await frame!.waitForLoadState();
  return frame!;
}

async function openStudio(page: Page, hash = "") {
  await page.goto(`./${hash}`);
  await expect(page.locator(".mm-stage-status")).toContainText(/exported page itself|reduced motion/, { timeout: 15_000 });
}

/** Minimal reader for the studio's store-only zip (the engine writes no compression). */
function unzipStore(buf: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    expect(method, "store-only entries").toBe(0);
    const start = i + 30 + nameLen + extraLen;
    out[name] = buf.subarray(start, start + size);
    i = start + size;
  }
  return out;
}

async function downloadPackage(page: Page): Promise<Record<string, Buffer>> {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download source package" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^[a-z0-9-]+-site\.zip$/);
  return unzipStore(readFileSync((await dl.path())!));
}

/** Writes the package to a temporary directory outside the repository and runs its own build with Node only. */
function buildIndependently(files: Record<string, Buffer>): { dir: string; html: string } {
  const dir = mkdtempSync(join(tmpdir(), "mms-export-"));
  for (const [name, data] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), data);
  }
  execFileSync(process.execPath, ["build.mjs"], { cwd: dir, env: { PATH: process.env.PATH ?? "" }, stdio: "pipe" });
  return { dir, html: readFileSync(join(dir, "dist", "index.html"), "utf8") };
}

const probe = () => {
  const pick = (sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    return [s.color, s.backgroundColor, s.fontFamily, s.fontSize, s.paddingTop, s.borderRadius].join(" | ");
  };
  return { body: pick("body"), h1: pick("h1"), cta: pick("main a[href]"), title: document.title, text: document.body.innerText.slice(0, 400) };
};

test("studio: stage shows the composed page in a sandboxed frame; accessible, no overflow", async ({ page }) => {
  const problems = watch(page);
  await openStudio(page);
  await expect(page.getByRole("link", { name: "Minimal Motion Studio" })).toBeVisible();
  const frame = stageFrame(page);
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  const doc = await previewFrame(page);
  await expect(doc.locator("h1")).toBeVisible();
  await noOverflow(page);
  await axe(page);
  await shot(page, "studio");
  await shot(page, "studio-first-viewport"); // kept as durable release evidence (the outcome loop keeps *-first-viewport.jpg)
  await shot(page, "studio-full", true);
  expect(problems).toEqual([]);
});

test("brief: editing a field updates the preview; a bad link is explained beside its field", async ({ page }) => {
  await openStudio(page);
  await page.getByLabel("Brand name").fill("Harbour Lane Ceramics");
  const doc = await previewFrame(page);
  await expect.poll(async () => (await previewFrame(page)).locator("body").innerText(), { timeout: 10_000 }).toContain("Harbour Lane Ceramics");
  expect(await doc.title()).toBeTruthy();
  await page.getByLabel("Button link").fill("javascript:alert(1)");
  await expect(page.getByLabel("Button link")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".mm-stage-status")).toContainText("last valid version");
  await expect(page.getByRole("button", { name: "Download source package" })).toBeDisabled();
  await shot(page, "brief-error");
  await page.getByLabel("Button link").fill("https://example.com/visit");
  await expect(page.getByRole("button", { name: "Download source package" })).toBeEnabled({ timeout: 10_000 });
});

test("palette: a low-contrast seed is adjusted, listed, and every pairing passes", async ({ page }) => {
  await openStudio(page, "#/studio/palette");
  await expect(page.getByRole("heading", { level: 2, name: "Palette" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Colour roles" }).locator("li")).toHaveCount(10);
  await expect(page.getByRole("heading", { name: "Contrast on the actual pairings" })).toBeVisible();
  await page.getByLabel("Ink", { exact: true }).fill("#E9DFD2");
  await expect(page.locator(".mm-adjustments li").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".mm-adjustments")).toContainText(/text/i);
  await expect(page.locator(".mm-stage-status")).toContainText("exported page itself");
  const verdicts = (await page.locator(".mm-pair-verdict").allInnerTexts()).map((v) => v.trim());
  expect(verdicts.length).toBeGreaterThan(8);
  expect(verdicts.filter((v) => !v.startsWith("pass"))).toEqual([]);
  await expect(page.locator(".mm-chip-flag").first()).toBeVisible();
  await axe(page);
  await shot(page, "palette");
});

test("type, space and components: controls change the composed stylesheet", async ({ page }) => {
  await openStudio(page, "#/studio/type");
  const before = await stageFrame(page).getAttribute("srcdoc");
  await page.getByLabel("Scale ratio").selectOption("1.5");
  await expect.poll(() => stageFrame(page).getAttribute("srcdoc")).not.toBe(before);
  await expect(page.locator(".mm-scale li")).toHaveCount(7);
  await shot(page, "type");
  await page.getByRole("link", { name: /Space/ }).first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Space" })).toBeFocused();
  await page.getByRole("group", { name: "Density" }).getByRole("button", { name: "Airy" }).click();
  await page.getByRole("link", { name: /Components/ }).first().click();
  const prev = await stageFrame(page).getAttribute("srcdoc");
  await page.getByRole("group", { name: "Buttons" }).getByRole("button", { name: "Pill" }).click();
  await expect.poll(() => stageFrame(page).getAttribute("srcdoc")).not.toBe(prev);
  await axe(page);
  await shot(page, "components");
});

test("device widths: the frame and its ruler follow phone, tablet and desktop", async ({ page }) => {
  await openStudio(page);
  const group = page.getByRole("group", { name: "Device width" });
  for (const [label, size] of [["Phone", "390 × 844"], ["Tablet", "768 × 1024"], ["Desktop", "1440 × 900"]] as const) {
    await group.getByRole("button", { name: label }).click();
    await expect(page.locator(".mm-stage .mm-frame-label")).toContainText(size);
    const w = await stageFrame(page).evaluate((el) => (el as HTMLIFrameElement).style.width);
    expect(w).toBe(`${size.split(" ")[0]}px`);
  }
  await shot(page, "device-desktop");
});

test("motion: presets, replay, and a reduced-motion preview with no animations", async ({ page }) => {
  await openStudio(page, "#/studio/motion");
  await page.getByRole("radio", { name: /Lively/ }).check();
  await expect(page.locator(".mm-preset[data-checked='true']")).toContainText("Lively");
  await page.getByRole("button", { name: "Replay motion" }).click();
  await page.getByRole("switch", { name: /reduced motion/i }).first().check();
  await expect(page.locator(".mm-stage-status")).toContainText("reduced motion");
  await expect(stageFrame(page)).toHaveAttribute("srcdoc", /data-motion="reduce"/);
  const doc = await previewFrame(page);
  await doc.waitForTimeout(300);
  expect(await doc.evaluate(() => document.getAnimations().length)).toBe(0);
  await shot(page, "motion");
});

test("export: the downloaded package builds on its own and matches the preview byte for byte", async ({ page }) => {
  const problems = watch(page);
  await openStudio(page);
  await page.getByRole("group", { name: "Device width" }).getByRole("button", { name: "Phone" }).click();
  const files = await downloadPackage(page);
  for (const name of ["index.html", "styles/site.css", "scripts/motion.js", "tokens.json", "brief.json", "build.mjs", "package.json", "README.md"]) expect(Object.keys(files)).toContain(name);
  expect(JSON.parse(files["package.json"]!.toString()).dependencies ?? {}).toEqual({});
  const { dir, html } = buildIndependently(files);
  try {
    expect(html).toBe(await stageFrame(page).getAttribute("srcdoc"));
    // Same rendering: the built page opened on its own at the phone size computes the same styles as the preview frame.
    const standalone = await page.context().newPage();
    await standalone.setViewportSize({ width: 390, height: 844 });
    await standalone.goto(pathToFileURL(join(dir, "dist", "index.html")).href);
    const inPreview = await (await previewFrame(page)).evaluate(probe);
    expect(await standalone.evaluate(probe)).toEqual(inPreview);
    await standalone.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  await expect(page.locator(".mm-message")).toContainText("Downloaded");
  await shot(page, "export");
  expect(problems).toEqual([]);
});

test("tokens propagate: editing tokens.json in the export changes every use on rebuild", async ({ page }) => {
  await openStudio(page);
  const files = await downloadPackage(page);
  const tokens = JSON.parse(files["tokens.json"]!.toString());
  const old = tokens.color.accent as string;
  tokens.color.accent = old === "#5a171b" ? "#4a1216" : "#5a171b";
  for (const p of tokens.pairings) if (p.fg === "accent" || p.bg === "accent") p.pass = true; // the build recomputes ratios itself
  files["tokens.json"] = Buffer.from(JSON.stringify(tokens));
  let built: { dir: string; html: string } | null = null;
  try {
    built = buildIndependently(files);
    expect(built.html).toContain(tokens.color.accent);
    expect(built.html.toLowerCase()).not.toContain(`--c-accent:${old}`);
  } catch (err) {
    // A darker accent can fail a pairing; the build must then refuse loudly rather than ship it.
    expect(String((err as { stderr?: Buffer }).stderr ?? err)).toMatch(/contrast|pairing/i);
  } finally {
    if (built) rmSync(built.dir, { recursive: true, force: true });
  }
});

test("injection: hostile brief text stays text, in the preview and in the export", async ({ page }) => {
  const problems = watch(page);
  await openStudio(page);
  const payloads: [string, string][] = [
    ["Brand name", "</title><script>alert(1)</script>"],
    ["Tagline", "\"><img src=x onerror=alert(1)>"],
    ["Summary", "';}</style><style>body{display:none}</style>"],
    ["Button label", "<svg onload=alert(1)>"],
    ["Contact", "{{constructor.constructor('alert(1)')()}}"],
  ];
  for (const [label, value] of payloads) await page.getByLabel(label, { exact: true }).fill(value);
  await expect.poll(async () => (await previewFrame(page)).locator("body").innerText(), { timeout: 10_000 }).toContain("<img src=x onerror=alert(1)>");
  const doc = await previewFrame(page);
  expect(await doc.evaluate(() => ({ scripts: document.scripts.length, imgs: document.images.length, hidden: getComputedStyle(document.body).display }))).toEqual({ scripts: 1, imgs: 0, hidden: "block" });
  expect(await page.evaluate(() => document.title)).toContain("Minimal Motion Studio");
  const files = await downloadPackage(page);
  const { dir, html } = buildIndependently(files);
  rmSync(dir, { recursive: true, force: true });
  expect(html).not.toContain("<script>alert");
  // The payload text may contain "onerror=", escaped; what must not exist is an element carrying a handler.
  const built = await page.context().newPage();
  await built.setContent(html);
  expect(await built.evaluate(() => [...document.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.name)).filter((n) => n.startsWith("on")))).toEqual([]);
  await built.close();
  await shot(page, "injection");
  expect(problems).toEqual([]);
});

test("import: a hostile or malformed brief is refused and nothing changes", async ({ page }) => {
  await openStudio(page);
  const name = await page.getByLabel("Brand name").inputValue();
  const chooser = async (content: string) => {
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Import a brief" }).click()]);
    await fc.setFiles({ name: "brief.json", mimeType: "application/json", buffer: Buffer.from(content) });
  };
  await chooser(JSON.stringify({ schema_version: "1.0", template: "studio", brand: { name: "x" }, script: "<script>" }));
  await expect(page.getByRole("alert")).toContainText("does not match the brief schema");
  await chooser("{not json");
  await expect(page.getByRole("alert")).toContainText("not valid JSON");
  await expect(page.getByLabel("Brand name")).toHaveValue(name);
});

test("keyboard: skip link, visible focus, steps by keyboard", async ({ page }) => {
  await openStudio(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#mm-main")).toBeFocused();
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe("none");
  await page.getByRole("navigation", { name: "Steps" }).getByRole("link", { name: /Motion/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Motion" })).toBeFocused();
  await shot(page, "keyboard-focus");
});

test("dark theme: applies everywhere and stays accessible", async ({ page }) => {
  await page.goto("./#/about");
  await page.getByRole("group", { name: "Colour theme" }).getByRole("button", { name: "Dark" }).click();
  await page.waitForTimeout(500);
  await expect(page.locator(".mm-root")).toHaveAttribute("data-theme", "dark");
  await axe(page);
  await openStudio(page);
  await expect(page.locator(".mm-root")).toHaveAttribute("data-theme", "dark");
  const [fg, bg] = await page.locator(".mm-btn-primary").first().evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  expect(fg).not.toBe(bg);
  await axe(page);
  await shot(page, "dark");
});

test("reduced motion: the studio itself does not animate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  expect(running).toBe(0);
  await shot(page, "reduced-motion");
});

test("history: published run with its origin, review, pairings and page; its brief opens in the studio", async ({ page }) => {
  const problems = watch(page);
  await page.goto("./#/history");
  await expect(page.getByRole("heading", { level: 1, name: "Generation history" })).toBeVisible();
  await expect(page.locator(".mm-origin")).toContainText(/no AI/);
  await expect(page.getByRole("table")).toContainText("390 px");
  const frame = page.locator(".mm-plinth iframe");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(frame).toHaveAttribute("src", /site\.html$/);
  const brand = (await page.locator("#mm-run-h").innerText()).trim();
  await noOverflow(page);
  await axe(page);
  await shot(page, "history");
  await page.getByRole("button", { name: "Open this brief in the studio" }).click();
  await expect(page.getByLabel("Brand name")).toHaveValue(brand);
  expect(problems).toEqual([]);
});

test("states: history loading, empty, error with retry, stale", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/data/snapshot.json", async (route) => { await gate; await route.continue(); });
  await page.goto("./#/history");
  await expect(page.getByRole("status").filter({ hasText: "Loading" })).toBeVisible();
  await shot(page, "state-loading");
  release();
  await expect(page.locator("#mm-run-h")).toBeVisible();
  await page.unroute("**/data/snapshot.json");

  await page.route("**/data/snapshot.json", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), latest_run_id: null, runs_included: [] } });
  });
  await page.goto("./?empty#/history");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No published generations yet.");
  await shot(page, "state-empty");
  await page.unroute("**/data/snapshot.json");

  let fail = true;
  await page.route("**/data/snapshot.json", async (route) => {
    if (fail) await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  await page.goto("./?error#/history");
  await expect(page.getByRole("alert")).toContainText("The server answered 503");
  await shot(page, "state-error");
  fail = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator("#mm-run-h")).toBeVisible();
  await page.unroute("**/data/snapshot.json");

  await page.route("**/data/snapshot.json", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), generated_at: "2025-01-01T00:00:00Z" } });
  });
  await page.goto("./?stale#/history");
  await expect(page.getByText(/older than its 14-day freshness window/)).toBeVisible();
  await shot(page, "state-stale");
});

test("honesty: no AI control for visitors; AI described as owner-only; pages and preview image", async ({ page }) => {
  const problems = watch(page);
  const preview = await page.request.get("./preview.jpg");
  expect(preview.status(), "portfolio preview image").toBe(200);
  await openStudio(page);
  expect(await page.getByRole("button", { name: /\bAI\b|generate with/i }).count()).toBe(0);
  expect(await page.getByRole("link", { name: /\bAI\b|generate with/i }).count()).toBe(0);
  await page.goto("./#/request");
  await expect(page.getByRole("heading", { name: "AI-proposed briefs, owner only" })).toBeVisible();
  await expect(page.getByText(/not available from this site or to visitors/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Open the request form/ })).toHaveAttribute("href", /\/issues\/new\?template=run-request\.yml$/);
  await axe(page);
  await noOverflow(page);
  await page.goto("./#/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How the studio works");
  await noOverflow(page);
  await shot(page, "about");
  expect(problems).toEqual([]);
});
