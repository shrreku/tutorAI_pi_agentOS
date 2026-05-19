import { describe, expect, it } from "vitest";
import { evaluateLearnerResponse, type MasteryEvaluatorJudge } from "./mastery-evaluator.js";

const baseInput = {
  notebookId: "nb_1",
  userId: "user_1",
  tutorQuestion: "What is the derivative of x^2?",
  learnerAnswer: "2x",
  conceptRoles: [{ conceptId: "concept_deriv", role: "primary" as const }],
  masterySnapshot: { concept_deriv: 0.4 },
  referenceAnswer: "2x",
  sourceRefs: [{ refType: "source" as const, refId: "src_1" }],
  contextRefs: [],
};

describe("evaluateLearnerResponse", () => {
  it("scores exact quiz-style answers deterministically", async () => {
    const evidence = await evaluateLearnerResponse({
      ...baseInput,
      evidenceType: "mastery_check",
      triggerSource: "runtime_auto",
    });
    expect(evidence.correctnessLabel).toBe("correct");
    expect(evidence.evaluatorProvenance.mode).toBe("deterministic");
    expect(evidence.conceptScores[0]?.delta).toBeGreaterThan(0);
  });

  it("uses LLM judgment for open-ended explanations when provided", async () => {
    const judge: MasteryEvaluatorJudge = async () => ({
      correctnessLabel: "partial",
      overallScore: 0.6,
      confidence: 0.7,
      uncertainty: 0.3,
      misconceptions: [{ conceptId: "concept_deriv", description: "Missing chain rule mention" }],
      tutoringIntervention: "guided_practice",
      notes: "stub llm",
    });
    const evidence = await evaluateLearnerResponse(
      {
        ...baseInput,
        learnerAnswer: "You multiply the power and reduce it by one.",
        referenceAnswer: undefined,
        evidenceType: "open_explanation",
        triggerSource: "tutor_tool",
      },
      { judge },
    );
    expect(evidence.evaluatorProvenance.mode).toBe("llm");
    expect(evidence.correctnessLabel).toBe("partial");
  });

  it("falls back deterministically when LLM judgment fails", async () => {
    const judge: MasteryEvaluatorJudge = async () => {
      throw new Error("llm unavailable");
    };
    const evidence = await evaluateLearnerResponse(
      {
        ...baseInput,
        learnerAnswer: "not sure",
        referenceAnswer: undefined,
        evidenceType: "open_explanation",
      },
      { judge },
    );
    expect(evidence.evaluatorProvenance.fallbackUsed).toBe(true);
    expect(evidence.evaluatorProvenance.mode).toBe("fallback");
  });

  it("gates uncertain judgments as needs_more_evidence", async () => {
    const judge: MasteryEvaluatorJudge = async () => ({
      correctnessLabel: "partial",
      overallScore: 0.4,
      confidence: 0.2,
      uncertainty: 0.9,
      misconceptions: [],
      tutoringIntervention: "quick_check",
      notes: "uncertain",
    });
    const evidence = await evaluateLearnerResponse(
      {
        ...baseInput,
        learnerAnswer: "maybe something about slopes",
        referenceAnswer: undefined,
      },
      { judge },
    );
    expect(evidence.correctnessLabel).toBe("needs_more_evidence");
    expect(evidence.tutoringIntervention).toBe("quick_check");
  });

  it("marks source-specific evaluation with source refs", async () => {
    const evidence = await evaluateLearnerResponse({
      ...baseInput,
      learnerAnswer: "wrong answer",
      referenceAnswer: "2x",
      sourceRefs: [{ refType: "source", refId: "src_calculus" }],
    });
    expect(evidence.sourceRefs).toEqual([{ refType: "source", refId: "src_calculus" }]);
    expect(evidence.correctnessLabel).toBe("incorrect");
  });
});
