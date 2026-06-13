import { describe, expect, it } from "vitest";
import { interactiveLearningActionEnvelopeSchema } from "@studyagent/schemas";
import { PASSIVE_INTERACTIVE_ACTIONS } from "@studyagent/schemas";

describe("interactive learning integration contracts", () => {
  it("treats evidence span open as passive (no mastery evidence)", () => {
    expect(PASSIVE_INTERACTIVE_ACTIONS.has("evidence.source_span_opened")).toBe(true);
  });

  it("accepts tutor-led session identity on quiz submission envelope", () => {
    const envelope = interactiveLearningActionEnvelopeSchema.parse({
      notebookId: "nb_1",
      surfaceId: "surface_artifact_1",
      blockId: "interactive_quiz_artifact_1",
      nodeRef: { refType: "artifact", refId: "artifact_1" },
      artifactId: "artifact_1",
      sessionId: "session_tutor_led",
      turnId: "turn_1",
      actionName: "quiz.answer_submitted",
      actionPayload: { questionId: "q1", answer: "wrong", isCorrect: false },
    });
    expect(envelope.sessionId).toBe("session_tutor_led");
  });

  it("accepts live plan intent actions without mastery fields", () => {
    const envelope = interactiveLearningActionEnvelopeSchema.parse({
      notebookId: "nb_1",
      surfaceId: "surface_plan_1",
      blockId: "interactive_live_plan_plan_1",
      nodeRef: { refType: "study_plan", refId: "plan_1" },
      actionName: "live_plan.action_selected",
      actionPayload: { actionId: "slow_down", label: "Slow down pace" },
    });
    expect(envelope.actionName).toBe("live_plan.action_selected");
  });
});
