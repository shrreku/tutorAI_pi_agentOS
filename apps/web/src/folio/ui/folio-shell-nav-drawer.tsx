import { ChevronRight, PanelLeft, PanelLeftClose, Shapes, Sparkles } from "lucide-react";
import { cn } from "../lib/utils.js";
import { Avatar } from "./primitives.js";
import {
  NAV_VARIANTS,
  PRIMARY_NAV,
  useFolioNavStats,
  type FolioNavKey,
  type FolioNavVariant,
} from "./folio-shell-nav-shared.js";

export function FolioNavDrawer({
  active,
  navigate,
  collapsed,
  onToggleCollapse,
  variant,
  onVariantChange,
}: {
  active: FolioNavKey;
  navigate: (path: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  variant: FolioNavVariant;
  onVariantChange: (v: FolioNavVariant) => void;
}) {
  const stats = useFolioNavStats();

  return (
    <div className="folio-nav-drawer-wrap" data-nav-variant="drawer">
      <nav
        className={cn("folio-nav-drawer", collapsed && "folio-nav-drawer--collapsed")}
        aria-label="Learner navigation"
      >
        <div className="folio-nav-drawer-header">
          <div className="folio-nav-drawer-header-top">
            {!collapsed ? (
              <div className="folio-nav-drawer-brand">
                <span className="folio-nav-drawer-logo">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div>
                  <span className="folio-nav-drawer-title">TutorBook</span>
                  <span className="folio-nav-drawer-sub">Folio</span>
                </div>
              </div>
            ) : (
              <span className="folio-nav-drawer-logo folio-nav-drawer-logo--solo">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            )}
            <button
              type="button"
              className="folio-nav-drawer-collapse"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          {!collapsed ? (
            <div className="folio-nav-drawer-chips">
              <span className="folio-nav-drawer-chip folio-nav-drawer-chip--study">
                {stats.studyMinutes}m today
              </span>
              <span className="folio-nav-drawer-chip folio-nav-drawer-chip--credits">
                {stats.creditsPct}% credits
              </span>
            </div>
          ) : null}
        </div>

        <div className="folio-nav-drawer-tray">
          <ul className="folio-nav-drawer-list">
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    className="folio-nav-drawer-pill"
                    data-active={isActive}
                    data-collapsed={collapsed}
                    title={collapsed ? item.label : undefined}
                    onClick={() => navigate(item.path)}
                  >
                    <Icon className="folio-nav-drawer-pill-icon" strokeWidth={1.75} />
                    {!collapsed ? <span>{item.label}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="folio-nav-drawer-footer">
          {!collapsed ? (
            <div className="folio-nav-variant-picker folio-nav-variant-picker--drawer">
              {NAV_VARIANTS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="folio-nav-variant-chip"
                  data-active={variant === v.id}
                  onClick={() => onVariantChange(v.id)}
                  title={v.blurb}
                >
                  {v.label}
                </button>
              ))}
            </div>
          ) : null}

          {!collapsed ? (
            <div className="folio-nav-drawer-links">
              <button type="button" onClick={() => navigate("/landing")}>
                Landing pages
              </button>
              <button
                type="button"
                data-active={active === "nodepack"}
                onClick={() => navigate("/nodepack")}
              >
                Node pack
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="folio-nav-drawer-pill"
              data-active={active === "nodepack"}
              data-collapsed
              title="Node pack"
              onClick={() => navigate("/nodepack")}
            >
              <Shapes className="folio-nav-drawer-pill-icon" strokeWidth={1.75} />
            </button>
          )}

          <button
            type="button"
            className="folio-nav-drawer-account"
            data-active={active === "account"}
            data-collapsed={collapsed}
            onClick={() => navigate("/account")}
            title={collapsed ? `${stats.firstName} · Account` : undefined}
          >
            <Avatar name={stats.displayName} className="h-9 w-9 shrink-0 text-[11px]" />
            {!collapsed ? (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-display text-[14px] font-semibold">
                    {stats.firstName}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    Account & settings
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            ) : null}
          </button>
        </div>
      </nav>
    </div>
  );
}
