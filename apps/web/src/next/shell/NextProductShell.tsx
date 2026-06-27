import type { ReactNode } from "react";
import { useSession } from "../../routing/RouteGuards.js";
import { useVisualTheme } from "./ThemeProvider.js";

export type ProductNavKey =
  | "dashboard"
  | "notebooks"
  | "credits"
  | "access-code"
  | "support"
  | "account";

const NAV: Array<{ key: ProductNavKey; label: string; path: string }> = [
  { key: "dashboard", label: "Dashboard", path: "/app" },
  { key: "notebooks", label: "Notebooks", path: "/notebooks" },
  { key: "credits", label: "Credits", path: "/app/credits" },
  { key: "access-code", label: "Access code", path: "/app/access-code" },
  { key: "support", label: "Support", path: "/app/support" },
  { key: "account", label: "Account", path: "/app/account" },
];

export function NextProductShell({
  navigate,
  active,
  children,
}: {
  navigate: (path: string) => void;
  active: ProductNavKey;
  children: ReactNode;
}) {
  const { session } = useSession();
  const theme = useVisualTheme();
  const percent = session?.credits?.percentRemaining;

  return (
    <div className={`app product-shell product-shell--${theme}`}>
      <div className="topbar product-topbar">
        <button type="button" className="brand" onClick={() => navigate("/app")}>
          <div className="logo">TB</div>
          <div className="title">TutorBook</div>
          <span className="badge purple">Beta</span>
        </button>
        <div className="spacer" />
        <nav style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="App">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn${active === item.key ? " primary" : ""}`}
              style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {percent != null ? <span className="credits">{percent}% credits</span> : null}
      </div>
      <main className="product-main">{children}</main>
    </div>
  );
}
