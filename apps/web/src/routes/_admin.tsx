import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { adminNavActive } from "../app/admin-nav.js";
import { useAppNavigate } from "../app/navigation.js";
import { AdminShell } from "../pages/admin/AdminShell.js";

export const Route = createFileRoute("/_admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useAppNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <AdminShell navigate={navigate} active={adminNavActive(pathname)}>
      <Outlet />
    </AdminShell>
  );
}
