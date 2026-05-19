import type { DbClient } from "@studyagent/db";
import type { MasteryEvidence, MasteryEvidenceInput } from "@studyagent/schemas";
import { evaluateLearnerResponse, type EvaluateLearnerResponseInput, type MasteryEvaluatorJudge } from "./mastery-evaluator.js";
import { persistMasteryEvidence } from "./mastery-evidence-store.js";
import { applyAdaptiveSessionPlanFromMasteryEvidence } from "./mastery-curriculum-adaptation.js";
import { applyMasteryEvidence } from "./mastery-learning.js";
import type { PendingMasteryEvaluation } from "./mastery-runtime.js";

export type MasteryEvidencePipelineOptions = {
  applyAdaptivePlan?: boolean;
};

export async function recordAndApplyMasteryEvidence(
  dbClient: DbClient,
  evidence: MasteryEvidence,
  options: MasteryEvidencePipelineOptions = {},
): Promise<{
  evidenceId: string;
  eventId: string;
  updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
  weakConceptIds: string[];
}> {
  const applyAdaptivePlan = options.applyAdaptivePlan ?? true;
  const persisted = await persistMasteryEvidence(dbClient, evidence);
  const applied = await applyMasteryEvidence(dbClient, evidence);
  if (applyAdaptivePlan) {
    await applyAdaptiveSessionPlanFromMasteryEvidence(dbClient, {
      evidence,
      updatedConceptStates: applied.updatedConceptStates,
      weakConceptIds: applied.weakConceptIds,
      sourceCoverageGap: evidence.contextRefs.some((ref) => ref.refType === "source" && ref.refId.startsWith("gap_")),
    });
  }
  return { evidenceId: persisted.evidenceId, eventId: persisted.eventId, ...applied };
}

export async function evaluatePersistAndApply(
  dbClient: DbClient,
  input: EvaluateLearnerResponseInput,
  options: { judge?: MasteryEvaluatorJudge; applyAdaptivePlan?: boolean } = {},
): Promise<{
  evidence: MasteryEvidence;
  evidenceId: string;
  eventId: string;
  updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
  weakConceptIds: string[];
}> {
  const evidence = await evaluateLearnerResponse(input, options);
  const applied = await recordAndApplyMasteryEvidence(
    dbClient,
    evidence,
    options.applyAdaptivePlan !== undefined ? { applyAdaptivePlan: options.applyAdaptivePlan } : {},
  );
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
): Promise<{ evidence: MasteryEvidence; applied: boolean } | null> {
  const result = await evaluatePersistAndApply(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    sessionId: input.sessionId,
    turnId: input.turnId,
    ...(input.runId ? { runId: input.runId } : {}),
    tutorQuestion: input.pending.tutorQuestion,
    learnerAnswer: input.learnerMessage,
    ...(input.pending.objectiveId ? { objectiveId: input.pending.objectiveId } : {}),
    conceptRoles: input.pending.conceptIds.map((conceptId) => ({ conceptId, role: "primary" as const })),
    masterySnapshot: input.masterySnapshot,
    sourceRefs: input.sourceRefs,
    contextRefs: input.contextRefs ?? [],
    ...(input.pending.referenceAnswer ? { referenceAnswer: input.pending.referenceAnswer } : {}),
    evidenceType: "mastery_check",
    triggerSource: "runtime_auto",
  });
  return { evidence: result.evidence, applied: true };
}
