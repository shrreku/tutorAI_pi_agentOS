import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentRuns, artifacts, concepts, notebooks, sources, tutorSessions, tutorTurns } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { registerTutorRoutes } from "./tutor.js";

const {
  appendEventMock,
  recordLearnerTraitSignalMock,
  runSessionMock,
  selectContextMock,
} = vi.hoisted(() => ({
  appendEventMock: vi.fn(async () => ({ id: "evt_1" })),
  recordLearnerTraitSignalMock: vi.fn(async (dbClient, signal) => ({ signal, eventId: "evt_trait_1" })),
  runSessionMock: vi.fn(),
  selectContextMock: vi.fn(),
}));

vi.mock("@studyagent/db", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/db")>("@studyagent/db");
  return {
    ...actual,
    appendEvent: appendEventMock,
  };
});

vi.mock("../auth.js", () => ({
  resolveActor: vi.fn(async () => ({ id: "user_1" })),
}));

vi.mock("../study-state.js", () => ({
  loadNotebookStudyState: vi.fn(async () => ({
    studentProfile: null,
    curriculum: null,
    module: null,
    objectiveList: null,
    sessionPlan: null,
    studyPlan: null,
    coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
    sourceLevels: [],
    learnerReadiness: [],
  })),
  formatLearnerStateSummary: vi.fn(() => null),
  formatStudyPlanSummary: vi.fn(() => null),
}));

vi.mock("../tutor-tool-provider.js", async () => {
  const actual = await vi.importActual<typeof import("../tutor-tool-provider.js")>("../tutor-tool-provider.js");
  return {
    ...actual,
    createTutorReadToolProvider: vi.fn(() => ({})),
    selectContextForTutor: selectContextMock,
  };
});

vi.mock("../tutor-write-provider.js", () => ({
  createTutorWriteToolProvider: vi.fn(() => ({})),
}));

vi.mock("../learner-trait-estimation.js", async () => {
  const actual = await vi.importActual<typeof import("../learner-trait-estimation.js")>("../learner-trait-estimation.js");
  return {
    ...actual,
    loadPersonalizationRecommendationsForTutorContext: vi.fn(async () => []),
  };
});

vi.mock("../learner-trait-store.js", async () => {
  const actual = await vi.importActual<typeof import("../learner-trait-store.js")>("../learner-trait-store.js");
  return {
    ...actual,
    recordLearnerTraitSignal: recordLearnerTraitSignalMock,
  };
});

vi.mock("@studyagent/agent-runtime", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/agent-runtime")>("@studyagent/agent-runtime");
  return {
    ...actual,
    runStudyAgentTutorSession: runSessionMock,
    createRuntimeToolRegistry: vi.fn(() => ({
      list: () => [],
      get: () => null,
    })),
  };
});

type SessionRow = {
  id: string;
  notebookId: string;
  userId: string;
  mode: string;
  status: string;
  selectedNodeRefsJson: unknown[];
  runtimeContextJson: Record<string, unknown>;
  startedAt: Date;
  endedAt: Date | null;
};

class FakeDb {
  notebooks = [{ id: "nb_1", ownerId: "user_1", title: "Notebook A" }];
  sources = [{ id: "src_1", notebookId: "nb_1" }];
  artifacts = [{ id: "artifact_1", notebookId: "nb_1" }];
  concepts = [{ id: "concept_1", notebookId: "nb_1" }];
  sessions: SessionRow[] = [];
  turns: Array<Record<string, unknown>> = [];
  agentRuns: Array<Record<string, unknown>> = [];

