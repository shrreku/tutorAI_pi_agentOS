import { learningState, type DbClient } from "@studyagent/db";
import type { MasteryEvidence, MasteryEvidenceInput } from "@studyagent/schemas";
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "./context.js";
import { recordProductAnalytics } from "./hosted-beta/product-analytics.js";
import {
  evaluateLearnerResponse,
  type EvaluateLearnerResponseInput,
  type MasteryEvaluatorJudge,
} from "./mastery-evaluator.js";
import { persistMasteryEvidence, readMasteryEvidenceById } from "./mastery-evidence-store.js";
import { applyAdaptiveSessionPlanFromMasteryEvidence } from "./mastery-curriculum-adaptation.js";
import { applyMasteryEvidence } from "./mastery-learning.js";
import type { PendingMasteryEvaluation } from "./mastery-runtime.js";

export type MasteryEvidencePipelineOptions = {
  applyAdaptivePlan?: boolean;
  analyticsContext?: AppContext;
};

type AppliedMasteryResult = {
  updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
  weakConceptIds: string[];
};

export function buildMasteryEvaluationEvidenceId(input: {
  notebookId: string;
  userId: string;
  idempotencyKey: string;
}): string {
  const digest = createHash("sha256")
    .update(`mastery-evaluation:v1\0${input.notebookId}\0${input.userId}\0${input.idempotencyKey}`)
    .digest("hex");
  return `mev_${digest}`;
}

async function readAppliedMasteryResult(
  dbClient: DbClient,
  evidence: MasteryEvidence,
): Promise<AppliedMasteryResult> {
  const conceptIds = [...new Set(evidence.conceptScores.map((entry) => entry.conceptId))];
  if (conceptIds.length === 0) return { updatedConceptStates: [], weakConceptIds: [] };

  const rows = await dbClient.db
    .select({
      conceptId: learningState.conceptId,
      masteryScore: learningState.masteryScore,
      nextReviewAt: learningState.nextReviewAt,
    })
    .from(learningState)
    .where(
      and(
        eq(learningState.notebookId, evidence.notebookId),
        eq(learningState.userId, evidence.userId),
        inArray(learningState.conceptId, conceptIds),
      ),
    );

  const updatedConceptStates = rows.flatMap((row) =>
    row.nextReviewAt
      ? [
          {
            conceptId: row.conceptId,
            masteryScore: row.masteryScore,
            nextReviewAt: row.nextReviewAt.toISOString(),
          },
        ]
      : [],
  );
  return {
    updatedConceptStates,
    weakConceptIds: updatedConceptStates
      .filter((state) => state.masteryScore < 0.45)
      .map((state) => state.conceptId),
  };
}

export async function recordAndApplyMasteryEvidence(
  dbClient: DbClient,
  evidence: MasteryEvidence,
  options: MasteryEvidencePipelineOptions = {},
): Promise<{
  evidenceId: string;
  eventId: string;
  updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
  weakConceptIds: string[];
  replayed: boolean;
}> {
  const applyAdaptivePlan = options.applyAdaptivePlan ?? true;

  // Persist the durable Mastery Evidence audit record and the reducer-governed
  // learning/weak-concept/session-plan changes it causes in a SINGLE transaction, so the
  // audit record can never desync from the applied state. Previously these ran as three
  // independent transactions: a partial failure could leave the audit row written with no
  // mastery update, or mastery applied with no session-plan adaptation.
  //
  // Within the transaction, persist runs first, so the per-notebook advisory lock taken by
  // its durable event (pg_advisory_xact_lock(notebookId) in appendEvent) is held until
  // commit. That serializes concurrent mastery applies on the same notebook and removes the
  // read-modify-write lost-update race on learning_state.masteryScore and study-plan weak
  // concepts. A stable mastery_evidence primary key makes retries converge on
  // the already-applied result instead of applying the same mastery delta twice.
  const { persisted, applied } = await dbClient.db.transaction(async (tx) => {
    const txDb = { db: tx } as unknown as DbClient;
    const persisted = await persistMasteryEvidence(txDb, evidence);
    if (!persisted.inserted) {
      return { persisted, applied: await readAppliedMasteryResult(txDb, evidence) };
    }
    const applied = await applyMasteryEvidence(txDb, evidence);
    if (applyAdaptivePlan) {
      await applyAdaptiveSessionPlanFromMasteryEvidence(txDb, {
        evidence,
        updatedConceptStates: applied.updatedConceptStates,
        weakConceptIds: applied.weakConceptIds,
        sourceCoverageGap: evidence.contextRefs.some(
          (ref) => ref.refType === "source" && ref.refId.startsWith("gap_"),
        ),
      });
    }
    return { persisted, applied };
  });

  // Analytics is best-effort and external; keep it out of the durable transaction.
  if (
    persisted.inserted &&
    options.analyticsContext &&
    evidence.evidenceType === "mastery_check" &&
    evidence.userId
  ) {
    await recordProductAnalytics(options.analyticsContext, {
      userId: evidence.userId,
      eventName: "mastery_check",
      properties: {
        notebookId: evidence.notebookId,
        sessionId: evidence.sessionId ?? null,
        evidenceId: persisted.evidenceId,
      },
    }).catch(() => undefined);
  }
  return {
    evidenceId: persisted.evidenceId,
    eventId: persisted.eventId,
    ...applied,
    replayed: !persisted.inserted,
  };
}

