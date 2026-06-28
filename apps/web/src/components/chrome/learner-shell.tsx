import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronRight,
  LayoutDashboard,
  PanelLeft,
  PanelLeftClose,
  Sparkles,
} from "lucide-react";
import { Avatar } from "../../folio/ui/primitives.js";
import { cn } from "../../folio/lib/utils.js";
import {
  creditsPercentOf,
  displayNameOf,
  firstNameOf,
  useSession,
} from "../../folio/lib/session.js";

const COLLAPSE_KEY = "folio-shell-collapsed";

type NavItem = {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  match: (path: string) => boolean;
};

const PRIMARY_NAV: NavItem[] = [
  { label: "Journal", to: "/app", icon: LayoutDashboard, match: (p) => p === "/app" },
  {
    label: "Notebooks",
    to: "/app/notebooks",
    icon: BookOpen,
    match: (p) => p.startsWith("/app/notebooks") || p.startsWith("/notebooks"),
  },
];

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);
  return [collapsed, setCollapsed] as const;
}

export function LearnerShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useCollapsed();
  const { data: session } = useSession();

  const name = displayNameOf(session);
  const first = firstNameOf(session);
  const creditsPct = creditsPercentOf(session);
  const accountActive = pathname.startsWith("/app/account");

  return (
    <div className="folio-shell" data-nav-variant="drawer" style={{ minHeight: "100dvh" }}>
      <div className="folio-learner-layout">
        <div className="folio-nav-drawer-wrap" data-nav-variant="drawer">
          <nav
            className={cn("folio-nav-drawer", collapsed && "folio-nav-drawer--collapsed")}
            aria-label="Learner navigation"
          >
            <div className="folio-nav-drawer-header">
              <div className="folio-nav-drawer-header-top">
                {!collapsed ? (
                  <Link to="/app" className="folio-nav-drawer-brand">
                    <span className="folio-nav-drawer-logo">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <span className="folio-nav-drawer-title">TutorBook</span>
                      <span className="folio-nav-drawer-sub">Folio</span>
                    </div>
                  </Link>
                ) : (
                  <Link to="/app" className="folio-nav-drawer-logo folio-nav-drawer-logo--solo">
                    <Sparkles className="h-3.5 w-3.5" />
                  </Link>
                )}
                <button
                  type="button"
                  className="folio-nav-drawer-collapse"
                  onClick={() => setCollapsed((v) => !v)}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </div>

              {!collapsed && creditsPct != null ? (
                <div className="folio-nav-drawer-chips">
                  <span className="folio-nav-drawer-chip folio-nav-drawer-chip--credits">
                    {creditsPct}% credits
                  </span>
                </div>
              ) : null}
            </div>

            <div className="folio-nav-drawer-tray">
              <ul className="folio-nav-drawer-list">
                {PRIMARY_NAV.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.match(pathname);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className="folio-nav-drawer-pill"
                        data-active={isActive}
                        data-collapsed={collapsed}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon className="folio-nav-drawer-pill-icon" strokeWidth={1.75} />
                        {!collapsed ? <span>{item.label}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="folio-nav-drawer-footer">
              <Link
                to="/app/account/$tab"
                params={{ tab: "overview" }}
                className="folio-nav-drawer-account"
                data-active={accountActive}
                data-collapsed={collapsed}
                title={collapsed ? `${first} · Account` : undefined}
              >
                <Avatar name={name} className="h-9 w-9 shrink-0 text-[11px]" />
                {!collapsed ? (
                  <>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-display text-[14px] font-semibold">
                        {first}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        Account &amp; settings
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </>
                ) : null}
              </Link>
            </div>
          </nav>
        </div>

        <main className="folio-main overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
