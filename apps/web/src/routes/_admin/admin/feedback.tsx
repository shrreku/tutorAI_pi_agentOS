import { createFileRoute } from "@tanstack/react-router";
import { AdminFeedbackPage } from "../../../pages/admin/AdminFeedbackPage.js";

export const Route = createFileRoute("/_admin/admin/feedback")({
  component: AdminFeedbackPage,
});
