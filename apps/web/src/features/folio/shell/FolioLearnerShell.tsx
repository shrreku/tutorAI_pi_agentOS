import type { ReactNode } from "react";
import { useSession } from "../../../routing/RouteGuards.js";
import { Badge } from "../primitives.js";

type FolioNavKey = "dashboard" | "notebooks" | "credits" | "access-code" | "support" | "account";

const NAV_ITEMS: Array<{ key: FolioNavKey; label: string; path: string }> = [
  { key: "dashboard", label: "Dashboard", path: "/app" },
  { key: "notebooks", label: "Notebooks", path: "/notebooks" },
  { key: "credits", label: "Credits", path: "/app/credits" },
  { key: "access-code", label: "Access code", path: "/app/access-code" },
  { key: "support", label: "Support", path: "/app/support" },
  { key: "account", label: "Account", path: "/app/account" },
];

export function FolioLearnerShell({
  navigate,
  active,
  children,
}: {
  navigate: (path: string) => void;
  active: FolioNavKey;
  children: ReactNode;
}) {
  const { session } = useSession();
  const credits = session?.credits;
  const percent = credits?.percentRemaining;

  return (
    <div className="folio-shell" data-theme="folio">
      <div className="folio-learner-layout">
        <nav className="folio-nav-rail" aria-label="Learner navigation">
          <div className="folio-nav-brand">TutorBook</div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Folio
          </p>

          {percent != null ? (
            <div className="mt-5 rounded-[var(--radius)] border border-border bg-card px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Tutor credits</span>
                <Badge tone={credits?.exhausted ? "danger" : "accent"}>
                  {Math.round(percent)}%
                </Badge>
              </div>
            </div>
          ) : null}

          <ul className="folio-nav-list mt-6 space-y-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="folio-nav-link"
                  data-active={active === item.key}
                  onClick={() => navigate(item.path)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="folio-main">{children}</main>
      </div>
    </div>
  );
}
