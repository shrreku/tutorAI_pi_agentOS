import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { matchRoute } from "./routes.js";
import { RouteGuard, SessionProvider } from "./RouteGuards.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { LandingPage } from "../pages/public/LandingPage.js";
import { LandingFlow } from "../pages/public/LandingFlow.js";
import { LandingBold } from "../pages/public/LandingBold.js";
import { DemoPage } from "../pages/public/DemoPage.js";
import { ContactPage } from "../pages/public/ContactPage.js";
import { PrivacyPage } from "../pages/public/PrivacyPage.js";
import { TermsPage } from "../pages/public/TermsPage.js";
import { LoginPage } from "../pages/public/LoginPage.js";
import { AuthCallbackPage } from "../pages/public/AuthCallbackPage.js";
import { AppShell } from "../pages/app/AppShell.js";
import { ConsentPage } from "../pages/app/ConsentPage.js";
import { DashboardPage } from "../pages/app/DashboardPage.js";
import { TemplateDetailPage } from "../pages/app/TemplateDetailPage.js";
import { WorkspaceCreatePage } from "../pages/app/WorkspaceCreatePage.js";
import { NotebooksListPage } from "../pages/app/NotebooksListPage.js";
import { AccountPage } from "../pages/app/AccountPage.js";
import { AccessCodePage } from "../pages/app/AccessCodePage.js";
import { SupportPage } from "../pages/app/SupportPage.js";
import { CreditsPage } from "../pages/app/CreditsPage.js";
import { AdminShell } from "../pages/admin/AdminShell.js";
import { recordPublicAnalyticsEvent } from "./api.js";

// Heavy / rarely-hit routes are code-split so the marketing + dashboard entry
// stays lean — React Flow, KaTeX, the eval dashboard and the whole admin console
// only download when their route is actually visited.
const NotebookWorkspacePage = lazy(() =>
  import("../NotebookWorkspacePage.js").then((m) => ({ default: m.NotebookWorkspacePage })),
);
const EvalRunsDashboard = lazy(() => import("../EvalRunsDashboard.js"));
const AdminOverviewPage = lazy(() =>
  import("../pages/admin/AdminOverviewPage.js").then((m) => ({ default: m.AdminOverviewPage })),
);
const AdminUsersPage = lazy(() =>
  import("../pages/admin/AdminUsersPage.js").then((m) => ({ default: m.AdminUsersPage })),
);
const AdminUserDetailPage = lazy(() =>
  import("../pages/admin/AdminUserDetailPage.js").then((m) => ({ default: m.AdminUserDetailPage })),
);
const AdminWorkspacesPage = lazy(() =>
  import("../pages/admin/AdminWorkspacesPage.js").then((m) => ({ default: m.AdminWorkspacesPage })),
);
const AdminWorkspaceDetailPage = lazy(() =>
  import("../pages/admin/AdminWorkspaceDetailPage.js").then((m) => ({
    default: m.AdminWorkspaceDetailPage,
  })),
);
const AdminTemplatesPage = lazy(() =>
  import("../pages/admin/AdminTemplatesPage.js").then((m) => ({ default: m.AdminTemplatesPage })),
);
const AdminAccessCodesPage = lazy(() =>
  import("../pages/admin/AdminAccessCodesPage.js").then((m) => ({
    default: m.AdminAccessCodesPage,
  })),
);
const AdminCreditsPage = lazy(() =>
  import("../pages/admin/AdminCreditsPage.js").then((m) => ({ default: m.AdminCreditsPage })),
);
const AdminFeedbackPage = lazy(() =>
  import("../pages/admin/AdminFeedbackPage.js").then((m) => ({ default: m.AdminFeedbackPage })),
);
const AdminIngestionPage = lazy(() =>
  import("../pages/admin/AdminIngestionPage.js").then((m) => ({ default: m.AdminIngestionPage })),
);
const AdminAnalyticsPage = lazy(() =>
  import("../pages/admin/AdminAnalyticsPage.js").then((m) => ({ default: m.AdminAnalyticsPage })),
);
const AdminAccountDeletionPage = lazy(() =>
  import("../pages/admin/AdminAccountDeletionPage.js").then((m) => ({
    default: m.AdminAccountDeletionPage,
  })),
);

