import { createFileRoute } from "@tanstack/react-router";
import { AdminCreditsPage } from "../../../pages/admin/AdminCreditsPage.js";

export const Route = createFileRoute("/_admin/admin/credits")({
  component: AdminCreditsPage,
});
