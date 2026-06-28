import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function PublicChrome({ children }: { children: ReactNode }) {
  return (
    <div>
      <header className="folio-shell-header">
        <Link to="/">TutorBook</Link>
        <nav>
          <Link to="/demo">Demo</Link> · <Link to="/login">Sign in</Link>
        </nav>
      </header>
      <main className="folio-shell-main">{children}</main>
    </div>
  );
}
