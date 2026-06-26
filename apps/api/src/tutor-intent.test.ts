import { describe, expect, it } from "vitest";
import {
  buildLearnerTurnRoutingInstruction,
  detectLearnerIntent,
  detectLearnerTurnGoal,
} from "./tutor-intent.js";

describe("detectLearnerTurnGoal", () => {
  it("detects mastery answers and quiz requests", () => {
    expect(detectLearnerTurnGoal("Tangent line. Is that correction right?")).toBe("mastery_answer");
    expect(detectLearnerTurnGoal("Can you make me a quiz I can study from?")).toBe(
      "quiz_or_artifact",
    );
    expect(detectLearnerTurnGoal("Please keep it tied to the source for revision.")).toBe(
      "artifact_followup",
    );
    expect(
      detectLearnerTurnGoal("Teach me the topic and check whether I am missing a key idea."),
    ).toBe("lesson_opening");
  });
});

describe("buildLearnerTurnRoutingInstruction", () => {
  it("requires evaluation when a pending mastery check exists", () => {
    const instruction = buildLearnerTurnRoutingInstruction("mastery_answer", true);
    expect(instruction).toContain("learning.evaluate_response");
    expect(instruction).toContain("generic greeting");
  });

  it("still maps teach-me intent for curriculum routing", () => {
    const intent = detectLearnerIntent("Teach me derivatives from the start");
    expect(intent.type).toBe("teach_me");
  });
});
