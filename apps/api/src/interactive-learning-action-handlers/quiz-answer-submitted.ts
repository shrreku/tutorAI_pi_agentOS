import { and, eq, inArray } from "drizzle-orm";
import { artifacts, concepts, curriculumModules, type DbClient } from "@studyagent/db";
import type { quizAnswerSubmittedPayloadSchema } from "@studyagent/schemas";
import type { z } from "zod";
import { recordQuizAttempt } from "../assessment-artifacts.js";
import { evaluateLearnerResponse } from "../mastery-evaluator.js";
import { createOpenRouterMasteryEvaluatorJudge } from "../mastery-llm-judge.js";
import type { ActionContext, ActionHandlerOutcome } from "./types.js";
import { isRecord } from "./shared.js";

type QuizQuestionRecord = Record<string, unknown> & {
  id?: string;
  answer?: string;
  referenceAnswer?: string;
  conceptId?: string;
  conceptIds?: string[];
  explanation?: string;
};

function normalizeQuestion(entry: unknown, index: number): QuizQuestionRecord | null {
  if (!isRecord(entry)) return null;
  const id = typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `q_${index}`;
  return { ...entry, id };
}

function candidateConceptOrModuleIds(
  question: QuizQuestionRecord,
  actionCtx: ActionContext,
  artifactPayload: Record<string, unknown>,
): string[] {
  const fromQuestion = Array.isArray(question.conceptIds)
    ? question.conceptIds
    : typeof question.conceptId === "string"
      ? [question.conceptId]
      : [];
  const fromArtifact = Array.isArray(artifactPayload.conceptIds)
    ? artifactPayload.conceptIds.filter((value): value is string => typeof value === "string")
    : [];
  const fromBlock = actionCtx.block.conceptRefs
    .filter((ref) => ref.refType === "concept")
    .map((ref) => ref.refId);
  return [
    ...new Set(
      [...fromQuestion, ...fromArtifact, ...fromBlock].filter((value) => value.length > 0),
    ),
  ];
}

async function serverOwnedConceptIds(
  dbClient: DbClient,
  notebookId: string,
  question: QuizQuestionRecord,
  actionCtx: ActionContext,
  artifactPayload: Record<string, unknown>,
): Promise<string[]> {
  const candidateIds = candidateConceptOrModuleIds(question, actionCtx, artifactPayload);
  if (candidateIds.length === 0) return [];

  const directConceptRows = await dbClient.db
    .select({ id: concepts.id })
    .from(concepts)
    .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, candidateIds)))
    .limit(candidateIds.length);
  const directConceptIds = new Set(directConceptRows.map((row) => row.id));

  const moduleRows = await dbClient.db
    .select({ targetConceptIds: curriculumModules.targetConceptIds })
    .from(curriculumModules)
    .where(
      and(
        eq(curriculumModules.notebookId, notebookId),
        inArray(curriculumModules.id, candidateIds),
      ),
    )
    .limit(candidateIds.length);
  const moduleTargetConceptIds = moduleRows.flatMap((row) => row.targetConceptIds ?? []);

  const expandedCandidates = [
    ...new Set([
      ...candidateIds.filter((id) => directConceptIds.has(id)),
      ...moduleTargetConceptIds,
    ]),
  ];
  if (expandedCandidates.length === 0) return [];

  const validRows = await dbClient.db
    .select({ id: concepts.id })
    .from(concepts)
    .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, expandedCandidates)))
    .limit(expandedCandidates.length);
  const validConceptIds = new Set(validRows.map((row) => row.id));

  return expandedCandidates.filter((id) => validConceptIds.has(id));
}

function referenceAnswerForQuestion(question: QuizQuestionRecord): string | undefined {
  if (typeof question.answer === "string" && question.answer.trim().length > 0)
    return question.answer;
  if (typeof question.referenceAnswer === "string" && question.referenceAnswer.trim().length > 0) {
    return question.referenceAnswer;
  }
  return undefined;
}

