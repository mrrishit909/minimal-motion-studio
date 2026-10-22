import { useEffect, useId, useRef } from "react";
import { Segmented } from "../components/Controls";
import { Icon } from "../components/Icon";
import { EXAMPLES } from "../engine/examples.ts";
import { curvePoints, MOTION_PRESETS } from "../engine/presets.ts";
import type { Preset, Ratio, Spec, Template, Voice } from "../engine/types.ts";
import { VOICES } from "../engine/voices.ts";
import { drawStroke } from "../lib/motion";
import { TEMPLATES } from "./Stage";
import { Pairings, PaintChips } from "./Swatches";
import { fieldErrors, type Studio } from "./useStudio";

type FieldProps = {
  studio: Studio;
  path: (string | number)[];
  label: string;
  max: number;
  hint?: string;
  multiline?: boolean;
  type?: "text" | "url";
};

function Field({ studio, path, label, max, hint, multiline, type = "text" }: FieldProps) {
  const id = useId();
  const value = path.reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key as string], studio.spec) as string;
  const errs = fieldErrors(studio.errors, path);
  const describedBy = [hint ? `${id}-hint` : null, errs.length ? `${id}-err` : null, `${id}-count`].filter(Boolean).join(" ");
  const common = {
    id,
    value: value ?? "",
    maxLength: max,
    "aria-invalid": errs.length > 0 || undefined,
    "aria-describedby": describedBy,
    onChange: (e: { target: { value: string } }) => studio.set(path, e.target.value),
  };
  return (
    <div className="mm-field">
      <div className="mm-field-head">
        <label htmlFor={id}>{label}</label>
        <span id={`${id}-count`} className="mm-count mm-mono" aria-label={`${(value ?? "").length} of ${max} characters`}>{(value ?? "").length}/{max}</span>
      </div>
      {multiline ? <textarea rows={3} {...common} /> : <input type={type} autoComplete="off" spellCheck={type === "text"} {...common} />}
      {hint && <p id={`${id}-hint`} className="mm-hint">{hint}</p>}
      {errs.length > 0 && <p id={`${id}-err`} className="mm-error"><Icon name="warn" /> {errs.map((e) => e.split(":").slice(1).join(":").trim() || e).join("; ")}</p>}
    </div>
  );
}

function Select<T extends string | number>({ label, value, options, onChange, hint }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="mm-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={String(value)} aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}>
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
      {hint && <p id={`${id}-hint`} className="mm-hint">{hint}</p>}
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; hint?: string;
}) {
  const id = useId();
  return (
    <div className="mm-field">
      <div className="mm-field-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="mm-mono">{value}{unit}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p id={`${id}-hint`} className="mm-hint">{hint}</p>}
    </div>
  );
}

function Group({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <fieldset className="mm-group">
      <legend>{title}</legend>
      {note && <p className="mm-hint">{note}</p>}
      {children}
    </fieldset>
  );
}

