import { PAIRINGS } from "./build-core.js";
import {
  atLightness, type Constraint, contrastRatio, ensureContrast, isLight, normalizeHex, oklchOf, ratio2, shift, towards, worstRatio,
} from "./color.ts";
import { MOTION_PRESETS, scaleDuration } from "./presets.ts";
import type { Adjustment, ColorRole, Pairing, Spec, Tokens, TypeStep } from "./types.ts";
import { MONO_STACK, VOICES } from "./voices.ts";

export { PAIRINGS };

type Palette = Record<ColorRole, string>;

/** Raised panels: a small OKLCH lightness step away from the canvas, enough to see. */
function surfaceFor(canvas: string): string {
  const lch = oklchOf(canvas);
  if (!isLight(canvas)) return atLightness(lch, Math.max(lch.l + 0.05, 0.2));
  return lch.l + 0.035 <= 0.995 ? atLightness(lch, lch.l + 0.035) : atLightness(lch, lch.l - 0.04);
}

const STATUS_HUES = { success: 150, warning: 70, danger: 27 } as const;

/**
 * Derives every role from the four seeds at a given canvas, or returns null if some role cannot
 * meet its minimums by lightness alone (the caller then moves the canvas and tries again).
 */
function attempt(canvas: string, seeds: Spec["palette"]): { color: Palette; supportMoved: boolean } | null {
  const surface = surfaceFor(canvas);
  const both = (min: number): Constraint[] => [{ bg: canvas, min }, { bg: surface, min }];
  const text = ensureContrast(seeds.ink, both(4.5));
  const accent = ensureContrast(seeds.accent, both(4.5));
  const action = ensureContrast(seeds.accent, both(3));
  if (!text || !accent || !action) return null;
  const text_muted = ensureContrast(towards(text, canvas, 0.32), both(4.5));
  const on_action = ensureContrast(canvas, [{ bg: action, min: 4.5 }]);
  if (!text_muted || !on_action) return null;

  let support = normalizeHex(seeds.support);
  let focus = ensureContrast(action, [...both(3), { bg: support, min: 3 }]);
  let supportMoved = false;
  if (!focus) {
    // No ring colour on this hue works on the page and the band at once: keep the ring right for
    // the page and move the band colour away from it instead.
    focus = ensureContrast(action, both(3));
    const moved = focus && ensureContrast(support, [{ bg: focus, min: 3 }]);
    if (!focus || !moved) return null;
    support = moved;
    supportMoved = true;
  }
  const bandSeed = contrastRatio(text, support) >= contrastRatio(canvas, support) ? text : canvas;
  const on_support = ensureContrast(bandSeed, [{ bg: support, min: 4.5 }]);
  if (!on_support) return null;

  const light = isLight(canvas);
  const status = (h: number) => ensureContrast(atLightness({ l: 0, c: 0.14, h }, light ? 0.5 : 0.8), [{ bg: canvas, min: 4.5 }]);
  const success = status(STATUS_HUES.success);
  const warning = status(STATUS_HUES.warning);
  const danger = status(STATUS_HUES.danger);
  if (!success || !warning || !danger) return null;

  const border = towards(canvas, text, 0.2);
  return {
    color: { canvas, surface, text, text_muted, border, accent, action, on_action, support, on_support, focus, success, warning, danger },
    supportMoved,
  };
}

const fmt = (n: number) => String(Math.round(n * 1e4) / 1e4);
const round2 = (n: number) => Math.round(n * 100) / 100;
const verb = (from: string, to: string) => (oklchOf(to).l < oklchOf(from).l ? "Darkened" : "Lightened");

function typeScale(spec: Spec): TypeStep[] {
  const ratio = Number(spec.type.ratio);
  const base = spec.type.base_px;
  const serifBody = spec.type.body === "old-style" || spec.type.body === "transitional";
  const lh: Record<number, number> = { [-1]: 1.5, 0: serifBody ? 1.65 : 1.58, 1: 1.35, 2: 1.25, 3: 1.18, 4: 1.12, 5: 1.08 };
  // Phone sizes: a share of the desktop size, capped so steep scales stay readable on a 390 px screen,
  // and never below step 2.
  const phone: Record<number, number> = { 3: 0.8, 4: 0.66, 5: 0.56 };
  const phoneCap: Record<number, number> = { 3: 30, 4: 38, 5: 44 };
  // Repeated multiplication rather than ** so every JavaScript engine gives the same bits.
  const px = (n: number) => {
    let v = base;
    for (let i = 0; i < Math.abs(n); i++) v = n > 0 ? v * ratio : v / ratio;
    return round2(v);
  };
  const steps: TypeStep[] = [];
  for (let n = -1; n <= 5; n++) {
    const max = px(n);
    let css = `${fmt(max / 16)}rem`;
    if (n >= 3) {
      // Fluid between a 390 px and a 1440 px wide viewport, in rem so text zoom still works.
      const min = Math.max(Math.min(round2(max * (phone[n] ?? 1)), phoneCap[n] ?? max), px(2));
      const slope = (max - min) / (1440 - 390);
      const intercept = min - slope * 390;
      css = `clamp(${fmt(min / 16)}rem, calc(${fmt(intercept / 16)}rem + ${fmt(slope * 100)}vw), ${fmt(max / 16)}rem)`;
    }
    steps.push({ step: n, px: max, css, line_height: lh[n] ?? 1.5 });
  }
  return steps;
}

