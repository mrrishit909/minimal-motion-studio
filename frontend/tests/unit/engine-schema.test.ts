// @vitest-environment node
// The brief contract behaves the same in Ajv (studio, CLI) and Python jsonschema (harness), in linear time.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC } from "../../src/engine/examples.ts";
import { validateSpec } from "../../src/engine/schema.ts";
import type { Spec } from "../../src/engine/types.ts";

const REPO = resolve(__dirname, "../../..");
const PY = join(REPO, ".venv/bin/python");
const HAS_PY = existsSync(PY) && spawnSync(PY, ["-I", "-c", "import jsonschema"]).status === 0;
const SCHEMA = JSON.parse(readFileSync(join(REPO, "schemas/request.schema.json"), "utf8"));

// Characters at the edges of "visible", "blank" and "control" in either engine.
const CODES = [
  0x00, 0x09, 0x0a, 0x0d, 0x1c, 0x1f, 0x20, 0x41, 0x7e, 0x7f, 0x80, 0x85, 0x9f, 0xa0, 0xa1, 0x1680, 0x180e,
  ...Array.from({ length: 12 }, (_, i) => 0x2000 + i), 0x2028, 0x2029, 0x202f, 0x205f, 0x2060, 0x3000, 0xfeff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xfffd,
];
const strings = CODES.flatMap((c) => {
  const ch = String.fromCharCode(c);
  return [ch, ch.repeat(3), `a${ch}`, `${ch}a`, `${ch}\u{1F33F}`];
}).concat(["\u{1F33F}", "a\n", "a\r\n", " \n"]);
/** One spec per string, the string placed in a required line, a line and a paragraph field. */
const specsFor = (s: string): Spec[] => [
  { ...structuredClone(DEFAULT_SPEC), brand: { ...DEFAULT_SPEC.brand, name: s } },
  { ...structuredClone(DEFAULT_SPEC), brand: { ...DEFAULT_SPEC.brand, contact: s } },
  { ...structuredClone(DEFAULT_SPEC), brand: { ...DEFAULT_SPEC.brand, summary: s } },
];

describe("schema parity and speed", () => {
  it.skipIf(!HAS_PY)("accepts and rejects exactly the same strings as Python jsonschema", () => {
    const specs = strings.flatMap(specsFor);
    const code = [
      "import json, sys",
      "from jsonschema import Draft202012Validator",
      `schema = json.load(open(${JSON.stringify(join(REPO, "schemas/request.schema.json"))}))`,
      "v = Draft202012Validator(schema)",
      "print(json.dumps([v.is_valid({'spec': s, 'origin': 'fixture'}) for s in json.load(sys.stdin)]))",
    ].join("\n");
    const r = spawnSync(PY, ["-I", "-c", code], { input: JSON.stringify(specs), encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const python = JSON.parse(r.stdout) as boolean[];
    const ajv = specs.map((s) => validateSpec(s).ok);
    const differ = specs.map((_, i) => i).filter((i) => python[i] !== ajv[i])
      .map((i) => `${["name", "contact", "summary"][i % 3]} ${JSON.stringify(strings[Math.floor(i / 3)])}`);
    expect(differ).toEqual([]);
    // Spot checks of the intended meaning.
    const ok = (s: string, field = 0) => validateSpec(specsFor(s)[field]).ok;
    expect(ok("﻿")).toBe(false); // blank required line
    expect(ok("　x")).toBe(true);
    expect(ok("​")).toBe(false);
    expect(ok("\u0085", 1)).toBe(false); // C1 control
    expect(ok("a\nb", 2)).toBe(true); // paragraphs keep line breaks
    expect(ok("a\n", 1)).toBe(false); // a trailing newline is still a line break
  });

  it("validates a 64 KB field in well under 100 ms (patterns are linear)", () => {
    for (const tail of ["\u0001", "a"]) {
      for (const field of ["name", "contact", "summary"] as const) {
        const s = structuredClone(DEFAULT_SPEC);
        s.brand[field] = `${field === "name" ? " ".repeat(32_768) : ""}${"a".repeat(32_768)}${tail}`;
        const t = performance.now();
        validateSpec(s);
        expect(performance.now() - t, `${field} ${JSON.stringify(tail)}`).toBeLessThan(100);
      }
    }
  });

  it.skipIf(!HAS_PY)("does the same in Python", () => {
    const code = [
      "import json, re, sys, time",
      "defs = json.load(sys.stdin)",
      "worst = 0",
      "for name in ['line', 'required_line', 'paragraph']:",
      "    p = re.compile(defs[name]['pattern'])",
      "    for s in [' ' * 32768 + 'a' * 32768 + '\\x01', 'a' * 65536 + '\\x01', 'a' * 65536]:",
      "        t = time.perf_counter(); p.search(s); worst = max(worst, time.perf_counter() - t)",
      "print(worst * 1000)",
    ].join("\n");
    const r = spawnSync(PY, ["-I", "-c", code], { input: JSON.stringify(SCHEMA.$defs), encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(Number(r.stdout)).toBeLessThan(100);
  });
});
