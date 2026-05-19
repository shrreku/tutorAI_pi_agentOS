import { desc, eq } from "drizzle-orm";
import { appendEvent, tutorSessions, tutorTurns, type DbClient } from "@studyagent/db";
import { crystallizeTutorSession } from "./phase7.js";

export type TutorSessionCompletionResult =
  | { status: "completed"; artifactId: string; reason: "crystallized" }
  | { status: "completed"; artifactId: null; reason: "ended_without_turns" };

export async function completeTutorSessionLifecycle(
  dbClient: DbClient,
  input: { notebookId: string; userId: string; sessionId: string; runtimeContextJson: unknown },
): Promise<TutorSessionCompletionResult> {
  const [lastTurn] = await dbClient.db
    .select()
    .from(tutorTurns)
    .where(eq(tutorTurns.sessionId, input.sessionId))
    .orderBy(desc(tutorTurns.turnIndex))
    .limit(1);

  if (!lastTurn || !lastTurn.userMessage || !lastTurn.assistantMessage) {
    await dbClient.db
      .update(tutorSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(tutorSessions.id, input.sessionId));
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      eventType: "session.completed",
      payload: { sessionId: input.sessionId, reason: "ended_without_turns" },
    });
    return { status: "completed", artifactId: null, reason: "ended_without_turns" };
  }

  const runtimeCtx = isJsonRecord(input.runtimeContextJson) ? input.runtimeContextJson : {};
  const sourceIds = stringArray(runtimeCtx.sourceIds);
  const citationIds = stringArray(runtimeCtx.citationIds);
  const artifactProposalIds = stringArray(runtimeCtx.artifactProposalIds);
  const currentObjective = typeof runtimeCtx.currentObjective === "string" ? runtimeCtx.currentObjective : undefined;

  const digest = await crystallizeTutorSession(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    sessionId: input.sessionId,
    assistantMessage: lastTurn.assistantMessage,
    userMessage: lastTurn.userMessage,
    sourceIds,
    citationIds,
    artifactProposalIds,
    ...(currentObjective ? { currentObjective } : {}),
  });

  return { status: "completed", artifactId: digest.artifactId, reason: "crystallized" };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
