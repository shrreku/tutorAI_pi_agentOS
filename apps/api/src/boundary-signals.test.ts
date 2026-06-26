import { describe, expect, it, vi } from "vitest";
import {
  buildStandingBoundarySignals,
  buildWikiSearchBoundarySignals,
} from "./boundary-signals.js";
import type { NotebookStudyState } from "./study-state.js";

const baseStudyState: NotebookStudyState = {
  studentProfile: null,
  curriculum: { id: "cur_1", title: "Heat Conduction", status: "active", activeModuleId: "mod_1" },
  module: { id: "mod_1", title: "Conduction basics", summary: null, status: "active" },
  objectiveList: {
    id: "olist_1",
    title: "Conduction basics objectives",
    status: "active",
    currentObjectiveId: null,
    objectiveIdsOrdered: ["obj_1", "obj_2"],
  },
  sessionPlan: {
    id: "sessplan_1",
    title: "Fourier law session",
    status: "active",
    sessionGoal: null,
    plannedObjectiveIds: ["obj_1", "obj_2"],
    teachingArcIds: [],
    teachingArcTitles: [],
    teachingArcBlockTypes: [],
  },
  studyPlan: {
    id: "plan_1",
    title: "Heat Conduction Plan",
    status: "active",
    activeSessionId: null,
    currentObjective: null,
    upcomingObjectives: [],
    completedObjectives: [
      { id: "obj_1", title: "Explain Fourier's law", status: "completed" },
      { id: "obj_2", title: "Connect Fourier's law with heat flux", status: "completed" },
    ],
    weakConcepts: [],
  },
  tutorSession: {
    active: null,
    last: null,
    canContinue: false,
    suggestedAction: "start_session",
  },
  coverage: {
    total: 2,
    planned: 0,
    introduced: 2,
    checked: 0,
    mastered: 0,
    needsReview: 0,
    gaps: [],
  },
  sourceLevels: [],
  learnerReadiness: [],
  learnerProgressSummary: {
    strengths: [],
    weakConcepts: [],
    needsReview: [],
    readyToAdvance: [],
  },
};

describe("boundary signals", () => {
  it("detects session-plan and source-coverage boundaries without implying mastery", () => {
    const signals = buildStandingBoundarySignals(baseStudyState);

    expect(signals.map((signal) => signal.type)).toEqual([
      "session_plan_boundary",
      "source_coverage_complete",
    ]);
    expect(signals.find((signal) => signal.type === "source_coverage_complete")?.summary).toContain(
      "no remaining planned or needs-review items",
    );
  });

  it("returns a query-specific source scope boundary when search has no source evidence", async () => {
    const dbClient = {
      db: {
        select: vi.fn(() => ({
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: async () => [
                      {
                        sourceId: "src_heat",
                        sourceTitle: "Chapter 2.pdf",
                        headingPath: ["2.1 The Conduction Rate Equation"],
                        pageStart: 1,
                        pageEnd: 2,
                      },
                      {
                        sourceId: "src_heat",
                        sourceTitle: "Chapter 2.pdf",
                        headingPath: ["2.2 Thermal Properties of Matter"],
                        pageStart: 3,
                        pageEnd: 8,
                      },
                    ],
                  }),
                }),
              }),
            }),
          }),
        })),
      },
    } as never;

    const signals = await buildWikiSearchBoundarySignals(dbClient, {
      notebookId: "nb_1",
      query: "teach the heat diffusion equation",
      results: [],
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      type: "source_scope_boundary",
      strength: "likely",
      requestedTopic: "teach the heat diffusion equation",
    });
    expect(signals[0]?.summary).toContain("sections 2.1, 2.2");
  });

  it("does not emit a query-specific boundary when search found topic evidence", async () => {
    const signals = await buildWikiSearchBoundarySignals({} as never, {
      notebookId: "nb_1",
      query: "teach the heat diffusion equation",
      results: [
        {
          refType: "chunk",
          refId: "chunk_1",
          title: "Heat diffusion equation",
          snippet: "The heat diffusion equation is...",
        },
      ],
    });

    expect(signals).toEqual([]);
  });
});
