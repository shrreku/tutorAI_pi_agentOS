import { createFileRoute } from "@tanstack/react-router";
import { parseDashboardActionTargetFromSearch } from "@studyagent/schemas";

export const Route = createFileRoute("/_learner/notebooks/$notebookId")({
  validateSearch: (search: Record<string, unknown>) => ({
    actionTarget: parseDashboardActionTargetFromSearch(
      search as Record<string, string | string[] | undefined>,
    ),
    rawSearch: search,
  }),
  component: WorkspacePlaceholder,
});

function WorkspacePlaceholder() {
  const { notebookId } = Route.useParams();
  const { actionTarget } = Route.useSearch();

  return (
    <section>
      <h1>Notebook workspace</h1>
      <p>
        <code>{notebookId}</code>
      </p>
      <div className="folio-placeholder">
        <p>F07 — Folio Workspace Shell with 35/65 split and Workspace URL Codec.</p>
        {actionTarget ? (
          <pre>{JSON.stringify(actionTarget, null, 2)}</pre>
        ) : (
          <p>No validated action target in search params.</p>
        )}
      </div>
    </section>
  );
}
