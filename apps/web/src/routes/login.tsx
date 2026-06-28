import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, GraduationCap } from "lucide-react";
import { sessionQueryKey } from "@studyagent/api-client";
import { apiClient } from "../platform/api-client.js";
import { Button } from "../folio/ui/primitives.js";

export const Route = createFileRoute("/login")({ component: LoginPage });

function isLocalhost(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ssoLogin = () => {
    window.location.href = "/api/v1/auth/workos/login";
  };

  const devLogin = async () => {
    if (!email.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiClient.request("/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error(`Sign in failed (${res.status})`);
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey() });
      void navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="folio-landing-root">
      <div className="folio-landing-backdrop" aria-hidden>
        <span className="folio-orb folio-orb--1" />
        <span className="folio-orb folio-orb--2" />
        <span className="folio-paper-grain" />
      </div>
      <div className="relative z-10 grid min-h-dvh place-items-center px-6 py-12">
        <div className="w-full max-w-md rounded-[calc(var(--radius)+6px)] border border-border bg-elevated p-8 shadow-pop">
          <Link to="/" className="folio-landing-logo">
            <span className="folio-landing-logo-mark">
              <GraduationCap className="h-4 w-4" />
            </span>
            <span className="folio-landing-logo-text">
              TutorBook
              <span className="folio-landing-logo-sub">Folio</span>
            </span>
          </Link>

          <h1 className="mt-6 font-display text-[28px] font-semibold leading-tight">Welcome back.</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Sign in to your notebooks, study map, and the tutor that read your material.
          </p>

          <Button className="mt-6 w-full" size="lg" onClick={ssoLogin}>
            Continue with TutorBook <ArrowRight className="h-4 w-4" />
          </Button>

          {isLocalhost() ? (
            <div className="mt-6 border-t border-border pt-5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Dev login
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void devLogin()}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-[14px] outline-none focus:border-accent"
                />
                <Button variant="outline" onClick={() => void devLogin()} disabled={pending || !email.trim()}>
                  {pending ? "…" : "Go"}
                </Button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-[var(--radius)] bg-destructive/12 px-3 py-2 text-[13px] text-destructive">
              {error}
            </p>
          ) : null}

          <p className="mt-6 text-[12px] text-muted-foreground">
            By continuing you agree to our{" "}
            <Link to="/terms" className="text-accent hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-accent hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
