import { SCRIPT_TAG, STYLE_LINK, TOKENS_MARKER } from "./build-core.js";
import { MOTION_PRESETS } from "./presets.ts";
import { RAW } from "./raw.ts";
import { CTA_HREF_PATTERN, validateSpec } from "./schema.ts";
import { deriveTokens } from "./tokens.ts";
import type { Composition, Spec, Template, Tokens } from "./types.ts";

export const GENERATOR = { name: "Minimal Motion Studio", version: "1.0.0" } as const;

// ---------------------------------------------------------------------------------------------
// Escaping is the security boundary: every brief string reaches the page through esc(), every
// attribute is double-quoted, and no brief string is ever written into CSS or JavaScript.

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

/** The CTA link, checked again at output time: https, mailto or tel only, otherwise "#". */
export function safeHref(href: string): string {
  return CTA_HREF_PATTERN.test(href) && /^(https:\/\/|mailto:|tel:)/.test(href) ? href : "#";
}

/** Base64 SHA-256 of UTF-8 text with Web Crypto (browsers, Node 19+): the hash build() needs for its CSP. */
export async function sha256Base64(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let bin = "";
  for (const byte of digest) bin += String.fromCharCode(byte);
  return btoa(bin);
}

/** JSON with keys sorted at every level, two-space indent and a final newline. */
export function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

/** Package name from the brand: ascii letters and digits joined by hyphens. */
export function slug(name: string): string {
  const s = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return s || "brand";
}

// ---------------------------------------------------------------------------------------------
// Decorative motif: deterministic from a hash of the brand name, no trigonometry at run time
// (a fixed table of angles) so every JavaScript engine draws the same bytes.

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// cos and sin of 0, 15, 30, ... 345 degrees, to four places.
const C = [1, 0.9659, 0.866, 0.7071, 0.5, 0.2588, 0, -0.2588, -0.5, -0.7071, -0.866, -0.9659, -1, -0.9659, -0.866, -0.7071, -0.5, -0.2588, 0, 0.2588, 0.5, 0.7071, 0.866, 0.9659];
const S = C.map((_, i) => C[(i + 18) % 24] as number);
const n1 = (n: number) => String(Math.round(n * 10) / 10);

function motif(spec: Spec): string {
  const r = random(fnv1a(`${spec.template}:${spec.brand.name}`));
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const shapes: string[] = [];
  let view = "0 0 240 240";
  if (spec.template === "studio") {
    // Field notes: a dot grid, a disc in the support colour and an accent arc.
    const disc = int(62, 84);
    shapes.push(`<circle class="m-s" cx="${int(132, 234 - disc)}" cy="${disc + int(6, 24)}" r="${disc}"/>`);
    const picked = new Set<number>();
    while (picked.size < 4) picked.add(int(0, 48));
    for (let i = 0; i < 49; i++) {
      const x = 30 + (i % 7) * 30;
      const y = 30 + Math.floor(i / 7) * 30;
      shapes.push(picked.has(i) ? `<circle class="m-a" cx="${x}" cy="${y}" r="5"/>` : `<circle class="m-b" cx="${x}" cy="${y}" r="2.5"/>`);
    }
    const cx = int(84, 112);
    const cy = int(140, 164);
    const rad = int(54, 72);
    const a0 = int(0, 23);
    const sweep = int(8, 14);
    const a1 = (a0 + sweep) % 24;
    shapes.push(`<path class="m-la" stroke-width="3" stroke-linecap="round" d="M${n1(cx + rad * (C[a0] as number))} ${n1(cy + rad * (S[a0] as number))}A${rad} ${rad} 0 ${sweep > 12 ? 1 : 0} 1 ${n1(cx + rad * (C[a1] as number))} ${n1(cy + rad * (S[a1] as number))}"/>`);
  } else if (spec.template === "shopfront") {
    // A shop window: three arches of different heights, a small sun and a ground line.
    const kinds = ["m-s", "m-f", "m-la"];
    const start = int(0, 2);
    let lowest = 0;
    let lowestTop = 0;
    for (let i = 0; i < 3; i++) {
      const x = 14 + i * 74;
      const top = int(36, 104);
      if (top > lowestTop) [lowest, lowestTop] = [i, top];
      const kind = kinds[(start + i) % 3] as string;
      const stroke = kind === "m-la" ? ' stroke-width="3"' : kind === "m-f" ? ' stroke="currentColor"' : "";
      shapes.push(`<path class="${kind}"${stroke} d="M${x} 214V${top + 32}A32 32 0 0 1 ${x + 64} ${top + 32}V214Z"/>`);
    }
    shapes.push(`<circle class="m-a" cx="${14 + lowest * 74 + 32}" cy="${lowestTop - int(14, 22)}" r="${int(9, 13)}"/>`);
    shapes.push('<path class="m-lt" stroke-width="2" stroke-linecap="round" d="M6 220H234"/>');
  } else {
    // An orbit: three ellipses, a planet in the support colour and a marker on the outer path.
    view = "0 48 480 132";
    const cx = 240;
    const cy = 156;
    for (const [rx, ry] of [[226, 92], [172, 70], [118, 48]] as const) {
      shapes.push(`<ellipse class="m-lb" stroke-width="1.5" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`);
    }
    shapes.push(`<circle class="m-s" cx="${cx}" cy="${cy}" r="${int(28, 36)}"/>`);
    const a = int(14, 22);
    const b = (a + int(2, 4)) % 24;
    const pt = (i: number, rx: number, ry: number) => `${n1(cx + rx * (C[i] as number))} ${n1(cy + ry * (S[i] as number))}`;
    shapes.push(`<path class="m-la" stroke-width="3" stroke-linecap="round" d="M${pt(a, 226, 92)}A226 92 0 0 1 ${pt(b, 226, 92)}"/>`);
    shapes.push(`<circle class="m-a" cx="${n1(cx + 226 * (C[b] as number))}" cy="${n1(cy + 92 * (S[b] as number))}" r="8"/>`);
    shapes.push(`<circle class="m-a" cx="${n1(cx + 118 * (C[a] as number))}" cy="${n1(cy + 48 * (S[a] as number))}" r="4"/>`);
  }
  return `<svg class="motif" data-m viewBox="${view}" aria-hidden="true" focusable="false">${shapes.join("")}</svg>`;
}

