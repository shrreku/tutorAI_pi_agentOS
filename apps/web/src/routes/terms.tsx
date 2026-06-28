import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "../folio/pages/public-pages.js";

export const Route = createFileRoute("/terms")({ component: TermsPage });
