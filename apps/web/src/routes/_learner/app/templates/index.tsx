import { createFileRoute } from "@tanstack/react-router";
import { TemplatesPage } from "../../../../folio/pages/learner-misc.js";

export const Route = createFileRoute("/_learner/app/templates/")({
  component: TemplatesPage,
});
