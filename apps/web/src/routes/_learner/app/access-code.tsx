import { createFileRoute } from "@tanstack/react-router";
import { AccessCodePage } from "../../../pages/app/AccessCodePage.js";

export const Route = createFileRoute("/_learner/app/access-code")({
  component: AccessCodePage,
});
