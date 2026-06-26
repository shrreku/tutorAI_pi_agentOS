import { describe, expect, it } from "vitest";
import { deriveMasteryEvidencePatternSignals } from "./learner-trait-mastery-patterns.js";

describe("learner trait mastery evidence patterns", () => {
  it("derives overconfidence and low metacognitive accuracy from contradicted self-report mastery evidence", () => {
    const signals = deriveMasteryEvidencePatternSignals({
      notebookId: "nb_1",
      userId: "user_1",
      masteryRows: [
        {
          id: "mev_1",
          turnId: "turn_1",
          sessionId: "sess_1",
          evidenceJson: {
            evidenceType: "self_report",
            correctnessLabel: "incorrect",
            confidence: 0.9,
          },
        },
      ],
      now: () => new Date("2026-05-29T08:00:00.000Z"),
    });

    expect(signals).toEqual([
      expect.objectContaining({
        source: "mastery_evidence_pattern",
        trait: "confidenceStyle",
        suggestedValue: "overconfident",
        evidenceRefs: [{ refType: "mastery_evidence", refId: "mev_1", summary: "turn turn_1" }],
      }),
      expect.objectContaining({
        source: "mastery_evidence_pattern",
        trait: "metacognitiveAccuracy",
        suggestedValue: "low",
      }),
    ]);
  });

  it("derives underconfidence when self-report confidence is low but the answer is correct", () => {
    const signals = deriveMasteryEvidencePatternSignals({
      notebookId: "nb_1",
      userId: "user_1",
      masteryRows: [
        {
          id: "mev_2",
          turnId: "turn_2",
          sessionId: "sess_1",
          evidenceJson: {
            evidenceType: "self_report",
            correctnessLabel: "correct",
            confidence: 0.3,
          },
        },
      ],
    });

    expect(signals).toEqual([
      expect.objectContaining({
        trait: "confidenceStyle",
        suggestedValue: "underconfident",
      }),
    ]);
  });

  it("ignores non-self-report mastery evidence", () => {
    const signals = deriveMasteryEvidencePatternSignals({
      notebookId: "nb_1",
      userId: "user_1",
      masteryRows: [
        {
          id: "mev_3",
          turnId: "turn_3",
          sessionId: "sess_1",
          evidenceJson: {
            evidenceType: "mastery_check",
            correctnessLabel: "incorrect",
            confidence: 0.9,
          },
        },
      ],
    });

    expect(signals).toEqual([]);
  });
});
