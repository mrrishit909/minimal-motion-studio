import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Segmented } from "../components/Controls";
import { Icon } from "../components/Icon";
import type { Template } from "../engine/types.ts";
import { animate } from "../lib/motion";
import { useWidth } from "../lib/useWidth";
import type { Studio } from "./useStudio";

export const DEVICES = [
  { id: "phone", label: "Phone", width: 390, height: 844 },
  { id: "tablet", label: "Tablet", width: 768, height: 1024 },
  { id: "desktop", label: "Desktop", width: 1440, height: 900 },
] as const;
export type DeviceId = (typeof DEVICES)[number]["id"];

export const TEMPLATES: { value: Template; label: string; description: string }[] = [
  { value: "studio", label: "Studio", description: "A small practice: services, questions, contact." },
  { value: "shopfront", label: "Shopfront", description: "A local shop or cafe: menu with prices, hours, visit." },
  { value: "launch", label: "Launch", description: "A product launch: announcement, features, questions, closing call to action." },
];

/** Adds the reduced-motion flag the exported motion script reads; the default preview is the built page unchanged. */
export function withReducedMotion(html: string): string {
  return html.replace(/<html(\s|>)/, '<html data-motion="reduce"$1');
}

/** A sandboxed, opaque-origin frame: the page's scripts run, but cannot reach the studio, its storage or the network. */
export function PreviewFrame({ html, src, device, maxHeight, title, reduced = false, replay = 0 }: {
  html?: string;
  src?: string;
  device: DeviceId;
  maxHeight: number;
  title: string;
  reduced?: boolean;
  replay?: number;
}) {
  const [ref, avail] = useWidth<HTMLDivElement>();
  const d = DEVICES.find((x) => x.id === device)!;
  const scale = avail ? Math.min(1, avail / d.width, maxHeight / d.height) : 0;
  const box = useRef<HTMLDivElement>(null);
  const prevWidth = useRef<number | null>(null);

  // Device change: the frame grows or shrinks from its previous on-screen width (uniform scale, transform only).
  useLayoutEffect(() => {
    const shown = d.width * scale;
    const before = prevWidth.current;
    prevWidth.current = shown;
    if (!before || !shown || Math.abs(before - shown) < 2) return;
    animate(box.current, [{ transform: `scale(${before / shown})` }, { transform: "scale(1)" }], { duration: 320 });
  }, [device, scale, d.width]);

  return (
    <div className="mm-frame-area" ref={ref}>
      {scale > 0 && (
        <>
          <div className="mm-ruler" style={{ width: d.width * scale }} aria-hidden>
            {Array.from({ length: Math.floor(d.width / 100) + 1 }, (_, i) => (
              <span key={i} className={i % 5 === 0 ? "mm-tick mm-tick-major" : "mm-tick"} style={{ left: i * 100 * scale }} />
            ))}
          </div>
          <p className="mm-frame-label">
            <span className="mm-mono">{d.width} × {d.height}</span> {d.label.toLowerCase()}
            {scale < 1 ? <>, shown at {Math.round(scale * 100)}%</> : <>, actual size</>}
          </p>
          <div className="mm-frame" ref={box} style={{ width: d.width * scale, height: d.height * scale }}>
            {html === undefined && !src ? <div className="mm-skel" style={{ width: "100%", height: "100%" }} aria-hidden /> : <iframe
              key={`${replay}-${reduced}`}
              title={title}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              {...(src ? { src } : { srcDoc: reduced && html ? withReducedMotion(html) : html })}
              style={{ width: d.width, height: d.height, transform: `scale(${scale})` }}
            />}
          </div>
        </>
      )}
    </div>
  );
}

export function Stage({ studio, device, setDevice, reduced, setReduced }: {
  studio: Studio;
  device: DeviceId;
  setDevice: (d: DeviceId) => void;
  reduced: boolean;
  setReduced: (v: boolean) => void;
}) {
  const [replay, setReplay] = useState(0);
  const [maxHeight, setMaxHeight] = useState(() => (typeof window === "undefined" ? 760 : Math.max(420, Math.min(820, window.innerHeight - 220))));
  useEffect(() => {
    const fit = () => setMaxHeight(Math.max(420, Math.min(820, window.innerHeight - 220)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const { preview, status, failure, errors } = studio;
  const invalid = errors.length > 0;

  return (
    <section className="mm-stage" aria-label="Preview">
      <div className="mm-stage-bar">
        <Segmented label="Template" value={studio.spec.template} options={TEMPLATES.map(({ value, label }) => ({ value, label }))} onChange={(v) => studio.set(["template"], v)} />
        <Segmented label="Device width" value={device} options={DEVICES.map((d) => ({ value: d.id, label: d.label }))} onChange={setDevice} />
        <div className="mm-stage-actions">
          <button type="button" className="mm-btn" onClick={() => setReplay((r) => r + 1)} disabled={!preview}>
            <Icon name="play" /> Replay motion
          </button>
          <label className="mm-switch">
            <input type="checkbox" role="switch" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
            <span>Reduced motion</span>
          </label>
        </div>
      </div>
      <p className="mm-stage-status" role="status" aria-live="polite">
        {invalid ? <><span className="mm-tone-warn"><Icon name="warn" /></span> The brief has {errors.length === 1 ? "a problem" : `${errors.length} problems`}; the stage shows the last valid version.</>
          : status === "failed" ? <><span className="mm-tone-danger"><Icon name="cross" /></span> The page did not build: {failure}</>
          : status === "composing" ? "Composing the page."
          : reduced ? "Showing the page as a visitor who asked for reduced motion sees it: no movement, same content."
          : "This is the exported page itself, built from the brief."}
      </p>
      <PreviewFrame html={preview?.html} device={device} maxHeight={maxHeight} title={preview ? `Preview of ${preview.spec.brand.name}` : "Preview, composing"} reduced={reduced} replay={replay} />
    </section>
  );
}
