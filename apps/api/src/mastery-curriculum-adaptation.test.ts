import { describe, expect, it } from "vitest";
import {
  buildAdaptivePlanSignalsFromMasteryEvidence,
  shouldApplyDurablePlanChange,
  wrapRecommendationReasonJson,
} from "@studyagent/schemas";
import { buildAdaptiveSessionPlanPatch } from "./phase7.js";

describe("adaptive curriculum from mastery evidence", () => {
  it("prioritizes remediation objectives after repeated mistakes", () => {
    const signals = buildAdaptivePlanSignalsFromMasteryEvidence({
      id: "mev_r1",
      notebookId: "nb_1",
      userId: "user_1",
      correctnessLabel: "incorrect",
      overallScore: 0.25,
      conceptScores: [{ conceptId: "c_weak", score: 0.2, delta: -0.08, role: "primary" }],
      misconceptions: [{ conceptId: "c_weak", description: "Sign error" }],
      readiness: "developing",
      tutoringIntervention: "guided_practice",
      uncertainty: 0.15,
      confidence: 0.82,
      evidenceType: "repeated_mistake",
      triggerSource: "runtime_auto",
      sourceRefs: [],
      contextRefs: [],
      evaluatorProvenance: { mode: "deterministic", model: null, fallbackUsed: false, notes: "test" },
    });
    expect(shouldApplyDurablePlanChange(signals)).toBe(true);

    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_a", "obj_b"],
      currentSessionGoal: "Old goal",
      objectiveIdsOrdered: ["obj_a", "obj_b"],
      currentObjectiveId: null,
      objectives: [
        { id: "obj_a", title: "Extension", status: "not_started", targetConceptIds: ["c_other"] },
        { id: "obj_b", title: "Repair", status: "in_progress", targetConceptIds: ["c_weak"] },
      ],
      weakConceptIds: ["c_weak"],
      misconceptionConceptIds: ["c_weak"],
      adaptivePlanSignals: signals,
      masteryEvidenceIds: ["mev_r1"],
    });

    expect(patch?.plannedObjectiveIds).toContain("obj_b");
    expect(patch?.plannedObjectiveIds.indexOf("obj_b")).toBeLessThan(patch!.plannedObjectiveIds.indexOf("obj_a"));
    expect(patch?.recommendationReasonJson.masteryEvidenceIds).toEqual(["mev_r1"]);
  });

  it("does not change plan for uncertain evidence alone", () => {
    const signals = buildAdaptivePlanSignalsFromMasteryEvidence({
      id: "mev_u1",
      notebookId: "nb_1",
      userId: "user_1",
      correctnessLabel: "needs_more_evidence",
      overallScore: 0.5,
      conceptScores: [{ conceptId: "c1", score: 0.5, delta: 0, role: "primary" }],
      misconceptions: [],
      readiness: "developing",
      tutoringIntervention: "clarify",
      uncertainty: 0.88,
      confidence: 0.25,
      evidenceType: "open_explanation",
      triggerSource: "tutor_tool",
      sourceRefs: [],
      contextRefs: [],
      evaluatorProvenance: { mode: "fallback", model: null, fallbackUsed: true, notes: "test" },
    });
    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_1"],
      currentSessionGoal: "Advance the current objective path with one focused checkpoint.",
      objectiveIdsOrdered: ["obj_1"],
      currentObjectiveId: "obj_1",
      objectives: [{ id: "obj_1", title: "Core", status: "in_progress", targetConceptIds: ["c1"] }],
      weakConceptIds: [],
      adaptivePlanSignals: signals,
    });
    expect(patch).toBeNull();
  });

  it("records source coverage gap signals in recommendation metadata", () => {
    const signals = buildAdaptivePlanSignalsFromMasteryEvidence(
      {
        id: "mev_gap",
        notebookId: "nb_1",
        userId: "user_1",
        correctnessLabel: "partial",
        overallScore: 0.4,
        conceptScores: [{ conceptId: "c1", score: 0.4, delta: -0.05, role: "primary" }],
        misconceptions: [],
        readiness: "developing",
        tutoringIntervention: "reteach",
        uncertainty: 0.3,
        confidence: 0.7,
        evidenceType: "mastery_check",
        triggerSource: "runtime_auto",
        sourceRefs: [{ refType: "source", refId: "src_1" }],
        contextRefs: [],
        evaluatorProvenance: { mode: "deterministic", model: null, fallbackUsed: false, notes: "test" },
      },
      { sourceCoverageGap: true },
    );
    const wrapped = wrapRecommendationReasonJson({
      signals,
      patch: { prioritizedObjectiveIds: ["obj_1"] },
      masteryEvidenceIds: ["mev_gap"],
    });
    expect(signals.some((signal) => signal.signalType === "source_coverage_gap")).toBe(true);
    expect(wrapped.masteryEvidenceIds).toEqual(["mev_gap"]);
  });
});
