import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentRuns, tutorSessions, tutorTurns } from "@studyagent/db";

const { appendEventMock } = vi.hoisted(() => ({
  appendEventMock: vi.fn(async () => ({ id: "evt_1" })),
}));

import {
  buildStudyAgentHostStateSignature,
  createRuntimeRun,
  disposeStudyAgentTutorSession,
} from "@studyagent/agent-runtime";
import type { AppContext } from "./context.js";
import { executeTutorTurn } from "./tutor-turn.js";

vi.mock("@studyagent/agent-runtime", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/agent-runtime")>("@studyagent/agent-runtime");
  return {
    ...actual,
    runStudyAgentTutorSession: (input: Parameters<typeof actual.runStudyAgentTutorSession>[0]) =>
      actual.runStudyAgentTutorSession({ ...input, config: { ...input.config, useMock: true } }),
  };
});

vi.mock("@studyagent/db", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/db")>("@studyagent/db");
  return {
    ...actual,
    appendEvent: appendEventMock,
    grantTrialBudgetIfNeeded: vi.fn(async () => ({ granted: false, amountCents: 0 })),
  };
});

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

vi.mock("./study-state.js", () => ({
  loadNotebookStudyState: vi.fn(async () => ({
    studentProfile: null,
    curriculum: null,
    module: null,
    objectiveList: null,
    sessionPlan: { id: "plan_1" },
    studyPlan: null,
    coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
    sourceLevels: [],
    learnerReadiness: [],
  })),
}));

vi.mock("./mastery-session.js", () => ({
  buildMasterySnapshot: vi.fn(async () => ({})),
  prepareRuntimeMasteryEvaluation: vi.fn(async () => ({ evaluated: false, runtimeContext: {} })),
}));

class IntegrationFakeDb {
  sessions = [{
    id: "sess_host_int",
    notebookId: "nb_1",
    userId: "user_1",
    mode: "learn",
    status: "active",
    selectedNodeRefsJson: [{ refType: "source", refId: "src_1" }],
    runtimeContextJson: {},
    startedAt: new Date("2026-05-15T00:00:00.000Z"),
    endedAt: null,
  }];
  turns: Array<Record<string, unknown>> = [];
  runs: Array<Record<string, unknown>> = [];
  toolCalls: Array<Record<string, unknown>> = [];

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
        } else if (table === tutorSessions) {
          db.sessions.push(values as never);
        }
        return {
          returning: () => Promise.resolve([values]),
        };
      },
    };
  }

  update(_table: unknown) {
    return {
      set: () => ({
        where: () => Promise.resolve(undefined),
      }),
    };
  }
}

const selectedNodeRefs = [{ refType: "source" as const, refId: "src_1" }];
const baseStudyState = {
  studentProfile: null,
  curriculum: null,
  module: null,
  objectiveList: null,
  sessionPlan: { id: "plan_1" },
  studyPlan: null,
  coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
  sourceLevels: [],
  learnerReadiness: [],
} as never;

function buildPromptContext(currentObjective: string) {
  return {
    notebookId: "nb_1",
    userId: "user_1",
    sessionId: "sess_host_int",
    notebookTitle: "Notebook A",
    activeMode: "learn" as const,
    selectedNodeRefs,
    currentObjective,
    completedObjectivesCount: 0,
    nextObjectives: [],
    additionalInstructions: [],
  };
}

describe("executeTutorTurn host-state integration", () => {
  beforeEach(() => {
    appendEventMock.mockClear();
  });

  afterEach(async () => {
    await disposeStudyAgentTutorSession("sess_host_int");
  });

  it("keeps cached runtime when only current objective changes with unchanged selected refs", async () => {
    const fakeDb = new IntegrationFakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: {
        DEFAULT_TUTOR_MODEL: "test-model",
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_BASE_URL: "https://example.invalid",
      },
    } as unknown as AppContext;

    const firstContext = buildPromptContext("Objective A");
    const firstSignature = buildStudyAgentHostStateSignature(firstContext);
    const firstRun = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_host_int",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs,
      hostStateSignature: firstSignature,
      modelConfig: { model: "test-model" },
    });

    await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_host_int",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs,
      action: "prompt",
      message: "teach me objective A",
      promptContext: firstContext,
      studyState: baseStudyState,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      run: firstRun,
    });

    appendEventMock.mockClear();

    const secondContext = buildPromptContext("Objective B");
    const secondSignature = buildStudyAgentHostStateSignature(secondContext);
    expect(secondSignature).toBe(firstSignature);

    const secondRun = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_host_int",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs,
      hostStateSignature: secondSignature,
      modelConfig: { model: "test-model" },
    });

    await executeTutorTurn({
      ctx,
      notebookId: "nb_1",
      sessionId: "sess_host_int",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs,
      action: "prompt",
      message: "teach me objective B",
      promptContext: secondContext,
      studyState: baseStudyState,
      previousRuntimeContext: {},
      toolRegistry: {},
      emitStreamEvent: () => undefined,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      run: secondRun,
    });

    expect(appendEventMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "session.runtime.replaced" }),
    );
  });
});
