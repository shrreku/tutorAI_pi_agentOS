import { describe, expect, it } from "vitest";
import {
  computeMasteryDeltaForEvidence,
  shouldApplyStrongMasteryUpdate,
} from "./mastery-reducer.js";
import type { MasteryEvidence } from "@studyagent/schemas";
import { buildMasteryEvidenceId } from "@studyagent/schemas";

function buildEvidence(overrides: Partial<MasteryEvidence> = {}): MasteryEvidence {
  return {
    id: buildMasteryEvidenceId(),
    notebookId: "nb_1",
    userId: "user_1",
    correctnessLabel: "partial",
    overallScore: 0.55,
    conceptScores: [{ conceptId: "concept_1", score: 0.5, delta: 0.04, role: "primary" }],
    misconceptions: [],
    readiness: "developing",
    tutoringIntervention: "guided_practice",
    uncertainty: 0.3,
    confidence: 0.7,
    evidenceType: "mastery_check",
    triggerSource: "runtime_auto",
    sourceRefs: [],
    contextRefs: [],
    evaluatorProvenance: { mode: "deterministic", model: null, fallbackUsed: false, notes: "test" },
    ...overrides,
  };
}

describe("computeMasteryDeltaForEvidence", () => {
  it.each([
    ["mastery_check", 0.14],
    ["quiz_artifact", 0.12],
    ["open_explanation", 0.08],
    ["self_report", 0.03],
    ["tutor_observation", 0.06],
    ["repeated_mistake", -0.1],
  ] as const)("weights %s evidence type", (evidenceType, magnitude) => {
    const evidence = buildEvidence({
      evidenceType,
      correctnessLabel: evidenceType === "repeated_mistake" ? "incorrect" : "correct",
      conceptScores: [{ conceptId: "concept_1", score: 0.7, delta: magnitude, role: "primary" }],
    });
    const delta = computeMasteryDeltaForEvidence(evidence, "concept_1");
    expect(Math.sign(delta)).toBe(evidenceType === "repeated_mistake" ? -1 : 1);
    expect(Math.abs(delta)).toBeLessThanOrEqual(Math.abs(magnitude) + 0.01);
  });

  it("gates low-confidence evidence to minimal updates", () => {
    const evidence = buildEvidence({
      confidence: 0.2,
      uncertainty: 0.9,
      correctnessLabel: "needs_more_evidence",
    });
    expect(computeMasteryDeltaForEvidence(evidence, "concept_1")).toBe(0);
    expect(shouldApplyStrongMasteryUpdate(evidence)).toBe(false);
  });

  it("allows stronger updates for confident mastery checks", () => {
    const evidence = buildEvidence({
      evidenceType: "mastery_check",
      correctnessLabel: "correct",
      confidence: 0.9,
      uncertainty: 0.1,
    });
    expect(shouldApplyStrongMasteryUpdate(evidence)).toBe(true);
    expect(computeMasteryDeltaForEvidence(evidence, "concept_1")).toBeGreaterThan(0.03);
  });

  it("applies minimal negative update for self-reported confusion", () => {
    const evidence = buildEvidence({
      evidenceType: "self_report",
      correctnessLabel: "incorrect",
      tutoringIntervention: "quick_check",
      confidence: 0.55,
      uncertainty: 0.4,
    });
    const delta = computeMasteryDeltaForEvidence(evidence, "concept_1");
    expect(delta).toBeLessThan(0);
    expect(delta).toBeGreaterThan(-0.05);
  });
});
