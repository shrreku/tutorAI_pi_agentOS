import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../app/navigation.js";
import { TermsPage } from "../pages/public/TermsPage.js";

export const Route = createFileRoute("/terms")({
  component: TermsRoute,
});

function TermsRoute() {
  const navigate = useAppNavigate();
  return <TermsPage navigate={navigate} />;
}