// ---------------------------------------------------------------------------------------------
// Page

type Section = { id: string; title: string; html: string };

const paras = (text: string, cls = "") => text.split(/\n+/).map((t) => t.trim()).filter(Boolean)
  .map((t) => `<p${cls ? ` class="${cls}"` : ""}>${esc(t)}</p>`).join("");

function facts(spec: Spec, keys: ("contact" | "location" | "hours")[]): string {
  const names = { contact: "Contact", location: "Location", hours: "Hours" };
  const rows = keys.filter((k) => spec.brand[k].trim()).map((k) => `<div><dt>${names[k]}</dt><dd>${esc(spec.brand[k])}</dd></div>`);
  return rows.length ? `<dl class="facts">${rows.join("")}</dl>` : "";
}

const button = (spec: Spec) => `<a class="btn" href="${esc(safeHref(spec.brand.cta_href))}">${esc(spec.brand.cta_label)}</a>`;

function questions(spec: Spec): Section | null {
  if (!spec.faqs.length) return null;
  const list = spec.faqs.map((f) => `<details class="qa card" data-m><summary>${esc(f.q)}</summary><div class="answer">${paras(f.a)}</div></details>`).join("\n");
  return {
    id: "questions", title: "Questions",
    html: `<div class="wrap faq"><h2 class="section-title" id="questions-title" data-m>Questions</h2><div class="faqs">\n${list}\n</div></div>`,
  };
}

function hero(spec: Spec): string {
  const b = spec.brand;
  const long = b.tagline.length > 40 ? " long" : "";
  const parts = [
    b.note.trim() ? `<p class="note" data-m>${esc(b.note)}</p>` : "",
    `<h1 class="title${long}" id="title" data-m>${esc(b.tagline)}</h1>`,
    b.summary.trim() ? `<div class="lede" data-m>${paras(b.summary)}</div>` : "",
    `<p class="actions" data-m>${button(spec)}</p>`,
  ];
  let aside = motif(spec);
  if (spec.template === "shopfront") {
    const f = facts(spec, ["location", "hours"]);
    if (f) aside = `<div class="hero-card">${aside}<div class="card" data-m>${f}</div></div>`;
  }
  return `<section class="hero" aria-labelledby="title">\n<div class="wrap hero-grid">\n<div class="hero-copy">\n${parts.filter(Boolean).join("\n")}\n</div>\n${aside}\n</div>\n</section>`;
}

