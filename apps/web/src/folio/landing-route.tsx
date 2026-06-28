import { useNavigate } from "@tanstack/react-router";
import { FolioLandingPage, type FolioLandingVariant } from "./directions/folio-landings.js";

/**
 * Adapts the design-lab `navigate(path)` contract to the production TanStack
 * router. Landing CTAs point into the real app ("/app") or between landing
 * variants ("/landing/:variant").
 */
export function useFolioLandingNavigate() {
  const navigate = useNavigate();
  return (path: string) => {
    if (path.startsWith("/landing/")) {
      const variant = path.split("/")[2] ?? "journal";
      void navigate({ to: "/landing/$variant", params: { variant } });
      return;
    }
    if (path === "/landing") {
      void navigate({ to: "/" });
      return;
    }
    if (path === "/dashboard" || path === "/app" || path.startsWith("/notebooks")) {
      void navigate({ to: "/app" });
      return;
    }
    void navigate({ to: "/" });
  };
}

export function FolioLandingRoute({ variant }: { variant: FolioLandingVariant }) {
  const navigate = useFolioLandingNavigate();
  return <FolioLandingPage variant={variant} navigate={navigate} />;
}

export function normalizeLandingVariant(value: string): FolioLandingVariant {
  return value === "journal" || value === "tutor" || value === "library" || value === "index"
    ? value
    : "index";
}
