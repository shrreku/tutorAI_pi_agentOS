import { describe, expect, it } from "vitest";
import { buildAdaptivePlanSignals, shouldApplyDurablePlanChange } from "@studyagent/schemas";
import {
  buildAdaptiveSessionPlanPatch,
  buildTutorSessionDigestPayload,
  decideObjectiveCompletion,
} from "./phase7.js";

describe("buildTutorSessionDigestPayload", () => {
  it("includes session provenance and objective context for drafts", () => {
    const payload = buildTutorSessionDigestPayload({
      sessionId: "sess_123",
      status: "draft",
      assistantMessage: "Work through the derivative rule step by step.",
      userMessage: "Can you help me with derivatives?",
      currentObjective: "Differentiate polynomial functions",
      sourceIds: ["src_1", "src_2"],
      citationIds: ["claim_7"],
      artifactProposalIds: ["artifact_9"],
      studyPlanSummary: "Calculus I; current: Differentiation",
      learnerStateSummary: "Weak concepts: chain rule",
      turnId: "turn_1",
    });

    expect(payload).toMatchObject({
      sessionId: "sess_123",
      status: "draft",
      summary: "Work through the derivative rule step by step.",
      learnerMessage: "Can you help me with derivatives?",
      currentObjective: "Differentiate polynomial functions",
      studyPlanSummary: "Calculus I; current: Differentiation",
      learnerStateSummary: "Weak concepts: chain rule",
      nextStep: "Continue with Differentiate polynomial functions",
      provenance: {
        sourceIds: ["src_1", "src_2"],
        citationIds: ["claim_7"],
        artifactProposalIds: ["artifact_9"],
        turnId: "turn_1",
      },
    });
  });

  it("falls back to a generic next step when no objective is available", () => {
    const payload = buildTutorSessionDigestPayload({
      sessionId: "sess_456",
      status: "ready",
      assistantMessage: "Let's review the notebook evidence.",
      userMessage: "What should I look at next?",
      sourceIds: [],
      citationIds: [],
      artifactProposalIds: [],
    });

    expect(payload).toMatchObject({
      sessionId: "sess_456",
      status: "ready",
      nextStep: "Continue the current tutoring path",
      currentObjective: null,
    });
  });
});

