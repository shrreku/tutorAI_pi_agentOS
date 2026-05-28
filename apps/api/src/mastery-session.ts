import { and, desc, eq } from "drizzle-orm";
import { learningState, tutorSessions, tutorTurns, type DbClient } from "@studyagent/db";
import type { MasteryEvidence, MasteryEvidenceInput } from "@studyagent/schemas";
import type { AppContext } from "./context.js";
import { runRuntimeMasteryEvaluation } from "./mastery-pipeline.js";
import {
  buildPendingEvaluationFromAssistantMessage,
  readEvaluatedTurnIds,
  readPendingEvaluation,
  shouldTriggerRuntimeMasteryEvaluation,
  type PendingMasteryEvaluation,
} from "./mastery-runtime.js";

export async function maybeRunRuntimeMasteryEvaluation(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    sessionId: string;
    runId?: string;
    learnerMessage: string;
    runtimeContext: Record<string, unknown> | null;
    masterySnapshot: Record<string, number>;
    sourceRefs: Array<{ refType: string; refId: string }>;
    contextRefs?: Array<{ refType: string; refId: string }>;
    fallbackPendingEvaluation?: PendingMasteryEvaluation | null;
  },
): Promise<{ evaluated: boolean; runtimeContext: Record<string, unknown> }> {
  const pending = readPendingEvaluation(input.runtimeContext) ?? input.fallbackPendingEvaluation ?? null;
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

  const result = await runRuntimeMasteryEvaluation(ctx.db, {
    notebookId: input.notebookId,
    userId: input.userId,
    sessionId: input.sessionId,
    turnId: pending.turnId,
    ...(input.runId ? { runId: input.runId } : {}),
    learnerMessage: input.learnerMessage,
    pending,
    masterySnapshot: input.masterySnapshot,
    sourceRefs: (pending.sourceRefs ?? input.sourceRefs) as Array<{ refType: "source"; refId: string }>,
    ...(pending.contextRefs ?? input.contextRefs
      ? { contextRefs: (pending.contextRefs ?? input.contextRefs) as MasteryEvidenceInput["contextRefs"] }
      : {}),
  });
  const lastRuntimeMasteryEvidence = result?.evidence
    ? summarizeRuntimeMasteryEvidenceForContext(result.evidence)
    : null;

  const nextContext = {
    ...(input.runtimeContext ?? {}),
    pendingMasteryEvaluation: null,
    evaluatedMasteryTurnIds: [...new Set([...evaluatedTurnIds, pending.turnId])],
    lastRuntimeMasteryEvaluationAt: new Date().toISOString(),
    ...(lastRuntimeMasteryEvidence ? { lastRuntimeMasteryEvidence } : {}),
  };

  await ctx.db.db
    .update(tutorSessions)
    .set({ runtimeContextJson: nextContext })
    .where(eq(tutorSessions.id, input.sessionId));

  return { evaluated: true, runtimeContext: nextContext };
}

export async function prepareRuntimeMasteryEvaluation(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    sessionId: string;
    runId: string;
    learnerMessage: string;
    runtimeContext: Record<string, unknown> | null;
    masterySnapshot: Record<string, number>;
    sourceRefs: Array<{ refType: string; refId: string }>;
    contextRefs?: Array<{ refType: string; refId: string }>;
  },
): Promise<{ evaluated: boolean; runtimeContext: Record<string, unknown> }> {
  const fallbackPendingEvaluation = readPendingEvaluation(input.runtimeContext)
    ? null
    : await loadLatestPendingMasteryEvaluationFallback(ctx, { sessionId: input.sessionId });
  return maybeRunRuntimeMasteryEvaluation(ctx, {
    notebookId: input.notebookId,
    userId: input.userId,
    sessionId: input.sessionId,
    runId: input.runId,
    learnerMessage: input.learnerMessage,
    runtimeContext: input.runtimeContext,
    masterySnapshot: input.masterySnapshot,
    sourceRefs: input.sourceRefs,
    ...(input.contextRefs ? { contextRefs: input.contextRefs } : {}),
    fallbackPendingEvaluation,
  });
}

