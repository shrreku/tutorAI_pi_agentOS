import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../../app/navigation.js";
import { AdminWorkspacesPage } from "../../../pages/admin/AdminWorkspacesPage.js";

export const Route = createFileRoute("/_admin/admin/workspaces")({
  component: AdminWorkspacesRoute,
});

function AdminWorkspacesRoute() {
  const navigate = useAppNavigate();
  return <AdminWorkspacesPage navigate={navigate} />;
}
