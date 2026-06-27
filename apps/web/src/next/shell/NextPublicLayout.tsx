import type { ReactNode } from "react";
import { Button } from "@studyagent/ui";
import { useVisualTheme } from "./ThemeProvider.js";

export function NextPublicLayout({
  navigate,
  children,
}: {
  navigate: (path: string) => void;
  children: ReactNode;
}) {
  const theme = useVisualTheme();

  return (
    <div className={`public-layout public-layout--${theme} min-h-screen bg-background`}>
      <header className="public-header mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <button
          type="button"
          className="public-brand flex items-center gap-2"
          onClick={() => navigate("/")}
        >
          <span className="public-logo flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            TB
          </span>
          <span className="public-title font-display text-lg font-semibold">TutorBook</span>
        </button>
        <div className="public-actions flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/login")}>
            Sign in
          </Button>
          <Button type="button" size="sm" onClick={() => navigate("/demo")}>
            Demo
          </Button>
        </div>
      </header>
      <main className="public-main mx-auto max-w-lg px-6 pb-16">{children}</main>
    </div>
  );
}