const DENSITY = { compact: 0.85, comfortable: 1, airy: 1.25 } as const;
const RADIUS = { none: [0, 0], soft: [6, 10], round: [14, 20] } as const;

export function deriveTokens(spec: Spec): { tokens: Tokens; adjustments: Adjustment[] } {
  const seeds = spec.palette;
  const seedCanvas = normalizeHex(seeds.canvas);
  let canvas = seedCanvas;
  let result = attempt(canvas, seeds);
  // Deterministic fallback: push the canvas away from the middle until every role can be met.
  for (let i = 0; !result && i < 60; i++) {
    canvas = shift(canvas, isLight(canvas) ? 0.02 : -0.02);
    result = attempt(canvas, seeds);
  }
  if (!result) throw new Error("no readable palette exists for these seeds");
  const color = result.color;

  const adjustments: Adjustment[] = [];
  const page: Constraint[] = [{ bg: color.canvas, min: 4.5 }, { bg: color.surface, min: 4.5 }];
  const ui: Constraint[] = [{ bg: color.canvas, min: 3 }, { bg: color.surface, min: 3 }];
  const note = (role: ColorRole, from: string, cs: Constraint[], why: string) => {
    const to = color[role];
    if (to === normalizeHex(from)) return;
    const a = worstRatio(normalizeHex(from), cs).toFixed(2);
    const b = worstRatio(to, cs).toFixed(2);
    adjustments.push({ role, from: normalizeHex(from), to, reason: `${verb(from, to)} to raise contrast from ${a}:1 to ${b}:1 ${why}.` });
  };
  if (canvas !== seedCanvas) {
    adjustments.push({
      role: "canvas", from: seedCanvas, to: canvas,
      reason: `${verb(seedCanvas, canvas)} the page: at its original lightness no text colour reaches 4.5:1 on both the page and its panels.`,
    });
  }
  note("text", seeds.ink, page, "against the page and panels, so body text is readable");
  note("accent", seeds.accent, page, "against the page and panels, so links and accent text are readable");
  note("action", seeds.accent, ui, "against the page and panels, so button edges are visible (3:1 for interface parts)");
  if (result.supportMoved) note("support", seeds.support, [{ bg: color.focus, min: 3 }], "against the focus ring, so keyboard focus stays visible on the support band");

  const pairings: Pairing[] = PAIRINGS.map((p) => {
    const r = contrastRatio(color[p.fg], color[p.bg]);
    return { ...p, ratio: ratio2(r), pass: r >= p.min };
  });
  if (pairings.some((p) => !p.pass)) throw new Error("internal: derived palette has a failing pairing");

  const preset = MOTION_PRESETS[spec.motion.preset];
  const still = spec.motion.preset === "still";
  const [control, surfaceRadius] = RADIUS[spec.components.radius];
  const tokens: Tokens = {
    schema_version: "1.0",
    mode: seeds.mode,
    color,
    font: { heading: VOICES[spec.type.heading].stack, body: VOICES[spec.type.body].stack, mono: MONO_STACK, heading_weight: spec.type.heading_weight },
    type: typeScale(spec),
    measure_ch: spec.type.measure_ch,
    space: [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12].map((m) => Math.round(m * spec.space.base_px * DENSITY[spec.space.density])),
    radius: { control, surface: surfaceRadius, pill: 999 },
    motion: {
      preset: spec.motion.preset,
      duration_ms: scaleDuration(preset.duration_ms, spec.motion.speed_pct),
      fast_ms: scaleDuration(preset.fast_ms, spec.motion.speed_pct),
      easing: preset.easing,
      distance_px: preset.distance_px,
      stagger_ms: still ? 0 : spec.motion.stagger_ms,
    },
    pairings,
  };
  return { tokens, adjustments };
}
