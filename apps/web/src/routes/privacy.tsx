import { createFileRoute } from "@tanstack/react-router";
import { PublicChrome } from "../components/chrome/public-chrome.js";

export const Route = createFileRoute("/privacy")({
  component: () => (
    <PublicChrome>
      <section>
        <h1>Privacy</h1>
        <div className="folio-placeholder">Privacy policy — F01 placeholder.</div>
      </section>
    </PublicChrome>
  ),
});
