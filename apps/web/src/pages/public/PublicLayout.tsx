import type { ReactNode } from "react";

type NavigateFn = (path: string) => void;

export function PublicLayout({
  navigate,
  children,
}: {
  navigate: NavigateFn;
  children: ReactNode;
}) {
  return (
    <div className="tutorbook-shell">
      <div className="tb-page">
        <header className="tb-public-header">
          <button type="button" className="tb-brand" onClick={() => navigate("/")}>
            TutorBook
          </button>
          <nav className="tb-public-nav" aria-label="Public">
            <button type="button" onClick={() => navigate("/demo")}>
              Demo
            </button>
            <button type="button" onClick={() => navigate("/contact")}>
              Contact
            </button>
            <button type="button" onClick={() => navigate("/login")}>
              Sign in
            </button>
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
