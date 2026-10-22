import { Component, type ReactNode } from "react";

/** Keeps one broken panel from blanking the whole studio; shows what failed and offers a retry. */
export class TabBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mm-note" role="alert" style={{ display: "grid", gap: 10 }}>
        <p className="mm-h3">The {this.props.label} panel could not be drawn.</p>
        <p className="mm-small">{this.state.error.message}</p>
        <div><button type="button" className="mm-btn" onClick={() => this.setState({ error: null })}>Try again</button></div>
      </div>
    );
  }
}
