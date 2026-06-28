import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../app/navigation.js";
import { LandingPage } from "../pages/public/LandingPage.js";

export const Route = createFileRoute("/")({
  component: LandingRoute,
});

function LandingRoute() {
  const navigate = useAppNavigate();
  return <LandingPage navigate={navigate} />;
}
