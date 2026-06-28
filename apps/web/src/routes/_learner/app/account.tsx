import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "../../../pages/app/AccountPage.js";

export const Route = createFileRoute("/_learner/app/account")({
  component: AccountPage,
});