async function loadLatestPendingMasteryEvaluationFallback(
  ctx: AppContext,
  input: { sessionId: string },
): Promise<PendingMasteryEvaluation | null> {
  const [latestTurn] = await ctx.db.db
    .select({
      id: tutorTurns.id,
      assistantMessage: tutorTurns.assistantMessage,
      selectedNodeRefsJson: tutorTurns.selectedNodeRefsJson,
      toolSummaryJson: tutorTurns.toolSummaryJson,
    })
    .from(tutorTurns)
    .where(eq(tutorTurns.sessionId, input.sessionId))
    .orderBy(desc(tutorTurns.turnIndex))
    .limit(1);

  if (!latestTurn?.assistantMessage) return null;
  const selectedNodeRefs = parseRefs(latestTurn.selectedNodeRefsJson);
  const contextSelection = parseContextSelection(latestTurn.toolSummaryJson);
  const conceptIds = [
    ...new Set([
      ...selectedNodeRefs.filter((ref) => ref.refType === "concept").map((ref) => ref.refId),
      ...stringArray(contextSelection?.objectivePathConceptIds),
      ...stringArray(contextSelection?.recentMistakeConceptIds),
    ]),
  ];
  const sourceRefs = [
    ...new Map([
      ...selectedNodeRefs.filter((ref) => ref.refType === "source").map((ref) => [ref.refId, { refType: "source" as const, refId: ref.refId }] as const),
      ...stringArray(contextSelection?.selectedSourceIds).map((refId) => [refId, { refType: "source" as const, refId }] as const),
    ]).values(),
  ];
  const contextRefs = [
    ...stringArray(contextSelection?.selectedChunkIds).map((refId) => ({ refType: "chunk", refId })),
    ...(contextSelection?.sourceCoverageGap ? [{ refType: "source", refId: "gap_strict_source_scope" }] : []),
  ];

  return buildPendingEvaluationFromAssistantMessage({
    turnId: latestTurn.id,
    assistantMessage: latestTurn.assistantMessage,
    conceptIds,
    sourceRefs,
    contextRefs,
    ...(typeof contextSelection?.sourceScopePolicy === "string" ? { sourceScopePolicy: contextSelection.sourceScopePolicy } : {}),
  });
}

function summarizeRuntimeMasteryEvidenceForContext(evidence: MasteryEvidence):
  | {
      evidenceId: string;
      objectiveId: string;
      correctnessLabel: MasteryEvidence["correctnessLabel"];
      overallScore: number;
      confidence: number;
      uncertainty: number;
      readiness: MasteryEvidence["readiness"];
      tutoringIntervention: MasteryEvidence["tutoringIntervention"];
    }
  | null {
  if (!evidence.objectiveId) return null;
  return {
    evidenceId: evidence.id,
    objectiveId: evidence.objectiveId,
    correctnessLabel: evidence.correctnessLabel,
    overallScore: evidence.overallScore,
    confidence: evidence.confidence,
    uncertainty: evidence.uncertainty,
    readiness: evidence.readiness,
    tutoringIntervention: evidence.tutoringIntervention,
  };
}

export function buildMasteryRuntimeContextPatch(input: {
  previousRuntimeContext: Record<string, unknown>;
  turnId: string;
  assistantMessage: string;
  conceptIds: string[];
  objectiveId?: string | null;
  sourceRefs?: Array<{ refType: "source"; refId: string }>;
  contextRefs?: Array<{ refType: string; refId: string }>;
  sourceScopePolicy?: string;
  referenceAnswer?: string;
}): Record<string, unknown> {
  const pending = buildPendingEvaluationFromAssistantMessage({
    turnId: input.turnId,
    assistantMessage: input.assistantMessage,
    conceptIds: input.conceptIds,
    ...(input.objectiveId !== undefined ? { objectiveId: input.objectiveId } : {}),
    ...(input.sourceRefs !== undefined ? { sourceRefs: input.sourceRefs } : {}),
    ...(input.contextRefs !== undefined ? { contextRefs: input.contextRefs } : {}),
    ...(input.sourceScopePolicy !== undefined ? { sourceScopePolicy: input.sourceScopePolicy } : {}),
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseRefs(value: unknown): Array<{ refType: string; refId: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((ref): ref is Record<string, unknown> => Boolean(ref && typeof ref === "object" && !Array.isArray(ref)))
    .filter((ref): ref is { refType: string; refId: string } => typeof ref.refType === "string" && typeof ref.refId === "string");
}

function parseContextSelection(value: unknown): Record<string, unknown> | null {
  if (!isJsonRecord(value)) return null;
  const contextSelection = value.contextSelection;
  return isJsonRecord(contextSelection) ? contextSelection : null;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
