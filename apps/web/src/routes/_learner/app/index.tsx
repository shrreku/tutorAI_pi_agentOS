import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../../../folio/pages/dashboard.js";

export const Route = createFileRoute("/_learner/app/")({
  component: DashboardPage,
});
