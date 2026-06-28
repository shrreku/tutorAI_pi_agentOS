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
        <div className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </span>
            <h1 className="mt-4 font-display text-[22px] font-semibold">Something went wrong</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              This part of TutorBook hit an unexpected error. Your study data is safe — reloading
              usually fixes it.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-accent"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