function sections(spec: Spec): Section[] {
  const out: (Section | null)[] = [];
  const t: Template = spec.template;
  if (t === "studio") {
    if (spec.items.length) {
      const cards = spec.items.map((it, i) => `<li class="card item" data-m><span class="num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><h3>${esc(it.title)}</h3>${it.text.trim() ? `<p>${esc(it.text)}</p>` : ""}${it.meta.trim() ? `<p class="meta">${esc(it.meta)}</p>` : ""}</li>`);
      out.push({ id: "services", title: "What we do", html: `<div class="wrap"><h2 class="section-title" id="services-title" data-m>What we do</h2><ul class="items">\n${cards.join("\n")}\n</ul></div>` });
    }
    out.push(questions(spec));
    const f = facts(spec, ["contact", "location", "hours"]);
    if (f) {
      out.push({ id: "contact", title: "Contact", html: `<div class="wrap"><div class="card panel" data-m><div><h2 class="section-title" id="contact-title">Contact</h2><p class="actions">${button(spec)}</p></div>${f}</div></div>` });
    }
  } else if (t === "shopfront") {
    if (spec.items.length) {
      const dishes = spec.items.map((it) => `<li class="dish" data-m><div class="dish-row"><h3>${esc(it.title)}</h3>${it.meta.trim() ? `<span class="leader" aria-hidden="true"></span><p class="price">${esc(it.meta)}</p>` : ""}</div>${it.text.trim() ? `<p class="dish-text">${esc(it.text)}</p>` : ""}</li>`);
      out.push({ id: "menu", title: "Menu", html: `<div class="wrap"><h2 class="section-title" id="menu-title" data-m>Menu</h2><ul class="menu">\n${dishes.join("\n")}\n</ul></div>` });
    }
    const f = facts(spec, ["location", "hours", "contact"]);
    if (f) {
      out.push({ id: "visit", title: "Visit", html: `<div class="wrap band-inner"><div data-m><h2 class="section-title" id="visit-title">Visit</h2></div><p class="actions" data-m>${button(spec)}</p><div class="band-facts" data-m>${f}</div></div>` });
    }
    out.push(questions(spec));
  } else {
    if (spec.items.length) {
      const cards = spec.items.map((it) => `<li class="card item" data-m>${it.meta.trim() ? `<p class="label">${esc(it.meta)}</p>` : ""}<h3>${esc(it.title)}</h3>${it.text.trim() ? `<p>${esc(it.text)}</p>` : ""}</li>`);
      out.push({ id: "features", title: "Features", html: `<div class="wrap"><h2 class="section-title" id="features-title" data-m>Features</h2><ul class="items">\n${cards.join("\n")}\n</ul></div>` });
    }
    out.push(questions(spec));
    const contact = spec.brand.contact.trim() ? `<p data-m>${esc(spec.brand.contact)}</p>` : "";
    out.push({ id: "start", title: "Get started", html: `<div class="wrap band-inner"><h2 class="section-title" id="start-title" data-m>Get started</h2><p class="actions" data-m>${button(spec)}</p>${contact}</div>` });
  }
  return out.filter((s): s is Section => s !== null);
}

