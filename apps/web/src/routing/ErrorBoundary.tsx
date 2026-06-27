import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Optional label to identify which boundary tripped in error reports. */
  area?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches render-time exceptions so a single bad component (e.g. a malformed live
 * trace chunk or LaTeX edge case in TutorPanel/AgentTrace) shows a recoverable
 * fallback instead of white-screening the whole SPA. Errors are forwarded to Sentry.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    Sentry.captureException(error, {
      tags: { boundary: this.props.area ?? "app" },
      extra: { componentStack: info.componentStack },
    });
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="tb-page">
          <div className="tb-card">
            <h1>Something went wrong</h1>
            <p>
              This part of TutorBook hit an unexpected error. Your study data is safe — reloading
              usually fixes it.
            </p>
            <p>
              <button
                type="button"
                className="tb-button tb-button-primary"
                onClick={this.handleReload}
              >
                Reload
              </button>
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