describe("buildAdaptiveSessionPlanPatch", () => {
  it("prioritizes current and weak-target objectives under time budget", () => {
    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_1", "obj_2", "obj_3"],
      currentSessionGoal: "Old session goal",
      objectiveIdsOrdered: ["obj_1", "obj_2", "obj_3"],
      currentObjectiveId: "obj_2",
      objectives: [
        { id: "obj_1", title: "Foundations", status: "not_started", targetConceptIds: ["c1"] },
        { id: "obj_2", title: "Core skill", status: "in_progress", targetConceptIds: ["c2", "c3"] },
        { id: "obj_3", title: "Extension", status: "not_started", targetConceptIds: ["c4"] },
      ],
      weakConceptIds: ["c3"],
      timeBudgetMinutes: 30,
    });

    expect(patch?.plannedObjectiveIds).toEqual(["obj_2", "obj_1"]);
    expect(patch?.sessionGoal).toContain("Repair misconceptions");
    expect(patch?.recommendationReasonJson.strategy).toBe("adaptive_regeneration_from_learning_state");
    expect(Array.isArray(patch?.recommendationReasonJson.adaptivePlanSignalIds)).toBe(true);
  });

  it("returns null when adaptive planning does not change plan", () => {
    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_1"],
      currentSessionGoal: "Advance the current objective path with one focused checkpoint.",
      objectiveIdsOrdered: ["obj_1"],
      currentObjectiveId: "obj_1",
      objectives: [{ id: "obj_1", title: "Foundations", status: "not_started", targetConceptIds: [] }],
      weakConceptIds: [],
      timeBudgetMinutes: 20,
    });

    expect(patch).toBeNull();
  });

  it("prioritizes misconception-target objectives ahead of weak-only objectives", () => {
    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_a", "obj_b"],
      currentSessionGoal: "Old goal",
      objectiveIdsOrdered: ["obj_a", "obj_b"],
      currentObjectiveId: null,
      objectives: [
        { id: "obj_a", title: "Weak focus", status: "not_started", targetConceptIds: ["c_weak"] },
        { id: "obj_b", title: "Misconception focus", status: "not_started", targetConceptIds: ["c_mis"] },
      ],
      weakConceptIds: ["c_weak"],
      misconceptionConceptIds: ["c_mis"],
      timeBudgetMinutes: 60,
    });
    expect(patch?.plannedObjectiveIds[0]).toBe("obj_b");
    expect((patch?.recommendationReasonJson.misconceptionConceptCount as number) ?? 0).toBe(1);
  });

  it("prioritizes diagnostic evidence targets ahead of misconception-only targets", () => {
    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_a", "obj_b"],
      currentSessionGoal: "Old goal",
      objectiveIdsOrdered: ["obj_a", "obj_b"],
      currentObjectiveId: null,
      objectives: [
        { id: "obj_a", title: "Misconception repair", status: "not_started", targetConceptIds: ["c_mis"] },
        { id: "obj_b", title: "Diagnostic repair", status: "not_started", targetConceptIds: ["c_diag"] },
      ],
      weakConceptIds: [],
      misconceptionConceptIds: ["c_mis"],
      diagnosticConceptIds: ["c_diag"],
      timeBudgetMinutes: 60,
    });

    expect(patch?.plannedObjectiveIds[0]).toBe("obj_b");
    expect((patch?.recommendationReasonJson.diagnosticConceptCount as number) ?? 0).toBe(1);
  });

  it("uses longer-horizon weak frequency to prioritize repeatedly weak concepts", () => {
    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_a", "obj_b"],
      currentSessionGoal: "Old goal",
      objectiveIdsOrdered: ["obj_a", "obj_b"],
      currentObjectiveId: null,
      objectives: [
        { id: "obj_a", title: "Low frequency weak", status: "not_started", targetConceptIds: ["c_weak_low"] },
        { id: "obj_b", title: "High frequency weak", status: "not_started", targetConceptIds: ["c_weak_high"] },
      ],
      weakConceptIds: ["c_weak_low", "c_weak_high"],
      recentWeakConceptFrequencyById: { c_weak_low: 1, c_weak_high: 4 },
      timeBudgetMinutes: 60,
    });

    expect(patch?.plannedObjectiveIds[0]).toBe("obj_b");
  });

  it("promotes next-module objectives when current module has none active", () => {
    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: [],
      currentSessionGoal: "Old goal",
      objectiveIdsOrdered: ["obj_done"],
      currentObjectiveId: null,
      objectives: [{ id: "obj_done", title: "Done", status: "completed", targetConceptIds: ["c_done"] }],
      weakConceptIds: [],
      nextModuleObjectiveIds: ["obj_next_1", "obj_next_2"],
      timeBudgetMinutes: 30,
    });

    expect(patch?.plannedObjectiveIds).toEqual(["obj_next_1", "obj_next_2"]);
  });

  it("returns null for vague learner messages without durable signals", () => {
    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_1"],
      currentSessionGoal: "Old goal",
      objectiveIdsOrdered: ["obj_1"],
      currentObjectiveId: "obj_1",
      objectives: [{ id: "obj_1", title: "Foundations", status: "not_started", targetConceptIds: [] }],
      weakConceptIds: [],
      vagueLearnerMessage: true,
    });
    expect(patch).toBeNull();
    expect(shouldApplyDurablePlanChange(buildAdaptivePlanSignals({ vagueLearnerMessage: true }))).toBe(false);
  });
});

describe("decideObjectiveCompletion", () => {
  it("completes objective when target concept mastery clears threshold", () => {
    const decision = decideObjectiveCompletion({
      objectiveTitle: "Derivatives",
      targetConceptIds: ["c1", "c2"],
      conceptMasteryById: { c1: 0.8, c2: 0.74 },
    });
    expect(decision.shouldComplete).toBe(true);
  });

  it("does not complete objective when mastery is still low", () => {
    const decision = decideObjectiveCompletion({
      objectiveTitle: "Integrals",
      targetConceptIds: ["c1", "c2"],
      conceptMasteryById: { c1: 0.4, c2: 0.5 },
    });
    expect(decision.shouldComplete).toBe(false);
  });

  it("does not complete objective when only one target concept is strong", () => {
    const decision = decideObjectiveCompletion({
      objectiveTitle: "Chain and Product Rule",
      targetConceptIds: ["c_chain", "c_product"],
      conceptMasteryById: { c_chain: 0.92, c_product: 0.4 },
    });
    expect(decision.shouldComplete).toBe(false);
  });
});
