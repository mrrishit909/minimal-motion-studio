// Engine CLI, run from frontend/ as `node src/engine/cli.ts <command> ...` (Node type stripping).
//   run --request <file> --out <dir> --screens <dir>   compose, build twice, review in Chromium, write results
//   verify-candidate --candidate <file> --out <file>   check an untrusted AI-proposed brief, write a request
//   compose --request <file> --out <dir>               write the source package for inspection
// Arguments are parsed as a list and child processes are started without a shell.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { build } from "./build-core.js";
import { compose, esc, type Provenance, stableJson } from "./compose.ts";
import { validateRequest, validateSpec } from "./schema.ts";
import type { Adjustment, Composition, Preset, Request, Spec, Tokens } from "./types.ts";
import { zip } from "./zip.ts";

const ENGINE = "minimal-motion-studio 1.0.0";
const SIZES = [[390, 844], [768, 1024], [1440, 900]] as const;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

class Failure extends Error {}

export const sha256Base64 = async (text: string) => createHash("sha256").update(text, "utf8").digest("base64");
const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/**
 * Canonical JSON for hashing: keys sorted, no spaces, everything outside printable ASCII escaped as
 * lower-case \uXXXX. Byte-identical to Python's json.dumps(x, sort_keys=True, separators=(",", ":"))
 * for every valid request whose numbers are written as plain integers. A number written with a
 * fraction or exponent (17.0, 1e2) still validates in both, but JavaScript prints it as 17 or 100
 * while Python keeps 17.0 or 100.0, so the two hashes differ for such a file.
 */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(sort(value)).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Read and parse a JSON file under a size limit; parse errors are reported without echoing content. */
function readJson(path: string, limit: number): { raw: Buffer; value: unknown } {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    throw new Failure(`cannot read ${path}`);
  }
  if (size > limit) throw new Failure(`file is larger than the ${limit} byte limit`);
  const raw = readFileSync(path);
  if (raw.length > limit) throw new Failure(`file is larger than the ${limit} byte limit`);
  let text: string;
  try {
    // Fatal decoding: invalid UTF-8 is refused, never silently replaced, so the bytes that are hashed
    // are exactly the bytes that were checked.
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new Failure("file is not valid UTF-8");
  }
  try {
    return { raw, value: JSON.parse(text) };
  } catch {
    throw new Failure("file is not valid JSON");
  }
}

/** The provenance compose() records in the package README, from a validated request. */
const provenanceOf = (req: Request): Provenance =>
  req.origin === "ai-candidate" ? { origin: req.origin, candidate_sha256: req.candidate_sha256 } : { origin: req.origin };

const run = promisify(execFile);

/**
 * Builds the package the way a user would: files written to a fresh temp folder, `node build.mjs`
 * run there with no shell and only PATH in the environment. Returns the folder and the page.
 */
