import { describe, expect, it } from "vitest";
import { deriveArtifactLifecycleEventType, resolveArtifactConsentPolicy } from "./artifact-lifecycle.js";
import { buildAdaptiveSessionPlanPatch, buildTutorSessionDigestPayload } from "./phase7.js";
import { buildIntentRoutingInstruction, detectLearnerIntent } from "./tutor-intent.js";
import { formatLearnerStateSummary, type NotebookStudyState } from "./study-state.js";
import { buildTutorContextSelectionReason, buildTutorContextSelectionPlan } from "./tutor-tool-provider.js";

describe("tutor regression scenarios", () => {
  it("keeps cold-start teach-me requests un-routed when there is no objective", () => {
    const intent = detectLearnerIntent("teach me about eigenvectors");
    expect(intent).toEqual({ type: "teach_me", keyword: "teach me" });
    expect(buildIntentRoutingInstruction(intent, false, undefined)).toBeNull();
  });

  it("routes teach-me directly to the active objective when the notebook is tutoring-ready", () => {
    const instruction = buildIntentRoutingInstruction(
      { type: "teach_me", keyword: "teach me" },
      true,
      "Differentiate polynomial functions",
    );

    expect(instruction).toContain("Begin teaching this objective directly");
    expect(instruction).toContain("Differentiate polynomial functions");
  });

  it("updates the rolling digest draft across turns and preserves session provenance", () => {
    const firstTurn = buildTutorSessionDigestPayload({
      sessionId: "sess_1",
      status: "draft",
      assistantMessage: "Start with the derivative rule.",
      userMessage: "teach me",
      currentObjective: "Differentiate polynomial functions",
      sourceIds: ["src_1"],
      citationIds: ["clm_1"],
      artifactProposalIds: [],
      turnId: "turn_1",
    });

    const secondTurn = buildTutorSessionDigestPayload({
      sessionId: "sess_1",
      status: "draft",
      assistantMessage: "Now apply it to a concrete example.",
      userMessage: "continue",
      currentObjective: "Differentiate polynomial functions",
      sourceIds: ["src_1", "src_2"],
      citationIds: ["clm_1", "clm_2"],
      artifactProposalIds: ["artifact_2"],
      turnId: "turn_2",
    });

    expect(firstTurn.sessionId).toBe(secondTurn.sessionId);
    expect(secondTurn.summary).toBe("Now apply it to a concrete example.");
    expect(secondTurn.provenance).toMatchObject({
      sourceIds: ["src_1", "src_2"],
      citationIds: ["clm_1", "clm_2"],
      artifactProposalIds: ["artifact_2"],
      turnId: "turn_2",
    });
  });

  it("creates one final digest payload at explicit end with next-step guidance", () => {
    const payload = buildTutorSessionDigestPayload({
      sessionId: "sess_2",
      status: "ready",
      assistantMessage: "Good work. Stop here and review the notebook summary.",
      userMessage: "end session",
      currentObjective: "Differentiate polynomial functions",
      studyPlanSummary: "Calculus I; current: Differentiation",
      learnerStateSummary: "Weak concepts: chain rule",
      sourceIds: ["src_1"],
      citationIds: ["clm_1"],
      artifactProposalIds: ["artifact_9"],
    });

    expect(payload).toMatchObject({
      sessionId: "sess_2",
      status: "ready",
      currentObjective: "Differentiate polynomial functions",
      studyPlanSummary: "Calculus I; current: Differentiation",
      learnerStateSummary: "Weak concepts: chain rule",
      nextStep: "Continue with Differentiate polynomial functions",
    });
  });

  it("maps artifact consent lifecycle transitions to approval and proposal events", () => {
    expect(deriveArtifactLifecycleEventType("draft", "ready")).toBe("artifact.approved");
    expect(deriveArtifactLifecycleEventType("draft", "proposed")).toBe("artifact.proposed");
    expect(deriveArtifactLifecycleEventType("proposed", "rejected")).toBe("artifact.rejected");
    expect(deriveArtifactLifecycleEventType("ready", "ready")).toBeNull();
  });

  it("detects resume-style continuations as continue intent", () => {
    expect(detectLearnerIntent("resume where we left off")).toEqual({
      type: "continue",
      keyword: "continue",
    });
  });

  it("includes full student profile preferences in learner state summary", () => {
    const state = {
      studentProfile: {
        id: "sprof_1",
        goalSummary: "Learn calculus for engineering",
        backgroundSummary: "High school math",
        pacePreference: "slow",
        depthPreference: "foundational",
        examplePreferencesJson: { workedExamples: "high", analogies: "medium" },
        assessmentPreferenceJson: { quizFrequency: "after_each_objective" },
        constraintsJson: { examDate: "2026-06-15", timeBudgetMinutes: 60 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      curriculum: null,
      module: null,
      objectiveList: null,
      sessionPlan: null,
      studyPlan: null,
      coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [],
      learnerReadiness: [],
      learnerProgressSummary: { strengths: [], weakConcepts: [], needsReview: [], readyToAdvance: [] },
    } as unknown as NotebookStudyState;

    const summary = formatLearnerStateSummary(state);
    expect(summary).toContain("goal: Learn calculus for engineering");
    expect(summary).toContain("pace: slow");
    expect(summary).toContain("depth: foundational");
    expect(summary).toContain("workedExamples: high");
    expect(summary).toContain("quizFrequency: after_each_objective");
    expect(summary).toContain("examDate: 2026-06-15");
  });

  it("surfaces weak concepts in the learner state summary for remediation routing", () => {
    const state: NotebookStudyState = {
      studentProfile: null,
      curriculum: null,
      module: null,
      objectiveList: null,
      sessionPlan: null,
      studyPlan: {
        id: "plan_1",
        title: "Calculus I",
        status: "active",
        currentObjective: null,
        upcomingObjectives: [],
        completedObjectives: [],
        weakConcepts: [
          { id: "concept_1", name: "chain rule" },
          { id: "concept_2", name: "product rule" },
        ],
      },
      coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [],
      learnerReadiness: [],
      learnerProgressSummary: {
        headline: "Focus on chain rule and product rule",
        strengths: [],
        weakConcepts: ["chain rule", "product rule"],
        needsReview: [],
        readyToAdvance: [],
      },
    };

    expect(formatLearnerStateSummary(state)).toContain("Weak concepts: chain rule, product rule");
    expect(formatLearnerStateSummary(state)).toContain("Progress:");
  });

  it("records explicit context-selection reasoning for selected-source scoped retrieval", () => {
    const plan = buildTutorContextSelectionPlan({
      message: "teach me from this source",
      selectedNodeRefs: [{ refType: "source", refId: "src_42" }],
      studyState: null,
    });

    const reason = buildTutorContextSelectionReason({
      plan,
      maxChunks: 6,
      selectedChunkCount: 3,
      usedSourceScopeFallback: false,
      sourceIds: ["src_42"],
    });

    expect(reason).toContain("Applied selected source scope (soft_source_scope): src_42");
    expect(reason).toContain("Retrieved 3 chunks");
    expect(reason).not.toContain("fell back to notebook-wide retrieval");
  });

  it("adapts session plans toward weak-concept remediation under time constraints", () => {
    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_a", "obj_b", "obj_c"],
      currentSessionGoal: "Advance quickly",
      objectiveIdsOrdered: ["obj_a", "obj_b", "obj_c"],
      currentObjectiveId: "obj_b",
      objectives: [
        { id: "obj_a", title: "Intro", status: "not_started", targetConceptIds: ["c_a"] },
        { id: "obj_b", title: "Current", status: "in_progress", targetConceptIds: ["c_weak"] },
        { id: "obj_c", title: "Advanced", status: "not_started", targetConceptIds: ["c_c"] },
      ],
      weakConceptIds: ["c_weak"],
      timeBudgetMinutes: 25,
    });

    expect(patch?.plannedObjectiveIds).toEqual(["obj_b"]);
    expect(patch?.sessionGoal).toContain("weak concepts");
  });

  it("models pedagogical runtime flow from intent routing to digest finalization payload", () => {
    const intent = detectLearnerIntent("teach me derivatives");
    const routing = buildIntentRoutingInstruction(intent, true, "Differentiate polynomial functions");
    expect(routing).toContain("Begin teaching this objective directly");

    const adaptivePatch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_intro", "obj_core"],
      currentSessionGoal: "Generic session",
      objectiveIdsOrdered: ["obj_intro", "obj_core"],
      currentObjectiveId: "obj_core",
      objectives: [
        { id: "obj_intro", title: "Intro", status: "completed", targetConceptIds: ["c0"] },
        { id: "obj_core", title: "Core derivatives", status: "in_progress", targetConceptIds: ["c_chain"] },
      ],
      weakConceptIds: ["c_chain"],
      diagnosticConceptIds: ["c_chain"],
      timeBudgetMinutes: 20,
    });
    expect(adaptivePatch?.plannedObjectiveIds).toEqual(["obj_core"]);

    const digest = buildTutorSessionDigestPayload({
      sessionId: "sess_runtime_flow",
      status: "ready",
      assistantMessage: "We covered the chain rule and checked a misconception.",
      userMessage: "end session",
      currentObjective: "Differentiate polynomial functions",
      sourceIds: ["src_1"],
      citationIds: ["clm_1"],
      artifactProposalIds: ["artifact_worked_1", "artifact_formula_1"],
      turnId: "turn_7",
    });
    expect(digest).toMatchObject({
      sessionId: "sess_runtime_flow",
      status: "ready",
      nextStep: "Continue with Differentiate polynomial functions",
      provenance: {
        artifactProposalIds: ["artifact_worked_1", "artifact_formula_1"],
      },
    });
  });

  it("applies per-type artifact consent ladder policies", () => {
    const consent = {
      perType: {
        worked_example: "auto_create",
        formula_sheet: "propose",
        comparison_page: "draft_only",
      },
    };
    expect(resolveArtifactConsentPolicy(consent, "worked_example")).toBe("auto_create");
    expect(resolveArtifactConsentPolicy(consent, "formula_sheet")).toBe("propose");
    expect(resolveArtifactConsentPolicy(consent, "comparison_page")).toBe("draft_only");
  });
});
