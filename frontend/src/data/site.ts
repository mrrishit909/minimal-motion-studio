import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "./load";
import type { Origin, Spec, Tokens } from "../engine/types";

export interface Snapshot {
  project: string;
  mode: "state-snapshot" | "fixture";
  generated_at: string;
  source_commit: string;
  state_commit: string;
  latest_run_id: string | null;
  runs_included: string[];
  stale_after_hours: number;
  files?: { release: boolean; memory: boolean };
}

export interface IndexEntry {
  run_id: string;
  request_id: string;
  status: string;
  attempt: number;
  created_at: string;
  completed_at: string | null;
  source: string;
  issue: number | null;
  headline: string | null;
}

export interface Release {
  release_id: string;
  status: "released" | "blocked";
  created_at: string;
}

export interface SiteData {
  snapshot: Snapshot;
  index: IndexEntry[];
  release: Release | null;
}

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "empty" }
  | { status: "ready"; data: T; stale: boolean };

export function isStale(s: Snapshot, now = Date.now()): boolean {
  const t = Date.parse(s.generated_at);
  return Number.isFinite(t) && now - t > s.stale_after_hours * 3600_000;
}

export function useSiteData(dataUrl: string): { state: LoadState<SiteData>; reload: () => void } {
  const [state, setState] = useState<LoadState<SiteData>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: "loading" });
    (async () => {
      try {
        const snapshot = await fetchJson<Snapshot>(`${dataUrl}snapshot.json`, ctrl.signal);
        const index = await fetchJson<{ runs: IndexEntry[] }>(`${dataUrl}index.json`, ctrl.signal);
        const release = snapshot.files?.release ? await fetchJson<Release>(`${dataUrl}release.json`, ctrl.signal) : null;
        if (!snapshot.latest_run_id) {
          setState({ status: "empty" });
          return;
        }
        setState({ status: "ready", data: { snapshot, index: index.runs, release }, stale: isStale(snapshot) });
      } catch (err) {
        if (!ctrl.signal.aborted) setState({ status: "error", error: err as Error });
      }
    })();
    return () => ctrl.abort();
  }, [dataUrl, tick]);
  return { state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export type RunDetail = {
  runId: string;
  createdAt: string;
  source: { type: string; issue: number | null };
  sourceCommit: string;
  workflowRunId: string | number | null;
  origin: Origin;
  headline: string;
  spec: Spec;
  tokens: Tokens;
  review: Review;
  files: { name: string; sha256: string; bytes: number }[];
  base: string;
};

export type ReviewWidth = {
  width: number;
  height?: number;
  axe_violations: { id: string; impact: string | null; nodes: number }[];
  overflow_px?: number;
  details_keyboard_ok?: number;
  details_total?: number;
  focus_visible?: boolean;
  [key: string]: unknown;
};
export type Review = { widths: ReviewWidth[]; flags?: Record<string, unknown>; [key: string]: unknown };

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadRun(dataUrl: string, runId: string, signal: AbortSignal): Promise<RunDetail> {
  const base = `${dataUrl}runs/${encodeURIComponent(runId)}/`;
  const [run, manifest, summary, spec, tokens, review] = await Promise.all(
    ["run.json", "manifest.json", "summary.json", "spec.json", "tokens.json", "review.json"].map((f) => fetchJson<any>(base + f, signal)),
  );
  return {
    runId: String(run.run_id),
    createdAt: String(run.created_at),
    source: { type: String(run.request_source?.type ?? "manual"), issue: run.request_source?.issue_number ?? null },
    sourceCommit: String(run.source_commit ?? ""),
    workflowRunId: run.workflow_run_id ?? null,
    origin: (manifest.origin ?? "studio") as Origin,
    headline: String(summary.headline ?? ""),
    spec: spec as Spec,
    tokens: tokens as Tokens,
    review: review as Review,
    files: Array.isArray(summary.files) ? summary.files : [],
    base,
  };
}

export function useRun(dataUrl: string, runId: string | null, tick: number): LoadState<RunDetail> {
  const cache = useRef(new Map<string, RunDetail>());
  const [state, setState] = useState<LoadState<RunDetail>>({ status: "loading" });
  useEffect(() => { cache.current.clear(); }, [tick]);
  useEffect(() => {
    if (!runId) {
      setState({ status: "empty" });
      return;
    }
    const hit = cache.current.get(runId);
    if (hit) {
      setState({ status: "ready", data: hit, stale: false });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading" });
    loadRun(dataUrl, runId, ctrl.signal).then(
      (data) => { cache.current.set(runId, data); setState({ status: "ready", data, stale: false }); },
      (error) => { if (!ctrl.signal.aborted) setState({ status: "error", error }); },
    );
    return () => ctrl.abort();
  }, [dataUrl, runId, tick]);
  return state;
}
