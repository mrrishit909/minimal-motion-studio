import type { Preset } from "./types.ts";

export type MotionPreset = {
  label: string;
  description: string;
  duration_ms: number; // entrances and reveals
  fast_ms: number; // press feedback, hover and collapse
  easing: string; // a CSS <easing-function>, also used by the Web Animations API
  distance_px: number; // how far content rises as it enters
};

// A damped spring (damping ratio 0.68, about 5% overshoot) sampled at 25 even steps; precomputed so
// every environment gets the same string.
const SPRING =
  "linear(0, 0.085, 0.271, 0.483, 0.676, 0.829, 0.937, 1.005, 1.041, 1.054, 1.052, 1.043, 1.032, 1.021, 1.012, 1.005, 1.001, 0.998, 0.997, 0.997, 0.997, 0.998, 0.999, 0.999, 1)";

export const MOTION_PRESETS: Record<Preset, MotionPreset> = {
  still: {
    label: "Still",
    description: "No motion at all. Everything is in place when the page opens, and nothing moves on scroll, hover or press.",
    duration_ms: 0,
    fast_ms: 0,
    easing: "linear",
    distance_px: 0,
  },
  gentle: {
    label: "Gentle",
    description: "Content fades in and rises a short way, slowing softly as it settles. Calm and unhurried.",
    duration_ms: 520,
    fast_ms: 200,
    easing: "cubic-bezier(0.33, 1, 0.68, 1)",
    distance_px: 14,
  },
  crisp: {
    label: "Crisp",
    description: "Quick, short entrances that start fast and stop cleanly. Feels precise and efficient.",
    duration_ms: 260,
    fast_ms: 120,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    distance_px: 8,
  },
  lively: {
    label: "Lively",
    description: "Content rises further and lands with a small spring past its resting place before settling.",
    duration_ms: 680,
    fast_ms: 240,
    easing: SPRING,
    distance_px: 22,
  },
};

/** speed_pct 100 keeps the preset; 200 is twice as fast (half the duration); 50 is half as fast. */
export function scaleDuration(ms: number, speedPct: number): number {
  return Math.round((ms * 100) / speedPct);
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

function bezier(p1x: number, p1y: number, p2x: number, p2y: number, x: number): number {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(p1x, p2x, mid) < x) lo = mid;
    else hi = mid;
  }
  return at(p1y, p2y, (lo + hi) / 2);
}

/** Stops of a CSS linear() easing as [input, output] pairs (evenly spaced unless a % is given). */
function linearStops(body: string): [number, number][] {
  const parts = body.split(",").map((s) => s.trim().split(/\s+/));
  const stops: [number | null, number][] = parts.map(([v, p]) => [p ? parseFloat(p) / 100 : null, parseFloat(v ?? "0")]);
  if (stops[0]) stops[0][0] ??= 0;
  const last = stops[stops.length - 1];
  if (last) last[0] ??= 1;
  // Fill missing inputs by spreading them evenly between known neighbours (CSS Easing 2).
  for (let i = 0; i < stops.length; i++) {
    if (stops[i]?.[0] !== null) continue;
    let j = i;
    while (stops[j]?.[0] === null) j++;
    const a = stops[i - 1]?.[0] ?? 0;
    const b = stops[j]?.[0] ?? 1;
    for (let k = i; k < j; k++) (stops[k] as [number, number])[0] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  return stops as [number, number][];
}

/** Progress curve of a preset's easing, for drawing: samples points from (0, 0) to (1, 1). */
export function curvePoints(preset: Preset, samples = 48): [number, number][] {
  const easing = MOTION_PRESETS[preset].easing;
  const n = Math.max(2, Math.floor(samples));
  const bz = /^cubic-bezier\(([^)]*)\)$/.exec(easing);
  const lin = /^linear\(([^)]*)\)$/.exec(easing);
  const stops = lin ? linearStops(lin[1] ?? "") : null;
  const f = (x: number): number => {
    if (bz) {
      const [a = 0, b = 0, c = 1, d = 1] = (bz[1] ?? "").split(",").map(Number);
      return bezier(a, b, c, d, x);
    }
    if (stops) {
      for (let i = 1; i < stops.length; i++) {
        const [x0, y0] = stops[i - 1] as [number, number];
        const [x1, y1] = stops[i] as [number, number];
        if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return x;
  };
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    out.push([round4(x), i === 0 ? 0 : i === n - 1 ? 1 : round4(f(x))]);
  }
  return out;
}
