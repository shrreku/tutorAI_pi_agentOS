import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../../../app/navigation.js";
import { AdminUserDetailPage } from "../../../../pages/admin/AdminUserDetailPage.js";

export const Route = createFileRoute("/_admin/admin/users/$userId")({
  component: AdminUserDetailRoute,
});

function AdminUserDetailRoute() {
  const navigate = useAppNavigate();
  const { userId } = Route.useParams();
  return <AdminUserDetailPage userId={userId} navigate={navigate} />;
}
