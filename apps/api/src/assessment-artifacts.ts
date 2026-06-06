import { and, desc, eq, inArray } from "drizzle-orm";
import { artifacts, concepts, quizAttempts, type DbClient } from "@studyagent/db";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";
import { applyLearningOutcome } from "./learning-outcome.js";

type RuntimeMeta = {
  notebookId: string;
  userId: string;
  runId?: string;
  sessionId?: string;
};

type ConceptSummary = {
  id: string;
  name: string;
  description: string | null;
};

async function loadConcepts(
  dbClient: DbClient,
  notebookId: string,
  conceptIds: string[],
  fallbackLimit: number,
): Promise<ConceptSummary[]> {
  if (conceptIds.length > 0) {
    const rows = await dbClient.db
      .select({
        id: concepts.id,
        name: concepts.canonicalName,
        description: concepts.description,
      })
      .from(concepts)
      .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, conceptIds)));
    return rows;
  }

  return dbClient.db
    .select({
      id: concepts.id,
      name: concepts.canonicalName,
      description: concepts.description,
    })
    .from(concepts)
    .where(eq(concepts.notebookId, notebookId))
    .orderBy(desc(concepts.updatedAt))
    .limit(fallbackLimit);
}

export async function buildQuizArtifactPayload(
  dbClient: DbClient,
  notebookId: string,
  conceptIds: string[],
  questionCount: number,
  prompt: string,
): Promise<Record<string, unknown>> {
  const selectedConcepts = await loadConcepts(dbClient, notebookId, conceptIds, questionCount);
  const questions = selectedConcepts.slice(0, questionCount).map((concept, index) => ({
    id: `quizq_${crypto.randomUUID().replaceAll("-", "")}`,
    conceptId: concept.id,
    prompt: `How would you explain ${concept.name} in your own words?`,
    referenceAnswer:
      concept.description?.trim() ||
      `${concept.name} is a key notebook concept. Explain what it is, why it matters, and connect it to the uploaded material.`,
    explanation: `Focus your review on ${concept.name} and tie your answer back to the notebook evidence.`,
    orderIndex: index,
  }));

  return {
    prompt,
    conceptIds: selectedConcepts.map((concept) => concept.id),
    questions,
    questionCount: questions.length,
  };
}

export async function buildFlashcardsArtifactPayload(
  dbClient: DbClient,
  notebookId: string,
  conceptIds: string[],
  cardCount: number,
  prompt: string,
): Promise<Record<string, unknown>> {
  const selectedConcepts = await loadConcepts(dbClient, notebookId, conceptIds, cardCount);
  const cards = selectedConcepts.slice(0, cardCount).map((concept, index) => ({
    id: `card_${crypto.randomUUID().replaceAll("-", "")}`,
    conceptId: concept.id,
    front: `What is ${concept.name}?`,
    back:
      concept.description?.trim() ||
      `${concept.name} is a notebook concept to review. State the definition, a relevant example, and when to use it.`,
    orderIndex: index,
  }));

  return {
    prompt,
    conceptIds: selectedConcepts.map((concept) => concept.id),
    cards,
    cardCount: cards.length,
    reviews: [],
  };
}

export async function recordQuizAttempt(
  dbClient: DbClient,
  input: RuntimeMeta & {
    artifactId: string;
    questionId: string;
    answer: string;
    isCorrect: boolean;
    score?: number;
    conceptIds: string[];
    explanation?: string;
  },
): Promise<{ attemptId: string; updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }> }> {
  const attemptId = `qat_${crypto.randomUUID().replaceAll("-", "")}`;
  await dbClient.db.insert(quizAttempts).values({
    id: attemptId,
    artifactId: input.artifactId,
    notebookId: input.notebookId,
    sessionId: input.sessionId ?? null,
    userId: input.userId,
    questionId: input.questionId,
    answerJson: {
      answer: input.answer,
      explanation: input.explanation,
    },
    isCorrect: input.isCorrect ? 1 : 0,
    score: input.score ?? (input.isCorrect ? 1 : 0),
    conceptIds: input.conceptIds,
  });

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "quiz.attempt.recorded",
    payload: {
      attemptId,
      artifactId: input.artifactId,
      questionId: input.questionId,
      isCorrect: input.isCorrect,
      conceptIds: input.conceptIds,
    },
  });

  const learning = await applyLearningOutcome(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    conceptIds: input.conceptIds,
    outcome: input.isCorrect ? "correct" : "incorrect",
    reason: "quiz_attempt",
    metadata: {
      artifactId: input.artifactId,
      questionId: input.questionId,
    },
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  return { attemptId, updatedConceptStates: learning.updatedConceptStates };
}

export async function recordFlashcardReview(
  dbClient: DbClient,
  input: RuntimeMeta & {
    artifactId: string;
    cardId: string;
    result: "again" | "hard" | "good" | "easy";
    conceptIds: string[];
  },
): Promise<{ updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }> }> {
  const [artifact] = await dbClient.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, input.artifactId), eq(artifacts.notebookId, input.notebookId)))
    .limit(1);

  if (artifact) {
    const payload = { ...(artifact.payloadJson ?? {}) };
    const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
    reviews.push({
      cardId: input.cardId,
      result: input.result,
      reviewedAt: new Date().toISOString(),
      conceptIds: input.conceptIds,
    });
    payload.reviews = reviews;

    await dbClient.db
      .update(artifacts)
      .set({
        payloadJson: payload,
        updatedAt: new Date(),
      })
      .where(eq(artifacts.id, input.artifactId));
  }

  const learning = await applyLearningOutcome(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    conceptIds: input.conceptIds,
    outcome: input.result,
    reason: "flashcard_review",
    metadata: {
      artifactId: input.artifactId,
      cardId: input.cardId,
    },
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  return { updatedConceptStates: learning.updatedConceptStates };
}
