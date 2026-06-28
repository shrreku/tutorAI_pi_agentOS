import type { CSSProperties } from "react";
import { PanelLeft, PanelLeftClose, Shapes } from "lucide-react";
import { cn } from "../lib/utils.js";
import { Avatar, Meter } from "./primitives.js";
import {
  NAV_VARIANTS,
  PRIMARY_NAV,
  useFolioNavStats,
  type FolioNavKey,
  type FolioNavVariant,
} from "./folio-shell-nav-shared.js";

export function FolioNavEditorial({
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
      className={cn("folio-nav-editorial", collapsed && "folio-nav-editorial--collapsed")}
      aria-label="Learner navigation"
      data-nav-variant="editorial"
    >
      <div className="folio-nav-editorial-masthead">
        <div className="folio-nav-editorial-rule" aria-hidden />
        {!collapsed ? (
          <p className="folio-nav-editorial-kicker">The study journal</p>
        ) : (
          <span className="folio-nav-editorial-mark">TB</span>
        )}
        <div className="folio-nav-editorial-rule" aria-hidden />
        <button
          type="button"
          className="folio-nav-editorial-collapse"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed ? (
        <div className="folio-nav-editorial-brand">
          <h1 className="folio-nav-editorial-title">TutorBook</h1>
          <p className="folio-nav-editorial-deck">Your folio for focused study</p>
        </div>
      ) : null}

      {!collapsed ? (
        <div className="folio-nav-editorial-ledger">
          <div className="folio-nav-editorial-ledger-row">
            <div>
              <span className="folio-nav-editorial-ledger-label">Today</span>
              <span className="folio-nav-editorial-ledger-value">
                {stats.studyMinutes}
                <span className="folio-nav-editorial-ledger-unit">min</span>
              </span>
            </div>
            <div className="folio-nav-editorial-ring" style={{ "--pct": stats.studyPct } as CSSProperties}>
              <span>{stats.studyPct}%</span>
            </div>
          </div>
          <div className="folio-nav-editorial-ledger-divider" />
          <div className="folio-nav-editorial-ledger-row">
            <div>
              <span className="folio-nav-editorial-ledger-label">Tutor credits</span>
              <span className="folio-nav-editorial-ledger-value">
                {stats.creditsPct}
                <span className="folio-nav-editorial-ledger-unit">%</span>
              </span>
            </div>
            <Meter className="w-20" value={stats.creditsPct} tone="accent" thickness="sm" />
          </div>
          <p className="folio-nav-editorial-ledger-meta">
            {stats.minutesLeft > 0
              ? `${stats.minutesLeft} minutes to daily goal`
              : "Daily goal reached — well done"}
          </p>
        </div>
      ) : null}

      <ul className="folio-nav-editorial-list">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <li key={item.key}>
              <button
                type="button"
                className="folio-nav-editorial-link"
                data-active={isActive}
                data-collapsed={collapsed}
                title={collapsed ? item.label : undefined}
                onClick={() => navigate(item.path)}
              >
                {!collapsed && item.numeral ? (
                  <span className="folio-nav-editorial-numeral">{item.numeral}</span>
                ) : null}
                <Icon className="folio-nav-editorial-icon" strokeWidth={1.75} />
                {!collapsed ? <span className="folio-nav-editorial-link-label">{item.label}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="folio-nav-editorial-footer">
        {!collapsed ? (
          <div className="folio-nav-variant-picker">
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
          <div className="folio-nav-editorial-secondary">
            <button type="button" className="folio-nav-editorial-aux" onClick={() => navigate("/landing")}>
              Landing pages
            </button>
            <button
              type="button"
              className="folio-nav-editorial-aux"
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
            className="folio-nav-editorial-link"
            data-active={active === "nodepack"}
            data-collapsed
            title="Node pack"
            onClick={() => navigate("/nodepack")}
          >
            <Shapes className="folio-nav-editorial-icon" strokeWidth={1.75} />
          </button>
        )}

        <button
          type="button"
          className="folio-nav-editorial-account"
          data-active={active === "account"}
          data-collapsed={collapsed}
          onClick={() => navigate("/account")}
          title={collapsed ? `${stats.firstName} · Account` : undefined}
        >
          <Avatar name={stats.displayName} className="h-9 w-9 shrink-0 text-[11px]" />
          {!collapsed ? (
            <span className="min-w-0 flex-1 text-left">
              <span className="folio-nav-editorial-account-name">{stats.firstName}</span>
              <span className="folio-nav-editorial-account-role">Account & settings</span>
            </span>
          ) : null}
        </button>
      </div>
    </nav>
  );
}
