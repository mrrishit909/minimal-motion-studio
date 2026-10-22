import { useEffect, useRef, useState } from "react";
import { TabBoundary } from "../components/Boundary";
import type { AppConfig } from "../config";
import { animate } from "../lib/motion";
import { routeHref, STEPS, type StepId } from "../routing";
import { ExportPanel } from "./Export";
import { BriefPanel, ComponentsPanel, MotionPanel, PalettePanel, SpacePanel, TypePanel } from "./Panels";
import { type DeviceId, Stage } from "./Stage";
import type { Studio } from "./useStudio";

const INTRO: Record<StepId, string> = {
  brief: "Who the site is for and what it says. Every string is shown as plain text on the page.",
  palette: "Four seed colours become every role on the page, each checked on the background it actually sits on.",
  type: "Two voices, one size scale, one comfortable line length.",
  space: "One spacing scale for every gap on the page.",
  components: "Variants change the stylesheet, never the content.",
  motion: "How the page moves when it loads, when sections arrive and when a question opens.",
};

export function StudioView({ studio, step, config, device, setDevice }: {
  studio: Studio;
  step: StepId;
  config: AppConfig;
  device: DeviceId;
  setDevice: (d: DeviceId) => void;
}) {
  const [reduced, setReduced] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const prevStep = useRef<StepId | null>(null);

  // Step change: cross-fade the panel in the direction of travel and move focus to its heading.
  useEffect(() => {
    const before = prevStep.current;
    prevStep.current = step;
    if (!before || before === step) return;
    const dir = STEPS.findIndex((s) => s.id === step) > STEPS.findIndex((s) => s.id === before) ? 1 : -1;
    animate(panel.current, [{ opacity: 0, transform: `translateY(${dir * 8}px)` }, { opacity: 1, transform: "none" }], { duration: 200 });
    const h = heading.current;
    if (!h) return;
    const r = h.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) h.scrollIntoView({ block: "start" });
    h.focus({ preventScroll: true });
  }, [step]);

  const current = STEPS.find((s) => s.id === step)!;
  const index = STEPS.indexOf(current);
  const next = STEPS[index + 1];
  const body =
    step === "brief" ? <BriefPanel studio={studio} />
      : step === "palette" ? <PalettePanel studio={studio} />
      : step === "type" ? <TypePanel studio={studio} />
      : step === "space" ? <SpacePanel studio={studio} />
      : step === "components" ? <ComponentsPanel studio={studio} />
      : <MotionPanel studio={studio} reduced={reduced} setReduced={setReduced} />;

  return (
    <div className="mm-studio">
      <div className="mm-stage-column">
        <Stage studio={studio} device={device} setDevice={setDevice} reduced={reduced} setReduced={setReduced} />
      </div>
      <div className="mm-controls">
        <nav className="mm-steps" aria-label="Steps">
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <a href={routeHref({ view: "studio", step: s.id })} aria-current={s.id === step ? "step" : undefined}>
                  <span className="mm-mono mm-step-n" aria-hidden>{i + 1}</span>
                  <span>{s.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="mm-panel" ref={panel}>
          <h2 className="mm-h2" tabIndex={-1} ref={heading} data-section-heading>{current.label}</h2>
          <p className="mm-lead">{INTRO[step]}</p>
          <TabBoundary key={step} label={current.label}>{body}</TabBoundary>
          {next && <a className="mm-next" href={routeHref({ view: "studio", step: next.id })}>Next: {next.label}</a>}
        </div>
        <ExportPanel studio={studio} config={config} />
      </div>
    </div>
  );
}
