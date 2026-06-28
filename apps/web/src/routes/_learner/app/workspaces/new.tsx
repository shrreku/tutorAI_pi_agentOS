import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../../../app/navigation.js";
import { WorkspaceCreatePage } from "../../../../pages/app/WorkspaceCreatePage.js";

export const Route = createFileRoute("/_learner/app/workspaces/new")({
  component: WorkspaceCreateRoute,
});

function WorkspaceCreateRoute() {
  const navigate = useAppNavigate();
  return <WorkspaceCreatePage navigate={navigate} />;
}
