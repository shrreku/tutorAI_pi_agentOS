import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../app/navigation.js";
import { DemoPage } from "../pages/public/DemoPage.js";

export const Route = createFileRoute("/demo")({
  component: DemoRoute,
});

function DemoRoute() {
  const navigate = useAppNavigate();
  return <DemoPage navigate={navigate} />;
}