function RouteFallback() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background text-foreground">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  );
}

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

  const content = useMemo(() => {
    switch (match.kind) {
      case "public":
        switch (match.page) {
          case "landing":
            return <LandingPage navigate={navigate} />;
          case "landing-flow":
            return <LandingFlow navigate={navigate} />;
          case "landing-bold":
            return <LandingBold navigate={navigate} />;
          case "demo":
            return <DemoPage navigate={navigate} />;
          case "contact":
            return <ContactPage navigate={navigate} />;
          case "privacy":
            return <PrivacyPage navigate={navigate} />;
          case "terms":
            return <TermsPage navigate={navigate} />;
          case "login":
            return <LoginPage navigate={navigate} />;
          case "auth-callback":
            return <AuthCallbackPage navigate={navigate} />;
        }
        break;
      case "app":
        if (match.page === "consent") {
          return (
            <AppShell navigate={navigate} active="dashboard">
              <ConsentPage navigate={navigate} />
            </AppShell>
          );
        }
        if (match.page === "dashboard") {
          return (
            <AppShell navigate={navigate} active="dashboard">
              <DashboardPage navigate={navigate} />
            </AppShell>
          );
        }
        if (match.page === "template-detail" && match.templateId) {
          return (
            <AppShell navigate={navigate} active="dashboard">
              <TemplateDetailPage templateId={match.templateId} navigate={navigate} />
            </AppShell>
          );
        }
        if (match.page === "credits") {
          return (
            <AppShell navigate={navigate} active="credits">
              <CreditsPage />
            </AppShell>
          );
        }
        if (match.page === "access-code") {
          return (
            <AppShell navigate={navigate} active="access-code">
              <AccessCodePage />
            </AppShell>
          );
        }
        if (match.page === "support") {
          return (
            <AppShell navigate={navigate} active="support">
              <SupportPage />
            </AppShell>
          );
        }
        if (match.page === "account") {
          return (
            <AppShell navigate={navigate} active="account">
              <AccountPage />
            </AppShell>
          );
        }
        if (match.page === "workspaces-new") {
          return (
            <AppShell navigate={navigate} active="dashboard">
              <WorkspaceCreatePage navigate={navigate} />
            </AppShell>
          );
        }
        break;
      case "admin": {
        if (match.page === "user-detail" && match.userId) {
          return (
            <AdminShell navigate={navigate} active="users">
              <AdminUserDetailPage userId={match.userId} navigate={navigate} />
            </AdminShell>
          );
        }
        if (match.page === "workspace-detail" && match.workspaceId) {
          return (
            <AdminShell navigate={navigate} active="workspaces">
              <AdminWorkspaceDetailPage workspaceId={match.workspaceId} navigate={navigate} />
            </AdminShell>
          );
        }

        const adminPages = {
          overview: <AdminOverviewPage />,
          users: <AdminUsersPage navigate={navigate} />,
          workspaces: <AdminWorkspacesPage navigate={navigate} />,
          templates: <AdminTemplatesPage />,
          "access-codes": <AdminAccessCodesPage />,
          credits: <AdminCreditsPage />,
          feedback: <AdminFeedbackPage />,
          ingestion: <AdminIngestionPage />,
          analytics: <AdminAnalyticsPage />,
          "account-deletion": <AdminAccountDeletionPage />,
        } as const;

        const page = match.page in adminPages ? match.page : "overview";
        return (
          <AdminShell navigate={navigate} active={page}>
            {adminPages[page as keyof typeof adminPages]}
          </AdminShell>
        );
      }
      case "notebooks-list":
        return (
          <AppShell navigate={navigate} active="notebooks">
            <NotebooksListPage navigate={navigate} />
          </AppShell>
        );
      case "notebook":
        return <NotebookWorkspacePage notebookId={match.notebookId} navigate={navigate} />;
      case "eval-runs":
        return (
          <EvalRunsDashboard
            selectedRunId={match.runId}
            onSelectRun={(runId) => navigate(`/eval-runs/${encodeURIComponent(runId)}`)}
            onBackToNotebooks={() => navigate("/notebooks")}
          />
        );
      case "unknown":
        return (
          <div className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
              <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
                404
              </p>
              <h1 className="mt-2 font-display text-[26px] font-semibold">Page not found</h1>
              <p className="mt-2 text-[14px] text-muted-foreground">
                The page you’re looking for doesn’t exist or has moved.
              </p>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-accent"
              >
                Back to TutorBook
              </button>
            </div>
          </div>
        );
    }
    return null;
  }, [match, navigate]);

  return (
    <SessionProvider>
      <RouteGuard routePath={routePath} navigate={navigate}>
        {/* Keyed by route so navigating away clears a tripped boundary. */}
        <ErrorBoundary key={routePath} area={routePath}>
          <Suspense fallback={<RouteFallback />}>{content}</Suspense>
        </ErrorBoundary>
      </RouteGuard>
    </SessionProvider>
  );
}
