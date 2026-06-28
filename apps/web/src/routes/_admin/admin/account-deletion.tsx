import { createFileRoute } from "@tanstack/react-router";
import { AdminAccountDeletionPage } from "../../../pages/admin/AdminAccountDeletionPage.js";

export const Route = createFileRoute("/_admin/admin/account-deletion")({
  component: AdminAccountDeletionPage,
});
