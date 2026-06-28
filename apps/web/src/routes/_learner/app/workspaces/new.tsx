import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_learner/app/workspaces/new")({
  component: WorkspaceCreatePlaceholder,
});

function WorkspaceCreatePlaceholder() {
  return (
    <section>
      <h1>Create workspace</h1>
      <div className="folio-placeholder">F03 — workspace creation API.</div>
    </section>
  );
}
