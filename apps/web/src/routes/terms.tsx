import { createFileRoute } from "@tanstack/react-router";
import { PublicChrome } from "../components/chrome/public-chrome.js";

export const Route = createFileRoute("/terms")({
  component: () => (
    <PublicChrome>
      <section>
        <h1>Terms</h1>
        <div className="folio-placeholder">Terms of use — F01 placeholder.</div>
      </section>
    </PublicChrome>
  ),
});
