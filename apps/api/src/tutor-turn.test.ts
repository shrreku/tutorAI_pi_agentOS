import { describe, expect, it, vi, beforeEach } from "vitest";
import { agentRuns, objectiveLists, objectives, studyPlans, toolCalls, tutorSessions, tutorTurns } from "@studyagent/db";
import type { AppContext } from "./context.js";
import { executeTutorTurn } from "./tutor-turn.js";
import { resetLivePiSessionsForTests } from "@studyagent/agent-runtime";

const {
  appendEventMock,
  runSessionMock,
  replaceRuntimeMock,
  compactStudyContextMock,
  loadNotebookStudyStateMock,
  processCompletedTutorTurnLearnerTraitSignalsMock,
  loadRehydrationTranscriptMock,
} = vi.hoisted(() => ({
  appendEventMock: vi.fn(async () => ({ id: "evt_1" })),
  runSessionMock: vi.fn(),
  replaceRuntimeMock: vi.fn(async () => ({ replaced: false, disposedSessionId: null, binding: null })),
  compactStudyContextMock: vi.fn(() => ({
    compressedContext: "compressed-context",
    activeConceptIds: [],
    sourceIds: [],
    citationIds: [],
  })),
  loadNotebookStudyStateMock: vi.fn(),
  processCompletedTutorTurnLearnerTraitSignalsMock: vi.fn(async (_ctx: unknown, _input: unknown) => ({ explicitCount: 0, inferredCount: 0 })),
  loadRehydrationTranscriptMock: vi.fn(async (): Promise<Array<{ role: "user" | "assistant"; content: string }>> => []),
}));

vi.mock("@studyagent/db", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/db")>("@studyagent/db");
  return {
    ...actual,
    appendEvent: appendEventMock,
    grantTrialBudgetIfNeeded: vi.fn(async () => ({ granted: false, amountCents: 0 })),
  };
});

vi.mock("@studyagent/agent-runtime", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/agent-runtime")>("@studyagent/agent-runtime");
  return {
    ...actual,
    createRuntimeRun: vi.fn(() => ({
      runId: "run_1",
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      modelConfig: { model: "test-model" },
      budgets: {},
      traceId: "trace_1",
    })),
    replaceStudyAgentTutorRuntime: replaceRuntimeMock,
    runStudyAgentTutorSession: runSessionMock,
    buildStudyAgentHostStateSignature: vi.fn(() => "studyagent-host-state-v2:test-signature"),
    createAgUiEventMapper: actual.createAgUiEventMapper,
    serializeAgUiEventToSse: vi.fn((event: { type: string }) => `event: ${event.type}\n\n`),
    mapPiSessionEventToAppendInput: vi.fn(() => null),
    classifyRuntimeError: vi.fn((error: unknown) => ({
      code: "runtime_error",
      safeMessage: error instanceof Error ? error.message : String(error),
    })),
    compactStudyAgentContext: compactStudyContextMock,
  };
});

vi.mock("./study-state.js", () => ({
  loadNotebookStudyState: loadNotebookStudyStateMock,
}));

vi.mock("./pi-session-rehydration.js", () => ({
  loadRehydrationTranscript: loadRehydrationTranscriptMock,
}));

vi.mock("./learner-trait-signals.js", () => ({
  processCompletedTutorTurnLearnerTraitSignals: (ctx: unknown, input: unknown) =>
    processCompletedTutorTurnLearnerTraitSignalsMock(ctx, input),
}));