export async function evaluatePersistAndApply(
  dbClient: DbClient,
  input: EvaluateLearnerResponseInput & { idempotencyKey: string },
  options: {
    judge?: MasteryEvaluatorJudge;
    applyAdaptivePlan?: boolean;
    analyticsContext?: AppContext;
  } = {},
): Promise<{
  evidence: MasteryEvidence;
  evidenceId: string;
  eventId: string;
  updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
  weakConceptIds: string[];
  replayed: boolean;
}> {
  const evidenceId = buildMasteryEvaluationEvidenceId(input);
  const existingEvidence = await readMasteryEvidenceById(dbClient, evidenceId);
  if (existingEvidence) {
    const applied = await recordAndApplyMasteryEvidence(dbClient, existingEvidence, {
      ...(options.applyAdaptivePlan !== undefined
        ? { applyAdaptivePlan: options.applyAdaptivePlan }
        : {}),
      ...(options.analyticsContext ? { analyticsContext: options.analyticsContext } : {}),
    });
    return { evidence: existingEvidence, ...applied };
  }

  const evidence = await evaluateLearnerResponse({ ...input, evidenceId }, options);
  const applied = await recordAndApplyMasteryEvidence(dbClient, evidence, {
    ...(options.applyAdaptivePlan !== undefined
      ? { applyAdaptivePlan: options.applyAdaptivePlan }
      : {}),
    ...(options.analyticsContext ? { analyticsContext: options.analyticsContext } : {}),
  });
  return { evidence, ...applied };
}

export async function runRuntimeMasteryEvaluation(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    sessionId: string;
    turnId: string;
    runId?: string;
    learnerMessage: string;
    pending: PendingMasteryEvaluation;
    masterySnapshot: Record<string, number>;
    sourceRefs: MasteryEvidenceInput["sourceRefs"];
    contextRefs?: MasteryEvidenceInput["contextRefs"];
  },
  options: { judge?: MasteryEvaluatorJudge; analyticsContext?: AppContext } = {},
): Promise<{ evidence: MasteryEvidence; applied: boolean } | null> {
  const result = await evaluatePersistAndApply(
    dbClient,
    {
      notebookId: input.notebookId,
      userId: input.userId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      ...(input.runId ? { runId: input.runId } : {}),
      tutorQuestion: input.pending.tutorQuestion,
      learnerAnswer: input.learnerMessage,
      ...(input.pending.objectiveId ? { objectiveId: input.pending.objectiveId } : {}),
      conceptRoles: input.pending.conceptIds.map((conceptId) => ({
        conceptId,
        role: "primary" as const,
      })),
      masterySnapshot: input.masterySnapshot,
      sourceRefs: input.sourceRefs,
      contextRefs: input.contextRefs ?? [],
      ...(input.pending.referenceAnswer ? { referenceAnswer: input.pending.referenceAnswer } : {}),
      evidenceType: "mastery_check",
      triggerSource: "runtime_auto",
      idempotencyKey: `runtime_auto:${input.sessionId}:${input.turnId}`,
    },
    {
      ...(options.judge ? { judge: options.judge } : {}),
      ...(options.analyticsContext ? { analyticsContext: options.analyticsContext } : {}),
    },
  );
  return { evidence: result.evidence, applied: true };
}
