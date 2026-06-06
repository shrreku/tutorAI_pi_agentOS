import { describe, expect, it, vi, beforeEach } from "vitest";

const { loadNotebookStudyStateMock } = vi.hoisted(() => ({
  loadNotebookStudyStateMock: vi.fn(),
}));

vi.mock("./study-state.js", () => ({
  loadNotebookStudyState: loadNotebookStudyStateMock,
}));

import { loadNotebookHostState } from "./notebook-host-state.js";

const baseStudyState = {
  studentProfile: null,
  curriculum: null,
  module: null,
  objectiveList: null,
  sessionPlan: {
    id: "plan_1",
    title: "Session plan",
    sessionGoal: "Learn limits",
    teachingArcTitles: [],
    teachingArcBlockTypes: [],
  },
  studyPlan: {
    id: "sp_1",
    currentObjective: { id: "objective_1", title: "Objective 1", status: "active" },
    upcomingObjectives: [],
    completedObjectives: [],
    weakConcepts: [{ name: "Limits" }],
  },
  coverage: { gaps: [] },
  tutorSession: null,
  sourceLevels: [],
  learnerReadiness: [],
  learnerProgressSummary: { headline: "progress", weakConcepts: [] },
};

describe("loadNotebookHostState", () => {
  beforeEach(() => {
    loadNotebookStudyStateMock.mockReset();
    loadNotebookStudyStateMock.mockResolvedValue(baseStudyState);
  });

  it("returns planning, mastery, session, and personalization slices when study plan exists", async () => {
    const host = await loadNotebookHostState({} as never, "nb_1", "user_1");
    expect(host.planning).toBeDefined();
    expect(host.planning.studyPlan).toBeDefined();
    expect(host.planning.sessionPlan).toBeDefined();
    expect(host.mastery).toBeDefined();
    expect(host.mastery.learnerProgressSummary).toEqual(expect.objectContaining({ headline: "progress" }));
    expect(host.session).toBeDefined();
    expect(host.personalization).toBeDefined();
    expect(Array.isArray(host.personalization.weakConcepts)).toBe(true);
    expect(host.studyState).toBeDefined();
  });
});

