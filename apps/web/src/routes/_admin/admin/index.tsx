import { createFileRoute } from "@tanstack/react-router";
import { AdminOverviewPage } from "../../../pages/admin/AdminOverviewPage.js";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminOverviewPage,
});
