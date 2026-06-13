import { describe, expect, it } from "vitest";
import { loadInteractiveLearningTutorContext } from "./interactive-learning-tutor-context.js";

describe("interactive learning tutor context", () => {
  it("formats quiz attempt lines for tutor prompt context", async () => {
    const lines = await loadInteractiveLearningTutorContext(
      {
        db: {
          db: {
            select: () => ({
              from: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: async () => [
                      {
                        eventType: "quiz.attempt.recorded",
                        payloadJson: { questionId: "q1", isCorrect: false },
                        createdAt: new Date("2026-06-08T12:00:00.000Z"),
                      },
                    ],
                  }),
                }),
              }),
            }),
          },
        },
      } as never,
      { notebookId: "nb_1", sessionId: "session_1" },
    );

    expect(lines[0]).toContain("incorrect");
    expect(lines[0]).toContain("q1");
  });
});
