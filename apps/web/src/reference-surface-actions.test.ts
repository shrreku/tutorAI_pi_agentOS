import { describe, expect, it } from "vitest";
import type { ReferenceSurface } from "@studyagent/schemas";
import { actionsForReferenceSurface, buildTutorPromptForReferenceAction, referenceSurfaceSupportsRegeneration } from "./reference-surface-actions.js";

const surface: ReferenceSurface = {
  id: "surface_1",
  notebookId: "nb_1",
  nodeRef: { refType: "artifact", refId: "artifact_1" },
  title: "Quiz",
  surfaceType: "artifact",
  summary: null,
  status: "ready",
  blocks: [],
  scopeRefs: [],
  sourceRefs: [],
  provenanceRefs: [],
  coverageRefs: [],
  primaryActions: ["quiz", "ask_tutor", "open_provenance"],
  quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
};

describe("actionsForReferenceSurface", () => {
  it("renders server-authored primaryActions in order", () => {
    expect(actionsForReferenceSurface({ surface, canLaunchTutor: true, canShowEvidence: true, canRegenerate: false })).toEqual([
      { id: "quiz", label: "Practice", tone: "secondary" },
      { id: "ask_tutor", label: "Teach me", tone: "primary" },
      { id: "open_provenance", label: "Evidence", tone: "secondary" },
    ]);
  });

  it("does not invent regenerate when the server did not author it", () => {
    expect(actionsForReferenceSurface({ surface, canLaunchTutor: true, canShowEvidence: true, canRegenerate: true }).map((action) => action.id)).toEqual([
      "quiz",
      "ask_tutor",
      "open_provenance",
    ]);
  });

  it("hides regenerate when regeneration is unavailable even if authored", () => {
    expect(actionsForReferenceSurface({
      surface: { ...surface, primaryActions: ["ask_tutor", "regenerate", "open_provenance"] },
      canLaunchTutor: true,
      canShowEvidence: true,
      canRegenerate: false,
    }).map((action) => action.id)).toEqual(["ask_tutor", "open_provenance"]);
  });

  it("renders regenerate when primaryActions includes it and regeneration is supported", () => {
    expect(actionsForReferenceSurface({
      surface: { ...surface, primaryActions: ["ask_tutor", "regenerate", "open_provenance"] },
      canLaunchTutor: true,
      canShowEvidence: true,
      canRegenerate: true,
    }).map((action) => action.id)).toEqual(["ask_tutor", "regenerate", "open_provenance"]);
  });

  it("builds learner action prompts from the reference surface title", () => {
    expect(buildTutorPromptForReferenceAction(surface, "quiz")).toContain("source-grounded practice");
  });

  it("supports open_evidence as the learner-facing evidence action", () => {
    expect(actionsForReferenceSurface({
      surface: { ...surface, primaryActions: ["ask_tutor", "open_evidence"] },
      canLaunchTutor: true,
      canShowEvidence: true,
      canRegenerate: false,
    }).map((action) => action.id)).toEqual(["ask_tutor", "open_evidence"]);
  });

  it("requires regenerate in primaryActions before supporting regeneration", () => {
    expect(referenceSurfaceSupportsRegeneration({ ...surface, primaryActions: ["ask_tutor", "quiz"] })).toBe(false);
    expect(referenceSurfaceSupportsRegeneration({ ...surface, primaryActions: ["ask_tutor", "quiz", "regenerate"] })).toBe(true);
  });
});
