import type { ReferenceSurface } from "@studyagent/schemas";
import { resolveReferenceSurfaceActions } from "@studyagent/schemas";

export type ReferenceSurfaceActionId = ReferenceSurface["primaryActions"][number];

export type ReferenceSurfaceAction = {
  id: ReferenceSurfaceActionId;
  label: string;
  tone: "primary" | "secondary";
};

export function actionsForReferenceSurface(input: {
  surface: ReferenceSurface | null | undefined;
  canLaunchTutor: boolean;
  canShowEvidence: boolean;
  canRegenerate: boolean;
}): ReferenceSurfaceAction[] {
  const resolved = resolveReferenceSurfaceActions(input.surface, {
    canLaunchTutor: input.canLaunchTutor,
    canShowEvidence: input.canShowEvidence,
    canRegenerate: input.canRegenerate,
  });
  return resolved.filter((r) => r.enabled).map((r) => ({ id: r.id, label: r.label, tone: r.tone }));
}

export function buildTutorPromptForReferenceAction(
  surface: ReferenceSurface,
  actionId: ReferenceSurfaceActionId,
): string {
  if (actionId === "quiz") return `Give me source-grounded practice for "${surface.title}".`;
  if (actionId === "review")
    return `Review "${surface.title}" with me and focus on what I should understand next.`;
  return `Teach me "${surface.title}" using the selected reference.`;
}

export function referenceSurfaceSupportsRegeneration(
  surface: ReferenceSurface | null | undefined,
): boolean {
  if (!surface) return false;
  if (!surface.primaryActions.includes("regenerate")) return false;
  if (surface.surfaceType === "source") return false;
  if (surface.surfaceType === "fallback") return false;
  return true;
}
