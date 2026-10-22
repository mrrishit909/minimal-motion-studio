import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SPEC } from "../engine/examples.ts";
import type { Composition, Spec, ValidateResult } from "../engine/types.ts";

type Engine = {
  validateSpec: (x: unknown) => ValidateResult;
  compose: (spec: unknown) => Composition;
  build: (files: Record<string, string>, sha256: (t: string) => Promise<string>) => Promise<Record<string, string>>;
};

let engine: Promise<Engine> | null = null;
/** The schema validator, colour maths and composer load after the page shell has painted (one shared copy). */
export function loadEngine(): Promise<Engine> {
  engine ??= Promise.all([import("../engine/schema.ts"), import("../engine/compose.ts"), import("../engine/build-core.js")]).then(
    ([schema, composer, core]) => ({ validateSpec: schema.validateSpec, compose: composer.compose, build: core.build as Engine["build"] }),
  );
  return engine;
}

/** What the stage shows: the built page of the last valid brief, byte-identical to the export's dist/index.html. */
export type Preview = { spec: Spec; composition: Composition; html: string };

export type Studio = {
  spec: Spec;
  errors: string[];
  preview: Preview | null;
  status: "composing" | "ready" | "failed";
  failure: string | null;
  set: (path: (string | number)[], value: unknown) => void;
  replace: (spec: Spec) => void;
  undo: (() => void) | null;
};

export async function sha256Base64(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot compute the page's content hashes (it needs a secure https page).");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let bin = "";
  for (const byte of new Uint8Array(digest)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function setIn<T>(obj: T, path: (string | number)[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const copy: any = Array.isArray(obj) ? [...obj] : { ...(obj as object) }; // eslint-disable-line @typescript-eslint/no-explicit-any
  copy[head as string] = setIn(copy[head as string], rest, value);
  return copy;
}

/** Errors that belong to one field, e.g. ["brand", "name"] matches "/brand/name" or "brand.name". */
export function fieldErrors(errors: string[], path: (string | number)[]): string[] {
  const slash = `/${path.join("/")}`;
  const dot = path.join(".");
  return errors.filter((e) => {
    const head = e.split(":")[0] ?? "";
    return head.trim() === slash || head.trim() === dot || head.trim() === `spec${slash}` || head.trim() === `spec.${dot}`;
  });
}

export function useStudio(initial: Spec = DEFAULT_SPEC): Studio {
  const [spec, setSpec] = useState<Spec>(initial);
  const [previous, setPrevious] = useState<Spec | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<Studio["status"]>("composing");
  const [failure, setFailure] = useState<string | null>(null);
  const generation = useRef(0);

  const first = useRef(true);
  useEffect(() => {
    const mine = ++generation.current;
    setStatus("composing");
    // A short debounce keeps typing smooth (none for the first page); the newest edit always wins.
    const timer = window.setTimeout(async () => {
      try {
        const { validateSpec, compose, build } = await loadEngine();
        if (mine !== generation.current) return;
        const result = validateSpec(spec);
        if (!result.ok) {
          setErrors(result.errors);
          setStatus("ready");
          return;
        }
        setErrors([]);
        const composition = compose(result.spec);
        const dist = await build(composition.files, sha256Base64);
        if (mine !== generation.current) return;
        setPreview({ spec: result.spec, composition, html: dist["dist/index.html"] ?? "" });
        setFailure(null);
        setStatus("ready");
      } catch (err) {
        if (mine !== generation.current) return;
        setFailure((err as Error).message);
        setStatus("failed");
      }
    }, first.current ? 0 : 120);
    first.current = false;
    return () => window.clearTimeout(timer);
  }, [spec]);

  const set = useCallback((path: (string | number)[], value: unknown) => setSpec((s) => setIn(s, path, value)), []);
  const current = useRef(spec);
  current.current = spec;
  const replace = useCallback((next: Spec) => {
    setPrevious(current.current);
    setSpec(next);
  }, []);
  const undo = previous
    ? () => {
        setSpec(previous);
        setPrevious(null);
      }
    : null;

  return { spec, errors, preview, status, failure, set, replace, undo };
}