  select(selection?: unknown) {
    const db = this;
    return {
      from(table: unknown) {
        const makeTurnAggregate = () => {
          const maxTurnIndex = db.turns.length ? Number(db.turns[db.turns.length - 1]?.turnIndex ?? -1) : null;
          return [{ maxTurnIndex }];
        };
        return {
          where(_condition: unknown) {
            if (table === tutorTurns && selection && typeof selection === "object" && "maxTurnIndex" in (selection as Record<string, unknown>)) {
              return Promise.resolve(makeTurnAggregate());
            }
            return this;
          },
          orderBy(_order: unknown) {
            return this;
          },
          limit(limitCount: number) {
            if (table === notebooks) return Promise.resolve(db.notebooks.slice(0, limitCount));
            if (table === tutorSessions) return Promise.resolve(db.sessions.slice(0, limitCount));
            if (table === sources) return Promise.resolve(db.sources.slice(0, limitCount));
            if (table === artifacts) return Promise.resolve(db.artifacts.slice(0, limitCount));
            if (table === concepts) return Promise.resolve(db.concepts.slice(0, limitCount));
            if (table === tutorTurns) {
              if (selection && typeof selection === "object" && "maxTurnIndex" in (selection as Record<string, unknown>)) {
                return Promise.resolve(makeTurnAggregate());
              }
              return Promise.resolve(db.turns.slice(0, limitCount));
            }
            return Promise.resolve([]);
          },
        };
      },
    };
  }

  insert(table: unknown) {
    const db = this;
    return {
      values(values: Record<string, unknown>) {
        if (table === tutorSessions) {
          db.sessions.push({
            id: values.id as string,
            notebookId: values.notebookId as string,
            userId: values.userId as string,
            mode: values.mode as string,
            status: values.status as string,
            selectedNodeRefsJson: (values.selectedNodeRefsJson as unknown[]) ?? [],
            runtimeContextJson: (values.runtimeContextJson as Record<string, unknown>) ?? {},
            startedAt: values.startedAt as Date,
            endedAt: (values.endedAt as Date | null) ?? null,
          });
        } else if (table === tutorTurns) {
          db.turns.push(values);
        } else if (table === agentRuns) {
          db.agentRuns.push(values);
        }
        return Promise.resolve();
      },
    };
  }

  update(_table: unknown) {
    return {
      set(_values: Record<string, unknown>) {
        return {
          where(_condition: unknown) {
            return Promise.resolve();
          },
        };
      },
    };
  }
}

