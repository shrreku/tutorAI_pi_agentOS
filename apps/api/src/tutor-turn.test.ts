import { describe, expect, it, vi, beforeEach } from "vitest";
import { agentRuns, objectiveLists, objectives, studyPlans, toolCalls, tutorSessions, tutorTurns } from "@studyagent/db";
import type { AppContext } from "./context.js";
import { executeTutorTurn } from "./tutor-turn.js";

const { appendEventMock, runSessionMock, compactStudyContextMock, loadNotebookStudyStateMock } = vi.hoisted(() => ({
  appendEventMock: vi.fn(async () => ({ id: "evt_1" })),
  runSessionMock: vi.fn(),
  compactStudyContextMock: vi.fn(() => ({
    compressedContext: "compressed-context",
    activeConceptIds: [],
    sourceIds: [],
    citationIds: [],
  })),
  loadNotebookStudyStateMock: vi.fn(),
}));

vi.mock("@studyagent/db", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/db")>("@studyagent/db");
  return {
    ...actual,
    appendEvent: appendEventMock,
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
    replaceStudyAgentTutorRuntime: vi.fn(async () => undefined),
    runStudyAgentTutorSession: runSessionMock,
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

describe("executeTutorTurn", () => {
  beforeEach(() => {
    appendEventMock.mockClear();
    runSessionMock.mockReset();
    loadNotebookStudyStateMock.mockReset();

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
      sessionDigestDraft: expect.objectContaining({ summary: "Tutor response" }),
      lastRunId: "run_1",
    });
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

  it("crystallizes progression after a normal tutor answer and Artifact creation", async () => {
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
    expect(fakeDb.objectives[0]).toMatchObject({ status: "completed" });
    expect(fakeDb.studyPlanRows[0]).toMatchObject({
      currentObjectiveId: "objective_2",
      completedObjectiveIds: ["objective_1"],
      progressSummaryJson: expect.objectContaining({
        lastCompletedObjectiveId: "objective_1",
        lastCompletedObjectiveTitle: "Objective 1",
      }),
    });
    expect(fakeDb.objectiveListRows[0]).toMatchObject({ currentObjectiveId: "objective_2" });
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "objective.completed" }),
    );
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "study_plan.updated" }),
    );
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
});
