// @vitest-environment node
// Independent adversarial review of the engine. `it.fails` marks a CONFIRMED defect (strict xfail: the
// test passes only while the defect is present; once it is fixed the test fails and the marker must be
// removed). Tests named "held" are claims that were attacked and survived. Ids match the review report.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { build, contrastRatio, PAIRINGS } from "../../src/engine/build-core.js";
import { compose, safeHref } from "../../src/engine/compose.ts";
import { DEFAULT_SPEC, EXAMPLES } from "../../src/engine/examples.ts";
import { validateSpec } from "../../src/engine/schema.ts";
import { deriveTokens } from "../../src/engine/tokens.ts";
import type { Spec, Template } from "../../src/engine/types.ts";
import { zip } from "../../src/engine/zip.ts";

const FRONTEND = resolve(__dirname, "../..");
const REPO = resolve(FRONTEND, "..");
const ENGINE = join(FRONTEND, "src/engine");
const sha = async (t: string) => createHash("sha256").update(t, "utf8").digest("base64");
const clone = (s: Spec): Spec => structuredClone(s);
const temps: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "mms-adv-"));
  temps.push(d);
  return d;
};
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));
const cli = (...args: string[]) => spawnSync(process.execPath, ["src/engine/cli.ts", ...args], { cwd: FRONTEND, encoding: "utf8" });
const SAMPLE = JSON.parse(readFileSync(join(REPO, "fixtures/requests/sample.json"), "utf8")) as { spec: Spec; origin: string };
const TEMPLATES: Template[] = ["studio", "shopfront", "launch"];

function nodeBuild(files: Record<string, string>): { code: number; stderr: string; html: string | null } {
  const dir = tempDir();
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  const r = spawnSync(process.execPath, ["build.mjs"], { cwd: dir, env: { PATH: process.env.PATH ?? "" }, encoding: "utf8" });
  const out = join(dir, "dist/index.html");
  return { code: r.status ?? -1, stderr: r.stderr, html: existsSync(out) ? readFileSync(out, "utf8") : null };
}

/** Writes a candidate brief (text or raw bytes) and runs verify-candidate on it. */
function verify(candidate: string | Buffer) {
  const dir = tempDir();
  writeFileSync(join(dir, "c.json"), candidate);
  const out = join(dir, "request.json");
  const r = cli("verify-candidate", "--candidate", join(dir, "c.json"), "--out", out);
  return { ...r, accepted: r.status === 0 && existsSync(out), out };
}

