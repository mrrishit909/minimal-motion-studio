// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { crc32 as zlibCrc32 } from "node:zlib";
import { wcagContrast } from "culori";
import { afterAll, describe, expect, it } from "vitest";
import { build, contrastRatio, PAIRINGS } from "../../src/engine/build-core.js";
import { canonicalJson, headline, type Review, secretFindings } from "../../src/engine/cli.ts";
import { compose, esc, safeHref, sha256Base64, slug } from "../../src/engine/compose.ts";
import { DEFAULT_SPEC, EXAMPLES } from "../../src/engine/examples.ts";
import { curvePoints, MOTION_PRESETS, scaleDuration } from "../../src/engine/presets.ts";
import { RAW } from "../../src/engine/raw.ts";
import { validateRequest, validateSpec } from "../../src/engine/schema.ts";
import { deriveTokens } from "../../src/engine/tokens.ts";
import type { Preset, Spec, Template } from "../../src/engine/types.ts";
import { VOICES } from "../../src/engine/voices.ts";
import { zip } from "../../src/engine/zip.ts";

const FRONTEND = resolve(__dirname, "../..");
const REPO = resolve(FRONTEND, "..");
const sha = async (t: string) => createHash("sha256").update(t, "utf8").digest("base64");
const clone = (s: Spec): Spec => structuredClone(s);
const page = async (spec: Spec) => (await build(compose(spec).files, sha))["dist/index.html"] as string;
const temps: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "mms-test-"));
  temps.push(d);
  return d;
};
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Writes a package to a fresh folder and runs its build.mjs with node, as a user would. */
function nodeBuild(files: Record<string, string>): { code: number; stderr: string; html: string | null } {
  const dir = tempDir();
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  const r = spawnSync(process.execPath, ["build.mjs"], { cwd: dir, env: { PATH: process.env.PATH ?? "" }, encoding: "utf8" });
  let html: string | null = null;
  try {
    html = readFileSync(join(dir, "dist/index.html"), "utf8");
  } catch { /* no output */ }
  return { code: r.status ?? -1, stderr: r.stderr, html };
}

