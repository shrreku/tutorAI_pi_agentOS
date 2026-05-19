import { describe, expect, it } from "vitest";
import { buildLearnerProgressSummary, formatLearnerProgressSummaryText } from "./learner-progress-summary.js";

describe("learner progress summary", () => {
  it("builds humane summaries without numeric evaluator fields", () => {
    const summary = buildLearnerProgressSummary({
      weakConcepts: [{ id: "c1", name: "chain rule" }],
      coverageGapTitles: ["Product rule procedure"],
      currentObjectiveTitle: "Derivatives",
      completedObjectiveCount: 1,
      readinessLabels: [{ conceptName: "limits", readiness: "proficient" }],
    });

    expect(summary.weakConcepts).toContain("chain rule");
    expect(summary.needsReview).toContain("Product rule procedure");
    expect(formatLearnerProgressSummaryText(summary)).not.toMatch(/0\.\d{2}|confidence|uncertainty/i);
  });
});
