import { createFileRoute } from "@tanstack/react-router";
import { CreditsPage } from "../../../pages/app/CreditsPage.js";

export const Route = createFileRoute("/_learner/app/credits")({
  component: CreditsPage,
});