function page(spec: Spec): string {
  const b = spec.brand;
  const list = sections(spec);
  const banded = (id: string) => (spec.template === "shopfront" && id === "visit") || (spec.template === "launch" && id === "start");
  const nav = list.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join("");
  const body = list.map((s) => `<section class="section${banded(s.id) ? " band" : ""}" id="${s.id}" aria-labelledby="${s.id}-title" data-reveal>\n${s.html}\n</section>`);
  const footBits = [`<p class="brand">${esc(b.name)}</p>`, b.location.trim() ? `<p>${esc(b.location)}</p>` : "", '<a href="#top">Back to top</a>'];
  const c = spec.components;
  return `<!doctype html>
<html lang="en" data-template="${spec.template}" data-button="${c.button}" data-surface="${c.surface}" data-header="${c.header}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(b.name)}: ${esc(b.tagline)}</title>
<meta name="description" content="${esc((b.summary.trim() || b.tagline).replace(/\s+/g, " "))}">
${STYLE_LINK}
${TOKENS_MARKER}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead" id="top" data-m>
<div class="wrap bar">
<a class="mark" href="#top">${esc(b.name)}</a>
<nav aria-label="Sections"><ul class="nav">${nav}</ul></nav>
</div>
</header>
<main id="main" tabindex="-1">
${hero(spec)}
${body.join("\n")}
</main>
<footer class="foot">
<div class="wrap foot-bar">${footBits.filter(Boolean).join("")}</div>
</footer>
${SCRIPT_TAG}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Package files

const md = (s: string) => esc(s).replace(/([\\`*_[\]#|])/g, "\\$1");

function readme(spec: Spec, tokens: Tokens): string {
  const m = tokens.motion;
  const preset = MOTION_PRESETS[m.preset];
  const rows = tokens.pairings.map((p) => `| ${p.label} | ${p.fg} on ${p.bg} | ${p.ratio.toFixed(2)}:1 | ${p.min}:1 | ${p.pass ? "pass" : "FAIL"} |`);
  const motion = m.preset === "still"
    ? "Preset **Still**: nothing moves."
    : `Preset **${preset.label}**: ${preset.description} Entrances take ${m.duration_ms} ms, presses and collapses ${m.fast_ms} ms, content rises ${m.distance_px} px, and siblings follow each other at ${m.stagger_ms} ms intervals. Easing: \`${m.easing}\`.`;
  return `# ${md(spec.brand.name)} website

The source package for a one-page website, generated by Minimal Motion Studio from \`brief.json\`.

## Build

You need Node.js 18 or newer and nothing else (no \`npm install\`):

\`\`\`sh
npm run build
\`\`\`

This writes \`dist/index.html\`, a single self-contained page with its styles and script inlined and a
Content-Security-Policy that allows only those two blocks. It makes no network requests and uses
system fonts. Upload \`dist/\` to any static host (GitHub Pages, Netlify, an S3 bucket, a shared host).

## Files

| File | What it is |
|---|---|
| \`index.html\` | The page markup. |
| \`styles/site.css\` | Layout and components; every colour, font, size and duration is a custom property. |
| \`scripts/motion.js\` | Optional motion (Web Animations API). The page is complete without it. |
| \`tokens.json\` | Colours, type, spacing, radii and motion. The build turns it into CSS custom properties. |
| \`brief.json\` | The brief this package was generated from. |
| \`build.mjs\` | The build script (Node standard library only). |

## Changing a colour

Edit a value under \`color\` in \`tokens.json\` (for example \`"accent": "#7a3020"\`) and run
\`npm run build\` again. The build re-checks every pairing in the table below with its own contrast
calculation and stops with a list of the failing pairs if an edit makes text or controls unreadable.

## Contrast

Ratios are WCAG 2.2 contrast ratios (text 4.5:1, interface parts and focus rings 3:1).

| Where | Colours | Ratio | Minimum | Result |
|---|---|---|---|---|
${rows.join("\n")}

## Motion

${motion} Visitors who ask their system for reduced motion see no animation.

## Provenance

Generated deterministically by Minimal Motion Studio 1.0.0 from brief.json. No AI was involved in producing these files.

You may use, change and publish these files however you like, without attribution.
`;
}

function buildScript(): string {
  return `// Builds dist/index.html from the source files in this folder.
// Node.js 18 or newer, nothing to install: npm run build (or node build.mjs).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---- build-core.js, verbatim ----
${RAW.buildCore}
// ---- end of build-core.js ----

const here = dirname(fileURLToPath(import.meta.url));
try {
  const names = ["index.html", "styles/site.css", "scripts/motion.js", "tokens.json"];
  const files = Object.fromEntries(names.map((n) => [n, readFileSync(join(here, n), "utf8")]));
  const out = await build(files, async (text) => createHash("sha256").update(text, "utf8").digest("base64"));
  for (const [name, text] of Object.entries(out)) {
    mkdirSync(dirname(join(here, name)), { recursive: true });
    writeFileSync(join(here, name), text);
  }
  console.log("Built dist/index.html");
} catch (err) {
  console.error(\`Build failed: \${err instanceof Error ? err.message : String(err)}\`);
  process.exitCode = 1;
}
`;
}

/** The exported source package for a brief. Throws on an invalid brief. */
export function compose(input: unknown): Composition {
  const v = validateSpec(input);
  if (!v.ok) throw new Error(`The brief is not valid:\n- ${v.errors.join("\n- ")}`);
  const spec = v.spec;
  const { tokens, adjustments } = deriveTokens(spec);
  const files: Record<string, string> = {
    "README.md": readme(spec, tokens),
    "brief.json": stableJson(spec),
    "build.mjs": buildScript(),
    "index.html": page(spec),
    "package.json": stableJson({ engines: { node: ">=18" }, name: `${slug(spec.brand.name)}-site`, private: true, scripts: { build: "node build.mjs" }, type: "module" }),
    "scripts/motion.js": RAW.motionJs,
    "styles/site.css": RAW.siteCss,
    "tokens.json": stableJson({ ...tokens, generator: GENERATOR }),
  };
  const sorted = Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k] as string]));
  return { files: sorted, tokens, adjustments };
}
