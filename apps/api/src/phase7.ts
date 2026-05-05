import { and, desc, eq, inArray } from "drizzle-orm";
import {
  appendEvent,
  artifacts,
  concepts,
  learningState,
  quizAttempts,
  studyPlans,
  tutorSessions,
  type DbClient,
} from "@studyagent/db";

type ConceptSummary = {
  id: string;
  name: string;
  description: string | null;
};

type RuntimeMeta = {
  notebookId: string;
  userId: string;
  runId?: string;
  sessionId?: string;
};

type DigestRuntimeMeta = {
  notebookId: string;
  sessionId: string;
  runId?: string;
};

type LearningOutcomeInput = RuntimeMeta & {
  conceptIds: string[];
  outcome: "correct" | "incorrect" | "again" | "hard" | "good" | "easy";
  reason: string;
  metadata?: Record<string, unknown>;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function daysFromNow(days: number): Date {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next;
}

type TutorSessionDigestContext = {
  sessionId: string;
  assistantMessage: string;
  userMessage: string;
  currentObjective?: string;
  sourceIds: string[];
  citationIds: string[];
  artifactProposalIds: string[];
  studyPlanSummary?: string;
  learnerStateSummary?: string;
  turnId?: string;
  status: "draft" | "ready";
};

export function buildTutorSessionDigestPayload(input: TutorSessionDigestContext): Record<string, unknown> {
  const nextStep = input.currentObjective ? `Continue with ${input.currentObjective}` : "Continue the current tutoring path";

  return {
    sessionId: input.sessionId,
    status: input.status,
    summary: input.assistantMessage,
    learnerMessage: input.userMessage,
    currentObjective: input.currentObjective ?? null,
    studyPlanSummary: input.studyPlanSummary ?? null,
    learnerStateSummary: input.learnerStateSummary ?? null,
    nextStep,
    provenance: {
      sourceIds: input.sourceIds,
      citationIds: input.citationIds,
      artifactProposalIds: input.artifactProposalIds,
      turnId: input.turnId ?? null,
    },
  };
}

export async function upsertTutorSessionDigestArtifact(
  dbClient: DbClient,
  input: DigestRuntimeMeta & TutorSessionDigestContext,
): Promise<{ artifactId: string; created: boolean }> {
  const existing = await dbClient.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.notebookId, input.notebookId), eq(artifacts.artifactType, "session_digest")))
    .orderBy(desc(artifacts.updatedAt))
    .limit(50);

  const existingMatchesSession = existing.find((artifact) => {
    const payload = artifact.payloadJson;
    return typeof payload === "object" && payload !== null && (payload as Record<string, unknown>).sessionId === input.sessionId;
  });
  const payloadJson = buildTutorSessionDigestPayload(input);
  const now = new Date();

  if (existingMatchesSession) {
    await dbClient.db
      .update(artifacts)
      .set({
        title: input.status === "ready" ? `Session digest · ${now.toLocaleDateString("en-US")}` : `Session digest draft · ${now.toLocaleDateString("en-US")}`,
        status: input.status,
        payloadJson,
        sourceNodeRefsJson: input.sourceIds.map((sourceId) => ({ refType: "source", refId: sourceId })),
        sourceClaimIds: input.citationIds,
        sourceChunkIds: [],
        createdByRunId: input.runId,
        updatedAt: now,
      })
      .where(eq(artifacts.id, existingMatchesSession.id));

    return { artifactId: existingMatchesSession.id, created: false };
  }

  const artifactId = `artifact_${crypto.randomUUID().replaceAll("-", "")}`;
  await dbClient.db.insert(artifacts).values({
    id: artifactId,
    notebookId: input.notebookId,
    artifactType: "session_digest",
    title: input.status === "ready" ? `Session digest · ${now.toLocaleDateString("en-US")}` : `Session digest draft · ${now.toLocaleDateString("en-US")}`,
    status: input.status,
    payloadJson,
    sourceNodeRefsJson: input.sourceIds.map((sourceId) => ({ refType: "source", refId: sourceId })),
    sourceClaimIds: input.citationIds,
    sourceChunkIds: [],
    createdByRunId: input.runId,
  });

  return { artifactId, created: true };
}

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

