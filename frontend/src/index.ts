import { Component, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MinimalMotionStudioApp } from "./App";
import type { AppConfig } from "./config";

export { MinimalMotionStudioApp } from "./App";
export type { AppConfig, Routing, Theme } from "./config";

/**
 * Mount the app into any element. Returns an unmount function that removes every listener the
 * app registered (hashchange, media queries and observers are all tied to React effects).
 */
class RootBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return createElement("div", { className: "mm-root", role: "alert", style: { padding: 24 } },
      createElement("p", null, `The studio hit an error and stopped: ${this.state.error.message}`),
      createElement("a", { href: "#/", onClick: () => { this.setState({ error: null }); } }, "Back to the studio"));
  }
}

export function mount(element: HTMLElement, config: Partial<AppConfig> = {}): () => void {
  const root: Root = createRoot(element);
  root.render(createElement(RootBoundary, null, createElement(MinimalMotionStudioApp, config)));
  return () => root.unmount();
}
