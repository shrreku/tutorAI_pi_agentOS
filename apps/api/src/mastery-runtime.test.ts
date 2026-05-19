import { describe, expect, it } from "vitest";
import {
  buildPendingEvaluationFromAssistantMessage,
  isEligibleLearnerEvaluationAnswer,
  isVagueLearnerAcknowledgement,
  shouldTriggerRuntimeMasteryEvaluation,
} from "./mastery-runtime.js";

describe("mastery runtime triggers", () => {
  it("detects evaluable mastery-check prompts", () => {
    const pending = buildPendingEvaluationFromAssistantMessage({
      turnId: "turn_1",
      assistantMessage: "Quick check: what is the derivative of x^2?",
      conceptIds: ["concept_1"],
      objectiveId: "obj_1",
    });
    expect(pending?.tutorQuestion).toContain("derivative");
  });

  it("does not create pending evaluation for general navigation", () => {
    const pending = buildPendingEvaluationFromAssistantMessage({
      turnId: "turn_1",
      assistantMessage: "Upload another PDF when you are ready.",
      conceptIds: [],
    });
    expect(pending).toBeNull();
  });

  it("triggers evaluation for eligible answers to pending prompts", () => {
    const pending = {
      turnId: "turn_1",
      tutorQuestion: "What is 2+2?",
      conceptIds: ["concept_1"],
      objectiveId: null,
      createdAt: new Date().toISOString(),
    };
    expect(
      shouldTriggerRuntimeMasteryEvaluation({
        pendingEvaluation: pending,
        learnerMessage: "It equals 4 because we add two units twice.",
        alreadyEvaluatedTurnIds: [],
      }),
    ).toBe(true);
  });

  it("skips vague acknowledgements unless answering a pending prompt with substance", () => {
    expect(isVagueLearnerAcknowledgement("ok")).toBe(true);
    expect(isEligibleLearnerEvaluationAnswer("ok", true)).toBe(false);
    expect(isEligibleLearnerEvaluationAnswer("ok", false)).toBe(false);
  });

  it("prevents duplicate runtime evaluation for the same turn", () => {
    const pending = {
      turnId: "turn_1",
      tutorQuestion: "Explain photosynthesis.",
      conceptIds: ["concept_1"],
      objectiveId: null,
      createdAt: new Date().toISOString(),
    };
    expect(
      shouldTriggerRuntimeMasteryEvaluation({
        pendingEvaluation: pending,
        learnerMessage: "Plants convert sunlight into energy.",
        alreadyEvaluatedTurnIds: ["turn_1"],
      }),
    ).toBe(false);
  });
});
