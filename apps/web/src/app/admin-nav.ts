import type { AdminPage } from "../routing/routes.js";

export function adminNavActive(pathname: string): AdminPage {
  if (pathname.startsWith("/admin/users/")) return "users";
  if (pathname === "/admin/users") return "users";
  if (pathname.startsWith("/admin/workspaces/")) return "workspaces";
  if (pathname === "/admin/workspaces") return "workspaces";
  if (pathname === "/admin/templates") return "templates";
  if (pathname === "/admin/access-codes") return "access-codes";
  if (pathname === "/admin/credits") return "credits";
  if (pathname === "/admin/feedback") return "feedback";
  if (pathname === "/admin/ingestion") return "ingestion";
  if (pathname === "/admin/analytics") return "analytics";
  if (pathname === "/admin/account-deletion") return "account-deletion";
  return "overview";
}
