import { useRef, useState } from "react";
import { Disclosure } from "../components/Controls";
import { Icon } from "../components/Icon";
import { zip } from "../engine/zip.ts";
import type { AppConfig } from "../config";
import { loadEngine, type Studio } from "./useStudio";

const MAX_IMPORT_BYTES = 64 * 1024;

export function slug(name: string): string {
  const s = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "brand";
}

function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ExportPanel({ studio, config }: { studio: Studio; config: AppConfig }) {
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string; list?: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = studio.preview;
  const ready = !!preview && studio.errors.length === 0 && studio.status === "ready";
  const files = preview ? Object.entries(preview.composition.files) : [];
  const enc = new TextEncoder();
  const total = files.reduce((n, [, text]) => n + enc.encode(text).length, 0);
  const name = preview ? `${slug(preview.spec.brand.name)}-site` : "site";
  const briefText = JSON.stringify(studio.spec, null, 2);
  const requestUrl = `${config.repoUrl}/issues/new?template=run-request.yml&title=${encodeURIComponent(`[generation] ${studio.spec.brand.name}`)}&brief=${encodeURIComponent(briefText)}`;

  const exportPackage = () => {
    if (!preview) return;
    const bytes = zip(preview.composition.files) as Uint8Array<ArrayBuffer>;
    download(`${name}.zip`, bytes, "application/zip");
    setMessage({ tone: "ok", text: `Downloaded ${name}.zip: ${files.length} files, ${kb(bytes.length)}. Unzip it and run npm run build inside; nothing needs installing.` });
  };

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(briefText);
      setMessage({ tone: "ok", text: "Brief copied as JSON. Paste it into a generation request or keep it to import later." });
    } catch {
      setMessage({ tone: "danger", text: "The browser blocked clipboard access. Use Download brief instead." });
    }
  };

  const importBrief = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage({ tone: "danger", text: `That file is ${kb(file.size)}; a brief is at most 64 KB. Nothing was changed.` });
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setMessage({ tone: "danger", text: "That file is not valid JSON. Nothing was changed." });
      return;
    }
    const result = (await loadEngine()).validateSpec(data);
    if (!result.ok) {
      setMessage({ tone: "danger", text: "That brief does not match the brief schema, so it was not loaded. Nothing was changed.", list: result.errors.slice(0, 8) });
      return;
    }
    studio.replace(result.spec);
    setMessage({ tone: "ok", text: `Loaded the brief for ${result.spec.brand.name}. Undo is available in the Brief step.` });
  };

  return (
    <section className="mm-export" aria-labelledby="mm-export-h">
      <h2 id="mm-export-h" className="mm-h3">Take it with you</h2>
      <p className="mm-hint">Everything above runs in this browser tab. Nothing is uploaded unless you open a generation request.</p>
      <button type="button" className="mm-btn mm-btn-primary mm-btn-wide" onClick={exportPackage} disabled={!ready}>
        <Icon name="download" /> Download source package
      </button>
      {!ready && <p className="mm-hint">{studio.errors.length ? "Fix the brief's problems to export." : "The page is still composing."}</p>}
      <div className="mm-export-row">
        <button type="button" className="mm-btn" onClick={() => download(`${slug(studio.spec.brand.name)}-brief.json`, briefText + "\n", "application/json")}>
          <Icon name="download" /> Download brief
        </button>
        <button type="button" className="mm-btn" onClick={copyBrief}><Icon name="copy" /> Copy brief</button>
        <button type="button" className="mm-btn" onClick={() => fileInput.current?.click()}>Import a brief</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-hidden tabIndex={-1}
          onChange={(e) => { void importBrief(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {message && (
        <div className={`mm-message mm-tone-${message.tone}`} role={message.tone === "danger" ? "alert" : "status"}>
          <Icon name={message.tone === "ok" ? "check" : "warn"} /> <span>{message.text}</span>
          {message.list && <ul className="mm-error-list">{message.list.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
      <a className="mm-btn mm-btn-wide" href={requestUrl} target="_blank" rel="noopener noreferrer">
        <Icon name="github" /> Request a generation run
      </a>
      <p className="mm-hint">Opens a GitHub issue with this brief (a GitHub sign-in is needed). A run composes and builds the same package on GitHub Actions, reviews it at three widths and publishes it to the history. The owner's requests run automatically; others wait for the owner's approval. No AI is involved.</p>
      {preview && (
        <Disclosure summary={<>Package contents: {files.length} files, {kb(total)}</>}>
          <ul className="mm-files">
            {files.map(([path, text]) => <li key={path}><span className="mm-mono">{path}</span><span className="mm-mono mm-count">{kb(enc.encode(text).length)}</span></li>)}
          </ul>
          <p className="mm-hint">No dependencies: build.mjs uses only Node's standard library, regenerates the tokens CSS from tokens.json, re-checks every contrast pairing and writes dist/index.html, the same page the stage shows.</p>
        </Disclosure>
      )}
    </section>
  );
}