// Python jsonschema, exactly as the harness validates (harness.core.schema_errors), when the repo venv exists.
const PY = join(REPO, ".venv/bin/python");
const HAS_PY = existsSync(PY) && spawnSync(PY, ["-I", "-c", "import jsonschema"]).status === 0;
/** For each raw JSON text: does Python's harness accept it as a request? */
function pythonAccepts(texts: string[]): boolean[] {
  const code = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(REPO)})`,
    "from harness.core import schema_errors",
    "texts = json.load(sys.stdin)",
    "print(json.dumps([not schema_errors(json.loads(t), 'request.schema.json') for t in texts]))",
  ].join("\n");
  const r = spawnSync(PY, ["-I", "-c", code], { input: JSON.stringify(texts), encoding: "utf8", cwd: REPO });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout) as boolean[];
}
/** The same texts through Ajv (the studio and the Node CLI). */
const ajvAccepts = (texts: string[]) => texts.map((t) => {
  const req = JSON.parse(t) as { spec: unknown };
  return validateSpec(req.spec).ok;
});
const sampleWith = (mutate: (s: Spec) => void) => {
  const req = structuredClone(SAMPLE);
  mutate(req.spec);
  return JSON.stringify(req);
};

// =================================================================================================
// Confirmed defects (strict xfail)
// =================================================================================================

describe("confirmed defects", () => {
  it("MMS-05: the package README says no AI was involved even when the brief is AI-proposed (origin ai-candidate)", () => {
    // `cli.ts run` zips exactly these compose() files into package.zip for every origin (cli.ts: put("package.zip", zip(comp.files))).
    const dir = tempDir();
    const req = { spec: SAMPLE.spec, origin: "ai-candidate", candidate_sha256: `sha256:${"0".repeat(64)}` };
    writeFileSync(join(dir, "req.json"), JSON.stringify(req));
    const r = cli("compose", "--request", join(dir, "req.json"), "--out", join(dir, "pkg"));
    expect(r.status, r.stderr).toBe(0);
    const readme = readFileSync(join(dir, "pkg/README.md"), "utf8");
    expect(readme).not.toContain("No AI was involved in producing these files");
  });

  it("MMS-11: verify-candidate accepts GitHub user-to-server, refresh and AWS temporary credentials (the repo's own secret_scan.py flags them)", () => {
    // Built at run time so this source file never contains a credential-shaped literal.
    const shapes = [`gh${"u"}_${"A1b2".repeat(9)}`, `gh${"r"}_${"C3d4".repeat(9)}`, `AS${"IA"}${"Q".repeat(16)}`];
    const accepted = shapes.map((value) => {
      const s = clone(DEFAULT_SPEC);
      s.brand.contact = value;
      return verify(JSON.stringify(s)).accepted;
    });
    expect(accepted).toEqual([false, false, false]);
  });

  it("MMS-12: verify-candidate accepts invalid UTF-8 (decoded lossily to U+FFFD) instead of rejecting the file", () => {
    const text = JSON.stringify({ ...clone(DEFAULT_SPEC), brand: { ...DEFAULT_SPEC.brand, contact: "helloXX" } });
    const bytes = Buffer.from(text, "utf8");
    const at = bytes.indexOf(Buffer.from("XX"));
    bytes[at] = 0xff; // never valid in UTF-8
    bytes[at + 1] = 0xfe;
    const r = verify(bytes);
    expect(r.accepted).toBe(false);
  });

  describe.skipIf(!HAS_PY)("schema parity with the Python harness", () => {
    it("MMS-13: Ajv and Python jsonschema disagree on a required line made only of U+FEFF (\\s differs between JS and Python)", () => {
      const text = sampleWith((s) => { s.brand.name = "﻿"; });
      // Today: the harness admits it (true) and the studio/Node CLI reject it (false), so admitted runs fail in compute.
      expect(pythonAccepts([text])).toEqual(ajvAccepts([text]));
    });
  });

  it("MMS-14: the required_line pattern backtracks quadratically (a 64 KB import or candidate freezes validation for seconds)", () => {
    const time = (n: number) => {
      const s = clone(DEFAULT_SPEC);
      s.brand.name = `${"a".repeat(n)}\u0001`; // one invalid character at the end forces full backtracking
      const t = performance.now();
      validateSpec(s);
      return performance.now() - t;
    };
    time(1000); // warm up
    const best = (n: number) => Math.min(time(n), time(n), time(n)); // the fastest of three ignores GC pauses
    const small = Math.max(best(6_000), 0.5);
    const large = best(30_000); // 5x the input
    // Linear matching grows about 5x; the current pattern grows about 25x (about 1.8 s for 60k characters here).
    expect(large / small).toBeLessThan(12);
  });

  // Fixed (was strict xfail).
  it("MMS-15: secret-bearing workflow steps run `npm install -g` (no lockfile, install scripts see the inference secret)", () => {
    const offenders: string[] = [];
    for (const wf of ["generate.yml", "outcome.yml"]) {
      const text = readFileSync(join(REPO, ".github/workflows", wf), "utf8");
      // Split into steps: each step starts with "- " at the steps indentation.
      for (const step of text.split(/\n(?=\s{6}- )/)) {
        if (/secrets\.(ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN)/.test(step) && /npm install/.test(step)) offenders.push(`${wf}: ${/name: (.*)/.exec(step)?.[1] ?? "step"}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// =================================================================================================
// Claims that held
// =================================================================================================

