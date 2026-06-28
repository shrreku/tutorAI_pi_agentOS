import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceCreatePage } from "../../../../folio/pages/learner-misc.js";

export const Route = createFileRoute("/_learner/app/workspaces/new")({
  component: WorkspaceCreatePage,
});
