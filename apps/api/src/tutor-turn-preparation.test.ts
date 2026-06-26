import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildStudyAgentHostStateSignature } from "@studyagent/agent-runtime";
import { artifacts, tutorSessions } from "@studyagent/db";

const { loadNotebookStudyStateMock, loadPersonalizationMock } = vi.hoisted(() => ({
  loadNotebookStudyStateMock: vi.fn(),
  loadPersonalizationMock: vi.fn(async () => [] as Array<{ recommendation: string }>),
}));

vi.mock("./study-state.js", () => ({
  loadNotebookStudyState: loadNotebookStudyStateMock,
}));

vi.mock("./learner-trait-estimation.js", () => ({
  loadPersonalizationRecommendationsForTutorContext: loadPersonalizationMock,
}));

vi.mock("./learner-trait/index.js", () => ({
  loadPersonalizationRecommendationsForTutorContext: loadPersonalizationMock,
}));

vi.mock("./tutor-tool-provider.js", () => ({
  createTutorReadToolProvider: vi.fn(() => ({})),
}));

vi.mock("./tutor-write-provider.js", () => ({
  createTutorWriteToolProvider: vi.fn(() => ({})),
}));

vi.mock("./agentic-cache-invalidation.js", () => ({
  appendEventWithTutorCacheInvalidation: vi.fn(async () => ({ id: "evt_1", sequenceNo: 1 })),
}));

import { prepareTutorTurn } from "./tutor-turn-preparation.js";

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
    currentObjective: { id: "objective_1", title: "Objective 1", status: "active" },
    upcomingObjectives: [],
    completedObjectives: [],
    weakConcepts: [{ name: "Limits" }],
  },
  coverage: { gaps: [] },
  tutorSession: null,
};

function createMockDb(options: {
  artifact?: {
    id: string;
    artifactType: string;
    title: string;
    status: string;
    notebookId: string;
  };
  existingSession?: {
    id: string;
    notebookId: string;
    userId: string;
    mode: string;
    status: string;
    selectedNodeRefsJson: unknown[];
    runtimeContextJson: Record<string, unknown>;
    startedAt: Date;
    endedAt: null;
  };
}) {
  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: () => {
              if (table === artifacts && options.artifact) {
                return Promise.resolve([options.artifact]);
              }
              if (table === tutorSessions && options.existingSession) {
                return Promise.resolve([options.existingSession]);
              }
              return Promise.resolve([]);
            },
            orderBy: () => ({
              limit: () =>
                Promise.resolve(options.existingSession ? [options.existingSession] : []),
            }),
          }),
          orderBy: () => Promise.resolve([]),
        }),
      }),
      insert: (_table: unknown) => ({
        values: async (_values: Record<string, unknown>) => {},
      }),
      update: (table: unknown) => ({
        set: (_values: Record<string, unknown>) => ({
          where: () => {
            if (table === tutorSessions && options.existingSession) {
              options.existingSession = {
                ...options.existingSession,
                mode: "learn",
                status: "active",
              };
            }
            return Promise.resolve(undefined);
          },
        }),
      }),
    },
  };
}

const baseInput = {
  notebookId: "nb_1",
  userId: "user_1",
  notebookTitle: "Notebook",
  message: "Teach me this artifact",
  activeMode: "learn" as const,
  selectedNodeRefs: [{ refType: "artifact" as const, refId: "artifact_1" }],
  sourceScopePolicy: "soft_source_scope" as const,
};

