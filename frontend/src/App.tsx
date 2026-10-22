import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ErrorState, Segmented } from "./components/Controls";
import { Icon } from "./components/Icon";
import { type AppConfig, resolveConfig, type Theme } from "./config";
import type { Spec } from "./engine/types.ts";
import { useRun, useSiteData } from "./data/site";
import { ago } from "./lib/format";
import { parseRoute, type Route, routeHref, useRoute } from "./routing";
import { StudioView } from "./studio/StudioView";
import type { DeviceId } from "./studio/Stage";
import { loadEngine, useStudio } from "./studio/useStudio";
import { HistoryView } from "./views/History";
import { AboutView, RequestView } from "./views/Pages";
import "./styles/app.css";

function useResolvedTheme(theme: Theme): "light" | "dark" {
  const q = "(prefers-color-scheme: dark)";
  const [system, setSystem] = useState<"light" | "dark">(() => (typeof window !== "undefined" && window.matchMedia?.(q).matches ? "dark" : "light"));
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return theme === "auto" ? system : theme;
}

const THEME_KEY = "minimal-motion-studio-theme";

/** A per-visitor convenience only; private windows or blocked storage fall back to the default. */
function storedTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "dark" || v === "light" || v === "auto" ? v : null;
  } catch {
    return null;
  }
}

export function MinimalMotionStudioApp(props: Partial<AppConfig>) {
  const config = useMemo(() => resolveConfig(props), [props.basePath, props.dataUrl, props.theme, props.showShell, props.routing, props.repoUrl, props.siteUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const [themeChoice, setThemeChoice] = useState<Theme>(() => (config.showShell ? storedTheme() ?? config.theme : config.theme));
  useEffect(() => {
    if (!config.showShell) return;
    try { window.localStorage.setItem(THEME_KEY, themeChoice); } catch { /* storage unavailable: the choice lasts for this visit */ }
  }, [themeChoice, config.showShell]);
  const theme = useResolvedTheme(themeChoice);
  const [route, navigate] = useRoute(config.routing);
  const studio = useStudio();
  const [device, setDevice] = useState<DeviceId>(() => (typeof window !== "undefined" && window.innerWidth < 700 ? "phone" : "desktop"));
  const { state, reload } = useSiteData(config.dataUrl);
  const [tick, setTick] = useState(0);
  const main = useRef<HTMLElement>(null);
  const prevView = useRef<Route["view"] | null>(null);

  const site = state.status === "ready" ? state.data : null;
  const historyRun = route.view === "history" ? route.runId ?? site?.snapshot.latest_run_id ?? null : null;
  const run = useRun(config.dataUrl, site ? historyRun : null, tick);
  const refresh = () => { reload(); setTick((t) => t + 1); };

  // View change (not the first render): move focus to the new view's heading.
  useEffect(() => {
    const before = prevView.current;
    prevView.current = route.view;
    if (!before || before === route.view) return;
    window.scrollTo({ top: 0 });
    main.current?.querySelector<HTMLElement>("[data-section-heading]")?.focus({ preventScroll: true });
  }, [route.view]);

  const loadIntoStudio = async (spec: Spec) => {
    const result = (await loadEngine()).validateSpec(spec);
    if (!result.ok) return false;
    studio.replace(result.spec);
    navigate({ view: "studio", step: "brief" });
    return true;
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href?.startsWith("#/") || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (config.routing === "memory") { e.preventDefault(); navigate(parseRoute(href)); }
  };

  let content: React.ReactNode;
  if (route.view === "studio") content = <StudioView studio={studio} step={route.step} config={config} device={device} setDevice={setDevice} />;
  else if (route.view === "request") content = <RequestView config={config} site={site} />;
  else if (route.view === "about") content = <AboutView config={config} />;
  else if (state.status === "loading") content = <div className="mm-page" role="status"><p className="mm-hint">Loading the generation history from the published snapshot.</p><div className="mm-skel" style={{ height: 360 }} /></div>;
  else if (state.status === "error") content = <div className="mm-page"><ErrorState title="The generation history did not load" error={state.error} onRetry={refresh} /></div>;
  else if (state.status === "empty") content = <div className="mm-page"><EmptyState requestHref={routeHref({ view: "request" })} /></div>;
  else if (site) content = <HistoryView site={site} runId={historyRun} run={run} config={config} onLoad={loadIntoStudio} onRetry={refresh} />;

  const snap = site?.snapshot ?? null;
  const release = site?.release ?? null;
  const link = (r: Route, label: string) => (
    <a href={routeHref(r)} aria-current={route.view === r.view ? "page" : undefined}>{label}</a>
  );

  return (
    <div className="mm-root" data-theme={theme} data-shell={config.showShell} data-app="minimal-motion-studio" onClick={onClick}>
      <a className="mm-skip" href="#mm-main" onClick={(e) => { e.preventDefault(); document.getElementById("mm-main")?.focus(); }}>Skip to content</a>
      {config.showShell && (
        <header className="mm-top">
          <a className="mm-wordmark" href="#/">Minimal Motion Studio</a>
          <nav className="mm-nav" aria-label="Site">
            {link({ view: "studio", step: "brief" }, "Studio")}
            {link({ view: "history" }, "History")}
            {link({ view: "request" }, "Request")}
            {link({ view: "about" }, "About")}
          </nav>
        </header>
      )}
      {route.view === "studio" && config.showShell && (
        <p className="mm-intro">Turn a brand brief into a small website you can preview, test and download. Everything on this page runs in your browser.</p>
      )}
      {route.view === "history" && snap?.mode === "fixture" && <div className="mm-banner" role="note"><Icon name="info" /> Fixture data: a real engine run built for automated browser tests, not a published generation.</div>}
      {route.view === "history" && state.status === "ready" && state.stale && snap && (
        <div className="mm-banner" role="status">
          <span className="mm-tone-warn"><Icon name="warn" /></span>
          <span>This snapshot is {ago(snap.generated_at)} old, older than its 14-day freshness window. The runs shown are the last ones published.</span>
          <button type="button" className="mm-btn" onClick={refresh}><Icon name="refresh" /> Refresh</button>
        </div>
      )}
      <main id="mm-main" ref={main} tabIndex={-1}>{content}</main>
      {config.showShell && (
        <footer className="mm-footer">
          <div className="mm-footer-main">
            <p>Deterministic templates in your browser; published runs from GitHub Actions.{snap ? ` History snapshot generated ${snap.generated_at.replace("T", " ").replace("Z", " UTC")}.` : ""}{release ? ` Latest release check: ${release.status}.` : ""}</p>
            <Segmented label="Colour theme" value={themeChoice} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "auto", label: "System" }]} onChange={setThemeChoice} />
          </div>
          <nav aria-label="Project links">
            <a href={config.repoUrl}>Source</a>
            <a href={`${config.repoUrl}/tree/state`}>State branch</a>
            <a href={`${config.repoUrl}/blob/main/docs/ARCHITECTURE.md`}>Architecture</a>
          </nav>
        </footer>
      )}
    </div>
  );
}
