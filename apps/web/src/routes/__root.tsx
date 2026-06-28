import { Outlet, createRootRouteWithContext, useLocation } from "@tanstack/react-router";
import type { RouterContext } from "../app/router.js";
import { ErrorBoundary } from "../routing/ErrorBoundary.js";
import { RouteGuard, SessionProvider } from "../routing/RouteGuards.js";
import { routeTelemetryFromPath } from "../routing/route-telemetry.js";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  const location = useLocation();

  return (
    <SessionProvider>
      <RouteGuard>
        <ErrorBoundary key={location.pathname} area={routeTelemetryFromPath(location.pathname)}>
          <Outlet />
        </ErrorBoundary>
      </RouteGuard>
    </SessionProvider>
  );
}

function NotFoundPage() {
  return (
    <div className="tb-page" data-theme="folio">
      <div className="tb-card">
        <h1>Page not found</h1>
        <p>
          <a href="/" className="tb-button tb-button-primary">
            Back to TutorBook
          </a>
        </p>
      </div>
    </div>
  );
}
