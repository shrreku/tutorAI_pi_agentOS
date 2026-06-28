import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_learner/app/consent")({
  component: ConsentPlaceholder,
});

function ConsentPlaceholder() {
  return (
    <section>
      <h1>Beta consent</h1>
      <div className="folio-placeholder">F02 wires versioned Beta Consent against the real API.</div>
    </section>
  );
}
