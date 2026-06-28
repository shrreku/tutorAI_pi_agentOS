import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

const PRIMARY_NAV = [
  { label: "Journal", to: "/app" as const },
  { label: "Notebooks", to: "/app/notebooks" as const },
] as const;

export function LearnerShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="folio-shell-layout">
      <aside className="folio-shell-aside" aria-label="Learner navigation">
        <p>
          <Link to="/app">
            <strong>TutorBook</strong>
          </Link>
        </p>
        <nav className="folio-shell-nav">
          {PRIMARY_NAV.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
              {item.to === "/app"
                ? pathname === "/app"
                  ? " (active)"
                  : ""
                : pathname === item.to || pathname.startsWith(`${item.to}/`)
                  ? " (active)"
                  : ""}
            </Link>
          ))}
        </nav>
        <nav className="folio-shell-nav" style={{ marginTop: "1.5rem" }}>
          <Link to="/app/account/$tab" params={{ tab: "overview" }}>
            Account{pathname.startsWith("/app/account") ? " (active)" : ""}
          </Link>
        </nav>
      </aside>
      <main className="folio-shell-main">{children}</main>
    </div>
  );
}
