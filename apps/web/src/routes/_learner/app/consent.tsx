import { createFileRoute } from "@tanstack/react-router";
import { ConsentPage } from "../../../folio/pages/learner-misc.js";

export const Route = createFileRoute("/_learner/app/consent")({
  component: ConsentPage,
});
