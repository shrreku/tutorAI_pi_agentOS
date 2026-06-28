import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "../folio/pages/public-pages.js";

export const Route = createFileRoute("/contact")({ component: ContactPage });