export async function handleQuizAnswerSubmitted(
  actionCtx: ActionContext,
): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, userId, envelope, payload, artifactId } = actionCtx;
  if (!artifactId) {
    return {
      ok: false,
      error: { code: "bad_request", message: "Quiz actions require an artifact reference." },
    };
  }

  const quizPayload = payload as z.infer<typeof quizAnswerSubmittedPayloadSchema>;
  const [artifact] = await ctx.db.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, notebookId)))
    .limit(1);
  if (!artifact || artifact.artifactType !== "quiz") {
    return { ok: false, error: { code: "not_found", message: "Quiz artifact not found." } };
  }

  const artifactPayload = (artifact.payloadJson ?? {}) as Record<string, unknown>;
  const questions = Array.isArray(artifactPayload.questions)
    ? artifactPayload.questions
        .map(normalizeQuestion)
        .filter((question): question is QuizQuestionRecord => Boolean(question))
    : [];
  const selectedQuestion = questions.find((question) => question.id === quizPayload.questionId);
  if (!selectedQuestion) {
    return {
      ok: false,
      error: { code: "bad_request", message: "Quiz question not found in artifact." },
    };
  }

  const conceptIds = await serverOwnedConceptIds(
    ctx.db,
    notebookId,
    selectedQuestion,
    actionCtx,
    artifactPayload,
  );
  if (conceptIds.length === 0) {
    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "Quiz question is missing server-owned concept refs.",
      },
    };
  }

  const explanation =
    quizPayload.explanation ??
    (typeof selectedQuestion?.explanation === "string" ? selectedQuestion.explanation : undefined);
  const referenceAnswer = referenceAnswerForQuestion(selectedQuestion);
  const judge = createOpenRouterMasteryEvaluatorJudge(ctx.env);
  const evaluation = await evaluateLearnerResponse(
    {
      notebookId,
      userId,
      ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
      ...(envelope.turnId ? { turnId: envelope.turnId } : {}),
      ...(envelope.runId ? { runId: envelope.runId } : {}),
      tutorQuestion:
        typeof selectedQuestion.prompt === "string" && selectedQuestion.prompt.trim().length > 0
          ? selectedQuestion.prompt
          : `Quiz question ${quizPayload.questionId}`,
      learnerAnswer: quizPayload.answer,
      conceptRoles: conceptIds.map((conceptId) => ({ conceptId, role: "primary" as const })),
      sourceRefs: actionCtx.block.sourceRefs.filter(
        (ref): ref is { refType: "source"; refId: string } => ref.refType === "source",
      ),
      contextRefs: [{ refType: "artifact", refId: artifactId }],
      masterySnapshot: {},
      ...(referenceAnswer ? { referenceAnswer } : {}),
      evidenceType: "quiz_artifact",
      triggerSource: "quiz_attempt",
    },
    judge ? { judge } : {},
  );
  const isCorrect = evaluation.correctnessLabel === "correct";
  const score = evaluation.overallScore;

  const result = await recordQuizAttempt(ctx.db, {
    notebookId,
    userId,
    artifactId,
    questionId: quizPayload.questionId,
    answer: quizPayload.answer,
    isCorrect,
    score,
    conceptIds,
    ...(explanation ? { explanation } : {}),
    evaluation: {
      correctnessLabel: evaluation.correctnessLabel,
      overallScore: evaluation.overallScore,
      confidence: evaluation.confidence,
      uncertainty: evaluation.uncertainty,
      evaluatorProvenance: evaluation.evaluatorProvenance,
    },
    ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
    ...(envelope.turnId ? { turnId: envelope.turnId } : {}),
    ...(envelope.runId ? { runId: envelope.runId } : {}),
  });

  return {
    ok: true,
    data: {
      updatedConceptStates: result.updatedConceptStates,
      attemptId: result.attemptId,
    },
  };
}
