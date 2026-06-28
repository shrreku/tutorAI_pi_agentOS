import { createFileRoute } from "@tanstack/react-router";
import { SupportPage } from "../../../pages/app/SupportPage.js";

export const Route = createFileRoute("/_learner/app/support")({
  component: SupportPage,
});
