import { describe, expect, it } from "vitest";
import { normalizeQuizQuestions } from "./quiz-utils.js";

describe("normalizeQuizQuestions", () => {
  it("normalizes common quiz aliases for artifact and MCP quiz surfaces", () => {
    expect(
      normalizeQuizQuestions([
        {
          questionId: "q1",
          question: "What drives heat conduction?",
          options: ["Temperature difference", "Density", "Color", "Mass"],
          correctAnswer: "Temperature difference",
          explanation: "Conduction needs a temperature difference.",
          conceptId: "concept_conduction",
        },
      ]),
    ).toEqual([
      {
        id: "q1",
        prompt: "What drives heat conduction?",
        choices: ["Temperature difference", "Density", "Color", "Mass"],
        answer: "Temperature difference",
        referenceAnswer: null,
        explanation: "Conduction needs a temperature difference.",
        difficulty: null,
        conceptIds: ["concept_conduction"],
      },
    ]);
  });

  it("upgrades legacy generic prompts into answerable quiz questions", () => {
    expect(
      normalizeQuizQuestions([
        {
          id: "q1",
          prompt: "How would you explain Conduction Rate Equation in your own words?",
          referenceAnswer:
            "It relates heat rate to thermal conductivity, area, temperature difference, and thickness.",
          conceptId: "concept_conduction_rate",
        },
      ]),
    ).toEqual([
      {
        id: "q1",
        prompt: "Which statement best describes Conduction Rate Equation?",
        choices: [
          "It relates heat rate to thermal conductivity, area, temperature difference, and thickness",
          "It is only a vocabulary label and does not affect problem solving.",
          "It means the same thing as every other concept in the quiz.",
          "It should be memorized without connecting it to source evidence.",
        ],
        answer:
          "It relates heat rate to thermal conductivity, area, temperature difference, and thickness",
        referenceAnswer:
          "It relates heat rate to thermal conductivity, area, temperature difference, and thickness",
        explanation:
          "Conduction Rate Equation: It relates heat rate to thermal conductivity, area, temperature difference, and thickness",
        difficulty: "recall",
        conceptIds: ["concept_conduction_rate"],
      },
    ]);
  });
});
