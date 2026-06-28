import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../../app/navigation.js";
import { AdminUsersPage } from "../../../pages/admin/AdminUsersPage.js";

export const Route = createFileRoute("/_admin/admin/users")({
  component: AdminUsersRoute,
});

function AdminUsersRoute() {
  const navigate = useAppNavigate();
  return <AdminUsersPage navigate={navigate} />;
}
