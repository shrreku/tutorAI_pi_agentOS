import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "../folio/pages/public-pages.js";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });
