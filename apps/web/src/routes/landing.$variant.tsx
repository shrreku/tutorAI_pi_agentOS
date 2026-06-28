import { createFileRoute, useParams } from "@tanstack/react-router";
import { FolioLandingRoute, normalizeLandingVariant } from "../folio/landing-route.js";

export const Route = createFileRoute("/landing/$variant")({
  component: LandingVariantRoute,
});

function LandingVariantRoute() {
  const { variant } = useParams({ from: "/landing/$variant" });
  return <FolioLandingRoute variant={normalizeLandingVariant(variant)} />;
}
