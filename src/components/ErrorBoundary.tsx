import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: an unexpected error inside one tool shows a message
 * in the document area instead of blanking the whole application.
 * Keyed by route in the layout, so switching tools clears it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Tool error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-3">
        <div className="border border-[var(--err-line)] bg-[var(--err-bg)] p-3">
          <div className="font-semibold">This tool stopped because of an unexpected error.</div>
          <p className="mt-1 text-muted">{this.state.error.message}</p>
          <p className="mt-1 text-muted">The inputs in the link probably contain a value the tool cannot handle. Resetting the inputs usually fixes it.</p>
          <div className="mt-2 flex gap-2">
            <button
              className="btn btn-primary"
              onClick={() => {
                window.history.replaceState(null, '', window.location.pathname);
                window.location.reload();
              }}
            >
              Reset this tool
            </button>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
