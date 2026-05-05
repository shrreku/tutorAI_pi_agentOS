import { describe, expect, it } from "vitest";
import { buildTutorSessionDigestPayload } from "./phase7.js";

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
