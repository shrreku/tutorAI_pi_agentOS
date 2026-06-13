import { describe, expect, it } from "vitest";
import type { DbClient } from "@studyagent/db";
import { buildQuizArtifactPayload } from "./assessment-artifacts.js";

function dbWithConcepts(
  rows: Array<{ id: string; name: string; description: string | null }>,
): DbClient {
  return {
    db: {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  orderBy() {
                    return {
                      limit() {
                        return Promise.resolve(rows);
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
  } as unknown as DbClient;
}

describe("buildQuizArtifactPayload", () => {
  it("builds varied answerable quiz questions instead of repeated concept-explanation prompts", async () => {
    const payload = await buildQuizArtifactPayload(
      dbWithConcepts([
        {
          id: "concept_conduction",
          name: "Conduction",
          description: "Heat transfer through direct contact due to a temperature difference.",
        },
        {
          id: "concept_fourier",
          name: "Fourier's Law",
          description:
            "Conductive heat rate is proportional to thermal conductivity, area, and temperature difference over thickness.",
        },
        {
          id: "concept_gradient",
          name: "Temperature Gradient",
          description: "The rate and direction of temperature change across distance.",
        },
      ]),
      "nb_heat",
      [],
      3,
      "Create a quiz about heat transfer.",
    );

    const questions = payload.questions as Array<Record<string, unknown>>;
    expect(questions).toHaveLength(3);
    expect(new Set(questions.map((question) => question.prompt))).toHaveProperty("size", 3);
    expect(
      questions.every(
        (question) =>
          typeof question.prompt === "string" && !question.prompt.includes("How would you explain"),
      ),
    ).toBe(true);
    expect(
      questions.every(
        (question) => Array.isArray(question.choices) && question.choices.length >= 4,
      ),
    ).toBe(true);
    expect(
      questions.every(
        (question) => typeof question.answer === "string" && question.answer.length > 0,
      ),
    ).toBe(true);
    expect(
      questions.every(
        (question) =>
          typeof question.referenceAnswer === "string" && question.referenceAnswer.length > 0,
      ),
    ).toBe(true);
    expect(
      questions.every(
        (question) => typeof question.explanation === "string" && question.explanation.length > 0,
      ),
    ).toBe(true);
  });
});
