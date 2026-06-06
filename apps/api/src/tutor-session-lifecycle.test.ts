import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerTraitSignal } from "@studyagent/schemas";
import { tutorSessions, tutorTurns } from "@studyagent/db";
import {
  completeTutorSessionLifecycle,
  completeTutorSessionLifecycleForRequest,
  pauseTutorSessionLifecycle,
  resumeTutorSessionLifecycle,
} from "./tutor-session-lifecycle.js";

const planLearnerTraitEstimationMock = vi.fn(async (_db: unknown, _input: unknown) => ({}));
const persistLearnerTraitEstimationPlanMock = vi.fn(async (_db: unknown, _plan: unknown) => undefined);
const runLearnerTraitEstimationCycleMock = vi.fn(async (_input: unknown) => ({
  plan: { decision: "skip", trigger: { shouldEstimate: false, reasons: [], evidenceRefs: [], traitFamilies: [] } },
  trigger: { shouldEstimate: false, reasons: [], evidenceRefs: [], traitFamilies: [] },
  proposals: [],
  guardrailDecisions: [],
  persistedEstimateIds: [],
}));
const crystallizeTutorSessionMock = vi.fn(async (_input: unknown) => ({ artifactId: "artifact_1" }));
const appendEventMock = vi.fn(async (_db: unknown, _event: unknown) => ({ id: "evt_1" }));
const disposeRuntimeMock = vi.fn(async (_sessionId: unknown) => undefined);

vi.mock("./learner-trait-estimation-planner.js", () => ({
  planLearnerTraitEstimation: (db: unknown, input: unknown) => planLearnerTraitEstimationMock(db, input),
  persistLearnerTraitEstimationPlan: (db: unknown, plan: unknown) => persistLearnerTraitEstimationPlanMock(db, plan),
}));

vi.mock("./learner-trait-estimation.js", async () => {
  const actual = await vi.importActual<typeof import("./learner-trait-estimation.js")>("./learner-trait-estimation.js");
  return {
    ...actual,
    runLearnerTraitEstimationCycle: (input: unknown) => runLearnerTraitEstimationCycleMock(input),
  };
});

vi.mock("./tutor-session-crystallization.js", () => ({
  crystallizeTutorSession: (input: unknown) => crystallizeTutorSessionMock(input),
}));

vi.mock("@studyagent/db", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/db")>("@studyagent/db");
  return {
    ...actual,
    appendEvent: (db: unknown, event: unknown) => appendEventMock(db, event),
  };
});

vi.mock("@studyagent/agent-runtime", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/agent-runtime")>("@studyagent/agent-runtime");
  return {
    ...actual,
    disposeStudyAgentTutorSession: vi.fn(async () => undefined),
  };
});

function signal(source: LearnerTraitSignal["source"] = "tutor_observation"): LearnerTraitSignal {
  return {
    id: "lts_1",
    notebookId: "nb_1",
    userId: "user_1",
    source,
    trait: "helpSeekingStyle",
    suggestedValue: "avoids_help",
    strength: 0.7,
    confidence: 0.65,
    evidenceRefs: [{ refType: "tutor_observation", refId: "turn_1" }],
    internalVisibility: true,
    observedAt: "2026-05-25T08:00:00.000Z",
  } as LearnerTraitSignal;
}

function createDbClient(lastTurn: Record<string, unknown> | null) {
  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => (table === tutorTurns && lastTurn ? [lastTurn] : []),
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: async () => undefined,
        }),
      }),
    },
  } as never;
}

