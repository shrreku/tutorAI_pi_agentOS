import type { ReactNode } from "react";
import type { AdminPage } from "../../routing/routes.js";

const NAV_ITEMS: Array<{ key: AdminPage; label: string; path: string }> = [
  { key: "overview", label: "Overview", path: "/admin" },
  { key: "users", label: "Users", path: "/admin/users" },
  { key: "workspaces", label: "Workspaces", path: "/admin/workspaces" },
  { key: "templates", label: "Templates", path: "/admin/templates" },
  { key: "access-codes", label: "Access codes", path: "/admin/access-codes" },
  { key: "credits", label: "Credits", path: "/admin/credits" },
  { key: "feedback", label: "Feedback", path: "/admin/feedback" },
  { key: "account-deletion", label: "Account deletion", path: "/admin/account-deletion" },
  { key: "ingestion", label: "Ingestion", path: "/admin/ingestion" },
  { key: "analytics", label: "Analytics", path: "/admin/analytics" },
];

export function AdminShell({
  navigate,
  active,
  children,
}: {
  navigate: (path: string) => void;
  active: AdminPage;
  children: ReactNode;
}) {
  return (
    <div className="tb-admin-shell">
      <nav className="tb-admin-nav" aria-label="Admin">
        <h2>Admin console</h2>
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
      <main className="tb-admin-main">{children}</main>
    </div>
  );
}
