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

type GeneratedQuizQuestion = {
  id: string;
  conceptId: string;
  conceptIds: string[];
  prompt: string;
  choices: string[];
  answer: string;
  referenceAnswer: string;
  explanation: string;
  difficulty: string;
  orderIndex: number;
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
  const questions = selectedConcepts
    .slice(0, questionCount)
    .map((concept, index) => buildGeneratedQuizQuestion(concept, selectedConcepts, index));

  return {
    prompt,
    conceptIds: selectedConcepts.map((concept) => concept.id),
    questions,
    questionCount: questions.length,
  };
}

function buildGeneratedQuizQuestion(
  concept: ConceptSummary,
  concepts: ConceptSummary[],
  index: number,
): GeneratedQuizQuestion {
  const referenceAnswer = conceptReferenceAnswer(concept);
  const templateIndex = index % 5;
  const question = generatedQuestionTemplate(concept.name, referenceAnswer, templateIndex);
  const choices = orderedChoices(
    question.answer,
    [
      `It is mainly about ${otherConceptName(concept, concepts)} and does not change how ${concept.name} is used.`,
      "It is only a vocabulary label to memorize without applying it to source evidence.",
      "It means the same thing in every situation, so conditions and assumptions do not matter.",
      "It should be chosen only because it sounds familiar, not because it fits the problem.",
    ],
    index,
  );

  return {
    id: `quizq_${crypto.randomUUID().replaceAll("-", "")}`,
    conceptId: concept.id,
    conceptIds: [concept.id],
    prompt: question.prompt,
    choices,
    answer: question.answer,
    referenceAnswer: question.answer,
    explanation: `${concept.name}: ${referenceAnswer}`,
    difficulty: question.difficulty,
    orderIndex: index,
  };
}

function conceptReferenceAnswer(concept: ConceptSummary): string {
  const description = concept.description?.trim().replace(/\s+/g, " ");
  if (description) return stripTrailingPeriod(description);
  return `${concept.name} is a key notebook concept that should be connected to the uploaded material and the current practice goal`;
}

function generatedQuestionTemplate(
  conceptName: string,
  referenceAnswer: string,
  templateIndex: number,
): { prompt: string; answer: string; difficulty: string } {
  switch (templateIndex) {
    case 0:
      return {
        prompt: `Which statement best describes ${conceptName}?`,
        answer: referenceAnswer,
        difficulty: "recall",
      };
    case 1:
      return {
        prompt: `What is the main role of ${conceptName} in this material?`,
        answer: `It helps explain or calculate this idea: ${lowerFirst(referenceAnswer)}`,
        difficulty: "application",
      };
    case 2:
      return {
        prompt: `Which answer shows a good use of ${conceptName}?`,
        answer: `Connect ${conceptName} to the relevant conditions, evidence, and result: ${lowerFirst(referenceAnswer)}`,
        difficulty: "application",
      };
    case 3:
      return {
        prompt: `Which mistake should you avoid when reasoning about ${conceptName}?`,
        answer: `Do not treat ${conceptName} as an isolated label; use the conditions and source evidence behind it.`,
        difficulty: "misconception",
      };
    default:
      return {
        prompt: `Why does ${conceptName} matter for solving problems from this lesson?`,
        answer: `Because it anchors the reasoning needed to apply this idea: ${lowerFirst(referenceAnswer)}`,
        difficulty: "transfer",
      };
  }
}

function orderedChoices(correctAnswer: string, distractors: string[], index: number): string[] {
  const uniqueChoices = [correctAnswer, ...distractors]
    .map((choice) => stripTrailingPeriod(choice.trim()))
    .filter(
      (choice, choiceIndex, choices) =>
        choice.length > 0 && choices.indexOf(choice) === choiceIndex,
    )
    .slice(0, 4);

  while (uniqueChoices.length < 4) {
    uniqueChoices.push(
      `Distractor ${uniqueChoices.length}: this does not match the source-backed idea`,
    );
  }

  const correct = uniqueChoices.shift()!;
  const insertAt = index % 4;
  uniqueChoices.splice(insertAt, 0, correct);
  return uniqueChoices;
}

function otherConceptName(concept: ConceptSummary, concepts: ConceptSummary[]): string {
  return concepts.find((entry) => entry.id !== concept.id)?.name ?? "a different concept";
}

function stripTrailingPeriod(value: string): string {
  return value.replace(/[.。]\s*$/, "");
}

function lowerFirst(value: string): string {
  if (!value) return value;
  return value.slice(0, 1).toLowerCase() + value.slice(1);
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
    evaluation?: Record<string, unknown>;
  },
): Promise<{
  attemptId: string;
  updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
}> {
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
      ...(input.evaluation ? { serverEvaluation: input.evaluation } : {}),
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
      score: input.score ?? (input.isCorrect ? 1 : 0),
      ...(input.evaluation ? { serverEvaluation: input.evaluation } : {}),
    },
  });

  const learning = await applyLearningOutcome(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    conceptIds: input.conceptIds,
    outcome: quizLearningOutcome(input),
    reason: "quiz_attempt",
    metadata: {
      artifactId: input.artifactId,
      questionId: input.questionId,
      answer: input.answer,
      ...(input.score !== undefined ? { score: input.score } : {}),
    },
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  return { attemptId, updatedConceptStates: learning.updatedConceptStates };
}

function quizLearningOutcome(input: {
  isCorrect: boolean;
  score?: number;
  evaluation?: Record<string, unknown>;
}) {
  const label = input.evaluation?.correctnessLabel;
  if (label === "correct") return "correct";
  if (label === "partial") return "good";
  if (label === "needs_more_evidence") return "hard";
  if (label === "incorrect") return "incorrect";
  if (input.isCorrect) return "correct";
  return typeof input.score === "number" && input.score >= 0.45 ? "good" : "incorrect";
}

export async function recordFlashcardReview(
  dbClient: DbClient,
  input: RuntimeMeta & {
    artifactId: string;
    cardId: string;
    result: "again" | "hard" | "good" | "easy";
    conceptIds: string[];
  },
): Promise<{
  updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
}> {
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

  return { updatedConceptStates: [] };
}
