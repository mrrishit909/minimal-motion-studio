import { useCallback, useEffect, useState } from "react";
import type { Routing } from "./config";

export const STEPS = [
  { id: "brief", label: "Brief" },
  { id: "palette", label: "Palette" },
  { id: "type", label: "Type" },
  { id: "space", label: "Space" },
  { id: "components", label: "Components" },
  { id: "motion", label: "Motion" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export type Route =
  | { view: "studio"; step: StepId }
  | { view: "history"; runId?: string }
  | { view: "request" }
  | { view: "about" };

const IDS = new Set<string>(STEPS.map((s) => s.id));

export function parseRoute(hash: string): Route {
  const [head, a] = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (head === "studio" && a && IDS.has(a)) return { view: "studio", step: a as StepId };
  if (head === "history") return a ? { view: "history", runId: a } : { view: "history" };
  if (head === "request") return { view: "request" };
  if (head === "about") return { view: "about" };
  return { view: "studio", step: "brief" };
}

export function routeHref(route: Route): string {
  switch (route.view) {
    case "studio":
      return route.step === "brief" ? "#/" : `#/studio/${route.step}`;
    case "history":
      return route.runId ? `#/history/${encodeURIComponent(route.runId)}` : "#/history";
    case "request":
      return "#/request";
    case "about":
      return "#/about";
  }
}

export function useRoute(mode: Routing): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => (mode === "hash" ? parseRoute(window.location.hash) : { view: "studio", step: "brief" }));
  useEffect(() => {
    if (mode !== "hash") return;
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [mode]);
  const navigate = useCallback(
    (r: Route) => {
      if (mode === "hash") window.location.hash = routeHref(r).slice(1);
      else setRoute(r);
    },
    [mode],
  );
  return [route, navigate];
}
