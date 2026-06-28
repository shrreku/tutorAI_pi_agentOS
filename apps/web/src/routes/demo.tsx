import { createFileRoute } from "@tanstack/react-router";
import { PublicChrome } from "../components/chrome/public-chrome.js";

function StaticPublicPage({ title, body }: { title: string; body: string }) {
  return (
    <PublicChrome>
      <section>
        <h1>{title}</h1>
        <div className="folio-placeholder">{body}</div>
      </section>
    </PublicChrome>
  );
}

export const Route = createFileRoute("/demo")({
  component: () => (
    <StaticPublicPage title="Product demo" body="Copy-only demo — F01 public shell placeholder." />
  ),
});
