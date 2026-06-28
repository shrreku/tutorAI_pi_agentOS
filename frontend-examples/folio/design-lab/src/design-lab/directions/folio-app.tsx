import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FolioNodePack } from "../ui/folio-nodes.js";
import { FolioShellNav, useFolioNavCollapsed, useFolioNavVariant, type FolioAccountTab, type FolioNavKey } from "../ui/folio-shell-nav.js";
import { FolioWorkspaceFull } from "../ui/layouts/folio-workspace-full.js";
import { FolioLandingPage, type FolioLandingVariant } from "./folio-landings.js";
import {
  FolioAccountPage,
  FolioDashboardPage,
  FolioNotebooksPage,
  FolioTemplateDetailPage,
  FolioWorkspaceCreatePage,
} from "./folio-pages.js";

export type { FolioAccountTab, FolioNavKey };

type FolioRoute =
  | { kind: "shell"; nav: FolioNavKey; accountTab?: FolioAccountTab }
  | { kind: "workspace"; notebookId: string }
  | { kind: "template"; templateId: string }
  | { kind: "workspace-create"; templateId: string | null }
  | { kind: "nodepack" }
  | { kind: "landing"; variant: FolioLandingVariant };

const ACCOUNT_TABS_LIST = ["overview", "credits", "access-code", "support", "data"] as const;

function parseAccountTab(value: string | null | undefined): FolioAccountTab {
  if (value && (ACCOUNT_TABS_LIST as readonly string[]).includes(value)) {
    return value as FolioAccountTab;
  }
  return "overview";
}
const LEGACY_ACCOUNT_PATHS: Record<string, FolioAccountTab> = {
  credits: "credits",
  "access-code": "access-code",
  support: "support",
};

function parseFolioRoute(hash: string): FolioRoute {
  const raw = hash.replace(/^#/, "");
  const [dir, ...rest] = raw.split("/");
  if (dir !== "folio") {
    return { kind: "shell", nav: "dashboard" };
  }

  const [page, sub, ...more] = rest;
  const queryStart = page?.indexOf("?") ?? -1;
  const pageName = queryStart >= 0 ? page!.slice(0, queryStart) : page;
  const query = queryStart >= 0 ? new URLSearchParams(page!.slice(queryStart + 1)) : null;

  if (!pageName || pageName === "dashboard") return { kind: "shell", nav: "dashboard" };
  if (pageName === "landing") {
    const v = sub as FolioLandingVariant | undefined;
    const variant: FolioLandingVariant =
      v === "journal" || v === "tutor" || v === "library" ? v : "index";
    return { kind: "landing", variant };
  }
  if (pageName === "nodepack") return { kind: "nodepack" };
  if (pageName === "notebooks" && sub) return { kind: "workspace", notebookId: decodeURIComponent(sub) };
  if (pageName === "notebooks") return { kind: "shell", nav: "notebooks" };
  if (pageName === "account") {
    const tab = parseAccountTab(sub ?? query?.get("tab"));
    return { kind: "shell", nav: "account", accountTab: tab };
  }
  if (pageName in LEGACY_ACCOUNT_PATHS) {
    return {
      kind: "shell",
      nav: "account",
      accountTab: LEGACY_ACCOUNT_PATHS[pageName]!,
    };
  }
  if (pageName === "templates" && sub) return { kind: "template", templateId: decodeURIComponent(sub) };
  if (pageName === "workspaces" && sub === "new") {
    return { kind: "workspace-create", templateId: query?.get("template") ?? null };
  }

  if (pageName === "workspace" && !sub) return { kind: "workspace", notebookId: "demo-orgchem" };
  if (more.length === 0 && pageName === "workspace" && sub) {
    return { kind: "workspace", notebookId: decodeURIComponent(sub) };
  }

  return { kind: "shell", nav: "dashboard" };
}

function useFolioRoute() {
  const [route, setRoute] = useState<FolioRoute>(() =>
    parseFolioRoute(window.location.hash),
  );

  useEffect(() => {
    const sync = () => setRoute(parseFolioRoute(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = useCallback((path: string) => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    window.location.hash = `folio${normalized}`;
  }, []);

  return { route, navigate };
}

function FolioShell({
  active,
  navigate,
  children,
}: {
  active: FolioNavKey;
  navigate: (path: string) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useFolioNavCollapsed();
  const [navVariant, setNavVariant] = useFolioNavVariant();

  return (
    <div className="folio-shell flex min-h-0 flex-1 flex-col" data-nav-variant={navVariant}>
      <div className="folio-learner-layout min-h-0 flex-1">
        <FolioShellNav
          active={active}
          navigate={navigate}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          variant={navVariant}
          onVariantChange={setNavVariant}
        />
        <main className="folio-main overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function FolioShellPage({
  route,
  navigate,
}: {
  route: Extract<FolioRoute, { kind: "shell" }>;
  navigate: (path: string) => void;
}) {
  switch (route.nav) {
    case "dashboard":
      return <FolioDashboardPage navigate={navigate} />;
    case "notebooks":
      return <FolioNotebooksPage navigate={navigate} />;
    case "account":
      return (
        <FolioAccountPage
          activeTab={route.accountTab ?? "overview"}
          onTabChange={(tab) => navigate(`/account/${tab}`)}
          navigate={navigate}
        />
      );
    case "nodepack":
      return <FolioNodePack />;
    default:
      return <FolioDashboardPage navigate={navigate} />;
  }
}

export function FolioApp() {
  const { route, navigate } = useFolioRoute();

  const shellNav = useMemo((): FolioNavKey => {
    if (route.kind === "shell") return route.nav;
    if (route.kind === "workspace" || route.kind === "template" || route.kind === "workspace-create") {
      return "notebooks";
    }
    return "dashboard";
  }, [route]);

  if (route.kind === "landing") {
    return <FolioLandingPage variant={route.variant} navigate={navigate} />;
  }

  if (route.kind === "workspace") {
    return (
      <FolioShell active={shellNav} navigate={navigate}>
        <FolioWorkspaceFull
          notebookId={route.notebookId}
          onBack={() => navigate("/dashboard")}
        />
      </FolioShell>
    );
  }

  if (route.kind === "nodepack") {
    return (
      <FolioShell active="nodepack" navigate={navigate}>
        <FolioNodePack />
      </FolioShell>
    );
  }

  if (route.kind === "template") {
    return (
      <FolioShell active="notebooks" navigate={navigate}>
        <FolioTemplateDetailPage templateId={route.templateId} navigate={navigate} />
      </FolioShell>
    );
  }

  if (route.kind === "workspace-create") {
    return (
      <FolioShell active="notebooks" navigate={navigate}>
        <FolioWorkspaceCreatePage templateId={route.templateId} navigate={navigate} />
      </FolioShell>
    );
  }

  return (
    <FolioShell active={shellNav} navigate={navigate}>
      <FolioShellPage route={route} navigate={navigate} />
    </FolioShell>
  );
}

export { parseFolioRoute };