describe("tutor session lifecycle trait estimation", () => {
  beforeEach(() => {
    planLearnerTraitEstimationMock.mockReset();
    persistLearnerTraitEstimationPlanMock.mockClear();
    runLearnerTraitEstimationCycleMock.mockClear();
    crystallizeTutorSessionMock.mockClear();
    appendEventMock.mockClear();
    disposeRuntimeMock.mockClear();
  });

  it("plans and skips trait estimation when a session ends without turns", async () => {
    planLearnerTraitEstimationMock.mockResolvedValue({
      planId: "ltplan_skip",
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      decision: "skip",
      skipReason: "ended_without_turns",
      trigger: { shouldEstimate: false, reasons: [], evidenceRefs: [], traitFamilies: [] },
      plannedAt: "2026-05-25T09:00:00.000Z",
    });

    const result = await completeTutorSessionLifecycle(createDbClient(null), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      runtimeContextJson: {},
      disposeRuntime: disposeRuntimeMock,
    });

    expect(result).toEqual({ status: "completed", artifactId: null, reason: "ended_without_turns" });
    expect(planLearnerTraitEstimationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ endedWithoutTurns: true, sessionId: "sess_1" }),
    );
    expect(persistLearnerTraitEstimationPlanMock).toHaveBeenCalledTimes(1);
    expect(runLearnerTraitEstimationCycleMock).not.toHaveBeenCalled();
    expect(crystallizeTutorSessionMock).not.toHaveBeenCalled();
  });

  it("always runs the estimation cycle planner before crystallization, even without an estimator client", async () => {
    runLearnerTraitEstimationCycleMock.mockResolvedValue({
      plan: {
        planId: "ltplan_skip",
        decision: "skip",
        skipReason: "one_off_low_signal_observation",
        trigger: { shouldEstimate: false, reasons: [], evidenceRefs: [], traitFamilies: [] },
      },
      trigger: { shouldEstimate: false, reasons: [], evidenceRefs: [], traitFamilies: [] },
      proposals: [],
      guardrailDecisions: [],
      persistedEstimateIds: [],
    } as never);

    const result = await completeTutorSessionLifecycle(createDbClient({
      id: "turn_1",
      userMessage: "hello",
      assistantMessage: "Hi there",
      turnIndex: 0,
    }), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      runtimeContextJson: {},
      disposeRuntime: disposeRuntimeMock,
    });

    expect(result.reason).toBe("crystallized");
    expect(crystallizeTutorSessionMock).toHaveBeenCalledTimes(1);
    expect(runLearnerTraitEstimationCycleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        notebookId: "nb_1",
        userId: "user_1",
        sessionId: "sess_1",
      }),
    );
    const firstCycleCall = runLearnerTraitEstimationCycleMock.mock.calls[0] as unknown[] | undefined;
    expect(firstCycleCall?.[0]).not.toHaveProperty("estimator");
  });

  it("passes the estimator through the estimation cycle when configured", async () => {
    const estimator = { propose: vi.fn(async () => []) };
    runLearnerTraitEstimationCycleMock.mockResolvedValue({
      plan: {
        planId: "ltplan_run",
        decision: "run",
        trigger: { shouldEstimate: true, reasons: ["explicit_preference_change"], evidenceRefs: [], traitFamilies: ["pacePreference"] },
      },
      trigger: { shouldEstimate: true, reasons: ["explicit_preference_change"], evidenceRefs: [], traitFamilies: ["pacePreference"] },
      proposals: [],
      guardrailDecisions: [],
      persistedEstimateIds: [],
    } as never);

    await completeTutorSessionLifecycle(createDbClient({
      id: "turn_1",
      userMessage: "Please go slower",
      assistantMessage: "Sure, we can take smaller steps.",
      turnIndex: 0,
    }), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      runtimeContextJson: {},
      estimator,
      disposeRuntime: disposeRuntimeMock,
    });

    expect(runLearnerTraitEstimationCycleMock).toHaveBeenCalledWith(
      expect.objectContaining({ estimator }),
    );
  });

  it("returns an estimation boundary without crystallizing when phase is estimation", async () => {
    runLearnerTraitEstimationCycleMock.mockResolvedValue({
      plan: {
        planId: "ltplan_run",
        decision: "run",
        trigger: { shouldEstimate: true, reasons: ["explicit_preference_change"], evidenceRefs: [], traitFamilies: ["pacePreference"] },
      },
      trigger: { shouldEstimate: true, reasons: ["explicit_preference_change"], evidenceRefs: [], traitFamilies: ["pacePreference"] },
      proposals: [],
      guardrailDecisions: [],
      persistedEstimateIds: [],
    } as never);

    const updateWhere = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const dbClient = {
      db: {
        select: () => ({
          from: (table: unknown) => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => (table === tutorTurns ? [{
                  id: "turn_1",
                  userMessage: "Please go slower",
                  assistantMessage: "Sure, we can take smaller steps.",
                  turnIndex: 0,
                }] : []),
              }),
            }),
          }),
        }),
        update,
      },
    } as never;

    const result = await completeTutorSessionLifecycle(dbClient, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      runtimeContextJson: {},
      phase: "estimation",
      disposeRuntime: disposeRuntimeMock,
    });

    expect(result).toEqual({ status: "estimation_boundary", artifactId: null, reason: "estimation_complete" });
    expect(crystallizeTutorSessionMock).not.toHaveBeenCalled();
    expect(disposeRuntimeMock).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      runtimeContextJson: expect.objectContaining({ estimationBoundaryComplete: true }),
    }));
  });

  it("crystallizes without re-running estimation when phase is crystallization", async () => {
    const result = await completeTutorSessionLifecycle(createDbClient({
      id: "turn_1",
      userMessage: "hello",
      assistantMessage: "Hi there",
      turnIndex: 0,
    }), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      runtimeContextJson: { estimationBoundaryComplete: true },
      phase: "crystallization",
      disposeRuntime: disposeRuntimeMock,
    });

    expect(result.reason).toBe("crystallized");
    expect(runLearnerTraitEstimationCycleMock).not.toHaveBeenCalled();
    expect(crystallizeTutorSessionMock).toHaveBeenCalledTimes(1);
  });

  it("pauses an active session and disposes runtime", async () => {
    const updateWhere = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const disposeRuntime = vi.fn(async () => undefined);
    const dbClient = { db: { update } } as never;

    const result = await pauseTutorSessionLifecycle(dbClient, {
      notebookId: "nb_1",
      sessionId: "sess_1",
      disposeRuntime,
    });

    expect(result).toEqual({ sessionId: "sess_1", status: "paused" });
    expect(set).toHaveBeenCalledWith({ status: "paused" });
    expect(disposeRuntime).toHaveBeenCalledWith("sess_1");
    expect(appendEventMock).toHaveBeenCalledWith(
      dbClient,
      expect.objectContaining({ eventType: "session.focus.updated", payload: { action: "paused", sessionId: "sess_1" } }),
    );
  });

  it("resumes a paused session and replaces runtime", async () => {
    const updateWhere = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const dbClient = { db: { update } } as never;
    const replaceRuntime = vi.fn(async () => ({ replaced: true, disposedSessionId: "sess_1", binding: null }));

    const result = await resumeTutorSessionLifecycle(dbClient, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      mode: "learn",
      selectedNodeRefs: [{ refType: "concept", refId: "concept_1" }],
      model: "test-model",
      replaceRuntime,
    });

    expect(result).toEqual({ sessionId: "sess_1", status: "active" });
    expect(replaceRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        previousSessionId: "sess_1",
        nextRun: expect.objectContaining({
          notebookId: "nb_1",
          sessionId: "sess_1",
          userId: "user_1",
          activeMode: "learn",
        }),
      }),
    );
    expect(appendEventMock).toHaveBeenCalledWith(
      dbClient,
      expect.objectContaining({ eventType: "session.focus.updated", payload: { action: "resumed", sessionId: "sess_1" } }),
    );
  });

  it("emits session.runtime.replacement_failed when resume runtime replacement throws", async () => {
    const updateWhere = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const dbClient = { db: { update } } as never;
    const replaceRuntime = vi.fn(async () => {
      throw new Error("replacement failed");
    });

    const result = await resumeTutorSessionLifecycle(dbClient, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      mode: "learn",
      selectedNodeRefs: [],
      model: "test-model",
      replaceRuntime,
    });

    expect(result).toEqual({ sessionId: "sess_1", status: "active" });
    expect(appendEventMock).toHaveBeenCalledWith(
      dbClient,
      expect.objectContaining({
        eventType: "session.runtime.replacement_failed",
        payload: { error: "replacement failed" },
      }),
    );
  });

  it("leaves session paused and records disposal failure when runtime disposal throws", async () => {
    const updateWhere = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const dbClient = { db: { update } } as never;
    const disposeRuntime = vi.fn(async () => {
      throw new Error("disposal failed");
    });

    const result = await pauseTutorSessionLifecycle(dbClient, {
      notebookId: "nb_1",
      sessionId: "sess_1",
      disposeRuntime,
    });

    expect(result).toEqual({ sessionId: "sess_1", status: "paused" });
    expect(set).toHaveBeenCalledWith({ status: "paused" });
    expect(disposeRuntime).toHaveBeenCalledWith("sess_1");
    expect(appendEventMock).toHaveBeenCalledWith(
      dbClient,
      expect.objectContaining({
        eventType: "session.runtime.disposal_failed",
        payload: { error: "disposal failed" },
      }),
    );
    expect(appendEventMock).toHaveBeenCalledWith(
      dbClient,
      expect.objectContaining({ eventType: "session.focus.updated", payload: { action: "paused", sessionId: "sess_1" } }),
    );
  });

  it("does not crystallize twice when completing an already completed session via request resolver", async () => {
    const dbClient = {
      db: {
        select: () => ({
          from: (table: unknown) => ({
            where: () => ({
              limit: async () => (table === tutorSessions
                ? [{ id: "sess_done", notebookId: "nb_1", userId: "user_1", status: "completed", runtimeContextJson: {}, selectedNodeRefsJson: [], mode: "learn" }]
                : []),
              orderBy: () => ({
                limit: async () => [],
              }),
            }),
          }),
        }),
      },
    } as never;

    const result = await completeTutorSessionLifecycleForRequest(dbClient, {
      notebookId: "nb_1",
      userId: "user_1",
      requestedSessionId: "sess_done",
    });

    expect(result).toBeNull();
    expect(crystallizeTutorSessionMock).not.toHaveBeenCalled();
  });
});
