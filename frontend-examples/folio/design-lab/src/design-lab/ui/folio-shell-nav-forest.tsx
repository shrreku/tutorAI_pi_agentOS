import { PanelLeft, PanelLeftClose, Shapes } from "lucide-react";
import { cn } from "../lib/utils.js";
import { Avatar } from "./primitives.js";
import {
  NAV_VARIANTS,
  PRIMARY_NAV,
  useFolioNavStats,
  type FolioNavKey,
  type FolioNavVariant,
} from "./folio-shell-nav-shared.js";

export function FolioNavForest({
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
    <nav
      className={cn("folio-nav-forest", collapsed && "folio-nav-forest--collapsed")}
      aria-label="Learner navigation"
      data-nav-variant="forest"
    >
      <div className="folio-nav-forest-glow" aria-hidden />

      <div className="folio-nav-forest-top">
        <div className={cn("folio-nav-forest-brand-row", collapsed && "justify-center")}>
          {!collapsed ? (
            <div>
              <div className="folio-nav-forest-brand">TutorBook</div>
              <p className="folio-nav-forest-tag">Folio · Beta</p>
            </div>
          ) : (
            <span className="folio-nav-forest-mark">TB</span>
          )}
          <button
            type="button"
            className="folio-nav-forest-collapse"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {!collapsed ? (
          <div className="folio-nav-forest-stats">
            <div className="folio-nav-forest-stat">
              <span className="folio-nav-forest-stat-num">{stats.studyMinutes}</span>
              <span className="folio-nav-forest-stat-label">min today</span>
              <div className="folio-nav-forest-bar">
                <span style={{ width: `${stats.studyPct}%` }} />
              </div>
            </div>
            <div className="folio-nav-forest-stat">
              <span className="folio-nav-forest-stat-num">{stats.creditsPct}</span>
              <span className="folio-nav-forest-stat-label">% credits</span>
              <div className="folio-nav-forest-bar folio-nav-forest-bar--gold">
                <span style={{ width: `${stats.creditsPct}%` }} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ul className="folio-nav-forest-list">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <li key={item.key}>
              <button
                type="button"
                className="folio-nav-forest-link"
                data-active={isActive}
                data-collapsed={collapsed}
                title={collapsed ? item.label : undefined}
                onClick={() => navigate(item.path)}
              >
                <span className="folio-nav-forest-link-icon-wrap">
                  <Icon className="folio-nav-forest-link-icon" strokeWidth={1.75} />
                </span>
                {!collapsed ? <span>{item.label}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="folio-nav-forest-footer">
        {!collapsed ? (
          <div className="folio-nav-variant-picker folio-nav-variant-picker--forest">
            <span className="folio-nav-variant-picker-label">Nav style</span>
            <div className="folio-nav-variant-picker-row">
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
          </div>
        ) : null}

        {!collapsed ? (
          <div className="folio-nav-forest-aux">
            <button type="button" onClick={() => navigate("/landing")}>
              Landing pages
            </button>
            <button
              type="button"
              data-active={active === "nodepack"}
              onClick={() => navigate("/nodepack")}
            >
              <Shapes className="h-3.5 w-3.5" />
              Node pack
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="folio-nav-forest-link"
            data-active={active === "nodepack"}
            data-collapsed
            title="Node pack"
            onClick={() => navigate("/nodepack")}
          >
            <span className="folio-nav-forest-link-icon-wrap">
              <Shapes className="folio-nav-forest-link-icon" strokeWidth={1.75} />
            </span>
          </button>
        )}

        <button
          type="button"
          className="folio-nav-forest-account"
          data-active={active === "account"}
          data-collapsed={collapsed}
          onClick={() => navigate("/account")}
          title={collapsed ? `${stats.firstName} · Account` : undefined}
        >
          <Avatar name={stats.displayName} className="h-9 w-9 shrink-0 text-[11px]" />
          {!collapsed ? (
            <span className="min-w-0 flex-1 text-left">
              <span className="folio-nav-forest-account-name">{stats.firstName}</span>
              <span className="folio-nav-forest-account-role">Account & settings</span>
            </span>
          ) : null}
        </button>
      </div>
    </nav>
  );
}
