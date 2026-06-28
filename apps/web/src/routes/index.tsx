import { createFileRoute } from "@tanstack/react-router";
import { FolioLandingRoute } from "../folio/landing-route.js";

export const Route = createFileRoute("/")({
  component: () => <FolioLandingRoute variant="journal" />,
});