/** The page without its inlined style and script, i.e. only markup built from the brief. */
const markup = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script>[\s\S]*?<\/script>/, "");
/** Every attribute name on every tag of the markup (double- or single-quoted values are skipped whole). */
const attributeNames = (html: string) => [...markup(html).matchAll(/<[a-zA-Z][^\s>/]*((?:\s+[^\s"'=<>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g)]
  .flatMap((m) => [...(m[1] ?? "").matchAll(/\s+([^\s"'=<>/]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)].map((a) => (a[1] as string).toLowerCase()));
const cli = (...args: string[]) => spawnSync(process.execPath, ["src/engine/cli.ts", ...args], { cwd: FRONTEND, encoding: "utf8" });

const DARK = { mode: "dark", canvas: "#29201B", ink: "#FFF6E8", accent: "#A6422A", support: "#5A171B" } as const;
const LIGHT = { mode: "light", canvas: "#FFF6E8", ink: "#29201B", accent: "#646548", support: "#E8D7BF" } as const;
const TEMPLATES: Template[] = ["studio", "shopfront", "launch"];
// U+2014 and U+2015, built from code points so no source file contains them.
const BANNED_DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2015)}]`);

describe("schema", () => {
  const bad = (mutate: (s: Record<string, any>) => void) => {
    const s = clone(DEFAULT_SPEC) as unknown as Record<string, any>;
    mutate(s);
    return validateSpec(s);
  };

  it("accepts every example and the committed sample request", () => {
    for (const s of Object.values(EXAMPLES)) expect(validateSpec(s).ok).toBe(true);
    const sample = JSON.parse(readFileSync(join(REPO, "fixtures/requests/sample.json"), "utf8"));
    expect(validateRequest(sample).ok).toBe(true);
    expect(sample.origin).toBe("fixture");
    expect(sample.spec).toEqual(EXAMPLES.studio);
  });

  it.each([
    ["bad hex", (s: any) => { s.palette.canvas = "#fff"; }, "palette.canvas"],
    ["hex with a trailing newline", (s: any) => { s.palette.ink = "#29201b\n"; }, "palette.ink"],
    ["unknown top-level key", (s: any) => { s.extra = true; }, "the brief"],
    ["unknown nested key", (s: any) => { s.brand.onload = "x"; }, "brand"],
    ["C0 control character", (s: any) => { s.brand.name = "A\u0007B"; }, "brand.name"],
    ["C1 control character", (s: any) => { s.brand.tagline = "A\u0085B"; }, "brand.tagline"],
    ["DEL", (s: any) => { s.items[0].title = "A\u007fB"; }, "items[0].title"],
    ["lone surrogate", (s: any) => { s.faqs[0].q = "A\ud800B"; }, "faqs[0].q"],
    ["line break in a line field", (s: any) => { s.brand.contact = "a\nb"; }, "brand.contact"],
    ["blank required line", (s: any) => { s.brand.cta_label = "   "; }, "brand.cta_label"],
    ["javascript: href", (s: any) => { s.brand.cta_href = "javascript:alert(1)"; }, "brand.cta_href"],
    ["data: href", (s: any) => { s.brand.cta_href = "data:text/html,<b>x</b>"; }, "brand.cta_href"],
    ["http: href", (s: any) => { s.brand.cta_href = "http://example.com"; }, "brand.cta_href"],
    ["protocol-relative href", (s: any) => { s.brand.cta_href = "//example.com"; }, "brand.cta_href"],
    ["oversize name", (s: any) => { s.brand.name = "n".repeat(41); }, "brand.name"],
    ["oversize summary", (s: any) => { s.brand.summary = "s".repeat(321); }, "brand.summary"],
    ["too many items", (s: any) => { s.items = Array(7).fill(s.items[0]); }, "items"],
    ["wrong template enum", (s: any) => { s.template = "blog"; }, "template"],
    ["wrong ratio enum", (s: any) => { s.type.ratio = 1.25; }, "type.ratio"],
    ["string in an integer field", (s: any) => { s.type.base_px = "17"; }, "type.base_px"],
    ["fraction in an integer field", (s: any) => { s.motion.speed_pct = 105; }, "motion.speed_pct"],
    ["missing field", (s: any) => { delete s.motion; }, "the brief"],
  ])("rejects %s, naming the path", (_name, mutate, path) => {
    const r = bad(mutate);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.startsWith(`${path}:`))).toBe(true);
  });

  it("never echoes the submitted value in an error", () => {
    const payload = "<marker-9f3c>";
    const r = bad((s) => {
      s.brand.cta_href = `javascript:${payload}`;
      s.brand.name = `${payload}\u0001`;
      s.palette.accent = payload;
      s[payload] = payload;
      s.type.heading = payload;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) for (const e of r.errors) expect(e).not.toContain("marker-9f3c");
  });

  it("keeps request provenance consistent", () => {
    expect(validateRequest({ spec: DEFAULT_SPEC, origin: "ai-candidate" }).ok).toBe(false);
    expect(validateRequest({ spec: DEFAULT_SPEC, origin: "studio", candidate_sha256: `sha256:${"0".repeat(64)}` }).ok).toBe(false);
    expect(validateRequest({ spec: DEFAULT_SPEC, origin: "ai-candidate", candidate_sha256: `sha256:${"0".repeat(64)}` }).ok).toBe(true);
  });
});

describe("raw files", () => {
  it("reads the exact bytes on disk in Node", () => {
    const disk = (p: string) => readFileSync(join(FRONTEND, "src/engine", p), "utf8");
    expect(RAW.buildCore).toBe(disk("build-core.js"));
    expect(RAW.siteCss).toBe(disk("assets/site.css"));
    expect(RAW.motionJs).toBe(disk("assets/motion.js"));
  });

  it("inlines the same bytes in a Vite browser bundle (?raw)", async () => {
    const { build: viteBuild } = await import("vite");
    const dir = tempDir();
    writeFileSync(join(dir, "entry.js"), `export { RAW } from ${JSON.stringify(join(FRONTEND, "src/engine/raw.ts"))};\n`);
    // process.versions is hidden so the bundle takes its browser path, then the bundle is loaded here.
    await viteBuild({
      root: dir, configFile: false, logLevel: "silent", define: { "process.versions": "undefined" },
      build: { outDir: join(dir, "out"), minify: false, target: "es2022", lib: { entry: join(dir, "entry.js"), formats: ["es"], fileName: "raw" } },
    });
    const bundled = (await import(pathToFileURL(join(dir, "out/raw.mjs")).href)) as { RAW: typeof RAW };
    expect(bundled.RAW).toEqual(RAW);
    expect(readdirSync(join(dir, "out")).join(" ")).not.toMatch(/browser-external|\.css/);
  });

  it("composes the same package in plain Node (the CLI reads files from disk)", () => {
    const dir = tempDir();
    const req = join(dir, "req.json");
    writeFileSync(req, JSON.stringify({ spec: EXAMPLES.launch, origin: "studio" }));
    const r = cli("compose", "--request", req, "--out", join(dir, "pkg"));
    expect(r.status, r.stderr).toBe(0);
    for (const [name, text] of Object.entries(compose(EXAMPLES.launch).files)) {
      expect(readFileSync(join(dir, "pkg", name), "utf8"), name).toBe(text);
    }
  });

  it("embeds build-core.js verbatim in the exported build.mjs", () => {
    expect(compose(DEFAULT_SPEC).files["build.mjs"]).toContain(RAW.buildCore);
  });
});

describe("determinism", () => {
  it("gives identical bytes for every example and every template in both modes", async () => {
    const specs: Spec[] = [...Object.values(EXAMPLES)];
    for (const t of TEMPLATES) for (const p of [LIGHT, DARK]) specs.push({ ...clone(EXAMPLES[t]), palette: { ...p } });
    for (const s of specs) {
      const a = compose(clone(s));
      const b = compose(clone(s));
      expect(a).toEqual(b);
      expect(await page(s)).toBe(await page(clone(s)));
      expect(zip(a.files)).toEqual(zip(b.files));
    }
  });

  it("sorts package keys and names the package after the brand", () => {
    const files = compose(EXAMPLES.shopfront).files;
    expect(Object.keys(files)).toEqual([...Object.keys(files)].sort());
    expect(JSON.parse(files["package.json"] as string)).toEqual({
      name: "marrow-lane-bakehouse-site", private: true, type: "module", scripts: { build: "node build.mjs" }, engines: { node: ">=18" },
    });
    expect(slug("Café Élan & Co!")).toBe("cafe-elan-co");
    expect(slug("<<<>>>")).toBe("brand");
  });
});

describe("escaping", () => {
  const PAYLOADS = [
    "</title><script>alert(1)</script>",
    "\"><img src=x onerror=alert(1)>",
    "';}</style><style>body{display:none}",
    "{{constructor}}",
    "<svg onload=alert(1)>&amp;",
  ];
  const fill = (p: string): Spec => {
    const s = clone(EXAMPLES.studio);
    const cut = (n: number) => p.slice(0, n);
    s.brand = { ...s.brand, name: cut(40), tagline: cut(90), summary: cut(320), cta_label: cut(28), contact: cut(120), location: cut(120), hours: cut(120), note: cut(160) };
    s.items = s.items.map(() => ({ title: cut(48), text: cut(160), meta: cut(24) }));
    s.faqs = s.faqs.map(() => ({ q: cut(100), a: cut(320) }));
    return s;
  };

  it.each(TEMPLATES)("keeps every brief string as text in the %s template", async (template) => {
    for (const p of PAYLOADS) {
      const s = { ...fill(p), template };
      expect(validateSpec(s).ok).toBe(true);
      const html = await page(s);
      expect(html.match(/<script/gi)).toHaveLength(1);
      expect(html.match(/<style/gi)).toHaveLength(1);
      expect(html.match(/<title>/g)).toHaveLength(1);
      const attrs = attributeNames(html);
      expect(attrs).toContain("href");
      expect(attrs.filter((a) => a.startsWith("on"))).toEqual([]);
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<svg onload");
      expect(html).not.toContain("</style><style>");
      expect(html).not.toContain("alert(1)</script>");
      expect(html).toContain(esc(p.slice(0, 24)));
      for (const [, href] of html.matchAll(/href="([^"]*)"/g)) expect(href).toMatch(/^(#|https:\/\/|mailto:|tel:)/);
    }
  });

  it("re-checks the link at output time and escapes allowed quote characters", async () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref("data:text/html,x")).toBe("#");
    expect(safeHref("http://example.com")).toBe("#");
    expect(safeHref(" https://example.com")).toBe("#");
    expect(safeHref("tel:+1 555 0100")).toBe("tel:+1 555 0100");
    const s = clone(EXAMPLES.launch);
    s.brand.cta_href = "https://a.example/'onmouseover='alert(1)";
    expect(validateSpec(s).ok).toBe(true);
    const html = await page(s);
    expect(html).toContain('href="https://a.example/&#39;onmouseover=&#39;alert(1)"');
    expect(attributeNames(html).filter((a) => a.startsWith("on"))).toEqual([]);
  });

  it("omits empty sections and lines", async () => {
    const s = clone(EXAMPLES.studio);
    s.brand = { ...s.brand, summary: "", note: "", contact: "", location: "", hours: "" };
    s.items = [];
    s.faqs = [];
    const html = await page(s);
    expect(html).not.toContain('id="services"');
    expect(html).not.toContain('id="questions"');
    expect(html).not.toContain('id="contact"');
    expect(html).not.toContain('class="note"');
    expect(html).not.toContain('class="lede"');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });
});

describe("build", () => {
  const strip = (html: string, tag: string) => [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1] as string);

  it("hashes exactly the inlined style and script in the CSP", async () => {
    for (const s of Object.values(EXAMPLES)) {
      const html = await page(s);
      const [style] = strip(html, "style");
      const [script] = strip(html, "script");
      const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1] ?? "";
      expect(csp).toBe(`default-src 'none'; style-src 'sha256-${await sha(style ?? "")}'; script-src 'sha256-${await sha(script ?? "")}'; img-src data:; base-uri 'none'; form-action 'none'`);
      expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<style>"));
      expect(html).not.toContain('href="styles/site.css"');
      expect(html).not.toContain('src="scripts/motion.js"');
    }
  });

  it("hashes the same with Web Crypto (the studio) as with node:crypto (build.mjs)", async () => {
    for (const t of ["", "a", "caf\u00e9 \u{1F600}", RAW.siteCss]) expect(await sha256Base64(t)).toBe(await sha(t));
  });

  it("defines every custom property the CSS and script use", async () => {
    const html = await page(DEFAULT_SPEC);
    const defined = new Set([...html.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = [...(RAW.siteCss + RAW.motionJs).matchAll(/var\((--[a-z0-9-]+)|"(--[a-z0-9-]+)"/g)].map((m) => m[1] ?? m[2]);
    expect(used.length).toBeGreaterThan(40);
    for (const v of used) expect(defined.has(v), v).toBe(true);
  });

  it("propagates an edited tokens.json and refuses unreadable or unsafe edits", async () => {
    const files = { ...compose(EXAMPLES.launch).files };
    const tokens = JSON.parse(files["tokens.json"] as string);
    const old = tokens.color.accent as string;
    expect((await build(files, sha))["dist/index.html"]).toContain(old);
    tokens.color.accent = "#f4a08a";
    const edited = { ...files, "tokens.json": JSON.stringify(tokens) };
    const html = (await build(edited, sha))["dist/index.html"] as string;
    expect(html).toContain("--c-accent: #f4a08a;");
    expect(html).not.toContain(old);
    const viaNode = nodeBuild(edited);
    expect(viaNode.code).toBe(0);
    expect(viaNode.html).toBe(html);

    const unreadable = structuredClone(tokens);
    unreadable.color.text = unreadable.color.canvas;
    const broken = { ...files, "tokens.json": JSON.stringify(unreadable) };
    await expect(build(broken, sha)).rejects.toThrow(/Contrast check failed .*\n- Body text on the page/);
    const failed = nodeBuild(broken);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain("Contrast check failed");
    expect(failed.html).toBeNull();

    const injected = structuredClone(tokens);
    injected.font.body = "serif;}</style><script>alert(1)</script>";
    await expect(build({ ...files, "tokens.json": JSON.stringify(injected) }, sha)).rejects.toThrow(/font.body/);
    const easing = structuredClone(tokens);
    easing.motion.easing = "ease;} body{display:none";
    await expect(build({ ...files, "tokens.json": JSON.stringify(easing) }, sha)).rejects.toThrow(/motion.easing/);
    await expect(build({ ...files, "styles/site.css": `${files["styles/site.css"]}a{color:var(--nope)}` }, sha)).rejects.toThrow(/--nope/);
    await expect(build({ ...files, "scripts/motion.js": `${files["scripts/motion.js"]}//</script>` }, sha)).rejects.toThrow(/<\/script/);
  });

  it("builds identical bytes with the exported build.mjs for every example", async () => {
    for (const s of Object.values(EXAMPLES)) {
      const comp = compose(s);
      const r = nodeBuild(comp.files);
      expect(r.code, r.stderr).toBe(0);
      expect(r.html).toBe((await build(comp.files, sha))["dist/index.html"]);
    }
  });
});

describe("colour", () => {
  const HOSTILE: [string, string, string, string][] = [
    ["#777777", "#888888", "#777777", "#777777"],
    ["#888888", "#888888", "#888888", "#888888"],
    ["#000000", "#000000", "#000000", "#000000"],
    ["#ffffff", "#ffffff", "#ffffff", "#ffffff"],
    ["#FFFFFF", "#000000", "#39FF14", "#FF00FF"],
    ["#000000", "#FFFFFF", "#00FFFF", "#FFFF00"],
    ["#757575", "#767676", "#0000FF", "#333333"],
    ["#6b6b6b", "#ffffff", "#ffff00", "#101010"],
    ["#fff6e8", "#29201b", "#a6422a", "#7a3020"],
    ["#5a171b", "#5a171b", "#a6422a", "#5a171b"],
  ];

  it("meets every pairing for the examples and keeps passing seeds", () => {
    for (const s of Object.values(EXAMPLES)) {
      const { tokens } = deriveTokens(s);
      expect(tokens.pairings).toHaveLength(PAIRINGS.length);
      expect(tokens.pairings.every((p) => p.pass)).toBe(true);
      for (const c of Object.values(tokens.color)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
    const studio = deriveTokens(EXAMPLES.studio);
    expect(studio.adjustments).toEqual([]);
    expect(studio.tokens.color.text).toBe(EXAMPLES.studio.palette.ink.toLowerCase());
    expect(studio.tokens.color.accent).toBe(EXAMPLES.studio.palette.accent.toLowerCase());
  });

  it("repairs hostile palettes and reports every change", () => {
    for (const [canvas, ink, accent, support] of HOSTILE) {
      for (const mode of ["light", "dark"] as const) {
        const s = { ...clone(DEFAULT_SPEC), palette: { mode, canvas, ink, accent, support } };
        const { tokens, adjustments } = deriveTokens(s);
        for (const p of tokens.pairings) expect(contrastRatio(tokens.color[p.fg], tokens.color[p.bg]), `${canvas} ${p.id}`).toBeGreaterThanOrEqual(p.min);
        const seeds = { canvas, text: ink, accent, action: accent, support } as const;
        for (const [role, seed] of Object.entries(seeds)) {
          const changed = tokens.color[role as keyof typeof seeds] !== seed.toLowerCase();
          expect(adjustments.some((a) => a.role === role), `${canvas}/${ink}/${accent}/${support} ${role}`).toBe(changed);
        }
        for (const a of adjustments) {
          expect(a.reason).toMatch(/^(Darkened|Lightened)/);
          expect(a.reason).not.toMatch(BANNED_DASHES);
        }
      }
    }
  });

  it("pushes a mid-grey canvas when no text colour can work on page and panels", () => {
    const s = { ...clone(DEFAULT_SPEC), palette: { mode: "dark" as const, canvas: "#6b6b6b", ink: "#ffffff", accent: "#ffff00", support: "#101010" } };
    const { adjustments } = deriveTokens(s);
    expect(adjustments.find((a) => a.role === "canvas")?.reason).toMatch(/page/);
  });

  it("moves the band colour when no focus ring can work on page and band", () => {
    const s = { ...clone(DEFAULT_SPEC), palette: { mode: "light" as const, canvas: "#fff6e8", ink: "#29201b", accent: "#a6422a", support: "#7a3020" } };
    const { tokens, adjustments } = deriveTokens(s);
    expect(adjustments.find((a) => a.role === "support")?.reason).toMatch(/focus ring/);
    expect(contrastRatio(tokens.color.focus, tokens.color.support)).toBeGreaterThanOrEqual(3);
  });

  it("agrees with culori's WCAG contrast on many pairs", () => {
    let x = 12345;
    const next = () => (x = (Math.imul(x, 1103515245) + 12345) >>> 0);
    const hex = () => `#${(next() & 0xffffff).toString(16).padStart(6, "0")}`;
    for (let i = 0; i < 3000; i++) {
      const a = hex();
      const b = hex();
      expect(Math.abs(contrastRatio(a, b) - wcagContrast(a, b))).toBeLessThan(1e-9);
    }
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
  });
});

describe("type, space and motion tokens", () => {
  it("scales type, space and radius as specified", () => {
    const t = deriveTokens(EXAMPLES.studio).tokens;
    expect(t.type.map((s) => s.step)).toEqual([-1, 0, 1, 2, 3, 4, 5]);
    expect(t.type[1]?.px).toBe(17);
    expect(t.type[1]?.css).toBe("1.0625rem");
    expect(t.type[5]?.css).toMatch(/^clamp\([\d.]+rem, calc\(-?[\d.]+rem \+ [\d.]+vw\), [\d.]+rem\)$/);
    expect(t.type[6]!.line_height).toBeLessThan(t.type[1]!.line_height);
    expect(t.space).toEqual([5, 10, 15, 20, 30, 40, 60, 80, 120]);
    expect(t.radius).toEqual({ control: 0, surface: 0, pill: 999 });
    expect(t.font.heading).toBe(VOICES["old-style"].stack);
    const serif = deriveTokens({ ...clone(EXAMPLES.studio), type: { ...EXAMPLES.studio.type, body: "old-style" } }).tokens;
    expect(serif.type[1]!.line_height).toBeGreaterThan(t.type[1]!.line_height);
  });

  it("scales durations by speed and stills everything for the still preset", () => {
    expect(scaleDuration(520, 200)).toBe(260);
    expect(scaleDuration(520, 50)).toBe(1040);
    const still = deriveTokens({ ...clone(DEFAULT_SPEC), motion: { preset: "still", speed_pct: 100, stagger_ms: 80 } }).tokens.motion;
    expect(still).toEqual({ preset: "still", duration_ms: 0, fast_ms: 0, easing: "linear", distance_px: 0, stagger_ms: 0 });
  });

  it("draws easing curves from (0, 0) to (1, 1)", () => {
    for (const p of Object.keys(MOTION_PRESETS) as Preset[]) {
      const pts = curvePoints(p, 40);
      expect(pts).toHaveLength(40);
      expect(pts[0]).toEqual([0, 0]);
      expect(pts[39]).toEqual([1, 1]);
    }
    expect(Math.max(...curvePoints("lively", 200).map(([, y]) => y))).toBeGreaterThan(1.03);
    const crisp = curvePoints("crisp", 100);
    for (let i = 1; i < crisp.length; i++) expect(crisp[i]![1]).toBeGreaterThanOrEqual(crisp[i - 1]![1]);
    expect(curvePoints("gentle", 3)[1]![1]).toBeGreaterThan(0.5);
  });
});

describe("zip", () => {
  it("reads back with the right names, sizes and CRCs, byte-identical across calls", () => {
    const files = compose(EXAMPLES.shopfront).files;
    const z = zip(files);
    expect(zip(files)).toEqual(z);
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
    const eocd = z.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    const count = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    expect(p + v.getUint32(eocd + 12, true)).toBe(eocd);
    const dec = new TextDecoder();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      expect(v.getUint32(p, true)).toBe(0x02014b50);
      expect(v.getUint16(p + 10, true)).toBe(0); // stored
      expect(v.getUint16(p + 12, true)).toBe(0); // 00:00
      expect(v.getUint16(p + 14, true)).toBe(0x21); // 1980-01-01
      const crc = v.getUint32(p + 16, true);
      const size = v.getUint32(p + 20, true);
      const nameLen = v.getUint16(p + 28, true);
      const local = v.getUint32(p + 42, true);
      const name = dec.decode(z.subarray(p + 46, p + 46 + nameLen));
      names.push(name);
      expect(v.getUint32(local, true)).toBe(0x04034b50);
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = z.subarray(start, start + size);
      expect(dec.decode(data)).toBe(files[name]);
      expect(crc).toBe(zlibCrc32(data));
      p += 46 + nameLen;
    }
    expect(names).toEqual(Object.keys(files).sort());
  });
});

describe("verify-candidate", () => {
  const fixture = (n: string) => join(REPO, "fixtures/ai", n);

  it("accepts the clean fixture and writes a verified request", () => {
    const out = join(tempDir(), "request.json");
    const r = cli("verify-candidate", "--candidate", fixture("clean-candidate.json"), "--out", out);
    expect(r.status, r.stderr).toBe(0);
    const req = JSON.parse(readFileSync(out, "utf8"));
    expect(validateRequest(req).ok).toBe(true);
    expect(req.origin).toBe("ai-candidate");
    expect(req.candidate_sha256).toBe(`sha256:${createHash("sha256").update(readFileSync(fixture("clean-candidate.json"))).digest("hex")}`);
  });

  it.each(["hostile-candidate.json", "hostile-secret-candidate.json"])("rejects %s without echoing it", (name) => {
    const out = join(tempDir(), "request.json");
    const r = cli("verify-candidate", "--candidate", fixture(name), "--out", out);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/error: the candidate/);
    for (const leak of ["alert", "evil.example", "FAKE-FIXTURE", "display:none", "xxxxxxxxxx"]) expect(r.stderr).not.toContain(leak);
    expect(() => readFileSync(out)).toThrow();
  });

  it("names the field path of a credential-shaped string", () => {
    const spec = clone(DEFAULT_SPEC);
    spec.items[1]!.text = `key ${"AKIA"}${"Q".repeat(16)}`;
    spec.brand.note = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "sig"].join(".");
    expect(secretFindings(spec)).toEqual(["brand.note: looks like a credential (JSON web token)", "items[1].text: looks like a credential (AWS access key)"]);
    expect(secretFindings(DEFAULT_SPEC)).toEqual([]);
  });

  it("rejects oversized and non-JSON files", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "big.json"), " ".repeat(70 * 1024));
    writeFileSync(join(dir, "bad.json"), "{ not json <script>");
    expect(cli("verify-candidate", "--candidate", join(dir, "big.json"), "--out", join(dir, "o.json")).stderr).toMatch(/byte limit/);
    const bad = cli("verify-candidate", "--candidate", join(dir, "bad.json"), "--out", join(dir, "o.json"));
    expect(bad.status).toBe(1);
    expect(bad.stderr).not.toContain("script");
  });
});

