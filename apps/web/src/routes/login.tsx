import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicChrome } from "../components/chrome/public-chrome.js";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  return (
    <PublicChrome>
      <section>
        <h1>Sign in</h1>
        <p>Dev login wires in F02.</p>
        <div className="folio-placeholder">
          <button type="button" disabled>
            Continue (dev login — F02)
          </button>
        </div>
        <p>
          <Link to="/">Back to home</Link>
        </p>
      </section>
    </PublicChrome>
  );
}