async function independentBuild(files: Record<string, string>): Promise<{ dir: string; html: string }> {
  const dir = mkdtempSync(join(tmpdir(), "mms-build-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  try {
    await run(process.execPath, ["build.mjs"], { cwd: dir, env: { PATH: process.env.PATH ?? "" }, timeout: 60_000 });
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    const stderr = (err as { stderr?: string }).stderr ?? "";
    throw new Failure(`the exported build.mjs failed: ${stderr.trim().split("\n")[0] ?? "unknown error"}`);
  }
  return { dir, html: readFileSync(join(dir, "dist/index.html"), "utf8") };
}

/** Compose, build in memory and build independently; the two pages must be byte-identical. */
async function composeAndCheck(spec: Spec, provenance: Provenance): Promise<{ comp: Composition; html: string; dir: string }> {
  const comp = compose(spec, provenance);
  let preview: string;
  try {
    preview = (await build(comp.files, sha256Base64))["dist/index.html"] as string;
  } catch (err) {
    throw new Failure(`the build failed: ${err instanceof Error ? err.message : "unknown error"}`);
  }
  const { dir, html } = await independentBuild(comp.files);
  if (html !== preview) {
    rmSync(dir, { recursive: true, force: true });
    throw new Failure("the exported package builds a different page from the studio preview");
  }
  return { comp, html, dir };
}

// ---------------------------------------------------------------------------------------------
// Visual review

type AxeViolation = { id: string; impact: "minor" | "moderate" | "serious" | "critical" | null; nodes: number; help: string };
type WidthResult = {
  width: number; height: number; axe_violations: AxeViolation[]; overflow_px: number; console_errors: string[];
  failed_requests: number; details_total: number; details_keyboard_ok: number; focus_visible: boolean;
};
export type Review = {
  schema_version: "1.0"; browser: string; widths: WidthResult[];
  motion: { preset: Preset; reduced_animations: number; animations_started: number };
  flags: Record<"axe_clean" | "no_overflow" | "no_console_errors" | "no_requests" | "details_keyboard" | "focus_visible" | "reduced_motion" | "motion", boolean>;
};

// Counts Element.animate() calls; injected by the test browser only, never part of the page.
const COUNT_ANIMATIONS = `(() => { let n = 0; const a = Element.prototype.animate;
  Element.prototype.animate = function (...args) { n++; return a.apply(this, args); };
  Object.defineProperty(window, "__mmsAnimateCalls", { get: () => n }); })();`;

async function review(file: string, preset: Preset, screens: string): Promise<Review> {
  const { chromium } = await import("@playwright/test");
  const { AxeBuilder } = await import("@axe-core/playwright");
  const url = pathToFileURL(file).href;
  const clean = (s: string) => s.split(url).join("<site>").split(dirname(file)).join("<site>").slice(0, 300);
  const browser = await chromium.launch();
  try {
    const widths: WidthResult[] = [];
    for (const [width, height] of SIZES) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const errors: string[] = [];
      let requests = 0;
      page.on("console", (m) => { if (m.type() === "error") errors.push(clean(m.text())); });
      page.on("pageerror", (e) => errors.push(clean(e.message)));
      page.on("request", (r) => { if (r.url() !== url) requests++; });
      await page.goto(url, { waitUntil: "load" });
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
      await page.screenshot({ path: join(screens, `${width}.jpg`), type: "jpeg", quality: 80 });
      // @axe-core/playwright is typed against its own playwright-core copy; the page object is the same.
      const axe = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).withTags(AXE_TAGS).analyze();
      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el !== document.querySelector("a")) return false;
        const s = getComputedStyle(el);
        return el.matches(":focus-visible") && s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      });
      const details = page.locator("details");
      const total = await details.count();
      let ok = 0;
      for (let i = 0; i < total; i++) {
        const d = details.nth(i);
        await d.locator("summary").focus();
        await page.keyboard.press("Enter");
        const opened = await d.evaluate((el) => (el as HTMLDetailsElement).open);
        await page.keyboard.press("Enter");
        const closed = await d.evaluate((el) => !(el as HTMLDetailsElement).open);
        if (opened && closed) ok++;
      }
      widths.push({
        width, height, overflow_px: overflow, console_errors: errors, failed_requests: requests,
        axe_violations: axe.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, nodes: v.nodes.length, help: v.help })),
        details_total: total, details_keyboard_ok: ok, focus_visible: focus,
      });
      await context.close();
    }

    const motion = async (reducedMotion: "reduce" | "no-preference") => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
      await context.addInitScript(COUNT_ANIMATIONS);
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "load" });
      const started = await page.evaluate(() => (window as unknown as { __mmsAnimateCalls: number }).__mmsAnimateCalls);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => (window as unknown as { __mmsAnimateCalls: number }).__mmsAnimateCalls + document.getAnimations().length);
      await context.close();
      return { started, after };
    };
    const reduced = await motion("reduce");
    const normal = await motion("no-preference");
    const all = (f: (w: WidthResult) => boolean) => widths.every(f);
    return {
      schema_version: "1.0",
      browser: `chromium ${browser.version()}`,
      widths,
      motion: { preset, reduced_animations: reduced.after, animations_started: normal.started },
      flags: {
        axe_clean: all((w) => w.axe_violations.length === 0),
        no_overflow: all((w) => w.overflow_px === 0),
        no_console_errors: all((w) => w.console_errors.length === 0),
        no_requests: all((w) => w.failed_requests === 0),
        details_keyboard: all((w) => w.details_keyboard_ok === w.details_total),
        focus_visible: all((w) => w.focus_visible),
        reduced_motion: reduced.after === 0,
        motion: preset === "still" ? normal.started === 0 : normal.started > 0,
      },
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Results

const TEMPLATE_NAME = { studio: "Studio", shopfront: "Shopfront", launch: "Launch" } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function headline(req: Request, tokens: Tokens, adjustments: Adjustment[], rev: Review): string {
  const name = req.origin !== "ai-candidate" && /ai-proposed/i.test(req.spec.brand.name) ? "this brand" : req.spec.brand.name;
  const pass = tokens.pairings.filter((p) => p.pass).length;
  const axe = rev.widths.reduce((n, w) => n + w.axe_violations.length, 0);
  const adjusted = adjustments.length ? ` (${plural(adjustments.length, "colour")} adjusted)` : "";
  const text = `${TEMPLATE_NAME[req.spec.template]} template for ${name}: ${pass} of ${tokens.pairings.length} contrast pairings pass${adjusted}, ${plural(axe, "axe violation")} at ${plural(rev.widths.length, "width")}, export builds identically.`;
  return req.origin === "ai-candidate" ? `AI-proposed brief: ${text}` : text;
}

const md = (s: string) => esc(s).replace(/([\\`*_[\]#|])/g, "\\$1");

function report(req: Request, comp: Composition, rev: Review, line: string, pageSha: string): string {
  const t = comp.tokens;
  const adj = comp.adjustments.length
    ? ["| Role | From | To | Why |", "|---|---|---|---|", ...comp.adjustments.map((a) => `| ${a.role} | ${a.from} | ${a.to} | ${a.reason} |`)].join("\n")
    : "No colour needed changing: every seed met its minimums as given.";
  const pairs = t.pairings.map((p) => `| ${p.label} | ${p.fg} on ${p.bg} | ${p.ratio.toFixed(2)}:1 | ${p.min}:1 | ${p.pass ? "pass" : "FAIL"} |`);
  const yes = (b: boolean) => (b ? "yes" : "no");
  const widths = rev.widths.map((w) => `| ${w.width} x ${w.height} | ${w.axe_violations.length} | ${w.overflow_px} px | ${w.console_errors.length} | ${w.failed_requests} | ${w.details_keyboard_ok} of ${w.details_total} | ${yes(w.focus_visible)} |`);
  const rules = rev.widths.flatMap((w) => w.axe_violations.map((v) => `- ${w.width} px: \`${v.id}\` (${v.impact ?? "no impact given"}, ${plural(v.nodes, "element")}): ${v.help}`));
  return `# Run report: ${md(req.spec.brand.name)}

${md(line)}

- Template: ${req.spec.template}. Origin: ${req.origin}. Motion preset: ${t.motion.preset}.
- Export: \`node build.mjs\` in a clean folder produced exactly the page the studio previews (site.html, ${pageSha}).

## Colour adjustments

${adj}

## Contrast (WCAG 2.2)

| Where | Colours | Ratio | Minimum | Result |
|---|---|---|---|---|
${pairs.join("\n")}

## Visual review (${rev.browser})

| Viewport | axe violations | Overflow | Console errors | Requests | Questions by keyboard | Focus visible |
|---|---|---|---|---|---|---|
${widths.join("\n")}

${rules.length ? `axe rules violated:\n\n${rules.join("\n")}` : "axe (WCAG 2.0, 2.1 and 2.2 A and AA rules) found no violations."}

Motion: ${rev.motion.animations_started} animations started on load with normal motion; ${rev.motion.reduced_animations} with reduced motion requested.

Screenshots taken during the review are temporary CI artifacts and are not part of these results.
`;
}

async function cmdRun(requestPath: string, out: string, screens: string): Promise<void> {
  const { value } = readJson(requestPath, 256 * 1024);
  const v = validateRequest(value);
  if (!v.ok) throw new Failure(`the request is not valid:\n- ${v.errors.join("\n- ")}`);
  const req = v.request;
  const { comp, html, dir } = await composeAndCheck(req.spec, provenanceOf(req));
  let rev: Review;
  try {
    mkdirSync(screens, { recursive: true });
    rev = await review(join(dir, "dist/index.html"), req.spec.motion.preset, screens);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(out, { recursive: true });
  const written: Record<string, Buffer> = {};
  const put = (name: string, data: string | Uint8Array) => {
    const buf = Buffer.from(data);
    writeFileSync(join(out, name), buf);
    written[name] = buf;
  };
  put("manifest.json", stableJson({
    schema_version: "1.0", engine: ENGINE, origin: req.origin,
    input_manifest_hash: `sha256:${sha256Hex(canonicalJson(req))}`,
    candidate_sha256: req.candidate_sha256 ?? null,
  }));
  put("spec.json", stableJson(req.spec));
  put("tokens.json", comp.files["tokens.json"] as string);
  put("adjustments.json", stableJson(comp.adjustments));
  put("site.html", html);
  put("package.zip", zip(comp.files));
  put("review.json", stableJson(rev));
  const line = headline(req, comp.tokens, comp.adjustments, rev);
  put("report.md", report(req, comp, rev, line, `sha256:${sha256Hex(html)}`));
  const axe = rev.widths.reduce((n, w) => n + w.axe_violations.length, 0);
  writeFileSync(join(out, "summary.json"), stableJson({
    schema_version: "1.0", headline: line, template: req.spec.template, origin: req.origin,
    motion_preset: req.spec.motion.preset, export_identical: true,
    counts: {
      pairings: comp.tokens.pairings.length, pairings_pass: comp.tokens.pairings.filter((p) => p.pass).length,
      adjustments: comp.adjustments.length, axe_violations: axe, widths: rev.widths.length,
      overflow_widths: rev.widths.filter((w) => w.overflow_px > 0).length,
      console_errors: rev.widths.reduce((n, w) => n + w.console_errors.length, 0),
      failed_requests: rev.widths.reduce((n, w) => n + w.failed_requests, 0),
    },
    files: Object.keys(written).sort().map((name) => ({ name, sha256: `sha256:${sha256Hex(written[name] as Buffer)}`, bytes: (written[name] as Buffer).length })),
  }));
  console.log(line);
}

// Credential shapes an AI step must never smuggle into a brief (checked after the schema). The first
// seven repeat scripts/secret_scan.py's PATTERNS exactly (a test keeps the two in sync); the rest are
// broader prefixes and a JSON web token shape, so this list is a superset of the repository scan.
export const SECRET_RULES: [string, RegExp][] = [
  ["anthropic-key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["openai-key", /sk-(proj-)?[A-Za-z0-9]{32,}/],
  ["github-token", /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["aws-access-key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["private-key", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ["slack-token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ["generic-assignment", /\b(api[_-]?key|secret|password)\s*[:=]\s*['"][A-Za-z0-9/+_=-]{16,}['"]/i],
  ["Anthropic key prefix", /sk-ant-/],
  ["GitHub token prefix", /gh[pousr]_|github_pat_/],
  ["AWS key id", /(AKIA|ASIA)[0-9A-Z]{16}/],
  ["private key block", /-----BEGIN/],
  ["Slack token prefix", /xox[abposr]-/],
  ["JSON web token", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

/** Paths of strings that look like credentials, with the rule matched; never the value. */
export function secretFindings(value: unknown, path = ""): string[] {
  if (typeof value === "string") {
    const rule = SECRET_RULES.find(([, re]) => re.test(value));
    return rule ? [`${path || "the brief"}: looks like a credential (${rule[0]})`] : [];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => secretFindings(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => secretFindings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

async function cmdVerify(candidatePath: string, out: string): Promise<void> {
  const { raw, value } = readJson(candidatePath, 64 * 1024);
  const v = validateSpec(value);
  if (!v.ok) throw new Failure(`the candidate breaks the brief schema:\n- ${v.errors.join("\n- ")}`);
  const secrets = secretFindings(v.spec);
  if (secrets.length) throw new Failure(`the candidate was rejected:\n- ${secrets.join("\n- ")}`);
  const request: Request = { spec: v.spec, origin: "ai-candidate", candidate_sha256: `sha256:${sha256Hex(raw)}` };
  const { dir } = await composeAndCheck(v.spec, provenanceOf(request));
  rmSync(dir, { recursive: true, force: true });
  if (!validateRequest(request).ok) throw new Failure("internal: the verified request does not validate");
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, stableJson(request));
  console.log(`candidate accepted: ${request.candidate_sha256}`);
}

function cmdCompose(requestPath: string, out: string): void {
  const { value } = readJson(requestPath, 256 * 1024);
  const v = validateRequest(value);
  if (!v.ok) throw new Failure(`the request is not valid:\n- ${v.errors.join("\n- ")}`);
  const comp = compose(v.request.spec, provenanceOf(v.request));
  for (const [name, text] of Object.entries(comp.files)) {
    mkdirSync(dirname(join(out, name)), { recursive: true });
    writeFileSync(join(out, name), text);
  }
  console.log(`wrote ${Object.keys(comp.files).length} files to ${out}`);
}

const USAGE = `usage:
  node src/engine/cli.ts run --request <file> --out <dir> --screens <dir>
  node src/engine/cli.ts verify-candidate --candidate <file> --out <file>
  node src/engine/cli.ts compose --request <file> --out <dir>`;

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv, allowPositionals: true, strict: true,
      options: { request: { type: "string" }, out: { type: "string" }, screens: { type: "string" }, candidate: { type: "string" } },
    });
  } catch {
    console.error(USAGE);
    return 2;
  }
  const [command, ...extra] = parsed.positionals;
  // Messages from an untrusted candidate's checks are ours alone; other unexpected errors are shown
  // for run and compose (trusted input) but not for verify-candidate.
  const showUnexpected = command !== "verify-candidate";
  const o = parsed.values;
  try {
    if (command === "run" && !extra.length && o.request && o.out && o.screens) await cmdRun(o.request, o.out, o.screens);
    else if (command === "verify-candidate" && !extra.length && o.candidate && o.out) await cmdVerify(o.candidate, o.out);
    else if (command === "compose" && !extra.length && o.request && o.out) cmdCompose(o.request, o.out);
    else {
      console.error(USAGE);
      return 2;
    }
    return 0;
  } catch (err) {
    const known = err instanceof Failure || (err instanceof Error && err.message.startsWith("The brief is not valid"));
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error: ${known || showUnexpected ? message : `unexpected failure (${err instanceof Error ? err.name : "unknown"})`}`);
    if (!known && err instanceof Error && process.env.MMS_DEBUG) console.error(err.stack);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main(process.argv.slice(2));
}
