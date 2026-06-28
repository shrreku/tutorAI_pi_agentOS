import { createFileRoute } from "@tanstack/react-router";
import { AdminIngestionPage } from "../../../pages/admin/AdminIngestionPage.js";

export const Route = createFileRoute("/_admin/admin/ingestion")({
  component: AdminIngestionPage,
});