export async function applyLearningOutcome(
  dbClient: DbClient,
  input: LearningOutcomeInput,
): Promise<{
  updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
  weakConceptIds: string[];
}> {
  const conceptIds = [...new Set(input.conceptIds.filter(Boolean))];
  if (!conceptIds.length) {
    return { updatedConceptStates: [], weakConceptIds: [] };
  }

  const deltas: Record<LearningOutcomeInput["outcome"], { mastery: number; nextReviewDays: number }> = {
    correct: { mastery: 0.14, nextReviewDays: 7 },
    incorrect: { mastery: -0.2, nextReviewDays: 1 },
    again: { mastery: -0.12, nextReviewDays: 1 },
    hard: { mastery: -0.04, nextReviewDays: 2 },
    good: { mastery: 0.08, nextReviewDays: 4 },
    easy: { mastery: 0.14, nextReviewDays: 10 },
  };

  const delta = deltas[input.outcome];
  const now = new Date();
  const nextReviewAt = daysFromNow(delta.nextReviewDays);
  const weakConceptIds: string[] = [];
  const updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }> = [];

  for (const conceptId of conceptIds) {
    const [existing] = await dbClient.db
      .select()
      .from(learningState)
      .where(
        and(
          eq(learningState.notebookId, input.notebookId),
          eq(learningState.userId, input.userId),
          eq(learningState.conceptId, conceptId),
        ),
      )
      .limit(1);

    const nextMastery = clamp((existing?.masteryScore ?? 0.35) + delta.mastery);
    const nextConfidence = clamp((existing?.confidence ?? 0.5) + delta.mastery / 2);
    const misconceptionJson =
      input.outcome === "correct" || input.outcome === "good" || input.outcome === "easy"
        ? existing?.misconceptionJson ?? null
        : {
            reason: input.reason,
            observedAt: now.toISOString(),
            ...(input.metadata ?? {}),
          };

    if (existing) {
      await dbClient.db
        .update(learningState)
        .set({
          masteryScore: nextMastery,
          confidence: nextConfidence,
          lastPracticedAt: now,
          nextReviewAt,
          misconceptionJson,
          metadataJson: {
            ...(existing.metadataJson ?? {}),
            lastOutcome: input.outcome,
            lastReason: input.reason,
          },
        })
        .where(eq(learningState.id, existing.id));
    } else {
      await dbClient.db.insert(learningState).values({
        id: `ls_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: input.notebookId,
        userId: input.userId,
        conceptId,
        masteryScore: nextMastery,
        confidence: nextConfidence,
        lastPracticedAt: now,
        nextReviewAt,
        misconceptionJson,
        metadataJson: {
          lastOutcome: input.outcome,
          lastReason: input.reason,
        },
      });
    }

    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      eventType: "learning.mastery.updated",
      payload: {
        conceptId,
        masteryScore: nextMastery,
        confidence: nextConfidence,
        outcome: input.outcome,
        reason: input.reason,
      },
    });

    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      eventType: "learning.review.scheduled",
      payload: {
        conceptId,
        nextReviewAt: nextReviewAt.toISOString(),
        outcome: input.outcome,
      },
    });

    if (nextMastery < 0.45) {
      weakConceptIds.push(conceptId);
      await appendEvent(dbClient, {
        notebookId: input.notebookId,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        eventType: "learning.weak_concept.added",
        payload: {
          conceptId,
          masteryScore: nextMastery,
          outcome: input.outcome,
        },
      });
    }

    updatedConceptStates.push({
      conceptId,
      masteryScore: nextMastery,
      nextReviewAt: nextReviewAt.toISOString(),
    });
  }

  const [studyPlan] = await dbClient.db
    .select()
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, input.notebookId), eq(studyPlans.userId, input.userId)))
    .limit(1);

  if (studyPlan) {
    const nextWeak = new Set(studyPlan.weakConceptIds ?? []);
    for (const conceptId of conceptIds) {
      const state = updatedConceptStates.find((item) => item.conceptId === conceptId);
      if (!state) continue;
      if (state.masteryScore < 0.45) nextWeak.add(conceptId);
      if (state.masteryScore >= 0.65) nextWeak.delete(conceptId);
    }

    await dbClient.db
      .update(studyPlans)
      .set({
        weakConceptIds: [...nextWeak],
        updatedAt: now,
      })
      .where(eq(studyPlans.id, studyPlan.id));

    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      eventType: "study_plan.updated",
      payload: {
        studyPlanId: studyPlan.id,
        weakConceptIds: [...nextWeak],
      },
    });
  }

  return { updatedConceptStates, weakConceptIds };
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

export async function crystallizeTutorSession(
  dbClient: DbClient,
  input: RuntimeMeta & {
    sessionId: string;
    assistantMessage: string;
    userMessage: string;
    currentObjective?: string;
    sourceIds: string[];
    citationIds: string[];
    artifactProposalIds: string[];
    studyPlanSummary?: string;
    learnerStateSummary?: string;
  },
): Promise<{ artifactId: string }> {
  const now = new Date();

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "session.crystallization.started",
    payload: {
      currentObjective: input.currentObjective,
      sourceIds: input.sourceIds,
      citationIds: input.citationIds,
    },
  });

  const digest = await upsertTutorSessionDigestArtifact(dbClient, {
    ...input,
    status: "ready",
  });

  if (digest.created) {
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      ...(input.runId ? { runId: input.runId } : {}),
      eventType: "artifact.created",
      payload: {
        artifactId: digest.artifactId,
        artifactType: "session_digest",
        title: `Session digest · ${now.toLocaleDateString("en-US")}`,
      },
    });
  }

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "artifact.ready",
    payload: {
      artifactId: digest.artifactId,
      artifactType: "session_digest",
    },
  });

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "session.crystallization.completed",
    payload: {
      artifactId: digest.artifactId,
      artifactType: "session_digest",
    },
  });

  await dbClient.db
    .update(tutorSessions)
    .set({
      status: "completed",
      endedAt: now,
      runtimeContextJson: {
        crystallizedArtifactId: digest.artifactId,
        updatedAt: now.toISOString(),
      },
    })
    .where(eq(tutorSessions.id, input.sessionId));

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "session.completed",
    payload: {
      sessionId: input.sessionId,
      artifactId: digest.artifactId,
    },
  });

  return { artifactId: digest.artifactId };
}
