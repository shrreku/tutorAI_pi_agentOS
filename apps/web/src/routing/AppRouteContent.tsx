import type { ReactNode } from "react";
import type { RouteMatch } from "./routes.js";
import { NextLoginPage } from "../next/pages/NextLoginPage.js";
import { NextConsentPage } from "../next/pages/NextConsentPage.js";
import { NextDashboardPage } from "../next/pages/NextDashboardPage.js";
import { NextNotebooksPage } from "../next/pages/NextNotebooksPage.js";
import { NextNotebookWorkspacePage } from "../next/pages/NextNotebookWorkspacePage.js";
import { NextHomePage } from "../next/pages/NextHomePage.js";
import { NextProductShell } from "../next/shell/NextProductShell.js";
import { NextPublicLayout } from "../next/shell/NextPublicLayout.js";
import { useVisualTheme } from "../next/shell/ThemeProvider.js";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@studyagent/ui";
import { DemoPage } from "../pages/public/DemoPage.js";
import { ContactPage } from "../pages/public/ContactPage.js";
import { PrivacyPage } from "../pages/public/PrivacyPage.js";
import { TermsPage } from "../pages/public/TermsPage.js";
import { AuthCallbackPage } from "../pages/public/AuthCallbackPage.js";
import { TemplateDetailPage } from "../pages/app/TemplateDetailPage.js";
import { WorkspaceCreatePage } from "../pages/app/WorkspaceCreatePage.js";
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
import EvalRunsDashboard from "../EvalRunsDashboard.js";

type NavigateFn = (path: string) => void;

function KitAppPage({
  navigate,
  active,
  children,
}: {
  navigate: NavigateFn;
  active: "dashboard" | "credits" | "access-code" | "support" | "account";
  children: ReactNode;
}) {
  const theme = useVisualTheme();

  return (
    <NextProductShell navigate={navigate} active={active}>
      <div className={`app-detail-page app-detail-page--${theme}`}>{children}</div>
    </NextProductShell>
  );
}

export function AppRouteContent({
  match,
  navigate,
  landingPage,
}: {
  match: RouteMatch;
  navigate: NavigateFn;
  landingPage?: ReactNode;
}) {
  switch (match.kind) {
    case "public":
      switch (match.page) {
        case "landing":
          return landingPage ?? <NextHomePage navigate={navigate} />;
        case "demo":
          return (
            <NextPublicLayout navigate={navigate}>
              <div className="public-doc-page">
                <DemoPage navigate={navigate} />
              </div>
            </NextPublicLayout>
          );
        case "contact":
          return (
            <NextPublicLayout navigate={navigate}>
              <div className="public-doc-page">
                <ContactPage navigate={navigate} />
              </div>
            </NextPublicLayout>
          );
        case "privacy":
          return (
            <NextPublicLayout navigate={navigate}>
              <div className="public-doc-page">
                <PrivacyPage navigate={navigate} />
              </div>
            </NextPublicLayout>
          );
        case "terms":
          return (
            <NextPublicLayout navigate={navigate}>
              <div className="public-doc-page">
                <TermsPage navigate={navigate} />
              </div>
            </NextPublicLayout>
          );
        case "login":
          return <NextLoginPage navigate={navigate} />;
        case "auth-callback":
          return <AuthCallbackPage navigate={navigate} />;
      }
      break;
    case "app":
      if (match.page === "consent") return <NextConsentPage navigate={navigate} />;
      if (match.page === "dashboard") return <NextDashboardPage navigate={navigate} />;
      if (match.page === "template-detail" && match.templateId) {
        return (
          <KitAppPage navigate={navigate} active="dashboard">
            <TemplateDetailPage templateId={match.templateId} navigate={navigate} />
          </KitAppPage>
        );
      }
      if (match.page === "credits") {
        return (
          <KitAppPage navigate={navigate} active="credits">
            <CreditsPage />
          </KitAppPage>
        );
      }
      if (match.page === "access-code") {
        return (
          <KitAppPage navigate={navigate} active="access-code">
            <AccessCodePage />
          </KitAppPage>
        );
      }
      if (match.page === "support") {
        return (
          <KitAppPage navigate={navigate} active="support">
            <SupportPage />
          </KitAppPage>
        );
      }
      if (match.page === "account") {
        return (
          <KitAppPage navigate={navigate} active="account">
            <AccountPage />
          </KitAppPage>
        );
      }
      if (match.page === "workspaces-new") {
        return (
          <KitAppPage navigate={navigate} active="dashboard">
            <WorkspaceCreatePage navigate={navigate} />
          </KitAppPage>
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
      return <NextNotebooksPage navigate={navigate} />;
    case "notebook":
      return <NextNotebookWorkspacePage notebookId={match.notebookId} navigate={navigate} />;
    case "eval-runs":
      return (
        <div className="app">
          <EvalRunsDashboard
            selectedRunId={match.runId}
            onSelectRun={(runId) => navigate(`/eval-runs/${encodeURIComponent(runId)}`)}
            onBackToNotebooks={() => navigate("/notebooks")}
          />
        </div>
      );
    case "unknown":
      return (
        <NextPublicLayout navigate={navigate}>
          <Card>
            <CardHeader>
              <CardTitle>Page not found</CardTitle>
            </CardHeader>
            <CardContent>
              <Button type="button" onClick={() => navigate("/")}>
                Back to TutorBook
              </Button>
            </CardContent>
          </Card>
        </NextPublicLayout>
      );
  }
  return null;
}
