import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../../app/navigation.js";
import { ConsentPage } from "../../../pages/app/ConsentPage.js";

export const Route = createFileRoute("/_learner/app/consent")({
  component: ConsentRoute,
});

function ConsentRoute() {
  const navigate = useAppNavigate();
  return <ConsentPage navigate={navigate} />;
}
