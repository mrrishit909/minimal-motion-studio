// build-core.js: turns a Minimal Motion Studio source package into one self-contained page.
// Plain JavaScript with no dependencies. The studio runs this file for its preview and every exported
// package embeds this exact text in build.mjs, so the preview and `npm run build` give the same bytes.

/**
 * @typedef {"canvas"|"surface"|"text"|"text_muted"|"border"|"accent"|"action"|"on_action"|"support"|"on_support"|"focus"|"success"|"warning"|"danger"} ColorRole
 * @typedef {{id: string, label: string, fg: ColorRole, bg: ColorRole, kind: "text"|"large-text"|"ui", min: number}} PairingRule
 * @typedef {{step: number, px: number, css: string, line_height: number}} Step
 * @typedef {{
 *   mode: "light"|"dark",
 *   color: Record<ColorRole, string>,
 *   font: {heading: string, body: string, mono: string, heading_weight: number},
 *   type: Step[],
 *   measure_ch: number,
 *   space: number[],
 *   radius: {control: number, surface: number, pill: number},
 *   motion: {preset: string, duration_ms: number, fast_ms: number, easing: string, distance_px: number, stagger_ms: number}
 * }} BuildTokens
 */

/** @type {ColorRole[]} */
export const ROLES = ["canvas", "surface", "text", "text_muted", "border", "accent", "action", "on_action", "support",
  "on_support", "focus", "success", "warning", "danger"];

/**
 * Every foreground/background pair the page's CSS uses, with its WCAG 2.2 minimum
 * (1.4.3: 4.5 for text, 3 for large text; 1.4.11: 3 for interface boundaries and focus rings).
 * Borders are decorative hairlines and have no minimum.
 * @type {PairingRule[]}
 */
export const PAIRINGS = [
  { id: "text-canvas", label: "Body text on the page", fg: "text", bg: "canvas", kind: "text", min: 4.5 },
  { id: "text-surface", label: "Body text on panels", fg: "text", bg: "surface", kind: "text", min: 4.5 },
  { id: "muted-canvas", label: "Secondary text on the page", fg: "text_muted", bg: "canvas", kind: "text", min: 4.5 },
  { id: "muted-surface", label: "Secondary text on panels", fg: "text_muted", bg: "surface", kind: "text", min: 4.5 },
  { id: "accent-canvas", label: "Accent text and links on the page", fg: "accent", bg: "canvas", kind: "text", min: 4.5 },
  { id: "accent-surface", label: "Accent text on panels", fg: "accent", bg: "surface", kind: "text", min: 4.5 },
  { id: "label-action", label: "Button label on a filled button", fg: "on_action", bg: "action", kind: "text", min: 4.5 },
  { id: "action-canvas", label: "Button edge against the page", fg: "action", bg: "canvas", kind: "ui", min: 3 },
  { id: "action-surface", label: "Button edge against panels", fg: "action", bg: "surface", kind: "ui", min: 3 },
  { id: "band-text", label: "Text and buttons on the support band", fg: "on_support", bg: "support", kind: "text", min: 4.5 },
  { id: "focus-canvas", label: "Focus ring on the page", fg: "focus", bg: "canvas", kind: "ui", min: 3 },
  { id: "focus-surface", label: "Focus ring on panels", fg: "focus", bg: "surface", kind: "ui", min: 3 },
  { id: "focus-support", label: "Focus ring on the support band", fg: "focus", bg: "support", kind: "ui", min: 3 },
  { id: "success-canvas", label: "Success text on the page", fg: "success", bg: "canvas", kind: "text", min: 4.5 },
  { id: "warning-canvas", label: "Warning text on the page", fg: "warning", bg: "canvas", kind: "text", min: 4.5 },
  { id: "danger-canvas", label: "Danger text on the page", fg: "danger", bg: "canvas", kind: "text", min: 4.5 },
];

/** WCAG 2.x relative luminance of a #rrggbb colour. @param {string} hex */
export function luminance(hex) {
  const lin = (/** @type {number} */ i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
}

/** WCAG 2.x contrast ratio between two #rrggbb colours (1 to 21). @param {string} a @param {string} b */
export function contrastRatio(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const TOKENS_MARKER = "<!-- mms:tokens -->";
export const STYLE_LINK = '<link rel="stylesheet" href="styles/site.css">';
export const SCRIPT_TAG = '<script defer src="scripts/motion.js"></script>';

/** @param {string} msg @returns {never} */
function fail(msg) {
  throw new Error(msg);
}

/** @param {unknown} v @param {string} at @param {number} lo @param {number} hi @param {boolean} [whole] */
function num(v, at, lo, hi, whole = false) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi || (whole && !Number.isInteger(v))) {
    fail(`tokens.json: ${at} must be a ${whole ? "whole " : ""}number from ${lo} to ${hi}`);
  }
  return v;
}

