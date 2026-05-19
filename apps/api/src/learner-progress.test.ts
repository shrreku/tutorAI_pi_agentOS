import { describe, expect, it } from "vitest";
import {
  deriveLearnerProgressSummary,
  formatLearnerProgressForDigest,
  learnerProgressExposesRawEvaluatorData,
} from "./learner-progress.js";
import type { NotebookStudyState } from "./study-state.js";

function baseState(overrides: Partial<NotebookStudyState> = {}): NotebookStudyState {
  return {
    studentProfile: null,
    curriculum: null,
    module: null,
    objectiveList: null,
    sessionPlan: null,
    studyPlan: null,
    coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
    sourceLevels: [],
    learnerReadiness: [],
    learnerProgressSummary: { strengths: [], weakConcepts: [], needsReview: [], readyToAdvance: [] },
    ...overrides,
  };
}

describe("learner progress summaries", () => {
  it("never exposes raw evaluator scores in learner-facing digest text", () => {
    const text = formatLearnerProgressForDigest(
      baseState({
        studyPlan: {
          id: "plan_1",
          title: "Calc",
          status: "active",
          weakConcepts: [{ id: "c1", name: "chain rule" }],
          currentObjective: null,
          upcomingObjectives: [],
          completedObjectives: [],
        },
        coverage: {
          total: 1,
          planned: 0,
          introduced: 0,
          checked: 0,
          mastered: 0,
          needsReview: 1,
          gaps: [{ coverageItemId: "cov_1", title: "Product rule", itemFamily: "procedure", status: "needs_review" }],
        },
      }),
    );
    expect(text).toBeDefined();
    expect(text).not.toMatch(/confidence|uncertainty|0\.\d{2}/i);
    expect(learnerProgressExposesRawEvaluatorData(deriveLearnerProgressSummary(baseState()))).toBe(false);
  });
});
