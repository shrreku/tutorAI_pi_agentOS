import { createFileRoute } from "@tanstack/react-router";
import { parseDashboardActionTargetFromSearch } from "@studyagent/schemas";
import { WorkspacePage } from "../../../folio/pages/workspace.js";

export const Route = createFileRoute("/_learner/notebooks/$notebookId")({
  validateSearch: (search: Record<string, unknown>) => ({
    actionTarget: parseDashboardActionTargetFromSearch(
      search as Record<string, string | string[] | undefined>,
    ),
    rawSearch: search,
  }),
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const { notebookId } = Route.useParams();
  return <WorkspacePage notebookId={notebookId} />;
}
