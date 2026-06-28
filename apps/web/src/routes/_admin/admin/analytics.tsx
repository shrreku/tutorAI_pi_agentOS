import { createFileRoute } from "@tanstack/react-router";
import { AdminAnalyticsPage } from "../../../pages/admin/AdminAnalyticsPage.js";

export const Route = createFileRoute("/_admin/admin/analytics")({
  component: AdminAnalyticsPage,
});
