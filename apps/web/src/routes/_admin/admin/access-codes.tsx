import { createFileRoute } from "@tanstack/react-router";
import { AdminAccessCodesPage } from "../../../pages/admin/AdminAccessCodesPage.js";

export const Route = createFileRoute("/_admin/admin/access-codes")({
  component: AdminAccessCodesPage,
});