/** @param {unknown} v @param {string} at @param {RegExp} re @param {string} rule */
function str(v, at, re, rule) {
  if (typeof v !== "string" || !re.test(v)) fail(`tokens.json: ${at} ${rule}`);
  return v;
}

/** @param {unknown} v @param {string} at @returns {Record<string, unknown>} */
function obj(v, at) {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(`tokens.json: ${at} must be an object`);
  return /** @type {Record<string, unknown>} */ (v);
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const FONT = /^(?=[^']*('[^']*'[^']*)*$)[A-Za-z0-9 ,'_-]{1,300}$/;
const CSS_LENGTH = /^[0-9a-z.,()+ -]{1,120}$/;
const EASING = /^(linear|ease|ease-in|ease-out|ease-in-out|(cubic-bezier|linear)\([0-9., %-]{1,400}\))$/;

/**
 * Checks tokens.json strictly before any value is written into CSS, so an edited file can change
 * values but can never inject rules or markup.
 * @param {unknown} raw
 * @returns {BuildTokens}
 */
export function checkTokens(raw) {
  const t = obj(raw, "the file");
  const mode = t.mode === "light" || t.mode === "dark" ? t.mode : fail('tokens.json: mode must be "light" or "dark"');
  const c = obj(t.color, "color");
  /** @type {Record<string, string>} */
  const color = {};
  for (const role of ROLES) color[role] = str(c[role], `color.${role}`, HEX, "must be a colour written as #rrggbb").toLowerCase();
  const f = obj(t.font, "font");
  const font = {
    heading: str(f.heading, "font.heading", FONT, "must be a list of font names"),
    body: str(f.body, "font.body", FONT, "must be a list of font names"),
    mono: str(f.mono, "font.mono", FONT, "must be a list of font names"),
    heading_weight: num(f.heading_weight, "font.heading_weight", 100, 900, true),
  };
  if (!Array.isArray(t.type) || t.type.length !== 7) fail("tokens.json: type must list the 7 steps -1 to 5");
  const type = t.type.map((s, i) => {
    const o = obj(s, `type[${i}]`);
    if (o.step !== i - 1) fail(`tokens.json: type[${i}].step must be ${i - 1}`);
    return {
      step: i - 1,
      px: num(o.px, `type[${i}].px`, 6, 200),
      css: str(o.css, `type[${i}].css`, CSS_LENGTH, "must be a CSS length such as 1.0625rem or a clamp()"),
      line_height: num(o.line_height, `type[${i}].line_height`, 0.8, 3),
    };
  });
  if (!Array.isArray(t.space) || t.space.length !== 9) fail("tokens.json: space must list 9 sizes in px");
  const space = t.space.map((v, i) => num(v, `space[${i}]`, 0, 400, true));
  const r = obj(t.radius, "radius");
  const radius = {
    control: num(r.control, "radius.control", 0, 999, true),
    surface: num(r.surface, "radius.surface", 0, 999, true),
    pill: num(r.pill, "radius.pill", 0, 999, true),
  };
  const m = obj(t.motion, "motion");
  const motion = {
    preset: str(m.preset, "motion.preset", /^(still|gentle|crisp|lively)$/, "must be still, gentle, crisp or lively"),
    duration_ms: num(m.duration_ms, "motion.duration_ms", 0, 5000, true),
    fast_ms: num(m.fast_ms, "motion.fast_ms", 0, 5000, true),
    easing: str(m.easing, "motion.easing", EASING, "must be a CSS easing such as ease-out or cubic-bezier(...)"),
    distance_px: num(m.distance_px, "motion.distance_px", 0, 200, true),
    stagger_ms: num(m.stagger_ms, "motion.stagger_ms", 0, 1000, true),
  };
  return {
    mode,
    color: /** @type {Record<ColorRole, string>} */ (color),
    font,
    type,
    measure_ch: num(t.measure_ch, "measure_ch", 20, 120, true),
    space,
    radius,
    motion,
  };
}

/**
 * The pairings that fail their minimum, in plain words.
 * @param {Record<ColorRole, string>} color
 */
export function failingPairings(color) {
  return PAIRINGS.filter((p) => contrastRatio(color[p.fg], color[p.bg]) < p.min).map(
    (p) => `${p.label}: ${contrastRatio(color[p.fg], color[p.bg]).toFixed(2)}:1, needs ${p.min}:1 (${p.fg} ${color[p.fg]} on ${p.bg} ${color[p.bg]})`,
  );
}

/** The :root custom properties every other file reads. @param {BuildTokens} t */
export function tokensCss(t) {
  const lines = [`color-scheme: ${t.mode};`];
  for (const role of ROLES) lines.push(`--c-${role.replace("_", "-")}: ${t.color[role]};`);
  // Shadows: the text colour on light pages, black on dark ones (a light shadow would glow).
  lines.push(`--c-shadow: ${luminance(t.color.canvas) > 0.18 ? t.color.text : "#000000"};`);
  lines.push(`--font-heading: ${t.font.heading};`, `--font-body: ${t.font.body};`, `--font-mono: ${t.font.mono};`);
  lines.push(`--weight-heading: ${t.font.heading_weight};`);
  for (const s of t.type) lines.push(`--step-${s.step}: ${s.css};`, `--lh-${s.step}: ${s.line_height};`);
  lines.push(`--measure: ${t.measure_ch}ch;`);
  t.space.forEach((v, i) => lines.push(`--space-${i + 1}: ${v}px;`));
  lines.push(`--radius-control: ${t.radius.control}px;`, `--radius-surface: ${t.radius.surface}px;`, `--radius-pill: ${t.radius.pill}px;`);
  lines.push(`--m-preset: ${t.motion.preset};`, `--m-duration: ${t.motion.duration_ms}ms;`, `--m-fast: ${t.motion.fast_ms}ms;`);
  lines.push(`--m-easing: ${t.motion.easing};`, `--m-distance: ${t.motion.distance_px}px;`, `--m-stagger: ${t.motion.stagger_ms}ms;`);
  // Fixed layout constants: touch target (WCAG 2.5.8 asks 24px; 44px is used), page width, gutters, lines.
  lines.push("--target: 2.75rem;", "--page: 74rem;", "--gutter: clamp(1rem, 5vw, 3.5rem);", "--line: 1px;", "--ring: 2px;");
  return `:root {\n${lines.map((l) => `  ${l}`).join("\n")}\n}\n`;
}

/** @param {string} text @param {string} part @param {string} name */
function once(text, part, name) {
  if (text.split(part).length !== 2) fail(`index.html must contain ${name} exactly once`);
}

/**
 * Builds dist/index.html: tokens CSS and site.css inlined as one <style>, motion.js as one <script>,
 * and a Content-Security-Policy that allows exactly those two blocks and nothing else.
 * @param {Record<string, string>} files the source package (index.html, styles/site.css, scripts/motion.js, tokens.json)
 * @param {(text: string) => Promise<string>} sha256 base64 SHA-256 of the UTF-8 text
 * @returns {Promise<Record<string, string>>}
 */
export async function build(files, sha256) {
  for (const name of ["index.html", "styles/site.css", "scripts/motion.js", "tokens.json"]) {
    if (typeof files[name] !== "string") fail(`the package is missing ${name}`);
  }
  const html = /** @type {string} */ (files["index.html"]);
  const css = /** @type {string} */ (files["styles/site.css"]);
  const js = /** @type {string} */ (files["scripts/motion.js"]);
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(/** @type {string} */ (files["tokens.json"]));
  } catch {
    fail("tokens.json is not valid JSON");
  }
  const tokens = checkTokens(raw);

  const failing = failingPairings(tokens.color);
  if (failing.length) {
    fail(`Contrast check failed for ${failing.length} pairing${failing.length === 1 ? "" : "s"} in tokens.json:\n- ${failing.join("\n- ")}`);
  }

  const root = tokensCss(tokens);
  const defined = new Set([...root.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([
    ...[...(css + js).matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map((m) => m[1]),
    ...[...js.matchAll(/["'](--[A-Za-z0-9_-]+)["']/g)].map((m) => m[1]),
  ]);
  const missing = [...used].filter((v) => !defined.has(v)).sort();
  if (missing.length) fail(`site.css or motion.js uses custom properties the tokens do not define: ${missing.join(", ")}`);

  const style = `${root}${css}`;
  if (/<\/style/i.test(style)) fail("site.css must not contain </style");
  if (/<\/script|<!--/i.test(js)) fail("motion.js must not contain </script or <!--");
  once(html, TOKENS_MARKER, TOKENS_MARKER);
  once(html, STYLE_LINK, STYLE_LINK);
  once(html, SCRIPT_TAG, SCRIPT_TAG);

  const [styleHash, scriptHash] = await Promise.all([sha256(style), sha256(js)]);
  const csp = `default-src 'none'; style-src 'sha256-${styleHash}'; script-src 'sha256-${scriptHash}'; img-src data:; base-uri 'none'; form-action 'none'`;
  const page = html
    .split(STYLE_LINK).join("")
    .split(TOKENS_MARKER).join(`<meta http-equiv="Content-Security-Policy" content="${csp}">\n<style>${style}</style>`)
    .split(SCRIPT_TAG).join(`<script>${js}</script>`);
  return { "dist/index.html": page };
}
