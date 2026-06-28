import { createFileRoute } from "@tanstack/react-router";
import { PublicLandingRoute } from "./-public-page.js";

export const Route = createFileRoute("/")({
  component: PublicLandingRoute,
});
