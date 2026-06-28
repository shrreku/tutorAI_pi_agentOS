import { createFileRoute } from "@tanstack/react-router";
import { AdminTemplatesPage } from "../../../pages/admin/AdminTemplatesPage.js";

export const Route = createFileRoute("/_admin/admin/templates")({
  component: AdminTemplatesPage,
});
