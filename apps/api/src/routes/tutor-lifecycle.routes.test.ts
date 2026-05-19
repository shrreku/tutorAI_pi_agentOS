import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notebooks, tutorSessions, tutorTurns } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { registerTutorRoutes } from "./tutor.js";

const {
  appendEventMock,
  disposeSessionMock,
  replaceRuntimeMock,
  crystallizeSessionMock,
} = vi.hoisted(() => ({
  appendEventMock: vi.fn(async () => ({ id: "evt_1" })),
  disposeSessionMock: vi.fn(async () => undefined),
  replaceRuntimeMock: vi.fn(async () => ({ replaced: false, disposedSessionId: null, binding: null })),
  crystallizeSessionMock: vi.fn(async () => ({ artifactId: "artifact_digest_1" })),
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

vi.mock("@studyagent/agent-runtime", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/agent-runtime")>("@studyagent/agent-runtime");
  return {
    ...actual,
    disposeStudyAgentTutorSession: disposeSessionMock,
    replaceStudyAgentTutorRuntime: replaceRuntimeMock,
  };
});

vi.mock("../phase7.js", async () => {
  const actual = await vi.importActual<typeof import("../phase7.js")>("../phase7.js");
  return {
    ...actual,
    crystallizeTutorSession: crystallizeSessionMock,
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

type TurnRow = {
  id: string;
  sessionId: string;
  turnIndex: number;
  userMessage: string | null;
  assistantMessage: string | null;
};

class FakeDb {
  sessions: SessionRow[] = [];
  turns: TurnRow[] = [];
  sessionUpdates: Array<{ id: string; values: Record<string, unknown> }> = [];

  select(_selection?: unknown) {
    const db = this;
    return {
      from(table: unknown) {
        return {
          where(_condition: unknown) {
            return this;
          },
          orderBy(_order: unknown) {
            return this;
          },
          limit(limitCount: number) {
            if (table === tutorSessions) {
              return Promise.resolve(db.sessions.slice(0, limitCount));
            }
            if (table === tutorTurns) {
              return Promise.resolve(db.turns.slice(0, limitCount));
            }
            if (table === notebooks) {
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          },
        };
      },
    };
  }

  update(table: unknown) {
    const db = this;
    return {
      set(values: Record<string, unknown>) {
        return {
          where(_condition: unknown) {
            if (table === tutorSessions) {
              for (const session of db.sessions) {
                db.sessionUpdates.push({ id: session.id, values });
                Object.assign(session, values);
              }
            }
            return Promise.resolve();
          },
        };
      },
    };
  }
}

describe("tutor lifecycle routes", () => {
  let app = Fastify();
  let fakeDb: FakeDb;

  beforeEach(async () => {
    appendEventMock.mockClear();
    disposeSessionMock.mockClear();
    replaceRuntimeMock.mockClear();
    crystallizeSessionMock.mockClear();

    fakeDb = new FakeDb();
    const ctx = {
      db: { db: fakeDb },
      env: {},
    } as unknown as AppContext;

    app = Fastify();
    await registerTutorRoutes(app, ctx);
  });

  afterEach(async () => {
    await app.close();
  });

  it("pauses active session and emits focus event", async () => {
    fakeDb.sessions = [
      {
        id: "sess_1",
        notebookId: "nb_1",
        userId: "user_1",
        mode: "learn",
        status: "active",
        selectedNodeRefsJson: [],
        runtimeContextJson: {},
        startedAt: new Date(),
        endedAt: null,
      },
    ];

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/tutor/session/pause",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sessionId: "sess_1", status: "paused" });
    expect(disposeSessionMock).toHaveBeenCalledWith("sess_1");
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        notebookId: "nb_1",
        sessionId: "sess_1",
        eventType: "session.focus.updated",
      }),
    );
  });

  it("resumes paused session and emits replacement failure event without failing request", async () => {
    replaceRuntimeMock.mockRejectedValueOnce(new Error("replacement failed"));
    fakeDb.sessions = [
      {
        id: "sess_2",
        notebookId: "nb_2",
        userId: "user_1",
        mode: "learn",
        status: "paused",
        selectedNodeRefsJson: [{ refType: "concept", refId: "c_1" }],
        runtimeContextJson: {},
        startedAt: new Date(),
        endedAt: null,
      },
    ];

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_2/tutor/session/resume",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sessionId: "sess_2", status: "active" });
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        notebookId: "nb_2",
        sessionId: "sess_2",
        eventType: "session.runtime.replacement_failed",
      }),
    );
  });

  it("ends session without completed turns and skips crystallization", async () => {
    fakeDb.sessions = [
      {
        id: "sess_3",
        notebookId: "nb_3",
        userId: "user_1",
        mode: "learn",
        status: "active",
        selectedNodeRefsJson: [],
        runtimeContextJson: {},
        startedAt: new Date(),
        endedAt: null,
      },
    ];
    fakeDb.turns = [];

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_3/tutor/session/end",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sessionId: "sess_3", status: "completed", artifactId: null });
    expect(crystallizeSessionMock).not.toHaveBeenCalled();
    expect(disposeSessionMock).toHaveBeenCalledWith("sess_3");
  });

  it("ends session with completed turn and crystallizes digest", async () => {
    fakeDb.sessions = [
      {
        id: "sess_4",
        notebookId: "nb_4",
        userId: "user_1",
        mode: "learn",
        status: "active",
        selectedNodeRefsJson: [],
        runtimeContextJson: {
          sourceIds: ["src_1"],
          citationIds: ["claim_1"],
          artifactProposalIds: ["artifact_1"],
          currentObjective: "Objective A",
        },
        startedAt: new Date(),
        endedAt: null,
      },
    ];
    fakeDb.turns = [
      {
        id: "turn_1",
        sessionId: "sess_4",
        turnIndex: 0,
        userMessage: "Teach me",
        assistantMessage: "Let's start.",
      },
    ];

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_4/tutor/session/end",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(crystallizeSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        notebookId: "nb_4",
        sessionId: "sess_4",
        userMessage: "Teach me",
        assistantMessage: "Let's start.",
      }),
    );
    expect(response.json()).toEqual({ sessionId: "sess_4", status: "completed", artifactId: "artifact_digest_1" });
  });
});
