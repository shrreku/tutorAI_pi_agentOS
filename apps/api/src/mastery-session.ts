import { and, eq } from "drizzle-orm";
import { learningState, tutorSessions, type DbClient } from "@studyagent/db";
import type { MasteryEvidenceInput } from "@studyagent/schemas";
import type { AppContext } from "./context.js";
import { runRuntimeMasteryEvaluation } from "./mastery-pipeline.js";
import {
  buildPendingEvaluationFromAssistantMessage,
  readEvaluatedTurnIds,
  readPendingEvaluation,
  shouldTriggerRuntimeMasteryEvaluation,
} from "./mastery-runtime.js";

export async function maybeRunRuntimeMasteryEvaluation(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    sessionId: string;
    learnerMessage: string;
    runtimeContext: Record<string, unknown> | null;
    masterySnapshot: Record<string, number>;
    sourceRefs: Array<{ refType: string; refId: string }>;
    contextRefs?: Array<{ refType: string; refId: string }>;
  },
): Promise<{ evaluated: boolean; runtimeContext: Record<string, unknown> }> {
  const pending = readPendingEvaluation(input.runtimeContext);
  const evaluatedTurnIds = readEvaluatedTurnIds(input.runtimeContext);
  if (
    !shouldTriggerRuntimeMasteryEvaluation({
      pendingEvaluation: pending,
      learnerMessage: input.learnerMessage,
      alreadyEvaluatedTurnIds: evaluatedTurnIds,
    }) ||
    !pending
  ) {
    return { evaluated: false, runtimeContext: input.runtimeContext ?? {} };
  }

  await runRuntimeMasteryEvaluation(ctx.db, {
    notebookId: input.notebookId,
    userId: input.userId,
    sessionId: input.sessionId,
    turnId: pending.turnId,
    learnerMessage: input.learnerMessage,
    pending,
    masterySnapshot: input.masterySnapshot,
    sourceRefs: input.sourceRefs as Array<{ refType: "source"; refId: string }>,
    ...(input.contextRefs ? { contextRefs: input.contextRefs as MasteryEvidenceInput["contextRefs"] } : {}),
  });

  const nextContext = {
    ...(input.runtimeContext ?? {}),
    pendingMasteryEvaluation: null,
    evaluatedMasteryTurnIds: [...new Set([...evaluatedTurnIds, pending.turnId])],
    lastRuntimeMasteryEvaluationAt: new Date().toISOString(),
  };

  await ctx.db.db
    .update(tutorSessions)
    .set({ runtimeContextJson: nextContext })
    .where(eq(tutorSessions.id, input.sessionId));

  return { evaluated: true, runtimeContext: nextContext };
}

export function buildMasteryRuntimeContextPatch(input: {
  previousRuntimeContext: Record<string, unknown>;
  turnId: string;
  assistantMessage: string;
  conceptIds: string[];
  objectiveId?: string | null;
  referenceAnswer?: string;
}): Record<string, unknown> {
  const pending = buildPendingEvaluationFromAssistantMessage({
    turnId: input.turnId,
    assistantMessage: input.assistantMessage,
    conceptIds: input.conceptIds,
    ...(input.objectiveId !== undefined ? { objectiveId: input.objectiveId } : {}),
    ...(input.referenceAnswer !== undefined ? { referenceAnswer: input.referenceAnswer } : {}),
  });

  return {
    ...input.previousRuntimeContext,
    pendingMasteryEvaluation: pending,
    lastEvaluablePromptTurnId: pending ? input.turnId : input.previousRuntimeContext.lastEvaluablePromptTurnId ?? null,
  };
}

export async function buildMasterySnapshot(
  dbClient: DbClient,
  notebookId: string,
  userId: string,
): Promise<Record<string, number>> {
  const rows = await dbClient.db
    .select({
      conceptId: learningState.conceptId,
      masteryScore: learningState.masteryScore,
    })
    .from(learningState)
    .where(and(eq(learningState.notebookId, notebookId), eq(learningState.userId, userId)));

  return Object.fromEntries(rows.map((row) => [row.conceptId, row.masteryScore]));
}

export async function loadSessionRuntimeContext(
  dbClient: DbClient,
  sessionId: string,
): Promise<Record<string, unknown>> {
  const [session] = await dbClient.db
    .select({ runtimeContextJson: tutorSessions.runtimeContextJson })
    .from(tutorSessions)
    .where(eq(tutorSessions.id, sessionId))
    .limit(1);
  const value = session?.runtimeContextJson;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
