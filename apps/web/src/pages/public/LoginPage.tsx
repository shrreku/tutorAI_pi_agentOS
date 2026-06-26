import { useState } from "react";
import { PublicLayout } from "./PublicLayout.js";
import { devLogin, isLocalhost, useSession } from "../../routing/RouteGuards.js";
import { recordPublicAnalyticsEvent } from "../../routing/api.js";

export function LoginPage({ navigate }: { navigate: (path: string) => void }) {
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const localhost = isLocalhost();

  const handleDevLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await devLogin(email.trim());
      await refresh();
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PublicLayout navigate={navigate}>
      <div className="tb-card">
        <h1>Sign in to TutorBook</h1>
        <p>Access study templates, your workspaces, and the tutor experience.</p>

        {localhost ? (
          <form
            className="tb-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleDevLogin();
            }}
          >
            <label>
              Dev email
              <input
                className="tb-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <button type="submit" className="tb-button tb-button-primary" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Continue (dev)"}
            </button>
          </form>
        ) : (
          <div className="tb-actions">
            <a
              className="tb-button tb-button-primary"
              href="/api/v1/auth/workos/login"
              onClick={() => recordPublicAnalyticsEvent("login_redirect", { provider: "workos" })}
            >
              Sign in with WorkOS
            </a>
          </div>
        )}

        {error && <pre className="tb-error">{error}</pre>}
      </div>
    </PublicLayout>
  );
}
