import { createFileRoute } from "@tanstack/react-router";
import type { WorkspaceSearch } from "../../app/workspace-search.js";
import { useAppNavigate } from "../../app/navigation.js";
import { FolioNotebookWorkspacePage } from "../../features/folio/workspace/FolioNotebookWorkspacePage.js";

export const Route = createFileRoute("/notebooks/$notebookId")({
  validateSearch: (search): WorkspaceSearch => search as WorkspaceSearch,
  component: NotebookWorkspaceRoute,
});

function NotebookWorkspaceRoute() {
  const navigate = useAppNavigate();
  const { notebookId } = Route.useParams();
  return <FolioNotebookWorkspacePage notebookId={notebookId} navigate={navigate} />;
}
