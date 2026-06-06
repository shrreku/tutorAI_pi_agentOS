import { and, desc, eq } from "drizzle-orm";
import { tutorSessions, type DbClient } from "@studyagent/db";
import type { StudyAgentPromptContext } from "@studyagent/agent-runtime";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";

export type TutorSessionRow = typeof tutorSessions.$inferSelect;

export async function resolveTutorSession(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    requestedSessionId?: string;
    allowedStatuses: string[];
  },
): Promise<TutorSessionRow | null> {
  if (input.requestedSessionId) {
    const [requested] = await dbClient.db
      .select()
      .from(tutorSessions)
      .where(
        and(
          eq(tutorSessions.id, input.requestedSessionId),
          eq(tutorSessions.notebookId, input.notebookId),
          eq(tutorSessions.userId, input.userId),
        ),
      )
      .limit(1);
    if (!requested) return null;
    return input.allowedStatuses.includes(requested.status) ? requested : null;
  }

  const rows = await dbClient.db
    .select()
    .from(tutorSessions)
    .where(and(eq(tutorSessions.notebookId, input.notebookId), eq(tutorSessions.userId, input.userId)))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(5);
  return rows.find((row) => input.allowedStatuses.includes(row.status)) ?? null;
}

export async function getOrCreateTutorSession(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    activeMode: StudyAgentPromptContext["activeMode"];
    selectedNodeRefs: Array<{ refType: string; refId: string }>;
    requestedSessionId?: string;
  },
): Promise<{ session: TutorSessionRow; created: boolean }> {
  const existing = await resolveTutorSession(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    ...(input.requestedSessionId ? { requestedSessionId: input.requestedSessionId } : {}),
    allowedStatuses: ["active", "paused"],
  });

  if (existing) {
    await dbClient.db
      .update(tutorSessions)
      .set({
        mode: input.activeMode,
        status: "active",
        selectedNodeRefsJson: input.selectedNodeRefs as unknown[],
        runtimeContextJson: isJsonRecord(existing.runtimeContextJson)
          ? { ...existing.runtimeContextJson, updatedAt: new Date().toISOString() }
          : { updatedAt: new Date().toISOString() },
      })
      .where(eq(tutorSessions.id, existing.id));

    return { session: { ...existing, mode: input.activeMode, status: "active" }, created: false };
  }

  const sessionId = `sess_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date();
  await dbClient.db.insert(tutorSessions).values({
    id: sessionId,
    notebookId: input.notebookId,
    userId: input.userId,
    mode: input.activeMode,
    status: "active",
    selectedNodeRefsJson: input.selectedNodeRefs as unknown[],
    runtimeContextJson: {},
    startedAt: now,
  });

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId,
    eventType: "session.started",
    payload: {
      sessionId,
      mode: input.activeMode,
    },
  });

  return {
    session: {
      id: sessionId,
      notebookId: input.notebookId,
      userId: input.userId,
      mode: input.activeMode,
      status: "active",
      selectedNodeRefsJson: input.selectedNodeRefs,
      runtimeContextJson: {},
      startedAt: now,
      endedAt: null,
    } as TutorSessionRow,
    created: true,
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