export function BriefPanel({ studio }: { studio: Studio }) {
  const { spec } = studio;
  const template = TEMPLATES.find((t) => t.value === spec.template)!;
  return (
    <div className="mm-panel-body">
      <div className="mm-example">
        <Select<Template | "">
          label="Start from an example"
          value=""
          options={[{ value: "", label: "Choose an example brand" }, ...TEMPLATES.map((t) => ({ value: t.value, label: `${EXAMPLES[t.value].brand.name} (${t.label.toLowerCase()} template)` }))]}
          onChange={(v) => v && studio.replace(EXAMPLES[v])}
          hint="Examples are fictional brands. Loading one replaces the whole brief; you can undo it."
        />
        {studio.undo && <button type="button" className="mm-btn" onClick={studio.undo}>Undo: restore the previous brief</button>}
      </div>
      <p className="mm-hint">Template: {template.label}. {template.description} Change it on the stage.</p>
      <Group title="Identity">
        <Field studio={studio} path={["brand", "name"]} label="Brand name" max={40} />
        <Field studio={studio} path={["brand", "tagline"]} label="Tagline" max={90} hint="One line under the name. The page's main heading." />
        <Field studio={studio} path={["brand", "summary"]} label="Summary" max={320} multiline />
        <Field studio={studio} path={["brand", "note"]} label="Announcement" max={160} hint="A short line above the main heading, such as a launch date or a booking note. Leave it empty to leave it out." />
      </Group>
      <Group title="Call to action">
        <Field studio={studio} path={["brand", "cta_label"]} label="Button label" max={28} hint="Say what happens, for example Book a visit." />
        <Field studio={studio} path={["brand", "cta_href"]} label="Button link" max={200} type="url" hint="An https address, mailto: or tel: link." />
      </Group>
      <Group title="Contact" note="Empty lines are left out of the page.">
        <Field studio={studio} path={["brand", "contact"]} label="Contact" max={120} />
        <Field studio={studio} path={["brand", "location"]} label="Location" max={120} />
        <Field studio={studio} path={["brand", "hours"]} label="Hours" max={120} />
      </Group>
      <ListEditor
        title={spec.template === "shopfront" ? "Menu items" : spec.template === "launch" ? "Features" : "Services"}
        items={spec.items}
        max={6}
        add={() => studio.set(["items"], [...spec.items, { title: "New item", text: "", meta: "" }])}
        remove={(i) => studio.set(["items"], spec.items.filter((_, j) => j !== i))}
        render={(i) => (
          <>
            <Field studio={studio} path={["items", i, "title"]} label="Title" max={48} />
            <Field studio={studio} path={["items", i, "text"]} label="Description" max={160} />
            <Field studio={studio} path={["items", i, "meta"]} label={spec.template === "shopfront" ? "Price or detail" : "Detail"} max={24} />
          </>
        )}
        noun="item"
      />
      <ListEditor
        title="Questions"
        items={spec.faqs}
        max={5}
        add={() => studio.set(["faqs"], [...spec.faqs, { q: "New question?", a: "Answer." }])}
        remove={(i) => studio.set(["faqs"], spec.faqs.filter((_, j) => j !== i))}
        render={(i) => (
          <>
            <Field studio={studio} path={["faqs", i, "q"]} label="Question" max={100} />
            <Field studio={studio} path={["faqs", i, "a"]} label="Answer" max={320} multiline />
          </>
        )}
        noun="question"
      />
    </div>
  );
}

function ListEditor<T>({ title, items, max, add, remove, render, noun }: {
  title: string; items: T[]; max: number; add: () => void; remove: (i: number) => void; render: (i: number) => React.ReactNode; noun: string;
}) {
  return (
    <fieldset className="mm-group">
      <legend>{title} <span className="mm-count mm-mono">{items.length}/{max}</span></legend>
      {items.length === 0 && <p className="mm-hint">None yet. The section is left out of the page until you add one.</p>}
      <ol className="mm-list-editor">
        {items.map((_, i) => (
          <li key={i}>
            <div className="mm-list-head">
              <span className="mm-mono mm-ordinal">{i + 1}</span>
              <button type="button" className="mm-btn mm-btn-quiet" onClick={() => remove(i)} aria-label={`Remove ${noun} ${i + 1}`}>
                <Icon name="minus" /> Remove
              </button>
            </div>
            {render(i)}
          </li>
        ))}
      </ol>
      <button type="button" className="mm-btn" onClick={add} disabled={items.length >= max}>
        <Icon name="plus" /> Add {noun}
      </button>
    </fieldset>
  );
}

const SEEDS: { key: keyof Spec["palette"] & ("canvas" | "ink" | "accent" | "support"); label: string; hint: string }[] = [
  { key: "canvas", label: "Canvas", hint: "The page background." },
  { key: "ink", label: "Ink", hint: "Body text and headings." },
  { key: "accent", label: "Accent", hint: "Buttons, links and the motif." },
  { key: "support", label: "Support", hint: "Bands and quiet surfaces." },
];

function SeedInput({ studio, seed }: { studio: Studio; seed: (typeof SEEDS)[number] }) {
  const id = useId();
  const value = studio.spec.palette[seed.key];
  const errs = fieldErrors(studio.errors, ["palette", seed.key]);
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="mm-seed">
      <input type="color" aria-label={`${seed.label} colour picker`} value={valid ? value.toLowerCase() : "#000000"} onChange={(e) => studio.set(["palette", seed.key], e.target.value)} />
      <div className="mm-field">
        <label htmlFor={id}>{seed.label}</label>
        <input id={id} className="mm-mono" value={value} maxLength={7} spellCheck={false} autoComplete="off"
          aria-invalid={errs.length > 0 || undefined} aria-describedby={`${id}-hint`}
          onChange={(e) => studio.set(["palette", seed.key], e.target.value.trim())} />
        <p id={`${id}-hint`} className="mm-hint">{errs.length ? <span className="mm-error"><Icon name="warn" /> Use a six-digit hex colour such as #A6422A.</span> : seed.hint}</p>
      </div>
    </div>
  );
}

