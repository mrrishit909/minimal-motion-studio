// The engine contract shared by the studio (browser) and the CLI (Node, run with type stripping).
// Spec mirrors schemas/request.schema.json#/$defs/spec exactly; the schema is the authority.

export type Template = "studio" | "shopfront" | "launch";
export type Voice = "humanist" | "transitional" | "old-style" | "geometric" | "industrial" | "rounded" | "mono";
export type Ratio = "1.125" | "1.2" | "1.25" | "1.333" | "1.414" | "1.5";
export type Preset = "still" | "gentle" | "crisp" | "lively";
export type Origin = "studio" | "ai-candidate" | "fixture";

export type Spec = {
  schema_version: "1.0";
  template: Template;
  brand: {
    name: string;
    tagline: string;
    summary: string;
    cta_label: string;
    cta_href: string;
    contact: string;
    location: string;
    hours: string;
    note: string;
  };
  items: { title: string; text: string; meta: string }[];
  faqs: { q: string; a: string }[];
  palette: { mode: "light" | "dark"; canvas: string; ink: string; accent: string; support: string };
  type: { heading: Voice; body: Voice; base_px: number; ratio: Ratio; heading_weight: 400 | 500 | 600 | 700 | 800; measure_ch: number };
  space: { base_px: 4 | 6 | 8; density: "compact" | "comfortable" | "airy" };
  components: {
    button: "solid" | "outline" | "pill" | "underline";
    surface: "flat" | "outlined" | "raised";
    radius: "none" | "soft" | "round";
    header: "inline" | "centered";
  };
  motion: { preset: Preset; speed_pct: number; stagger_ms: number };
};

export type Request = { spec: Spec; origin: Origin; candidate_sha256?: string };

export type ColorRole =
  | "canvas" | "surface" | "text" | "text_muted" | "border" | "accent" | "action" | "on_action"
  | "support" | "on_support" | "focus" | "success" | "warning" | "danger";

/** One colour the engine changed to meet a contrast minimum (shown to the user, never silent). */
export type Adjustment = { role: ColorRole; from: string; to: string; reason: string };

/** A foreground/background pair that the composed CSS actually uses. */
export type Pairing = {
  id: string;
  label: string;           // plain words, e.g. "Body text on page"
  fg: ColorRole;
  bg: ColorRole;
  kind: "text" | "large-text" | "ui";
  min: number;             // 4.5 text, 3 large text and UI
  ratio: number;           // rounded to 2 decimals
  pass: boolean;
};

export type TypeStep = { step: number; px: number; css: string; line_height: number };

export type Tokens = {
  schema_version: "1.0";
  mode: "light" | "dark";
  color: Record<ColorRole, string>;          // #rrggbb, lower case
  font: { heading: string; body: string; mono: string; heading_weight: number };  // CSS font-family stacks
  type: TypeStep[];                          // steps -1..5; css may be a clamp() for large steps
  measure_ch: number;
  space: number[];                           // px, ascending
  radius: { control: number; surface: number; pill: number };
  motion: { preset: Preset; duration_ms: number; fast_ms: number; easing: string; distance_px: number; stagger_ms: number };
  pairings: Pairing[];
};

export type Composition = {
  files: Record<string, string>;             // the exported source package, keys sorted
  tokens: Tokens;
  adjustments: Adjustment[];
};

export type ValidateResult = { ok: true; spec: Spec } | { ok: false; errors: string[] };
