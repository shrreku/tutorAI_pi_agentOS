import { describe, expect, it } from "vitest";
import {
  adaptivePlanSignalSchema,
  buildAdaptivePlanSignals,
  buildAdaptivePlanSignalsFromMasteryEvidence,
  shouldApplyDurablePlanChange,
  wrapRecommendationReasonJson,
} from "./adaptive-plan-signals.js";
import type { MasteryEvidence } from "./mastery-evidence.js";

describe("adaptive plan signal vocabulary", () => {
  it.each([
    "checkpoint_performance",
    "repeated_mistake",
    "learner_self_report",
    "mastery_change",
    "weak_concept_recurrence",
    "source_coverage_gap",
    "multi_turn_confusion",
  ] as const)("builds a %s signal", (signalType) => {
    const signals = buildAdaptivePlanSignals({
      weakConceptIds: signalType === "weak_concept_recurrence" ? ["concept_1"] : [],
      misconceptionConceptIds: signalType === "repeated_mistake" ? ["concept_2"] : [],
      diagnosticConceptIds: signalType === "checkpoint_performance" ? ["concept_3"] : [],
      selfReported: signalType === "learner_self_report",
      sourceCoverageGap: signalType === "source_coverage_gap",
      multiTurnConfusion: signalType === "multi_turn_confusion",
      checkpointFailed: signalType === "checkpoint_performance",
      masteryIncreasedConceptIds: signalType === "mastery_change" ? ["concept_4"] : [],
    });
    expect(signals.some((signal) => signal.signalType === signalType)).toBe(true);
    expect(adaptivePlanSignalSchema.safeParse(signals[0]).success).toBe(true);
  });

  it("does not apply durable plan changes for vague messages alone", () => {
    const signals = buildAdaptivePlanSignals({ vagueLearnerMessage: true });
    expect(signals[0]?.signalType).toBe("vague_message");
    expect(shouldApplyDurablePlanChange(signals)).toBe(false);
  });

  it("builds remediation signals from low-confidence mastery evidence", () => {
    const evidence: MasteryEvidence = {
      id: "mev_1",
      notebookId: "nb_1",
      userId: "user_1",
      correctnessLabel: "incorrect",
      overallScore: 0.3,
      conceptScores: [{ conceptId: "c_chain", score: 0.2, delta: -0.1, role: "primary" }],
      misconceptions: [{ conceptId: "c_chain", description: "Confused inner and outer function" }],
      readiness: "developing",
      tutoringIntervention: "guided_practice",
      uncertainty: 0.2,
      confidence: 0.8,
      evidenceType: "mastery_check",
      triggerSource: "runtime_auto",
      sourceRefs: [],
      contextRefs: [],
      evaluatorProvenance: { mode: "deterministic", model: null, fallbackUsed: false, notes: "test" },
    };
    const signals = buildAdaptivePlanSignalsFromMasteryEvidence(evidence);
    expect(signals.some((signal) => signal.signalType === "repeated_mistake")).toBe(true);
    expect(shouldApplyDurablePlanChange(signals)).toBe(true);
  });

  it("returns no durable signals for uncertain mastery evidence", () => {
    const evidence: MasteryEvidence = {
      id: "mev_2",
      notebookId: "nb_1",
      userId: "user_1",
      correctnessLabel: "needs_more_evidence",
      overallScore: 0.5,
      conceptScores: [{ conceptId: "c1", score: 0.5, delta: 0, role: "primary" }],
      misconceptions: [],
      readiness: "developing",
      tutoringIntervention: "clarify",
      uncertainty: 0.9,
      confidence: 0.3,
      evidenceType: "open_explanation",
      triggerSource: "tutor_tool",
      sourceRefs: [],
      contextRefs: [],
      evaluatorProvenance: { mode: "fallback", model: null, fallbackUsed: true, notes: "test" },
    };
    expect(buildAdaptivePlanSignalsFromMasteryEvidence(evidence)).toEqual([]);
  });

  it("builds advancement signals from strong mastery evidence", () => {
    const evidence: MasteryEvidence = {
      id: "mev_3",
      notebookId: "nb_1",
      userId: "user_1",
      correctnessLabel: "correct",
      overallScore: 0.92,
      conceptScores: [{ conceptId: "c1", score: 0.88, delta: 0.12, role: "primary" }],
      misconceptions: [],
      readiness: "proficient",
      tutoringIntervention: "advance",
      sourceRefs: [],
      contextRefs: [],
      uncertainty: 0.1,
      confidence: 0.85,
      evidenceType: "mastery_check",
      triggerSource: "runtime_auto",
      evaluatorProvenance: { mode: "deterministic", model: null, fallbackUsed: false, notes: "test" },
    };
    const signals = buildAdaptivePlanSignalsFromMasteryEvidence(evidence);
    expect(signals.some((signal) => signal.signalType === "mastery_change")).toBe(true);
  });

  it("wraps session-plan recommendation metadata with signal refs", () => {
    const signals = buildAdaptivePlanSignals({
      misconceptionConceptIds: ["concept_1"],
    });
    const wrapped = wrapRecommendationReasonJson({
      signals,
      patch: { prioritizedObjectiveIds: ["obj_1"] },
    });
    expect(wrapped.adaptivePlanSignalIds).toHaveLength(signals.length);
    expect(wrapped.durableChangeApplied).toBe(true);
  });

  it("includes mastery evidence ids in recommendation metadata", () => {
    const signals = buildAdaptivePlanSignals({ misconceptionConceptIds: ["c1"] });
    const wrapped = wrapRecommendationReasonJson({
      signals,
      patch: {},
      masteryEvidenceIds: ["mev_abc"],
    });
    expect(wrapped.masteryEvidenceIds).toEqual(["mev_abc"]);
  });
});
