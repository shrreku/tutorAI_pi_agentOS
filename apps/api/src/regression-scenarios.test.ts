import { describe, expect, it } from "vitest";
import { deriveArtifactLifecycleEventType } from "./routes/notebooks.js";
import { buildTutorSessionDigestPayload } from "./phase7.js";
import { buildIntentRoutingInstruction, detectLearnerIntent } from "./tutor-intent.js";
import { formatLearnerStateSummary, type NotebookStudyState } from "./study-state.js";

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
    };

    expect(formatLearnerStateSummary(state)).toBe("Weak concepts: chain rule, product rule");
  });
});
