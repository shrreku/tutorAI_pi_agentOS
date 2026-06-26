import { describe, expect, it } from "vitest";
import { buildStudyAgentHostStateSignature } from "@studyagent/agent-runtime";
import {
  buildTraitRecommendationOnlySnapshot,
  buildEvalEvidenceSnapshot,
  type ReferenceSurface,
} from "@studyagent/schemas";
import { evaluateSyntheticLearnerAssertions as _evaluateSyntheticLearnerAssertions } from "@studyagent/eval-runner";

const evaluateSyntheticLearnerAssertions = _evaluateSyntheticLearnerAssertions;
import { decideObjectiveCompletion } from "./objective-progression.js";

function referenceSurfaceSupportsRegeneration(
  surface: ReferenceSurface | null | undefined,
): boolean {
  if (!surface) return false;
  if (!surface.primaryActions.includes("regenerate")) return false;
  if (surface.surfaceType === "source") return false;
  if (surface.surfaceType === "fallback") return false;
  return true;
}

describe("architecture remediation cross-track gate", () => {
  it("proves runtime host-state signatures ignore non-binding pedagogical context changes", () => {
    const base = {
      notebookId: "nb_gate",
      userId: "user_gate",
      sessionId: "sess_gate",
      notebookTitle: "Gate Notebook",
      activeMode: "learn" as const,
      selectedNodeRefs: [{ refType: "concept" as const, refId: "cnc_1" }],
      currentObjective: "Objective 1",
      completedObjectivesCount: 0,
      nextObjectives: ["Objective 2"],
      additionalInstructions: [],
    };
    const first = buildStudyAgentHostStateSignature(base);
    const second = buildStudyAgentHostStateSignature({
      ...base,
      currentObjective: "Objective 2",
    });
    expect(first).toEqual(second);
  });

  it("proves mastery-backed objective completion requires strong evidence", () => {
    expect(
      decideObjectiveCompletion({
        objectiveTitle: "Objective 1",
        targetConceptIds: ["cnc_1"],
        conceptMasteryById: { cnc_1: 0.8 },
      }).shouldComplete,
    ).toBe(true);
    expect(
      decideObjectiveCompletion({
        objectiveTitle: "Objective 1",
        targetConceptIds: ["cnc_1"],
        conceptMasteryById: { cnc_1: 0.4 },
      }).shouldComplete,
    ).toBe(false);
  });

  it("proves reference surface regeneration honors server primaryActions", () => {
    const baseSurface: ReferenceSurface = {
      id: "surface_gate",
      notebookId: "nb_gate",
      nodeRef: { refType: "artifact", refId: "artifact_1" },
      title: "Quiz",
      surfaceType: "artifact",
      summary: null,
      status: "ready",
      blocks: [],
      interactiveBlocks: [],
      scopeRefs: [],
      sourceRefs: [],
      provenanceRefs: [],
      coverageRefs: [],
      primaryActions: ["ask_tutor", "quiz"],
      quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
    };
    expect(referenceSurfaceSupportsRegeneration(baseSurface)).toBe(false);
    expect(
      referenceSurfaceSupportsRegeneration({
        ...baseSurface,
        primaryActions: ["ask_tutor", "regenerate"],
      }),
    ).toBe(true);
  });

  it("proves trait recommendation-only assertions fail forbidden product deltas", () => {
    const before = buildEvalEvidenceSnapshot({
      id: "snap_before",
      notebookId: "nb_gate",
      capturedAt: "2026-05-29T00:00:00.000Z",
      masteryEvidence: [
        { ref: { refType: "turn", refId: "turn_1" }, overallScore: 0.5, confidence: 0.6 },
      ],
    });
    const after = buildEvalEvidenceSnapshot({
      id: "snap_after",
      notebookId: "nb_gate",
      capturedAt: "2026-05-29T00:00:01.000Z",
      masteryEvidence: [
        { ref: { refType: "turn", refId: "turn_1" }, overallScore: 0.5, confidence: 0.6 },
        { ref: { refType: "turn", refId: "turn_forbidden" }, overallScore: 0.9, confidence: 0.9 },
      ],
      learnerTraitEstimates: [{ ref: { refType: "trait_estimate", refId: "lte_1" } }],
    });
    const snapshot = buildTraitRecommendationOnlySnapshot({ before, after });
    const assertions = evaluateSyntheticLearnerAssertions({
      assertionRefs: [{ refType: "assertion", refId: "persistence_trait_recommendation_only" }],
      persistence: {
        sessionEvents: [
          {
            ref: { refType: "trait_guardrail_decision", refId: "ltgd_1" },
            eventType: "learner_trait.estimation.planned",
          },
        ],
        traitRecommendationOnlySnapshot: snapshot,
      },
    });
    expect(assertions[0]?.status).toBe("failed");
  });
});
