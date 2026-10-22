import { useState } from "react";
import { ErrorState, Segmented } from "../components/Controls";
import { Icon } from "../components/Icon";
import type { AppConfig } from "../config";
import type { Origin, Spec } from "../engine/types.ts";
import { type LoadState, type RunDetail, type SiteData } from "../data/site";
import { timestamp } from "../lib/format";
import { routeHref } from "../routing";
import { DEVICES, type DeviceId, PreviewFrame } from "../studio/Stage";
import { Pairings } from "../studio/Swatches";

export const ORIGIN_LABEL: Record<Origin, string> = {
  studio: "Deterministic template, no AI",
  "ai-candidate": "AI-proposed brief, verified without secrets (owner workflow)",
  fixture: "Fixture brief, deterministic, no AI",
};

export function HistoryView({ site, runId, run, config, onLoad, onRetry }: {
  site: SiteData;
  runId: string | null;
  run: LoadState<RunDetail>;
  config: AppConfig;
  onLoad: (spec: Spec) => Promise<boolean>;
  onRetry: () => void;
}) {
  const runs = site.index.filter((r) => r.status === "completed" && site.snapshot.runs_included.includes(r.run_id));
  const others = site.index.filter((r) => r.status !== "completed");
  return (
    <div className="mm-history">
      <div className="mm-section-head">
        <h1 className="mm-h1" tabIndex={-1} data-section-heading>Generation history</h1>
        <p className="mm-lead">Sites composed, built and reviewed on GitHub Actions and published to the state branch. Each one is the exact page and package the run produced.</p>
      </div>
      <div className="mm-history-grid">
        <nav aria-label="Published generations" className="mm-run-list">
          <ol>
            {runs.map((r) => (
              <li key={r.run_id}>
                <a href={routeHref({ view: "history", runId: r.run_id })} aria-current={r.run_id === runId ? "page" : undefined}>
                  <span className="mm-run-title">{r.headline?.split(":")[0] ?? r.run_id}</span>
                  <span className="mm-hint">{timestamp(r.created_at)}, {r.source}{r.issue ? ` (issue ${r.issue})` : ""}</span>
                </a>
              </li>
            ))}
          </ol>
          {others.length > 0 && <p className="mm-hint">{others.length} other {others.length === 1 ? "request is" : "requests are"} queued, blocked or failed; see the state branch index.</p>}
        </nav>
        <div className="mm-run-detail">
          {run.status === "loading" && <div role="status"><p className="mm-hint">Loading the run from the published snapshot.</p><div className="mm-skel" style={{ height: 360 }} /></div>}
          {run.status === "error" && <ErrorState title={`Run ${runId} did not load`} error={run.error} onRetry={onRetry} />}
          {run.status === "ready" && <RunDetailView run={run.data} config={config} onLoad={onLoad} />}
        </div>
      </div>
    </div>
  );
}

function flag(v: unknown): string {
  return v === true ? "yes" : v === false ? "no" : "not recorded";
}

function RunDetailView({ run, config, onLoad }: { run: RunDetail; config: AppConfig; onLoad: (spec: Spec) => Promise<boolean> }) {
  const [loadError, setLoadError] = useState(false);
  const [device, setDevice] = useState<DeviceId>(() => (typeof window !== "undefined" && window.innerWidth < 700 ? "phone" : "tablet"));
  const zipFile = run.files.find((f) => f.name === "package.zip");
  return (
    <article className="mm-run" aria-labelledby="mm-run-h">
      <p className={run.origin === "ai-candidate" ? "mm-origin mm-origin-ai" : "mm-origin"}>{ORIGIN_LABEL[run.origin]}</p>
      <h2 id="mm-run-h" className="mm-h2">{run.spec.brand.name}</h2>
      <p className="mm-lead">{run.headline}</p>
      <div className="mm-toolbar">
        <button type="button" className="mm-btn mm-btn-primary" onClick={async () => setLoadError(!(await onLoad(run.spec)))}>Open this brief in the studio</button>
        {zipFile && <a className="mm-btn" href={`${run.base}package.zip`} download><span aria-hidden><Icon name="download" /></span> Download package</a>}
        <a className="mm-btn" href={`${config.repoUrl}/tree/state/runs/${encodeURIComponent(run.runId)}`}><Icon name="external" /> Run on the state branch</a>
      </div>
      {loadError && <p className="mm-error" role="alert"><Icon name="warn" /> This published brief does not match the current brief schema, so it was not loaded into the studio.</p>}
      <Segmented label="Preview width" value={device} options={DEVICES.map((d) => ({ value: d.id, label: d.label }))} onChange={setDevice} />
      <div className="mm-plinth">
        <PreviewFrame src={`${run.base}site.html`} device={device} maxHeight={640} title={`Published page for ${run.spec.brand.name}`} />
      </div>
      <section aria-labelledby="mm-review-h" className="mm-review">
        <h3 id="mm-review-h" className="mm-h3">Review at three widths</h3>
        <div className="mm-table-wrap" tabIndex={0} role="region" aria-label="Review results">
          <table className="mm-table">
            <thead><tr><th scope="col">Width</th><th scope="col">axe violations</th><th scope="col">Sideways scroll</th><th scope="col">Questions by keyboard</th><th scope="col">Visible focus</th></tr></thead>
            <tbody>
              {run.review.widths.map((w) => (
                <tr key={w.width}>
                  <th scope="row" className="mm-mono">{w.width} px</th>
                  <td>{w.axe_violations.length === 0 ? <span className="mm-tone-ok"><Icon name="check" /> none</span> : <span className="mm-tone-danger">{w.axe_violations.map((v) => `${v.id} (${v.nodes})`).join(", ")}</span>}</td>
                  <td>{typeof w.overflow_px === "number" ? (w.overflow_px > 0 ? <span className="mm-tone-danger">{w.overflow_px} px</span> : "none") : "not recorded"}</td>
                  <td>{typeof w.details_keyboard_ok === "number" ? `${w.details_keyboard_ok} of ${w.details_total ?? w.details_keyboard_ok}` : "not recorded"}</td>
                  <td>{flag(w.focus_visible)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mm-hint">Reduced motion respected: {flag((run.review.flags as Record<string, unknown> | undefined)?.reduced_motion)}. Recorded by the run's own browser review (Playwright and axe-core on Chromium). Source commit <span className="mm-mono">{run.sourceCommit.slice(0, 10)}</span>, run <span className="mm-mono">{run.runId}</span>.</p>
      </section>
      <Pairings pairings={run.tokens.pairings} tokens={run.tokens} />
      <section aria-labelledby="mm-files-h">
        <h3 id="mm-files-h" className="mm-h3">Published files</h3>
        <ul className="mm-files">
          {run.files.map((f) => <li key={f.name}><a className="mm-mono" href={`${run.base}${f.name}`}>{f.name}</a><span className="mm-mono mm-count" title={f.sha256}>{f.sha256.slice(7, 17)}</span></li>)}
        </ul>
      </section>
    </article>
  );
}
