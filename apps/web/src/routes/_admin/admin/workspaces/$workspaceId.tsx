import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../../../app/navigation.js";
import { AdminWorkspaceDetailPage } from "../../../../pages/admin/AdminWorkspaceDetailPage.js";

export const Route = createFileRoute("/_admin/admin/workspaces/$workspaceId")({
  component: AdminWorkspaceDetailRoute,
});

function AdminWorkspaceDetailRoute() {
  const navigate = useAppNavigate();
  const { workspaceId } = Route.useParams();
  return <AdminWorkspaceDetailPage workspaceId={workspaceId} navigate={navigate} />;
}