vi.mock("./hosted-beta/credit-reservation.js", () => ({
  TUTOR_TURN_ESTIMATE_CENTS: 10,
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    code = "credit_exhausted";
  },
  isCreditExhausted: vi.fn(async () => false),
  createReservation: vi.fn(async () => ({ id: "cres_test", status: "active" })),
  settleReservation: vi.fn(async () => ({ id: "cres_test", status: "settled" })),
  releaseReservation: vi.fn(async () => ({ id: "cres_test", status: "released" })),
  costCentsFromRuntimeUsage: vi.fn(() => 10),
}));

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
  sessions: SessionRow[] = [
    {
      id: "sess_1",
      notebookId: "nb_1",
      userId: "user_1",
      mode: "learn",
      status: "active",
      selectedNodeRefsJson: [],
      runtimeContextJson: {},
      startedAt: new Date("2026-05-15T00:00:00.000Z"),
      endedAt: null,
    },
  ];
  turns: Array<Record<string, unknown>> = [];
  runs: Array<Record<string, unknown>> = [];
  toolCalls: Array<Record<string, unknown>> = [];
  objectives: Array<Record<string, unknown>> = [];
  studyPlanRows: Array<Record<string, unknown>> = [];
  objectiveListRows: Array<Record<string, unknown>> = [];

  select(selection?: unknown) {
    const db = this;
    return {
      from(table: unknown) {
        return {
          where(_condition: unknown) {
            if (table === tutorTurns && selection && typeof selection === "object" && "maxTurnIndex" in selection) {
              return Promise.resolve([{ maxTurnIndex: db.turns.length ? Number(db.turns[db.turns.length - 1]?.turnIndex ?? -1) : null }]);
            }
            return this;
          },
          limit(limitCount: number) {
            if (table === tutorSessions) return Promise.resolve(db.sessions.slice(0, limitCount));
            if (table === tutorTurns) return Promise.resolve(db.turns.slice(0, limitCount));
            if (table === agentRuns) return Promise.resolve(db.runs.slice(0, limitCount));
            if (table === objectives) return Promise.resolve(db.objectives.slice(0, limitCount));
            if (table === studyPlans) return Promise.resolve(db.studyPlanRows.slice(0, limitCount));
            if (table === objectiveLists) return Promise.resolve(db.objectiveListRows.slice(0, limitCount));
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
        if (table === tutorTurns) {
          db.turns.push(values);
        } else if (table === agentRuns) {
          db.runs.push(values);
        } else if (table === toolCalls) {
          db.toolCalls.push(values);
        }
        return Promise.resolve();
      },
    };
  }

  update(table: unknown) {
    const db = this;
    return {
      set(values: Record<string, unknown>) {
        return {
          where(condition: unknown) {
            void condition;
            if (table === tutorTurns) {
              Object.assign(db.turns[0] ?? {}, values);
            } else if (table === agentRuns) {
              Object.assign(db.runs[0] ?? {}, values);
            } else if (table === toolCalls) {
              Object.assign(db.toolCalls[0] ?? {}, values);
            } else if (table === tutorSessions) {
              Object.assign(db.sessions[0] ?? {}, values);
            } else if (table === objectives) {
              Object.assign(db.objectives[0] ?? {}, values);
            } else if (table === studyPlans) {
              Object.assign(db.studyPlanRows[0] ?? {}, values);
            } else if (table === objectiveLists) {
              Object.assign(db.objectiveListRows[0] ?? {}, values);
            }
            return Promise.resolve();
          },
        };
      },
    };
  }
}

const progressionStudyState = {
  studentProfile: null,
  curriculum: null,
  module: null,
  objectiveList: {
    id: "olist_1",
    title: "Objective List",
    status: "active",
    currentObjectiveId: "objective_1",
    objectiveIdsOrdered: ["objective_1", "objective_2"],
  },
  sessionPlan: {
    id: "plan_1",
    title: "Session Plan",
    status: "active",
    sessionGoal: null,
    plannedObjectiveIds: ["objective_1", "objective_2"],
    teachingArcIds: [],
    teachingArcTitles: [],
    teachingArcBlockTypes: [],
  },
  studyPlan: {
    id: "study_plan_1",
    title: "Study Plan",
    status: "active",
    activeSessionId: null,
    currentObjective: { id: "objective_1", title: "Objective 1", status: "active" },
    upcomingObjectives: [{ id: "objective_2", title: "Objective 2", status: "not_started" }],
    completedObjectives: [],
    weakConcepts: [],
  },
  coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
  sourceLevels: [],
  learnerReadiness: [],
} as const;

describe("executeTutorTurn", () => {
  beforeEach(() => {
    appendEventMock.mockClear();
    runSessionMock.mockReset();
    loadNotebookStudyStateMock.mockReset();
    replaceRuntimeMock.mockClear();
    processCompletedTutorTurnLearnerTraitSignalsMock.mockClear();
    resetLivePiSessionsForTests();
    loadRehydrationTranscriptMock.mockReset();
    loadRehydrationTranscriptMock.mockResolvedValue([]);

    loadNotebookStudyStateMock.mockResolvedValue({
      studentProfile: null,
      curriculum: null,
      module: null,
      objectiveList: {
        id: "olist_1",
        title: "Objective List",
        status: "active",
        currentObjectiveId: "objective_1",
        objectiveIdsOrdered: ["objective_1", "objective_2"],
      },
      sessionPlan: {
        id: "plan_1",
        title: "Session Plan",
        status: "active",
        sessionGoal: null,
        plannedObjectiveIds: ["objective_1", "objective_2"],
        teachingArcIds: [],
        teachingArcTitles: [],
        teachingArcBlockTypes: [],
      },
      studyPlan: {
        id: "study_plan_1",
        title: "Study Plan",
        status: "active",
        activeSessionId: null,
        currentObjective: { id: "objective_1", title: "Objective 1", status: "active" },
        upcomingObjectives: [{ id: "objective_2", title: "Objective 2", status: "not_started" }],
        completedObjectives: [],
        weakConcepts: [],
      },
      coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [],
      learnerReadiness: [],
    });

    runSessionMock.mockImplementation(async function* () {
      yield {
        type: "message_complete",
        data: { text: "Tutor response", stopReason: "end_turn" },
      };
      yield {
        type: "run_complete",
        data: { runId: "run_1" },
      };
    });
  });

  it("adds a binding host-state signature before replacing cached runtime", async () => {
    const fakeDb = new FakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "teach me this",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Objective A",
        learnerProgressSummary: "Pace preference: slow.",
        additionalInstructions: ["Stay inside selected source."],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: null,
        sessionPlan: { id: "plan_1" },
        studyPlan: null,
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
        sourceLevels: [],
        learnerReadiness: [],
      } as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(replaceRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nextRun: expect.objectContaining({
          hostStateSignature: expect.stringMatching(/^studyagent-host-state-v2:/),
        }),
      }),
    );
    expect(runSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        run: expect.objectContaining({
          hostStateSignature: expect.stringMatching(/^studyagent-host-state-v2:/),
        }),
      }),
    );
  });

  it("executes a tutor turn without the route layer", async () => {
    const fakeDb = new FakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const emitted: Array<Record<string, unknown>> = [];
    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "teach me this",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Explore notebook resources",
        completedObjectivesCount: 0,
        nextObjectives: [],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: null,
        sessionPlan: { id: "plan_1" },
        studyPlan: null,
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [],
      learnerReadiness: [],
      } as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: (chunk) => {
        emitted.push(chunk);
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("completed");
    expect(result.runId).toBe("run_1");
    expect(emitted[0]).toMatchObject({ type: "SESSION_STARTED", sessionId: "sess_1", runId: "run_1" });
    expect(fakeDb.turns).toHaveLength(1);
    expect(fakeDb.turns[0]?.assistantMessage).toBe("Tutor response");
    expect(fakeDb.runs[0]?.status).toBe("completed");
    expect(fakeDb.sessions[0]?.runtimeContextJson).toMatchObject({
      sessionDigestDraft: null,
      lastRunId: "run_1",
    });
    expect(processCompletedTutorTurnLearnerTraitSignalsMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        notebookId: "nb_1",
        userId: "user_1",
        sessionId: "sess_1",
        userMessage: "teach me this",
        assistantMessage: "Tutor response",
      }),
    );
  });

  it("does not record learner trait signals when the tutor turn fails", async () => {
    runSessionMock.mockImplementationOnce(async function* () {
      yield { type: "run_error", data: { error: "model unavailable", code: "runtime_error" } };
    });

    const fakeDb = new FakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "Please go slower",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Explore notebook resources",
        completedObjectivesCount: 0,
        nextObjectives: [],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: null,
        sessionPlan: { id: "plan_1" },
        studyPlan: null,
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
        sourceLevels: [],
        learnerReadiness: [],
      } as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("failed");
    expect(processCompletedTutorTurnLearnerTraitSignalsMock).not.toHaveBeenCalled();
  });

  it("does not persist legacy context selection events into the turn summary", async () => {
    const fakeDb = new FakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "teach me this",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Explore notebook resources",
        completedObjectivesCount: 0,
        nextObjectives: [],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: null,
        sessionPlan: { id: "plan_1" },
        studyPlan: null,
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
        sourceLevels: [],
        learnerReadiness: [],
      } as never,
      contextSelection: {
        strategy: "selected-nodes-current-objective-weak-concepts-notebook",
        query: "teach me this",
        retrievalMode: "lexical",
        maxChunks: 6,
        selectedNodeRefs: [],
        selectedChunkIds: [],
        selectedSourceIds: [],
        objectiveTitle: null,
        objectivePathConceptIds: [],
        weakConceptNames: [],
        recentMistakeConceptIds: [],
        sourceScopePolicy: "soft_source_scope",
        usedSourceScopeFallback: false,
        sourceCoverageGap: false,
        reason: "No retrieval rows matched; continuing with notebook state.",
      },
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    const appendCalls = appendEventMock.mock.calls as unknown as Array<[unknown, { eventType?: string } | undefined]>;
    expect(appendCalls.some((call) => call[1]?.eventType === "session.context.selected")).toBe(false);
    expect(fakeDb.turns[0]?.toolSummaryJson).toEqual(
      expect.objectContaining({
        tools: [],
      }),
    );
    expect((fakeDb.turns[0]?.toolSummaryJson as Record<string, unknown>)?.contextSelection).toBeUndefined();
  });

  it("persists failed run and turn summary when runtime throws", async () => {
    runSessionMock.mockImplementation(async function* () {
      yield {
        type: "message_start",
        data: { runId: "run_1" },
      };
      throw new Error("provider unavailable");
    });

    const fakeDb = new FakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const emitted: Array<Record<string, unknown>> = [];
    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "teach me this",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Explore notebook resources",
        completedObjectivesCount: 0,
        nextObjectives: [],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: null,
        sessionPlan: { id: "plan_1" },
        studyPlan: null,
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [],
      learnerReadiness: [],
      } as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: (chunk) => {
        emitted.push(chunk);
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("failed");
    expect(result.failure).toEqual({ code: "runtime_error", error: "provider unavailable" });
    expect(emitted.some((event) => event.type === "RUN_ERROR")).toBe(true);
    expect(fakeDb.runs[0]?.status).toBe("failed");
    expect(fakeDb.turns[0]?.assistantMessage).toBe("provider unavailable");
    expect(fakeDb.turns[0]?.toolSummaryJson).toEqual({ tools: [] });
  });

  it("persists tool lifecycle output and artifact proposals behind the turn harness", async () => {
    runSessionMock.mockImplementation(async function* (input: {
      onToolLifecycleEvent?: (event: unknown) => Promise<void>;
    }) {
      await input.onToolLifecycleEvent?.({
        phase: "started",
        toolCallId: "tool_1",
        toolName: "artifact.create_note",
        sideEffectClass: "candidate_write",
        input: { title: "Entropy note" },
      });
      await input.onToolLifecycleEvent?.({
        phase: "completed",
        toolCallId: "tool_1",
        toolName: "artifact.create_note",
        output: {
          artifactId: "art_1",
          reducerResult: {
            accepted: true,
            mutationType: "artifact.created",
            appliedChanges: { artifactId: "art_1" },
            emittedEventIds: [],
          },
        },
        latencyMs: 12,
      });
      yield {
        type: "message_complete",
        data: { text: "I made a note.", stopReason: "end_turn" },
      };
      yield {
        type: "run_complete",
        data: { runId: "run_1" },
      };
    });

    const fakeDb = new FakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "make a note",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Explore notebook resources",
        completedObjectivesCount: 0,
        nextObjectives: [],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: null,
        sessionPlan: { id: "plan_1" },
        studyPlan: null,
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [],
      learnerReadiness: [],
      } as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("completed");
    expect(result.artifactProposalIds).toEqual(["art_1"]);
    expect(result.toolSummary).toEqual([
      { toolCallId: "tool_1", toolName: "artifact.create_note", status: "completed", latencyMs: 12 },
    ]);
    expect(fakeDb.toolCalls[0]).toMatchObject({
      id: "tool_1",
      runId: "run_1",
      sessionId: "sess_1",
      toolName: "artifact.create_note",
      status: "completed",
      latencyMs: 12,
      reducerResultJson: {
        accepted: true,
        mutationType: "artifact.created",
        appliedChanges: { artifactId: "art_1" },
        emittedEventIds: [],
      },
    });
    expect(fakeDb.turns[0]?.toolSummaryJson).toMatchObject({
      tools: [{ toolCallId: "tool_1", toolName: "artifact.create_note", status: "completed", latencyMs: 12 }],
    });
  });

  it("projects runtime events in the same order the fake runtime emits them", async () => {
    runSessionMock.mockImplementation(async function* (input: {
      onToolLifecycleEvent?: (event: unknown) => Promise<void>;
    }) {
      yield {
        type: "message_start",
        data: { runId: "run_1" },
      };
      yield {
        type: "message_delta",
        data: { text: "Hello" },
      };
      await input.onToolLifecycleEvent?.({
        phase: "started",
        toolCallId: "tool_1",
        toolName: "artifact.create_note",
        sideEffectClass: "candidate_write",
        input: { title: "Note" },
      });
      yield {
        type: "tool_call_start",
        data: { toolName: "artifact.create_note", toolCallId: "tool_1", args: { title: "Note" } },
      };
      yield {
        type: "tool_call_complete",
        data: {
          toolName: "artifact.create_note",
          toolCallId: "tool_1",
          args: { title: "Note" },
          result: { artifactId: "art_1", reducerResult: { accepted: true, mutationType: "artifact.created", appliedChanges: { artifactId: "art_1" }, emittedEventIds: [] } },
        },
      };
      yield {
        type: "message_delta",
        data: { text: " world" },
      };
      yield {
        type: "message_complete",
        data: { text: "Hello world", stopReason: "end_turn" },
      };
      yield {
        type: "run_complete",
        data: { runId: "run_1" },
      };
    });

    const fakeDb = new FakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const streamEvents: string[] = [];
    await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "teach me",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Explore notebook resources",
        completedObjectivesCount: 0,
        nextObjectives: [],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: null,
        sessionPlan: { id: "plan_1" },
        studyPlan: null,
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [],
      learnerReadiness: [],
      } as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: (event) => {
        streamEvents.push(String(event.type));
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(streamEvents).toEqual([
      "SESSION_STARTED",
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
  });

  it("records tool failure without losing the turn result", async () => {
    runSessionMock.mockImplementation(async function* (input: {
      onToolLifecycleEvent?: (event: unknown) => Promise<void>;
    }) {
      await input.onToolLifecycleEvent?.({
        phase: "started",
        toolCallId: "tool_1",
        toolName: "artifact.create_note",
        sideEffectClass: "candidate_write",
        input: { title: "Broken note" },
      });
      await input.onToolLifecycleEvent?.({
        phase: "failed",
        toolCallId: "tool_1",
        toolName: "artifact.create_note",
        error: "validation failed",
        code: "tool_validation_failed",
        latencyMs: 8,
      });
      yield {
        type: "message_complete",
        data: { text: "I could not finish that write.", stopReason: "end_turn" },
      };
      yield {
        type: "run_complete",
        data: { runId: "run_1" },
      };
    });

    const fakeDb = new FakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "make a note",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Explore notebook resources",
        completedObjectivesCount: 0,
        nextObjectives: [],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: null,
        sessionPlan: { id: "plan_1" },
        studyPlan: null,
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [],
      learnerReadiness: [],
      } as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("completed");
    expect(fakeDb.toolCalls[0]).toMatchObject({
      id: "tool_1",
      status: "failed",
      outputJson: { error: "validation failed", code: "tool_validation_failed" },
    });
    expect(result.toolSummary).toEqual([
      { toolCallId: "tool_1", toolName: "artifact.create_note", status: "failed", latencyMs: 8 },
    ]);
    expect(result.assistantMessage).toBe("I could not finish that write.");
  });

  it("does not complete an Objective from vague learner confirmation alone", async () => {
    runSessionMock.mockImplementation(async function* (input: {
      onToolLifecycleEvent?: (event: unknown) => Promise<void>;
    }) {
      await input.onToolLifecycleEvent?.({
        phase: "started",
        toolCallId: "tool_1",
        toolName: "artifact.create_note",
        sideEffectClass: "candidate_write",
        input: { title: "Objective note" },
      });
      await input.onToolLifecycleEvent?.({
        phase: "completed",
        toolCallId: "tool_1",
        toolName: "artifact.create_note",
        output: {
          artifactId: "art_1",
          reducerResult: {
            accepted: true,
            mutationType: "artifact.created",
            appliedChanges: { artifactId: "art_1" },
            emittedEventIds: [],
          },
        },
        latencyMs: 12,
      });
      yield {
        type: "message_complete",
        data: { text: "Got it, and I made a note.", stopReason: "end_turn" },
      };
      yield {
        type: "run_complete",
        data: { runId: "run_1" },
      };
    });

    const fakeDb = new FakeDb();
    fakeDb.objectives = [{ id: "objective_1", notebookId: "nb_1", status: "active" }];
    fakeDb.studyPlanRows = [{ id: "study_plan_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    fakeDb.objectiveListRows = [{ id: "olist_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "got it",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Objective 1",
        completedObjectivesCount: 0,
        nextObjectives: ["Objective 2"],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: {
          id: "olist_1",
          title: "Objective List",
          status: "active",
          currentObjectiveId: "objective_1",
          objectiveIdsOrdered: ["objective_1", "objective_2"],
        },
        sessionPlan: {
          id: "plan_1",
          title: "Session Plan",
          status: "active",
          sessionGoal: null,
          plannedObjectiveIds: ["objective_1", "objective_2"],
          teachingArcIds: [],
          teachingArcTitles: [],
          teachingArcBlockTypes: [],
        },
        studyPlan: {
          id: "study_plan_1",
          title: "Study Plan",
          status: "active",
          activeSessionId: null,
          currentObjective: { id: "objective_1", title: "Objective 1", status: "active" },
          upcomingObjectives: [{ id: "objective_2", title: "Objective 2", status: "not_started" }],
          completedObjectives: [],
          weakConcepts: [],
        },
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [],
      learnerReadiness: [],
      } as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("completed");
    expect(result.artifactProposalIds).toEqual(["art_1"]);
    expect(fakeDb.objectives[0]).toMatchObject({ status: "active" });
    expect(fakeDb.studyPlanRows[0]).toMatchObject({ currentObjectiveId: "objective_1" });
    expect(fakeDb.objectiveListRows[0]).toMatchObject({ currentObjectiveId: "objective_1" });
    const appendCalls = appendEventMock.mock.calls as unknown as Array<[unknown, { eventType?: string }]>;
    expect(appendCalls.some(([, event]) => event.eventType === "objective.completed")).toBe(false);
    expect(appendCalls.some(([, event]) => event.eventType === "study_plan.updated")).toBe(false);
  });

  it.each(["continue", "makes sense"])("does not complete an Objective from %s acknowledgement alone", async (message) => {
    runSessionMock.mockImplementation(async function* () {
      yield {
        type: "message_complete",
        data: { text: "Sure, let's keep going.", stopReason: "end_turn" },
      };
      yield {
        type: "run_complete",
        data: { runId: "run_1" },
      };
    });

    const fakeDb = new FakeDb();
    fakeDb.objectives = [{ id: "objective_1", notebookId: "nb_1", status: "active" }];
    fakeDb.studyPlanRows = [{ id: "study_plan_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    fakeDb.objectiveListRows = [{ id: "olist_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message,
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Objective 1",
        completedObjectivesCount: 0,
        nextObjectives: ["Objective 2"],
        additionalInstructions: [],
      },
      studyState: progressionStudyState as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(fakeDb.objectives[0]).toMatchObject({ status: "active" });
    const appendCalls = appendEventMock.mock.calls as unknown as Array<[unknown, { eventType?: string }]>;
    expect(appendCalls.some(([, event]) => event.eventType === "objective.completed")).toBe(false);
  });

  it("does not complete an Objective after weak incorrect mastery evidence from a quiz check", async () => {
    const fakeDb = new FakeDb();
    fakeDb.objectives = [{ id: "objective_1", notebookId: "nb_1", status: "active" }];
    fakeDb.studyPlanRows = [{ id: "study_plan_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    fakeDb.objectiveListRows = [{ id: "olist_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "Heat always flows from cold to hot regions.",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Objective 1",
        completedObjectivesCount: 0,
        nextObjectives: ["Objective 2"],
        additionalInstructions: [],
      },
      studyState: progressionStudyState as never,
      previousRuntimeContext: {
        lastRuntimeMasteryEvidence: {
          evidenceId: "mev_weak",
          objectiveId: "objective_1",
          correctnessLabel: "incorrect",
          overallScore: 0.25,
          confidence: 0.85,
          uncertainty: 0.15,
          readiness: "developing",
          tutoringIntervention: "reteach",
        },
      },
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("completed");
    expect(fakeDb.objectives[0]).toMatchObject({ status: "active" });
    const appendCalls = appendEventMock.mock.calls as unknown as Array<[unknown, { eventType?: string }]>;
    expect(appendCalls.some(([, event]) => event.eventType === "objective.completed")).toBe(false);
  });

  it("completes an Objective when recent strong Mastery Evidence supports advancement", async () => {
    const fakeDb = new FakeDb();
    fakeDb.objectives = [{ id: "objective_1", notebookId: "nb_1", status: "active" }];
    fakeDb.studyPlanRows = [{ id: "study_plan_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    fakeDb.objectiveListRows = [{ id: "olist_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "next",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Objective 1",
        completedObjectivesCount: 0,
        nextObjectives: ["Objective 2"],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: {
          id: "olist_1",
          title: "Objective List",
          status: "active",
          currentObjectiveId: "objective_1",
          objectiveIdsOrdered: ["objective_1", "objective_2"],
        },
        sessionPlan: {
          id: "plan_1",
          title: "Session Plan",
          status: "active",
          sessionGoal: null,
          plannedObjectiveIds: ["objective_1", "objective_2"],
          teachingArcIds: [],
          teachingArcTitles: [],
          teachingArcBlockTypes: [],
        },
        studyPlan: {
          id: "study_plan_1",
          title: "Study Plan",
          status: "active",
          activeSessionId: null,
          currentObjective: { id: "objective_1", title: "Objective 1", status: "active" },
          upcomingObjectives: [{ id: "objective_2", title: "Objective 2", status: "not_started" }],
          completedObjectives: [],
          weakConcepts: [],
        },
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
        sourceLevels: [],
        learnerReadiness: [],
      } as never,
      previousRuntimeContext: {
        lastRuntimeMasteryEvidence: {
          evidenceId: "mev_strong",
          objectiveId: "objective_1",
          correctnessLabel: "correct",
          overallScore: 0.92,
          confidence: 0.86,
          uncertainty: 0.12,
          readiness: "advanced",
          tutoringIntervention: "advance",
        },
      },
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("completed");
    expect(fakeDb.objectives[0]).toMatchObject({ status: "completed" });
    expect(fakeDb.studyPlanRows[0]).toMatchObject({
      currentObjectiveId: "objective_2",
      completedObjectiveIds: ["objective_1"],
      progressSummaryJson: expect.objectContaining({
        lastCompletedObjectiveId: "objective_1",
        masteryEvidenceId: "mev_strong",
      }),
    });
    expect(fakeDb.objectiveListRows[0]).toMatchObject({ currentObjectiveId: "objective_2" });
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "objective.completed",
        payload: expect.objectContaining({ reason: "mastery_evidence", masteryEvidenceId: "mev_strong" }),
      }),
    );
  });

  it("completes an Objective after a correct quiz check produces strong Mastery Evidence", async () => {
    const fakeDb = new FakeDb();
    fakeDb.objectives = [{ id: "objective_1", notebookId: "nb_1", status: "active" }];
    fakeDb.studyPlanRows = [{ id: "study_plan_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    fakeDb.objectiveListRows = [{ id: "olist_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "The derivative at a point is the limit of the difference quotient.",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Objective 1",
        completedObjectivesCount: 0,
        nextObjectives: ["Objective 2"],
        additionalInstructions: [],
      },
      studyState: progressionStudyState as never,
      previousRuntimeContext: {
        lastRuntimeMasteryEvidence: {
          evidenceId: "mev_quiz_correct",
          objectiveId: "objective_1",
          correctnessLabel: "correct",
          overallScore: 0.91,
          confidence: 0.88,
          uncertainty: 0.12,
          readiness: "proficient",
          tutoringIntervention: "advance",
          triggerSource: "quiz_attempt",
        },
      },
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("completed");
    expect(fakeDb.objectives[0]).toMatchObject({ status: "completed" });
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "objective.completed",
        payload: expect.objectContaining({ reason: "mastery_evidence", masteryEvidenceId: "mev_quiz_correct" }),
      }),
    );
  });

  it("does not complete an Objective from borderline failing Mastery Evidence", async () => {
    const fakeDb = new FakeDb();
    fakeDb.objectives = [{ id: "objective_1", notebookId: "nb_1", status: "active" }];
    fakeDb.studyPlanRows = [{ id: "study_plan_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    fakeDb.objectiveListRows = [{ id: "olist_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "next",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Objective 1",
        completedObjectivesCount: 0,
        nextObjectives: ["Objective 2"],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: {
          id: "olist_1",
          title: "Objective List",
          status: "active",
          currentObjectiveId: "objective_1",
          objectiveIdsOrdered: ["objective_1", "objective_2"],
        },
        sessionPlan: {
          id: "plan_1",
          title: "Session Plan",
          status: "active",
          sessionGoal: null,
          plannedObjectiveIds: ["objective_1", "objective_2"],
          teachingArcIds: [],
          teachingArcTitles: [],
          teachingArcBlockTypes: [],
        },
        studyPlan: {
          id: "study_plan_1",
          title: "Study Plan",
          status: "active",
          activeSessionId: null,
          currentObjective: { id: "objective_1", title: "Objective 1", status: "active" },
          upcomingObjectives: [{ id: "objective_2", title: "Objective 2", status: "not_started" }],
          completedObjectives: [],
          weakConcepts: [],
        },
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
        sourceLevels: [],
        learnerReadiness: [],
      } as never,
      previousRuntimeContext: {
        lastRuntimeMasteryEvidence: {
          evidenceId: "mev_borderline",
          objectiveId: "objective_1",
          correctnessLabel: "partially_correct",
          overallScore: 0.52,
          confidence: 0.55,
          uncertainty: 0.45,
          readiness: "developing",
          tutoringIntervention: "reteach",
        },
      },
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("completed");
    expect(fakeDb.objectives[0]).toMatchObject({ status: "active" });
    const appendCalls = appendEventMock.mock.calls as unknown as Array<[unknown, { eventType?: string }]>;
    expect(appendCalls.some(([, event]) => event.eventType === "objective.completed")).toBe(false);
  });

  it("skips progression on a no-op tutor turn", async () => {
    runSessionMock.mockImplementation(async function* () {
      yield {
        type: "message_complete",
        data: { text: "Here is a review.", stopReason: "end_turn" },
      };
      yield {
        type: "run_complete",
        data: { runId: "run_1" },
      };
    });

    const fakeDb = new FakeDb();
    fakeDb.objectives = [{ id: "objective_1", notebookId: "nb_1", status: "active" }];
    fakeDb.studyPlanRows = [{ id: "study_plan_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    fakeDb.objectiveListRows = [{ id: "olist_1", notebookId: "nb_1", currentObjectiveId: "objective_1" }];
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const result = await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "teach me more",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Objective 1",
        completedObjectivesCount: 0,
        nextObjectives: ["Objective 2"],
        additionalInstructions: [],
      },
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: {
          id: "olist_1",
          title: "Objective List",
          status: "active",
          currentObjectiveId: "objective_1",
          objectiveIdsOrdered: ["objective_1", "objective_2"],
        },
        sessionPlan: {
          id: "plan_1",
          title: "Session Plan",
          status: "active",
          sessionGoal: null,
          plannedObjectiveIds: ["objective_1", "objective_2"],
          teachingArcIds: [],
          teachingArcTitles: [],
          teachingArcBlockTypes: [],
        },
        studyPlan: {
          id: "study_plan_1",
          title: "Study Plan",
          status: "active",
          activeSessionId: null,
          currentObjective: { id: "objective_1", title: "Objective 1", status: "active" },
          upcomingObjectives: [{ id: "objective_2", title: "Objective 2", status: "not_started" }],
          completedObjectives: [],
          weakConcepts: [],
        },
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [],
      learnerReadiness: [],
      } as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(result.status).toBe("completed");
    expect(fakeDb.objectives[0]).toMatchObject({ status: "active" });
    expect(fakeDb.studyPlanRows[0]).toMatchObject({ currentObjectiveId: "objective_1" });
    const appendCalls = appendEventMock.mock.calls as unknown as Array<[unknown, { eventType?: string }]>;
    expect(appendCalls.some(([, event]) => event.eventType === "objective.completed")).toBe(false);
    expect(appendCalls.some(([, event]) => event.eventType === "study_plan.updated")).toBe(false);
  });

  it("rehydrates prior session turns when no live Pi runtime exists", async () => {
    runSessionMock.mockImplementation(async function* () {
      yield {
        type: "message_complete",
        data: { text: "Continuing from before.", stopReason: "end_turn" },
      };
      yield {
        type: "run_complete",
        data: { runId: "run_1" },
      };
    });

    const fakeDb = new FakeDb();
    fakeDb.turns.push({
      id: "turn_prev",
      sessionId: "sess_1",
      turnIndex: 0,
      userMessage: "Remind me what we covered",
      assistantMessage: "We covered derivatives.",
      toolSummaryJson: {
        tools: [{ toolName: "wiki.search", status: "completed", latencyMs: 12 }],
      },
    });
    loadRehydrationTranscriptMock.mockResolvedValueOnce([
      { role: "user", content: "Remind me what we covered" },
      {
        role: "assistant",
        content: "We covered derivatives.\n\n[Tool summary]\n- wiki.search (completed, 12ms)",
      },
    ]);

    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
        TUTOR_REHYDRATE_TURN_LIMIT: 5,
      },
    } as unknown as AppContext;

    await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      message: "Continue",
      promptContext: {
        notebookTitle: "Notebook A",
        activeMode: "learn",
        selectedNodeRefs: [],
        currentObjective: "Objective 1",
        completedObjectivesCount: 0,
        nextObjectives: [],
        additionalInstructions: [],
      },
      studyState: progressionStudyState as never,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      run: {
        runId: "run_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        userId: "user_1",
        activeMode: "learn",
        selectedNodeRefs: [],
        modelConfig: { model: "test-model" },
        budgets: {},
        traceId: "trace_1",
      } as never,
    });

    expect(runSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialMessages: [
          { role: "user", content: "Remind me what we covered" },
          {
            role: "assistant",
            content: "We covered derivatives.\n\n[Tool summary]\n- wiki.search (completed, 12ms)",
          },
        ],
      }),
    );
  });
});
