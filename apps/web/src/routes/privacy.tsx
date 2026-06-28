import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../app/navigation.js";
import { PrivacyPage } from "../pages/public/PrivacyPage.js";

export const Route = createFileRoute("/privacy")({
  component: PrivacyRoute,
});

function PrivacyRoute() {
  const navigate = useAppNavigate();
  return <PrivacyPage navigate={navigate} />;
}
