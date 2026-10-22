import { useEffect, useRef } from "react";
import { Icon } from "../components/Icon";
import type { Adjustment, ColorRole, Pairing, Tokens } from "../engine/types.ts";
import { animate } from "../lib/motion";

const CHIPS: { role: ColorRole; label: string }[] = [
  { role: "canvas", label: "Canvas" },
  { role: "surface", label: "Surface" },
  { role: "text", label: "Text" },
  { role: "text_muted", label: "Muted text" },
  { role: "accent", label: "Accent" },
  { role: "action", label: "Action" },
  { role: "on_action", label: "On action" },
  { role: "support", label: "Support" },
  { role: "on_support", label: "On support" },
  { role: "focus", label: "Focus" },
];

/** Tall paint-chip tiles: each role's colour, its value, and whether the engine had to move it. */
export function PaintChips({ tokens, adjustments }: { tokens: Tokens; adjustments: Adjustment[] }) {
  const strip = useRef<HTMLOListElement>(null);
  const dealt = useRef(false);
  useEffect(() => {
    if (dealt.current || !strip.current) return;
    dealt.current = true; // deal in once, on first load only
    strip.current.querySelectorAll("li").forEach((li, i) => {
      animate(li, [{ opacity: 0, transform: "translateY(10px) rotate(-1.5deg)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: 40 * i });
    });
  }, [tokens]);
  const adjusted = new Set(adjustments.map((a) => a.role));
  return (
    <ol className="mm-chips" ref={strip} aria-label="Colour roles">
      {CHIPS.map(({ role, label }) => (
        <li key={role} className="mm-chip">
          <span className="mm-chip-color" style={{ background: tokens.color[role] }} aria-hidden />
          <span className="mm-chip-name">{label}</span>
          <span className="mm-mono mm-chip-hex">{tokens.color[role]}</span>
          {adjusted.has(role) && <span className="mm-chip-flag mm-tone-warn"><Icon name="warn" /> adjusted</span>}
        </li>
      ))}
    </ol>
  );
}

/** Every foreground/background pair the page's stylesheet uses, measured, with the minimum it must meet. */
export function Pairings({ pairings, tokens }: { pairings: Pairing[]; tokens: Tokens }) {
  const passed = pairings.filter((p) => p.pass).length;
  return (
    <section className="mm-pairings" aria-labelledby="mm-pairings-h">
      <div className="mm-section-head">
        <h2 id="mm-pairings-h" className="mm-h3">Contrast on the actual pairings</h2>
        <p className="mm-hint">
          {passed} of {pairings.length} pass. Text needs 4.5:1, large text and interface boundaries 3:1 (WCAG 2.2). The same check runs again when the exported package builds.
        </p>
      </div>
      <ul className="mm-pair-list">
        {pairings.map((p) => (
          <li key={p.id} className="mm-pair">
            <span className="mm-pair-sample" style={{ color: tokens.color[p.fg], background: tokens.color[p.bg] }} aria-hidden>
              {p.kind === "ui" ? <span className="mm-pair-ui" style={{ borderColor: tokens.color[p.fg] }} /> : "Aa"}
            </span>
            <span className="mm-pair-label">{p.label}</span>
            <span className="mm-pair-meter" aria-hidden>
              <span className="mm-pair-bar" style={{ transform: `scaleX(${Math.min(1, p.ratio / 12)})` }} data-pass={p.pass} />
              <span className="mm-pair-min" style={{ left: `${(p.min / 12) * 100}%` }} />
            </span>
            <span className="mm-mono mm-pair-ratio">{p.ratio.toFixed(2)}:1</span>
            <span className={p.pass ? "mm-tone-ok mm-pair-verdict" : "mm-tone-danger mm-pair-verdict"}>
              <Icon name={p.pass ? "check" : "cross"} /> {p.pass ? "pass" : "fail"}, needs {p.min}:1
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
