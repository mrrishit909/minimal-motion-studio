import { clampChroma, converter, formatHex, wcagContrast } from "culori";

// Colour work happens in OKLCH: hue and chroma are kept, only lightness moves, and the result is
// gamut-mapped to sRGB (chroma reduced until it fits) and written as lower-case #rrggbb.

const toOklch = converter("oklch");

export type Lch = { l: number; c: number; h: number };

export function oklchOf(hex: string): Lch {
  const o = toOklch(hex);
  if (!o) throw new Error("not a colour");
  return { l: o.l, c: o.c ?? 0, h: o.h ?? 0 };
}

/** The sRGB colour at lightness l with the given hue and chroma (chroma reduced to fit the gamut). */
export function atLightness(lch: Lch, l: number): string {
  const L = Math.min(1, Math.max(0, l));
  return formatHex(clampChroma({ mode: "oklch", l: L, c: lch.c, h: lch.h }, "oklch")).toLowerCase();
}

export function normalizeHex(hex: string): string {
  return hex.toLowerCase();
}

/** WCAG 2.x contrast ratio (culori's implementation; build-core.js carries an independent one). */
export function contrastRatio(a: string, b: string): number {
  return wcagContrast(a, b);
}

export type Constraint = { bg: string; min: number };

export const fits = (hex: string, cs: Constraint[]) => cs.every((c) => contrastRatio(hex, c.bg) >= c.min);

/** Lowest ratio of a colour across its constraints (the binding one). */
export const worstRatio = (hex: string, cs: Constraint[]) => Math.min(...cs.map((c) => contrastRatio(hex, c.bg)));

/**
 * The colour closest in lightness to `seed` (same hue and chroma) that meets every constraint, or
 * null if none exists on that hue line. A seed that already passes is returned byte for byte.
 * Both directions are searched: a coarse walk in 0.01 steps finds the first passing lightness, then a
 * binary search narrows the boundary so the change is as small as possible. Every candidate is
 * judged on its final rounded hex value, so what passes here passes in the built page.
 */
export function ensureContrast(seed: string, cs: Constraint[]): string | null {
  const hex = normalizeHex(seed);
  if (fits(hex, cs)) return hex;
  const lch = oklchOf(hex);
  const found: { hex: string; dist: number; dir: number }[] = [];
  for (const dir of [-1, 1]) {
    let fail = lch.l;
    let pass: number | null = null;
    for (let k = 1; k <= 101; k++) {
      const l = Math.min(1, Math.max(0, lch.l + dir * k * 0.01));
      if (fits(atLightness(lch, l), cs)) {
        pass = l;
        break;
      }
      fail = l;
      if (l === 0 || l === 1) break;
    }
    if (pass === null) continue;
    let ok: number = pass;
    for (let i = 0; i < 20; i++) {
      const mid = (fail + ok) / 2;
      if (fits(atLightness(lch, mid), cs)) ok = mid;
      else fail = mid;
    }
    found.push({ hex: atLightness(lch, ok), dist: Math.abs(ok - lch.l), dir });
  }
  if (!found.length) return null;
  // Smallest change wins; on a tie, the direction with more contrast headroom against the first background.
  found.sort((a, b) => a.dist - b.dist || headroom(b.dir, cs) - headroom(a.dir, cs));
  return found[0]!.hex;
}

/** Contrast available at the far end of a direction (black for -1, white for +1). */
function headroom(dir: number, cs: Constraint[]): number {
  return contrastRatio(dir < 0 ? "#000000" : "#ffffff", cs[0]!.bg);
}

/** Is this background closer to white than to black, judged by actual luminance? */
export const isLight = (hex: string) => contrastRatio(hex, "#000000") >= contrastRatio(hex, "#ffffff");

/** Move a colour's OKLCH lightness by `dl`, keeping hue and chroma. */
export const shift = (hex: string, dl: number) => {
  const lch = oklchOf(hex);
  return atLightness(lch, lch.l + dl);
};

/** A colour part-way from `a` to `b` in OKLCH lightness (t = 0 is a), keeping a's hue and chroma. */
export const towards = (a: string, b: string, t: number) => {
  const x = oklchOf(a);
  return atLightness(x, x.l + (oklchOf(b).l - x.l) * t);
};

export const ratio2 = (n: number) => Math.round(n * 100) / 100;
