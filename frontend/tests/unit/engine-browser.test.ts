// @vitest-environment node
// Generated pages in Chromium: no field at its schema maximum, written as one unbroken word, may make
// the 390 px page scroll sideways. Needs Playwright's Chromium (CI installs it before the unit tests).
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { build } from "../../src/engine/build-core.js";
import { compose } from "../../src/engine/compose.ts";
import { EXAMPLES } from "../../src/engine/examples.ts";
import type { Spec, Template } from "../../src/engine/types.ts";

const sha = async (t: string) => createHash("sha256").update(t, "utf8").digest("base64");
const word = (n: number) => "Donaudampfschifffahrtsgesellschaftskapitän".repeat(8).slice(0, n);

function longest(template: Template, components: Spec["components"]): Spec {
  const s = structuredClone(EXAMPLES[template]);
  s.components = components;
  s.brand = { ...s.brand, name: word(40), tagline: word(90), summary: word(320), cta_label: word(28), contact: word(120), location: word(120), hours: word(120), note: word(160) };
  s.items = Array.from({ length: 6 }, () => ({ title: word(48), text: word(160), meta: word(24) }));
  s.faqs = Array.from({ length: 5 }, () => ({ q: word(100), a: word(320) }));
  return s;
}

type Field = [string, (s: Spec) => void];
// One page per field at its maximum (the reviewer's case: a single long item title), plus one with all of them.
const FIELDS: Field[] = [
  ["name", (s) => { s.brand.name = word(40); }], ["tagline", (s) => { s.brand.tagline = word(90); }],
  ["summary", (s) => { s.brand.summary = word(320); }], ["cta_label", (s) => { s.brand.cta_label = word(28); }],
  ["contact", (s) => { s.brand.contact = word(120); }], ["location", (s) => { s.brand.location = word(120); }],
  ["hours", (s) => { s.brand.hours = word(120); }], ["note", (s) => { s.brand.note = word(160); }],
  ["item title", (s) => { s.items[0]!.title = word(48); }], ["item text", (s) => { s.items[0]!.text = word(160); }],
  ["item meta", (s) => { s.items[0]!.meta = word(24); }], ["question", (s) => { s.faqs[0]!.q = word(100); }],
  ["answer", (s) => { s.faqs[0]!.a = word(320); }],
];

describe("generated pages in Chromium", () => {
  it("never scroll sideways at 390 px, whatever the field lengths", async () => {
    const browser = await chromium.launch();
    try {
      const cases: [string, Spec][] = [];
      const variants: Spec["components"][] = [
        { button: "solid", surface: "flat", radius: "soft", header: "inline" },
        { button: "underline", surface: "outlined", radius: "none", header: "centered" },
        { button: "pill", surface: "raised", radius: "round", header: "inline" },
      ];
      for (const template of ["studio", "shopfront", "launch"] as const) {
        for (const components of variants) {
          const spec = longest(template, components);
          expect(validateLengths(spec)).toBe(true);
          cases.push([`${template}/${components.button}/${components.header}/all fields`, spec]);
        }
        for (const [name, set] of FIELDS) {
          const spec = structuredClone(EXAMPLES[template]);
          set(spec);
          cases.push([`${template}/${name}`, spec]);
        }
      }
      const failures: string[] = [];
      for (const [name, spec] of cases) {
        // A fresh page each time: a page's CSP meta outlives setContent and would block the next style.
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.setContent((await build(compose(spec).files, sha))["dist/index.html"] as string);
        const r = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          styled: getComputedStyle(document.body).margin === "0px",
        }));
        await page.close();
        expect(r.styled, `${name}: the page's own styles applied`).toBe(true);
        if (r.overflow > 0) failures.push(`${name}: ${r.overflow} px`);
      }
      expect(failures).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60_000);
});

/** Every field really is at its maximum (so the test cannot pass by accident with short text). */
function validateLengths(s: Spec): boolean {
  const b = s.brand;
  return [b.name.length === 40, b.tagline.length === 90, b.summary.length === 320, b.cta_label.length === 28, b.note.length === 160,
    s.items.every((i) => i.title.length === 48 && i.text.length === 160 && i.meta.length === 24),
    s.faqs.every((f) => f.q.length === 100 && f.a.length === 320)].every(Boolean);
}