describe("held: tokens.json is checked before anything reaches CSS", () => {
  const base = () => {
    const files = { ...compose(EXAMPLES.shopfront).files };
    return { files, tokens: JSON.parse(files["tokens.json"] as string) };
  };
  const tryBuild = async (tokens: unknown) => {
    const { files } = base();
    try {
      return { ok: true, html: (await build({ ...files, "tokens.json": JSON.stringify(tokens) }, sha))["dist/index.html"] as string };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  };

  it("held: missing, malformed, non-string and prototype-keyed colour roles are refused with the role named", async () => {
    const cases: [string, (t: any) => void, RegExp][] = [
      ["missing role", (t) => { delete t.color.focus; }, /color\.focus must be a colour/],
      ["malformed hex", (t) => { t.color.text = "#12345g"; }, /color\.text/],
      ["short hex", (t) => { t.color.text = "#123"; }, /color\.text/],
      ["css in hex", (t) => { t.color.text = "#000000;}body{color:red"; }, /color\.text/],
      ["non-string", (t) => { t.color.accent = 0x29201b; }, /color\.accent/],
      ["array", (t) => { t.color.canvas = ["#ffffff"]; }, /color\.canvas/],
      ["role only on the prototype", (t) => { const c = t.color; delete c.surface; t.color = JSON.parse(JSON.stringify(c).replace(/^\{/, '{"__proto__":{"surface":"#ffffff"},')); }, /color\.surface/],
      ["huge number", (t) => { t.space[3] = 1e308; }, /space\[3\]/],
      ["NaN-like", (t) => { t.type[2].px = "16"; }, /type\[2\]\.px/],
      ["fractional weight", (t) => { t.font.heading_weight = 650.5; }, /heading_weight/],
      ["wrong type step order", (t) => { [t.type[0], t.type[1]] = [t.type[1], t.type[0]]; }, /type\[0\]\.step/],
    ];
    for (const [name, mutate, re] of cases) {
      const { tokens } = base();
      mutate(tokens);
      const r = await tryBuild(tokens);
      expect(r.ok, name).toBe(false);
      expect(r.message, name).toMatch(re);
    }
  });

  it("held: extra roles and a stale pairings table claiming 'pass' are ignored; the build recomputes contrast itself", async () => {
    const { tokens } = base();
    tokens.color.sparkle = "#ff00ff";
    tokens.color.text = tokens.color.canvas; // unreadable
    tokens.pairings = tokens.pairings.map((p: any) => ({ ...p, ratio: 21, pass: true }));
    const r = await tryBuild(tokens);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Contrast check failed for \d+ pairings? in tokens\.json:\n- Body text on the page: 1\.00:1, needs 4\.5:1 \(text #[0-9a-f]{6} on canvas #[0-9a-f]{6}\)/);
    const ok = base().tokens;
    ok.color.sparkle = "#ff00ff";
    const built = await tryBuild(ok);
    expect(built.ok).toBe(true);
    expect(built.html).not.toContain("sparkle");
  });

  it("held: a near-threshold edit (4.49:1) is refused and a 4.5:1 edit is accepted, through the exported build.mjs too", async () => {
    // Pick a grey for text on the canvas just under and just over 4.5:1 with build-core's own maths.
    const { files, tokens } = base();
    const greys = Array.from({ length: 256 }, (_, i) => `#${i.toString(16).padStart(2, "0").repeat(3)}`);
    const worst = (g: string) => Math.min(contrastRatio(g, tokens.color.canvas), contrastRatio(g, tokens.color.surface));
    const passing = greys.filter((g) => worst(g) >= 4.5).sort((a, b) => worst(a) - worst(b))[0]!;
    const failing = greys.filter((g) => worst(g) < 4.5).sort((a, b) => worst(b) - worst(a))[0]!;
    const withText = (g: string) => ({ ...files, "tokens.json": JSON.stringify({ ...tokens, color: { ...tokens.color, text: g } }) });
    expect(nodeBuild(withText(passing)).code).toBe(0);
    const refused = nodeBuild(withText(failing));
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/Body text on (the page|panels): 4\.\d\d:1, needs 4\.5:1/);
  });

  it("held: site.css and motion.js hold no literal colour, so editing one role changes every use through one declaration", async () => {
    const { files, tokens } = base();
    const css = files["styles/site.css"] as string;
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch|lab|lch)\(|\b(white|black|red|gray|grey)\b/i);
    const before = (await build(files, sha))["dist/index.html"] as string;
    const next = { ...tokens, color: { ...tokens.color, border: "#123456" } }; // border has no minimum, so any value builds
    const after = (await build({ ...files, "tokens.json": JSON.stringify(next) }, sha))["dist/index.html"] as string;
    const strip = (h: string) => h.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "");
    expect(strip(after).split("#123456").length - 1).toBe(1);
    expect(strip(after).replace("--c-border: #123456;", "")).toBe(strip(before).replace(`--c-border: ${tokens.color.border};`, ""));
  });
});

