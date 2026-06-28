import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../../app/navigation.js";
import { FolioDashboardPage } from "../../../features/folio/dashboard/FolioDashboardPage.js";

export const Route = createFileRoute("/_learner/app/")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const navigate = useAppNavigate();
  return <FolioDashboardPage navigate={navigate} />;
}