export function PalettePanel({ studio }: { studio: Studio }) {
  const adjustments = studio.preview?.composition.adjustments ?? [];
  const tokens = studio.preview?.composition.tokens;
  return (
    <div className="mm-panel-body">
      <Segmented label="Mode" value={studio.spec.palette.mode} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(v) => studio.set(["palette", "mode"], v)} />
      <p className="mm-hint">Mode sets the page's colour scheme for form controls and scrollbars. Contrast is always computed from the actual colours.</p>
      <Group title="Seed colours" note="Every role on the page is derived from these four. Roles that fail their contrast minimum are adjusted in lightness only, and each change is listed below.">
        {SEEDS.map((s) => <SeedInput key={s.key} studio={studio} seed={s} />)}
      </Group>
      <section aria-labelledby="mm-adj-h" className="mm-group">
        <h3 id="mm-adj-h" className="mm-h4">Adjustments</h3>
        {adjustments.length === 0 ? <p className="mm-hint"><span className="mm-tone-ok"><Icon name="check" /></span> No colour needed adjusting: every seed already meets its pairings.</p> : (
          <ul className="mm-adjustments">
            {adjustments.map((a) => (
              <li key={a.role}>
                <span className="mm-swatch" style={{ background: a.from }} aria-hidden /><span className="mm-swatch" style={{ background: a.to }} aria-hidden />
                <span><strong>{a.role.replace(/_/g, " ")}</strong> <span className="mm-mono">{a.from} to {a.to}</span>. {a.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {tokens && (
        <>
          <PaintChips tokens={tokens} adjustments={adjustments} />
          <Pairings pairings={tokens.pairings} tokens={tokens} />
        </>
      )}
    </div>
  );
}

const RATIOS: { value: Ratio; label: string }[] = [
  { value: "1.125", label: "1.125, major second (subtle)" },
  { value: "1.2", label: "1.2, minor third" },
  { value: "1.25", label: "1.25, major third" },
  { value: "1.333", label: "1.333, perfect fourth" },
  { value: "1.414", label: "1.414, augmented fourth" },
  { value: "1.5", label: "1.5, perfect fifth (dramatic)" },
];

export function TypePanel({ studio }: { studio: Studio }) {
  const t = studio.spec.type;
  const voices = Object.entries(VOICES).map(([value, v]) => ({ value: value as Voice, label: v.label }));
  const tokens = studio.preview?.composition.tokens;
  return (
    <div className="mm-panel-body">
      <Select label="Heading voice" value={t.heading} options={voices} onChange={(v) => studio.set(["type", "heading"], v)} />
      <Select label="Body voice" value={t.body} options={voices} onChange={(v) => studio.set(["type", "body"], v)}
        hint="Voices are system font stacks, so the exported site makes no font requests and each visitor sees the best match installed on their device." />
      <Slider label="Base size" value={t.base_px} min={15} max={20} step={1} unit=" px" onChange={(v) => studio.set(["type", "base_px"], v)} />
      <Select label="Scale ratio" value={t.ratio} options={RATIOS} onChange={(v) => studio.set(["type", "ratio"], v)} />
      <Select label="Heading weight" value={t.heading_weight} options={[400, 500, 600, 700, 800].map((w) => ({ value: w as Spec["type"]["heading_weight"], label: String(w) }))}
        onChange={(v) => studio.set(["type", "heading_weight"], v)} />
      <Slider label="Line length" value={t.measure_ch} min={45} max={80} step={1} unit=" ch" onChange={(v) => studio.set(["type", "measure_ch"], v)}
        hint="The longest a line of body text may run. 60 to 70 characters reads comfortably." />
      {tokens && (
        <section className="mm-group" aria-labelledby="mm-scale-h">
          <h3 id="mm-scale-h" className="mm-h4">Scale</h3>
          <ol className="mm-scale">
            {[...tokens.type].reverse().map((s) => (
              <li key={s.step}>
                <span className="mm-mono mm-scale-px">{s.px} px</span>
                <span className="mm-scale-sample" style={{ fontFamily: s.step >= 2 ? tokens.font.heading : tokens.font.body, fontSize: Math.min(s.px, 44), fontWeight: s.step >= 2 ? tokens.font.heading_weight : 400 }}>
                  {studio.spec.brand.name}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export function SpacePanel({ studio }: { studio: Studio }) {
  const s = studio.spec.space;
  const space = studio.preview?.composition.tokens.space ?? [];
  const max = Math.max(1, ...space);
  return (
    <div className="mm-panel-body">
      <Segmented label="Base unit" value={String(s.base_px) as "4" | "6" | "8"} options={[{ value: "4", label: "4 px" }, { value: "6", label: "6 px" }, { value: "8", label: "8 px" }]}
        onChange={(v) => studio.set(["space", "base_px"], Number(v))} />
      <Segmented label="Density" value={s.density} options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "airy", label: "Airy" }]}
        onChange={(v) => studio.set(["space", "density"], v)} />
      <p className="mm-hint">Every gap, padding and section rhythm on the page is one of these steps.</p>
      <ol className="mm-space">
        {space.map((px, i) => (
          <li key={i}>
            <span className="mm-mono">{px} px</span>
            <span className="mm-space-bar" style={{ transform: `scaleX(${px / max})` }} aria-hidden />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ComponentsPanel({ studio }: { studio: Studio }) {
  const c = studio.spec.components;
  return (
    <div className="mm-panel-body">
      <Segmented label="Buttons" value={c.button} options={[{ value: "solid", label: "Solid" }, { value: "outline", label: "Outline" }, { value: "pill", label: "Pill" }, { value: "underline", label: "Underline" }]}
        onChange={(v) => studio.set(["components", "button"], v)} />
      <Segmented label="Surfaces" value={c.surface} options={[{ value: "flat", label: "Flat" }, { value: "outlined", label: "Outlined" }, { value: "raised", label: "Raised" }]}
        onChange={(v) => studio.set(["components", "surface"], v)} />
      <Segmented label="Corners" value={c.radius} options={[{ value: "none", label: "Square" }, { value: "soft", label: "Soft" }, { value: "round", label: "Round" }]}
        onChange={(v) => studio.set(["components", "radius"], v)} />
      <Segmented label="Header" value={c.header} options={[{ value: "inline", label: "Inline" }, { value: "centered", label: "Centred" }]}
        onChange={(v) => studio.set(["components", "header"], v)} />
      <p className="mm-hint">Each choice changes the stylesheet, not the content. Outline and underline buttons use the accent colour for their label, so the contrast list checks that pairing too.</p>
    </div>
  );
}

function Curve({ preset }: { preset: Preset }) {
  const path = useRef<SVGPathElement>(null);
  // Still never moves: draw a flat line at the resting position rather than an easing curve.
  const pts: [number, number][] = preset === "still" ? [[0, 1], [1, 1]] : curvePoints(preset, 48);
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const minY = Math.min(0, ...ys), maxY = Math.max(1, ...ys);
  const W = 120, H = 64, pad = 6;
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${(pad + x * (W - 2 * pad)).toFixed(1)},${(H - pad - ((y - minY) / (maxY - minY)) * (H - 2 * pad)).toFixed(1)}`).join(" ");
  useEffect(() => { drawStroke(path.current, 420); }, [preset]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mm-curve" aria-hidden>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="mm-curve-axis" />
      {xs.length > 0 && <path ref={path} d={d} />}
    </svg>
  );
}

export function MotionPanel({ studio, reduced, setReduced }: { studio: Studio; reduced: boolean; setReduced: (v: boolean) => void }) {
  const m = studio.spec.motion;
  const name = useId();
  return (
    <div className="mm-panel-body">
      <fieldset className="mm-group">
        <legend>Preset</legend>
        <div className="mm-presets">
          {(Object.keys(MOTION_PRESETS) as Preset[]).map((p) => {
            const info = MOTION_PRESETS[p];
            return (
              <label key={p} className="mm-preset" data-checked={m.preset === p}>
                <input type="radio" name={name} value={p} checked={m.preset === p} onChange={() => studio.set(["motion", "preset"], p)} />
                <Curve preset={p} />
                <span className="mm-preset-name">{info.label}</span>
                <span className="mm-hint">{info.description}</span>
                <span className="mm-mono mm-count">{info.duration_ms ? `${Math.round(info.duration_ms * 100 / m.speed_pct)} ms` : "no movement"}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Slider label="Speed" value={m.speed_pct} min={50} max={200} step={10} unit="%" onChange={(v) => studio.set(["motion", "speed_pct"], v)} hint="100% is the preset's own timing; 200% is twice as fast." />
      <Slider label="Stagger" value={m.stagger_ms} min={0} max={160} step={10} unit=" ms" onChange={(v) => studio.set(["motion", "stagger_ms"], v)} hint="The delay between items that enter one after another." />
      <label className="mm-switch">
        <input type="checkbox" role="switch" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
        <span>Preview as a visitor who asked for reduced motion</span>
      </label>
      <p className="mm-hint">The exported page moves only on entry, on first sight of each section and when a question opens. It never moves for visitors who ask for reduced motion, and its content is fully visible without JavaScript.</p>
    </div>
  );
}
