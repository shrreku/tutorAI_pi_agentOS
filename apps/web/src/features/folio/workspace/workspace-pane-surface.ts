import type { DashboardSurface } from "@studyagent/schemas";

/** Tutor always occupies the left split; the right pane shows workspace surfaces. */
export function workspacePaneSurface(surface: DashboardSurface): DashboardSurface {
  return surface === "tutor" ? "study_map" : surface;
}

export function surfaceAfterNodeSelect(activeSurface: DashboardSurface): DashboardSurface {
  if (activeSurface === "study_map" || activeSurface === "tutor") {
    return "reading";
  }
  return activeSurface;
}
