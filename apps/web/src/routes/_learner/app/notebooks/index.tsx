import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_learner/app/notebooks/")({
  component: NotebooksListPlaceholder,
});

function NotebooksListPlaceholder() {
  return (
    <section>
      <h1>Notebooks</h1>
      <div className="folio-placeholder">
        F03+ lists Personal Learner Workspaces. Study opens at `/notebooks/:notebookId`.
      </div>
    </section>
  );
}
