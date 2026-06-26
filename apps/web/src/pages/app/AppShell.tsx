import type { ReactNode } from "react";
import { useSession } from "../../routing/RouteGuards.js";

type AppNavKey = "dashboard" | "notebooks" | "credits" | "access-code" | "support" | "account";

const NAV_ITEMS: Array<{ key: AppNavKey; label: string; path: string }> = [
  { key: "dashboard", label: "Dashboard", path: "/app" },
  { key: "notebooks", label: "Notebooks", path: "/notebooks" },
  { key: "credits", label: "Credits", path: "/app/credits" },
  { key: "access-code", label: "Access code", path: "/app/access-code" },
  { key: "support", label: "Support", path: "/app/support" },
  { key: "account", label: "Account", path: "/app/account" },
];

export function AppShell({
  navigate,
  active,
  children,
}: {
  navigate: (path: string) => void;
  active: AppNavKey;
  children: ReactNode;
}) {
  const { session } = useSession();
  const credits = session?.credits;
  const percent = credits?.percentRemaining;

  return (
    <div className="tutorbook-shell tb-app-shell">
      <nav className="tb-app-nav" aria-label="App">
        <h2>TutorBook</h2>
        {percent != null && (
          <div className="tb-nav-credits" data-exhausted={credits?.exhausted ?? false}>
            <span className="tb-nav-credits-label">Tutor credits</span>
            <span className="tb-nav-credits-value">{percent}%</span>
            <div className="tb-nav-credits-bar">
              <div className="tb-nav-credits-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
            </div>
          </div>
        )}
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                data-active={active === item.key}
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="tb-app-main">{children}</main>
    </div>
  );
}
