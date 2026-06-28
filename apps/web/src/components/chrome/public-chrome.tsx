import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "../../folio/ui/primitives.js";

export function PublicChrome({ children }: { children: ReactNode }) {
  return (
    <div className="folio-landing-root">
      <header className="folio-landing-nav">
        <div className="folio-landing-nav-inner">
          <Link to="/" className="folio-landing-logo">
            <span className="folio-landing-logo-mark">TB</span>
            <span className="folio-landing-logo-text">
              TutorBook
              <span className="folio-landing-logo-sub">Folio</span>
            </span>
          </Link>
          <nav className="folio-landing-nav-links" aria-label="Public">
            <Link to="/demo" className="folio-landing-nav-link">
              Demo
            </Link>
            <Link to="/landing/$variant" params={{ variant: "tutor" }} className="folio-landing-nav-link">
              Tutor
            </Link>
            <Link to="/landing/$variant" params={{ variant: "library" }} className="folio-landing-nav-link">
              Library
            </Link>
          </nav>
          <div className="folio-landing-nav-actions">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="accent" size="sm">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>
      <div className="folio-landing-body">{children}</div>
    </div>
  );
}
