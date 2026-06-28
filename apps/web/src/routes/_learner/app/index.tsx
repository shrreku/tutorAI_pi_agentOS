import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_learner/app/")({
  component: LearnerHomePlaceholder,
});

function LearnerHomePlaceholder() {
  return (
    <section>
      <h1>Journal</h1>
      <p>Learner Home Gate (F16): dashboard content waits for Learner Dashboard Summary API.</p>
      <div className="folio-placeholder">F03 wires `/app/templates` with real API data.</div>
    </section>
  );
}
