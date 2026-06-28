import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_learner/app/templates/")({
  component: TemplatesPlaceholder,
});

function TemplatesPlaceholder() {
  return (
    <section>
      <h1>Study templates</h1>
      <div className="folio-placeholder">F03 — Published Study Template gallery.</div>
    </section>
  );
}
