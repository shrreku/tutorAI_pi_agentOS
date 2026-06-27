import { useCallback, useEffect, useMemo, useState } from "react";
import { matchRoute } from "./routes.js";
import { RouteGuard, SessionProvider } from "./RouteGuards.js";
import { LandingPage } from "../pages/public/LandingPage.js";
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
import { AdminOverviewPage } from "../pages/admin/AdminOverviewPage.js";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage.js";
import { AdminWorkspacesPage } from "../pages/admin/AdminWorkspacesPage.js";
import { AdminWorkspaceDetailPage } from "../pages/admin/AdminWorkspaceDetailPage.js";
import { AdminTemplatesPage } from "../pages/admin/AdminTemplatesPage.js";
import { AdminAccessCodesPage } from "../pages/admin/AdminAccessCodesPage.js";
import { AdminCreditsPage } from "../pages/admin/AdminCreditsPage.js";
import { AdminFeedbackPage } from "../pages/admin/AdminFeedbackPage.js";
import { AdminIngestionPage } from "../pages/admin/AdminIngestionPage.js";
import { AdminAnalyticsPage } from "../pages/admin/AdminAnalyticsPage.js";
import { AdminAccountDeletionPage } from "../pages/admin/AdminAccountDeletionPage.js";
import { AdminUserDetailPage } from "../pages/admin/AdminUserDetailPage.js";
import { NotebookWorkspacePage } from "../NotebookWorkspacePage.js";
import EvalRunsDashboard from "../EvalRunsDashboard.js";
import { recordPublicAnalyticsEvent } from "./api.js";

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
          <div className="tb-page">
            <div className="tb-card">
              <h1>Page not found</h1>
              <p>
                <button type="button" className="tb-button tb-button-primary" onClick={() => navigate("/")}>
                  Back to TutorBook
                </button>
              </p>
            </div>
          </div>
        );
    }
    return null;
  }, [match, navigate]);

  return (
    <SessionProvider>
      <RouteGuard routePath={routePath} navigate={navigate}>
        {content}
      </RouteGuard>
    </SessionProvider>
  );
}