describe("prepareTutorTurn", () => {
  beforeEach(() => {
    loadNotebookStudyStateMock.mockReset();
    loadPersonalizationMock.mockReset();
    loadNotebookStudyStateMock.mockResolvedValue(baseStudyState);
    loadPersonalizationMock.mockResolvedValue([]);
  });

  it("builds a thin prompt context with open artifact and personalization guidance", async () => {
    loadPersonalizationMock.mockResolvedValue([{ recommendation: "Use more visual examples." }]);

    const prepared = await prepareTutorTurn(
      {
        db: createMockDb({
          artifact: {
            id: "artifact_1",
            artifactType: "quiz",
            title: "Quiz 1",
            status: "ready",
            notebookId: "nb_1",
          },
        }),
        env: { DEFAULT_TUTOR_MODEL: "test-model" },
      } as never,
      baseInput,
    );

    expect(prepared.promptContext.notebookId).toBe("nb_1");
    expect(prepared.promptContext.userId).toBe("user_1");
    expect(prepared.promptContext.sessionId).toBe(prepared.sessionId);
    expect(prepared.promptContext.sourceScopePolicy).toBe("soft_source_scope");
    expect(prepared.promptContext.personalizationRecommendations).toEqual([
      "Use more visual examples.",
    ]);
    expect(prepared.contextSelection).toBeNull();
    expect(prepared.isNewSession).toBe(true);
    expect(prepared.openArtifact).toEqual(
      expect.objectContaining({
        id: "artifact_1",
        artifactType: "quiz",
        title: "Quiz 1",
        status: "ready",
      }),
    );
    expect(prepared.promptContext.openArtifact).toEqual(prepared.openArtifact);
    expect(prepared.promptContext.additionalInstructions).toEqual(
      expect.arrayContaining([
        "[Turn Bootstrap]",
        "[Open Artifact Context]",
        "[Personalization Recommendations]",
        "[New session]",
      ]),
    );

    const signature = buildStudyAgentHostStateSignature(prepared.promptContext);
    expect(signature).toMatch(/^studyagent-host-state-v2:/);
  });

  it("loads live study state on each bootstrap instead of caching host context snapshots", async () => {
    const db = createMockDb({
      artifact: {
        id: "artifact_1",
        artifactType: "quiz",
        title: "Quiz 1",
        status: "ready",
        notebookId: "nb_1",
      },
    });
    const ctx = {
      db,
      env: { DEFAULT_TUTOR_MODEL: "test-model" },
    } as never;

    const first = await prepareTutorTurn(ctx, baseInput);
    const second = await prepareTutorTurn(ctx, baseInput);

    expect(first.sessionId).not.toBe(second.sessionId);
    expect(loadNotebookStudyStateMock).toHaveBeenCalledTimes(2);
    expect(loadPersonalizationMock).toHaveBeenCalledTimes(2);
  });

  it("marks reused sessions as existing and preserves prior runtime context", async () => {
    const existingSession = {
      id: "sess_existing",
      notebookId: "nb_1",
      userId: "user_1",
      mode: "practice",
      status: "paused",
      selectedNodeRefsJson: [],
      runtimeContextJson: { compressedContext: "prior summary" },
      startedAt: new Date("2026-06-06T00:00:00.000Z"),
      endedAt: null,
    };

    const prepared = await prepareTutorTurn(
      {
        db: createMockDb({ existingSession }),
        env: { DEFAULT_TUTOR_MODEL: "test-model" },
      } as never,
      baseInput,
    );

    expect(prepared.contextSelection).toBeNull();
    expect(prepared.isNewSession).toBe(false);
    expect(prepared.sessionId).toBe("sess_existing");
    expect(prepared.previousRuntimeContext).toEqual({ compressedContext: "prior summary" });
  });

  it("keeps the thin prompt resilient when planning state is sparse", async () => {
    loadNotebookStudyStateMock.mockResolvedValue({
      ...baseStudyState,
      sessionPlan: null,
      objectiveList: null,
      studyPlan: null,
    });

    const prepared = await prepareTutorTurn(
      {
        db: createMockDb({}),
        env: { DEFAULT_TUTOR_MODEL: "test-model" },
      } as never,
      { ...baseInput, selectedNodeRefs: [] },
    );

    expect(prepared.promptContext.selectedNodeRefs).toEqual([]);
    expect(prepared.promptContext.additionalInstructions).toEqual(
      expect.arrayContaining(["[Turn Bootstrap]", "Selected refs: none", "[New session]"]),
    );
    expect(prepared.studyState).toEqual(
      expect.objectContaining({ studyPlan: null, sessionPlan: null }),
    );
  });
});