describe("results helpers", () => {
  it("hashes canonical JSON the way Python's json.dumps(sort_keys=True) does", () => {
    expect(canonicalJson({ b: 1, a: ["é", { d: null, c: "\u{1F600}" }] })).toBe('{"a":["\\u00e9",{"c":"\\ud83d\\ude00","d":null}],"b":1}');
  });

  it("marks AI-proposed headlines and never others", () => {
    const { tokens, adjustments } = deriveTokens(DEFAULT_SPEC);
    const rev = { widths: [{ axe_violations: [] }, { axe_violations: [] }, { axe_violations: [] }] } as unknown as Review;
    const h = (origin: "studio" | "ai-candidate" | "fixture", spec = DEFAULT_SPEC) => headline({ spec, origin }, tokens, adjustments, rev);
    expect(h("fixture")).toBe("Studio template for Fieldnote Studio: 16 of 16 contrast pairings pass, 0 axe violations at 3 widths, export builds identically.");
    expect(h("ai-candidate")).toMatch(/^AI-proposed brief: Studio template/);
    const sneaky = { ...clone(DEFAULT_SPEC), brand: { ...DEFAULT_SPEC.brand, name: "AI-proposed Ltd" } };
    expect(h("studio", sneaky)).not.toMatch(/AI-proposed/i);
  });

  it("uses no em dash or U+2015 in any generated file", () => {
    for (const s of Object.values(EXAMPLES)) for (const text of Object.values(compose(s).files)) expect(text).not.toMatch(BANNED_DASHES);
  });

  it("runs the CLI with list arguments only and prints usage otherwise", () => {
    expect(cli("nope").status).toBe(2);
    expect(() => execFileSync(process.execPath, ["src/engine/cli.ts", "run", "--request"], { cwd: FRONTEND, stdio: "pipe" })).toThrow();
  });
});
