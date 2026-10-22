import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/** Measures the selected child and slides a thumb under it (transform only, no layout shift). */
export function useIndicator<T extends HTMLElement>(selector: string, key: unknown) {
  const container = useRef<T>(null);
  const [style, setStyle] = useState<{ transform: string; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const place = () => {
      const target = el.querySelector<HTMLElement>(selector);
      if (!target) {
        setStyle(null);
        return;
      }
      const box = el.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      // Position and width (not scaleX) so the thumb keeps its rounded corners.
      setStyle({ transform: `translateX(${t.left - box.left - el.clientLeft}px)`, width: t.width });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selector, key]);
  return { container, style };
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { container, style } = useIndicator<HTMLDivElement>('button[aria-pressed="true"]', value);
  return (
    <div className="mm-segmented" role="group" aria-label={label} ref={container}>
      {style && <span className="mm-seg-thumb" style={style} aria-hidden />}
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="mm-disclosure" data-open={open}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <svg className="mm-chev" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7.5 4.5 13 10l-5.5 5.5" />
        </svg>
        <span>{summary}</span>
      </button>
      <div className="mm-collapse" id={id}>
        <div>
          {/* Content stays in the DOM (searchable, printable); `inert` keeps it out of tab order while closed. */}
          <div className="mm-collapse-inner" inert={!open}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Skeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="mm-skeleton" aria-hidden>
      <div className="mm-skel" style={{ height: 44, width: "62%" }} />
      <div className="mm-skel" style={{ width: "38%" }} />
      <div className="mm-skel" style={{ height: 220, borderRadius: 10 }} />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="mm-skel" style={{ width: `${88 - ((i * 13) % 40)}%` }} />
      ))}
    </div>
  );
}

export function LoadingState({ what }: { what: string }) {
  return (
    <div role="status" aria-live="polite">
      <p className="mm-meta">Loading {what} from the published snapshot.</p>
      <Skeleton />
    </div>
  );
}

export function ErrorState({ title, error, onRetry }: { title: string; error: Error; onRetry: () => void }) {
  const url = (error as Error & { url?: string }).url;
  return (
    <div className="mm-state" role="alert">
      <h2 className="mm-h2">{title}</h2>
      <p className="mm-prose">
        {error.message} {url ? <>The file was <code className="mm-wrap-anywhere">{url}</code>.</> : null}
      </p>
      <p className="mm-prose">
        The site is a static snapshot; nothing was lost. Retry, or open the state branch to read the records
        directly.
      </p>
      <div className="mm-toolbar">
        <button type="button" className="mm-btn mm-btn-primary" onClick={onRetry}>
          <Icon name="refresh" /> Retry
        </button>
      </div>
    </div>
  );
}

export function EmptyState({ requestHref }: { requestHref: string }) {
  return (
    <div className="mm-state">
      <h1 className="mm-h1" tabIndex={-1} data-section-heading>No published generations yet.</h1>
      <p className="mm-prose">
        A generation is published only after its package built on its own and its review finished. The first one
        will appear here with its preview, contrast pairings, accessibility results and the package to download.
      </p>
      <div className="mm-toolbar">
        <a className="mm-btn mm-btn-primary" href={requestHref}>
          How to request a run
        </a>
      </div>
    </div>
  );
}
