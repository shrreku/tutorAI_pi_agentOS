import { createFileRoute } from "@tanstack/react-router";
import { PublicChrome } from "../components/chrome/public-chrome.js";

export const Route = createFileRoute("/contact")({
  component: () => (
    <PublicChrome>
      <section>
        <h1>Contact</h1>
        <div className="folio-placeholder">Contact page — F01 placeholder.</div>
      </section>
    </PublicChrome>
  ),
});