describe("tutor chat route", () => {
  let app = Fastify();
  let fakeDb: FakeDb;

  beforeEach(async () => {
    appendEventMock.mockClear();
    recordLearnerTraitSignalMock.mockClear();
    runSessionMock.mockReset();
    selectContextMock.mockReset();

    runSessionMock.mockImplementation(async function* () {
      yield {
        type: "message_complete",
        data: { text: "Tutor response", stopReason: "end_turn" },
      };
      yield {
        type: "run_complete",
        data: { runId: "run_x" },
      };
    });

    selectContextMock.mockResolvedValue({
      strategy: "selected-nodes-current-objective-weak-concepts-notebook",
      query: "teach me",
      retrievalMode: "hybrid",
      maxChunks: 6,
      selectedNodeRefs: [{ refType: "concept", refId: "concept_1" }],
      selectedChunkIds: ["chunk_1"],
      selectedSourceIds: ["src_1"],
      objectiveTitle: null,
      objectivePathConceptIds: [],
      weakConceptNames: [],
      recentMistakeConceptIds: [],
      reason: "selected objective and source context",
    });

    fakeDb = new FakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: { OPENROUTER_API_KEY: "key" },
    } as unknown as AppContext;

    app = Fastify();
    await registerTutorRoutes(app, ctx);
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates chat run, streams session started, and persists merged selected refs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/tutor/chat",
      payload: {
        messages: [{ role: "user", content: "teach me this" }],
        data: { activeMode: "learn", selectedNodeRefs: [{ refType: "source", refId: "src_1" }] },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["x-studyagent-session-id"]).toBeTruthy();
    expect(response.body).toContain("SESSION_STARTED");

    expect(fakeDb.turns).toHaveLength(1);
    const savedRefs = (fakeDb.turns[0]?.selectedNodeRefsJson as Array<{ refType: string; refId: string }>) ?? [];
    expect(savedRefs).toEqual(
      expect.arrayContaining([
        { refType: "source", refId: "src_1" },
        { refType: "concept", refId: "concept_1" },
        { refType: "chunk", refId: "chunk_1" },
      ]),
    );
  });

  it("preserves open artifact refs in tutor turn context", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/tutor/chat",
      payload: {
        messages: [{ role: "user", content: "explain this artifact" }],
        data: {
          activeMode: "learn",
          selectedNodeRefs: [
            { refType: "artifact", refId: "artifact_1" },
            { refType: "source", refId: "src_1" },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const savedRefs = (fakeDb.turns[0]?.selectedNodeRefsJson as Array<{ refType: string; refId: string }>) ?? [];
    expect(savedRefs).toEqual(expect.arrayContaining([{ refType: "artifact", refId: "artifact_1" }]));
  });

  it("emits context-selection failure telemetry and still completes chat", async () => {
    selectContextMock.mockRejectedValueOnce(new Error("retrieval unavailable"));

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/tutor/chat",
      payload: {
        messages: [{ role: "user", content: "teach me" }],
        data: { activeMode: "learn", selectedNodeRefs: [{ refType: "source", refId: "src_1" }] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("RUN_FINISHED");
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        notebookId: "nb_1",
        eventType: "session.context.selection_failed",
        payload: { message: "retrieval unavailable" },
      }),
    );
    const savedRefs = (fakeDb.turns[0]?.selectedNodeRefsJson as Array<{ refType: string; refId: string }>) ?? [];
    expect(savedRefs).toEqual([{ refType: "source", refId: "src_1" }]);
  });

  it("does not reuse a requested session from another notebook", async () => {
    fakeDb.notebooks.push({ id: "nb_2", ownerId: "user_1", title: "Notebook B" });
    fakeDb.sessions.push({
      id: "sess_other",
      notebookId: "nb_2",
      userId: "user_1",
      mode: "learn",
      status: "active",
      selectedNodeRefsJson: [],
      runtimeContextJson: { previous: true },
      startedAt: new Date(),
      endedAt: null,
    });

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/tutor/chat",
      payload: {
        messages: [{ role: "user", content: "teach me" }],
        data: { activeMode: "learn", sessionId: "sess_other", selectedNodeRefs: [] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-studyagent-session-id"]).not.toBe("sess_other");
    expect(fakeDb.sessions.some((session) => session.id !== "sess_other" && session.notebookId === "nb_1")).toBe(true);
  });

  it("drops selected refs that belong to another notebook", async () => {
    fakeDb.sources = [{ id: "src_other", notebookId: "nb_2" }];

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/tutor/chat",
      payload: {
        messages: [{ role: "user", content: "teach me" }],
        data: { activeMode: "learn", selectedNodeRefs: [{ refType: "source", refId: "src_other" }] },
      },
    });

    expect(response.statusCode).toBe(200);
    const savedRefs = (fakeDb.turns[0]?.selectedNodeRefsJson as Array<{ refType: string; refId: string }>) ?? [];
    expect(savedRefs).not.toContainEqual({ refType: "source", refId: "src_other" });
  });

  it("records explicit learner trait signals only after a completed tutor turn with turn and run evidence", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/tutor/chat",
      payload: {
        messages: [{ role: "user", content: "Please go slower, no rush." }],
        data: { activeMode: "learn", selectedNodeRefs: [] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(recordLearnerTraitSignalMock).toHaveBeenCalledTimes(1);
    const signal = recordLearnerTraitSignalMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(signal).toEqual(
      expect.objectContaining({
        notebookId: "nb_1",
        userId: "user_1",
        sessionId: expect.stringMatching(/^sess_/),
        turnId: expect.stringMatching(/^turn_/),
        runId: expect.stringMatching(/^run_/),
        trait: "pacePreference",
        suggestedValue: "slow",
      }),
    );
    expect(signal.evidenceRefs).toEqual([
      expect.objectContaining({
        refType: "session_trace",
        refId: signal.sessionId,
        summary: expect.stringContaining(String(signal.turnId)),
      }),
    ]);
  });

  it("does not record a durable learner trait signal for a generic example request", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/tutor/chat",
      payload: {
        messages: [{ role: "user", content: "Can you give me an example?" }],
        data: { activeMode: "learn", selectedNodeRefs: [] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(recordLearnerTraitSignalMock).not.toHaveBeenCalled();
  });

  it("does not record durable learner trait signals when the tutor turn fails", async () => {
    runSessionMock.mockImplementationOnce(async function* () {
      throw new Error("model unavailable");
    });

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/tutor/chat",
      payload: {
        messages: [{ role: "user", content: "Please go slower." }],
        data: { activeMode: "learn", selectedNodeRefs: [] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("RUN_ERROR");
    expect(recordLearnerTraitSignalMock).not.toHaveBeenCalled();
  });
});
