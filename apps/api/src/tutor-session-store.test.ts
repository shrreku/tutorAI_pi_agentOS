import { describe, expect, it } from "vitest";
import { tutorSessions } from "@studyagent/db";
import { getOrCreateTutorSession, resolveTutorSession } from "./tutor-session-store.js";

function makeDbClient(rows: Array<typeof tutorSessions.$inferSelect>) {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(rows.slice(0, 1)),
            orderBy: () => ({
              limit: () => Promise.resolve(rows),
            }),
          }),
          orderBy: () => ({
            limit: () => Promise.resolve(rows),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(undefined),
        }),
      }),
      insert: () => ({
        values: () => Promise.resolve(undefined),
      }),
    },
  };
}

describe("resolveTutorSession", () => {
  it("returns the requested session when status is allowed", async () => {
    const session = {
      id: "sess_a",
      notebookId: "nb_1",
      userId: "user_1",
      status: "active",
      mode: "learn",
      selectedNodeRefsJson: [],
      runtimeContextJson: {},
      startedAt: new Date(),
      endedAt: null,
    } as typeof tutorSessions.$inferSelect;

    const dbClient = makeDbClient([session]);
    const resolved = await resolveTutorSession(dbClient as never, {
      notebookId: "nb_1",
      userId: "user_1",
      requestedSessionId: "sess_a",
      allowedStatuses: ["active"],
    });

    expect(resolved?.id).toBe("sess_a");
  });

  it("rejects requested sessions outside allowed statuses", async () => {
    const session = {
      id: "sess_a",
      notebookId: "nb_1",
      userId: "user_1",
      status: "completed",
      mode: "learn",
      selectedNodeRefsJson: [],
      runtimeContextJson: {},
      startedAt: new Date(),
      endedAt: new Date(),
    } as typeof tutorSessions.$inferSelect;

    const dbClient = makeDbClient([session]);
    const resolved = await resolveTutorSession(dbClient as never, {
      notebookId: "nb_1",
      userId: "user_1",
      requestedSessionId: "sess_a",
      allowedStatuses: ["active"],
    });

    expect(resolved).toBeNull();
  });
});
