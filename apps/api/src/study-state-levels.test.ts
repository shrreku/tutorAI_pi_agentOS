import { describe, expect, it } from "vitest";
import { formatLearnerStateSummary, type NotebookStudyState } from "./study-state.js";

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
    learnerProgressSummary: {
      strengths: [],
      weakConcepts: [],
      needsReview: [],
      readyToAdvance: [],
    },
    ...overrides,
  };
}

describe("study state level contracts", () => {
  it("includes inferred source levels in the learner summary", () => {
    const summary = formatLearnerStateSummary(
      baseState({
        sourceLevels: [
          {
            sourceId: "src_grad",
            level: "graduate",
            confidence: 0.72,
            lastUpdatedReason: "inferred_from_title",
          },
        ],
      }),
    );
    expect(summary).toContain("Source levels: src_grad=graduate");
  });

  it("includes humane progress summary without raw evaluator scores", () => {
    const summary = formatLearnerStateSummary(
      baseState({
        studyPlan: {
          id: "plan_1",
          title: "Thermodynamics",
          status: "active",
          weakConcepts: [{ id: "concept_entropy", name: "entropy" }],
          currentObjective: null,
          upcomingObjectives: [],
          completedObjectives: [],
        },
        learnerProgressSummary: {
          headline: "Focus on entropy",
          strengths: [],
          weakConcepts: ["entropy"],
          needsReview: [],
          readyToAdvance: [],
        },
      }),
    );
    expect(summary).toContain("Progress: Focus on entropy");
    expect(summary).not.toMatch(/confidence|uncertainty|0\.\d{2}/i);
  });
});