describe("held: contrast on every pairing across hostile palettes", () => {
  it("held: 1,500 hostile seed sets in both modes derive palettes where every pairing passes build-core's independent check", () => {
    let seed = 0x5eed;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    const special = ["#000000", "#ffffff", "#808080", "#777777", "#767676", "#ff00ff", "#00ff00", "#ffff00", "#00ffff", "#ff0000", "#0000ff", "#010101", "#fefefe", "#7f7f7f", "#808081"];
    const pick = () => (rnd() < 0.45 ? special[Math.floor(rnd() * special.length)]! : `#${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0")}`);
    const failures: string[] = [];
    for (let i = 0; i < 1500; i++) {
      const s = clone(DEFAULT_SPEC);
      const near = pick();
      // A third of the sets use near-identical seeds (one step apart), the hardest case for the derivation.
      const bump = (h: string) => `#${(Math.min(0xffffff, parseInt(h.slice(1), 16) + 1)).toString(16).padStart(6, "0")}`;
      s.palette = i % 3 === 0
        ? { mode: rnd() < 0.5 ? "light" : "dark", canvas: near, ink: bump(near), accent: near, support: bump(bump(near)) }
        : { mode: rnd() < 0.5 ? "light" : "dark", canvas: pick(), ink: pick(), accent: pick(), support: pick() };
      try {
        const { tokens } = deriveTokens(s);
        for (const p of PAIRINGS) {
          const r = contrastRatio(tokens.color[p.fg], tokens.color[p.bg]);
          if (r < p.min) failures.push(`${JSON.stringify(s.palette)} ${p.id} ${r.toFixed(2)}`);
        }
      } catch (e) {
        failures.push(`${JSON.stringify(s.palette)} threw ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);
});

describe("held: exported packages build independently, byte for byte, for every template x variant", () => {
  it("held: 3 templates x 4 buttons x 3 surfaces x 2 headers x 2 modes, node build.mjs equals build()", async () => {
    const buttons = ["solid", "outline", "pill", "underline"] as const;
    const surfaces = ["flat", "outlined", "raised"] as const;
    const mismatches: string[] = [];
    let n = 0;
    for (const template of TEMPLATES) for (const button of buttons) for (const surface of surfaces) for (const header of ["inline", "centered"] as const) for (const mode of ["light", "dark"] as const) {
      const s = clone(EXAMPLES[template]);
      s.components = { ...s.components, button, surface, header };
      s.palette = mode === "light"
        ? { mode, canvas: "#FFF6E8", ink: "#29201B", accent: "#A6422A", support: "#E8D7BF" }
        : { mode, canvas: "#1E1916", ink: "#FFF6E8", accent: "#EE9E85", support: "#5A171B" };
      const files = compose(s).files;
      const studio = (await build(files, sha))["dist/index.html"];
      // An independent node process for a deterministic quarter of the grid keeps the suite fast.
      if (n++ % 4 === 0) {
        const r = nodeBuild(files);
        if (r.code !== 0 || r.html !== studio) mismatches.push(`${template}/${button}/${surface}/${header}/${mode}`);
      }
      expect(studio).toContain(`data-button="${button}" data-surface="${surface}" data-header="${header}"`);
    }
    expect(mismatches).toEqual([]);
  }, 120_000);
});

describe("held: determinism across processes, time zones, locales and working directories", () => {
  it("held: identical zip, page and tokens bytes", () => {
    const code = [
      `const { compose } = await import(${JSON.stringify(pathToFileURL(join(ENGINE, "compose.ts")).href)});`,
      `const { build } = await import(${JSON.stringify(pathToFileURL(join(ENGINE, "build-core.js")).href)});`,
      `const { zip } = await import(${JSON.stringify(pathToFileURL(join(ENGINE, "zip.ts")).href)});`,
      `const { EXAMPLES } = await import(${JSON.stringify(pathToFileURL(join(ENGINE, "examples.ts")).href)});`,
      `const { createHash } = await import("node:crypto");`,
      "const h = (d) => createHash('sha256').update(d).digest('hex');",
      "const out = [];",
      "for (const s of Object.values(EXAMPLES)) {",
      "  const c = compose(s);",
      "  const page = (await build(c.files, async (t) => createHash('sha256').update(t, 'utf8').digest('base64')))['dist/index.html'];",
      "  out.push(h(zip(c.files)), h(page), h(c.files['tokens.json']));",
      "}",
      "console.log(out.join(' '));",
    ].join("\n");
    const run = (env: Record<string, string>, cwd: string) => {
      const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd, env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
      expect(r.status, r.stderr).toBe(0);
      return r.stdout.trim();
    };
    const a = run({ TZ: "UTC", LANG: "C", LC_ALL: "C" }, FRONTEND);
    const b = run({ TZ: "Pacific/Kiritimati", LANG: "tr_TR.UTF-8", LC_ALL: "tr_TR.UTF-8" }, tempDir());
    const c = run({ TZ: "America/St_Johns", LANG: "ar_EG.UTF-8", LC_ALL: "ar_EG.UTF-8" }, REPO);
    expect(a.split(" ")).toHaveLength(9);
    expect(b).toBe(a);
    expect(c).toBe(a);
  }, 60_000);
});

describe("held: injection surfaces", () => {
  it("held: cta_href lookalikes, encoded schemes, whitespace and newlines are refused by the schema and by safeHref", () => {
    const hostile = [
      "javascript:alert(1)", "JAVASCRIPT:alert(1)", " https://a.example", "https://a.example ", "https://a.example\n", "https://a.example\njavascript:x",
      "https://exаmple.com", "ｈttps://a.example", "https:/\\evil.example", "//evil.example", "https://evil.example@good.example",
      "https://a.example/\"onmouseover=alert(1)", "https://a.example/<script>", "data:text/html,<script>alert(1)</script>", "https&#58;//a.example",
      "%6Aavascript:alert(1)", "https\u0000://a.example", "mailto:a@b.example?subject=<x>", "tel:+1<script>", "https://a.example/ ",
    ];
    for (const href of hostile) {
      const s = clone(DEFAULT_SPEC);
      s.brand.cta_href = href;
      expect(validateSpec(s).ok, JSON.stringify(href)).toBe(false);
      expect(safeHref(href), JSON.stringify(href)).toBe("#");
    }
    for (const href of ["https://a.example/path?x=1#y", "mailto:hello@fieldnote.example", "tel:+44 (0)20 7946 0000"]) {
      expect(safeHref(href)).toBe(href);
    }
  });

  it("held: zip entry names are the fixed eight files whatever the brief says", () => {
    const s = clone(DEFAULT_SPEC);
    s.brand.name = "../../etc/passwd ‮ gpj.exe";
    const names = Object.keys(compose(s).files);
    expect(names).toEqual(["README.md", "brief.json", "build.mjs", "index.html", "package.json", "scripts/motion.js", "styles/site.css", "tokens.json"]);
    // Read the names back from the zip's central directory.
    const buf = Buffer.from(zip(compose(s).files));
    const read: string[] = [];
    for (let i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), p = buf.readUInt32LE(i + 16), k = 0; k < buf.readUInt16LE(i + 10); k++) {
      const len = buf.readUInt16LE(p + 28);
      read.push(buf.subarray(p + 46, p + 46 + len).toString("utf8"));
      p += 46 + len + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    }
    expect(read).toEqual(names);
    expect(JSON.parse(compose(s).files["package.json"]!).name).toMatch(/^[a-z0-9-]+-site$/);
  });

  it("held: verify-candidate refuses prototype keys, deep nesting and oversize input without polluting prototypes", () => {
    const proto = verify(`{"__proto__":{"polluted":1},${JSON.stringify(DEFAULT_SPEC).slice(1)}`);
    const ctor = verify(JSON.stringify({ ...DEFAULT_SPEC, brand: { ...DEFAULT_SPEC.brand, constructor: { prototype: { polluted: 1 } } } }));
    const deep = verify(`{"schema_version":${"[".repeat(30_000)}${"]".repeat(30_000)}}`);
    const big = verify(`${JSON.stringify(DEFAULT_SPEC)}${" ".repeat(64 * 1024)}`);
    for (const r of [proto, ctor, deep, big]) {
      expect(r.accepted).toBe(false);
      expect(r.status).toBe(1);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(validateSpec(JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(DEFAULT_SPEC).slice(1)}`)).ok).toBe(false);
  });
});

describe("held: workflow boundaries", () => {
  const dir = join(REPO, ".github/workflows");
  const wf = (n: string) => readFileSync(join(dir, n), "utf8");
  const all = ["ci.yml", "generate.yml", "intake.yml", "memory.yml", "operations.yml", "outcome.yml", "pages.yml", "run.yml"];
  /** The text of one job (from its two-space key to the next job key). */
  const job = (text: string, name: string) => new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z][a-z-]*:\\n|$)`).exec(text)?.[1] ?? "";

  it("held: no pull_request_target, every third-party action pinned to a full SHA, no ${{ }} expression inside a shell script", () => {
    for (const n of all) {
      const text = wf(n);
      expect(text, n).not.toMatch(/pull_request_target/);
      for (const m of text.matchAll(/uses:\s*([^\s#]+)/g)) if (!m[1]!.startsWith("./")) expect(m[1], n).toMatch(/@[0-9a-f]{40}$/);
      // Lines of `run:` blocks (deeper than the `run:` key) must not interpolate expressions into the shell.
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        const run = /^(\s*)(- )?run: ?\|?(.*)$/.exec(line);
        if (!run) return;
        const indent = (run[1] ?? "").length + (run[2] ? 2 : 0);
        const body = [run[3] ?? ""];
        for (let j = i + 1; j < lines.length && (lines[j]!.trim() === "" || lines[j]!.search(/\S/) > indent); j++) body.push(lines[j]!);
        expect(body.join("\n"), `${n}:${i + 1}`).not.toMatch(/\$\{\{/);
      });
    }
  });

  it("held: the jobs that run repository code over requests or candidates hold no inference secret, and issues cannot claim AI provenance", () => {
    expect(job(wf("run.yml"), "compute")).not.toMatch(/secrets\./);
    expect(job(wf("run.yml"), "compute")).toMatch(/permissions:\n\s+contents: read\n/);
    const verifyJob = job(wf("generate.yml"), "verify");
    expect(verifyJob).toMatch(/verify-candidate/);
    expect(verifyJob).not.toMatch(/secrets\./);
    expect(verifyJob).toMatch(/permissions:\n\s+contents: read\n\s+steps:/);
    expect(wf("generate.yml")).toMatch(/on:\n\s+workflow_dispatch:/);
    expect(wf("generate.yml")).not.toMatch(/\n\s+(issues|issue_comment|pull_request|push|schedule|workflow_run):/);
    const project = JSON.parse(readFileSync(join(REPO, "project.json"), "utf8"));
    expect(project.constants).toEqual({ origin: "studio" });
  });
});

describe.skipIf(!HAS_PY)("held: schema parity on other edge inputs", () => {
  it("held: Ajv and Python agree on floats-as-integers, booleans, astral characters, separators and controls", () => {
    const base = JSON.stringify(SAMPLE);
    const texts = [
      base,
      base.replace('"base_px":17', '"base_px":17.0'),
      base.replace('"base_px":17', '"base_px":1.7e1'),
      base.replace('"base_px":17', '"base_px":true'),
      base.replace('"heading_weight":500', '"heading_weight":500.0'),
      base.replace('"speed_pct":100', '"speed_pct":1e2'),
      base.replace('"speed_pct":100', '"speed_pct":105'),
      sampleWith((s) => { s.brand.name = "\u{1F33F}".repeat(40); }),
      sampleWith((s) => { s.brand.name = "\u{1F33F}".repeat(41); }),
      sampleWith((s) => { s.brand.name = " "; }),
      sampleWith((s) => { s.brand.name = "　x"; }),
      sampleWith((s) => { s.brand.name = "a b"; }),
      sampleWith((s) => { s.brand.name = "a\u0085"; }),
      sampleWith((s) => { s.brand.name = "\ud800"; }),
      sampleWith((s) => { s.brand.summary = "line one\nline two"; }),
      sampleWith((s) => { s.brand.summary = "tab\there"; }),
      sampleWith((s) => { s.brand.cta_href = "https://a.example\n"; }),
      sampleWith((s) => { s.palette.canvas = "#FFF6E8\n"; }),
    ];
    expect(pythonAccepts(texts)).toEqual(ajvAccepts(texts));
  });
});
