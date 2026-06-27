export type PublicPage =
  | "landing"
  | "demo"
  | "contact"
  | "privacy"
  | "terms"
  | "login"
  | "auth-callback";

export type AppPage =
  | "dashboard"
  | "consent"
  | "template-detail"
  | "workspaces-new"
  | "credits"
  | "access-code"
  | "support"
  | "account";

export type AdminPage =
  | "overview"
  | "users"
  | "user-detail"
  | "workspaces"
  | "workspace-detail"
  | "templates"
  | "access-codes"
  | "credits"
  | "feedback"
  | "ingestion"
  | "analytics"
  | "account-deletion";

export type RouteMatch =
  | { kind: "public"; page: PublicPage }
  | { kind: "app"; page: AppPage; templateId?: string }
  | { kind: "admin"; page: AdminPage; userId?: string; workspaceId?: string }
  | { kind: "notebooks-list" }
  | { kind: "notebook"; notebookId: string }
  | { kind: "eval-runs"; runId: string | null }
  | { kind: "unknown" };

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function matchRoute(pathname: string): RouteMatch {
  const path = normalizePath(pathname);

  if (path === "/") return { kind: "public", page: "landing" };
  if (path === "/demo") return { kind: "public", page: "demo" };
  if (path === "/contact") return { kind: "public", page: "contact" };
  if (path === "/privacy") return { kind: "public", page: "privacy" };
  if (path === "/terms") return { kind: "public", page: "terms" };
  if (path === "/login") return { kind: "public", page: "login" };
  if (path === "/auth/callback") return { kind: "public", page: "auth-callback" };

  if (path === "/app") return { kind: "app", page: "dashboard" };
  if (path === "/app/consent") return { kind: "app", page: "consent" };
  if (path === "/app/workspaces/new") return { kind: "app", page: "workspaces-new" };
  if (path === "/app/credits") return { kind: "app", page: "credits" };
  if (path === "/app/access-code") return { kind: "app", page: "access-code" };
  if (path === "/app/support") return { kind: "app", page: "support" };
  if (path === "/app/account") return { kind: "app", page: "account" };

  const templateMatch = path.match(/^\/app\/templates\/([^/]+)$/);
  if (templateMatch?.[1]) {
    return {
      kind: "app",
      page: "template-detail",
      templateId: decodeURIComponent(templateMatch[1]),
    };
  }

  if (path === "/admin") return { kind: "admin", page: "overview" };
  if (path === "/admin/users") return { kind: "admin", page: "users" };

  const adminUserMatch = path.match(/^\/admin\/users\/([^/]+)$/);
  if (adminUserMatch?.[1]) {
    return { kind: "admin", page: "user-detail", userId: decodeURIComponent(adminUserMatch[1]) };
  }
  if (path === "/admin/workspaces") return { kind: "admin", page: "workspaces" };
  const adminWorkspaceMatch = path.match(/^\/admin\/workspaces\/([^/]+)$/);
  if (adminWorkspaceMatch?.[1]) {
    return {
      kind: "admin",
      page: "workspace-detail",
      workspaceId: decodeURIComponent(adminWorkspaceMatch[1]),
    };
  }
  if (path === "/admin/templates") return { kind: "admin", page: "templates" };
  if (path === "/admin/access-codes") return { kind: "admin", page: "access-codes" };
  if (path === "/admin/credits") return { kind: "admin", page: "credits" };
  if (path === "/admin/feedback") return { kind: "admin", page: "feedback" };
  if (path === "/admin/ingestion") return { kind: "admin", page: "ingestion" };
  if (path === "/admin/analytics") return { kind: "admin", page: "analytics" };
  if (path === "/admin/account-deletion") return { kind: "admin", page: "account-deletion" };

  if (path === "/notebooks") return { kind: "notebooks-list" };

  const notebookMatch = path.match(/^\/notebooks\/([^/]+)$/);
  if (notebookMatch?.[1]) {
    return { kind: "notebook", notebookId: decodeURIComponent(notebookMatch[1]) };
  }

  const evalMatch = path.match(/^\/eval-runs(?:\/([^/]+))?$/);
  if (evalMatch) {
    return { kind: "eval-runs", runId: evalMatch[1] ? decodeURIComponent(evalMatch[1]) : null };
  }

  return { kind: "unknown" };
}

/**
 * Stable, low-cardinality route name for telemetry. Dynamic route identifiers
 * must never be copied into error tags or analytics dimensions.
 */
export function routeTelemetryName(match: RouteMatch): string {
  switch (match.kind) {
    case "public":
      return `public:${match.page}`;
    case "app":
      return `app:${match.page}`;
    case "admin":
      return `admin:${match.page}`;
    case "notebooks-list":
    case "notebook":
    case "eval-runs":
    case "unknown":
      return match.kind;
  }
}

export function isProtectedRoute(match: RouteMatch): boolean {
  return (
    match.kind === "app" ||
    match.kind === "admin" ||
    match.kind === "notebooks-list" ||
    match.kind === "notebook" ||
    match.kind === "eval-runs"
  );
}

export function isEvalRunsRoute(match: RouteMatch): boolean {
  return match.kind === "eval-runs";
}

export function isAdminRoute(match: RouteMatch): boolean {
  return match.kind === "admin";
}

export function requiresConsent(match: RouteMatch): boolean {
  if (match.kind === "notebook" || match.kind === "notebooks-list") return true;
  return match.kind === "app" && match.page !== "consent";
}
