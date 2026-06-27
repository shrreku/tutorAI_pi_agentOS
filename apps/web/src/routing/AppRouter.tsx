import { useCallback, useEffect, useMemo, useState } from "react";
import { matchRoute } from "./routes.js";
import { RouteGuard, SessionProvider } from "./RouteGuards.js";
import { recordPublicAnalyticsEvent } from "./api.js";
import { AppRouteContent } from "./AppRouteContent.js";

export function AppRouter() {
  const [routePath, setRoutePath] = useState(() => window.location.pathname);

  const navigate = useCallback((path: string) => {
    window.history.pushState(null, "", path);
    setRoutePath(window.location.pathname);
  }, []);

  useEffect(() => {
    const onPopState = () => setRoutePath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const match = useMemo(() => matchRoute(routePath), [routePath]);

  useEffect(() => {
    if (match.kind === "public") {
      recordPublicAnalyticsEvent("visitor_page_view", {
        path: routePath,
        page: match.page,
      });
    }
  }, [match, routePath]);

  return (
    <SessionProvider>
      <RouteGuard routePath={routePath} navigate={navigate}>
        <AppRouteContent match={match} navigate={navigate} />
      </RouteGuard>
    </SessionProvider>
  );
}
