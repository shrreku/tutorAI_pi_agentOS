import {
  buildQuizAnswerSubmittedEnvelope,
  type InteractiveLearningActionResponse,
  type InteractiveLearningBlock,
  type ReferenceSurface,
} from "@studyagent/schemas";
import { dispatchInteractiveLearningAction } from "./mcp-app-bridge.js";
import type { QuizQuestion } from "../quiz-utils.js";

function findQuizBlock(surface: ReferenceSurface): InteractiveLearningBlock | null {
  const fromInteractive = surface.interactiveBlocks?.find((block) => block.kind === "quiz");
  if (fromInteractive) return fromInteractive;

  const artifactId = surface.nodeRef.refType === "artifact" ? surface.nodeRef.refId : undefined;
  if (!artifactId) return null;

  return {
    id: `interactive_quiz_${artifactId}`,
    kind: "quiz",
    title: surface.title,
    learningPurpose: "Practice quiz",
    surfaceRole: "primary",
    nodeRef: surface.nodeRef,
    artifactRef: { refType: "artifact", refId: artifactId },
    objectiveRefs: [],
    conceptRefs: [],
    sourceRefs: [],
    evidenceRefs: [],
    prompt: null,
    content: {},
    canonicalState: {},
    allowedActions: ["quiz.answer_submitted", "tutor.help_requested"],
    rendererPreference: "mcp_app",
    fallbackSummary: null,
    quality: { sourceBacked: false, needsReview: false },
  };
}

export function quizAttemptsFromSurface(surface: ReferenceSurface | undefined): Record<string, { answer: string; isCorrect: boolean }> {
  if (!surface) return {};
  const quizBlock = findQuizBlock(surface);
  const attempts = quizBlock?.canonicalState;
  if (!attempts || typeof attempts !== "object" || Array.isArray(attempts)) return {};

  const rawAttempts = (attempts as { attempts?: unknown }).attempts;
  if (!Array.isArray(rawAttempts)) return {};

  const byQuestion: Record<string, { answer: string; isCorrect: boolean }> = {};
  for (const attempt of rawAttempts) {
    if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) continue;
    const record = attempt as { questionId?: string; answer?: string; isCorrect?: boolean };
    if (typeof record.questionId !== "string" || byQuestion[record.questionId]) continue;
    byQuestion[record.questionId] = {
      answer:
        typeof record.answer === "string"
          ? record.answer
          : record.isCorrect
            ? "correct"
            : "attempted",
      isCorrect: Boolean(record.isCorrect),
    };
  }
  return byQuestion;
}

export async function submitQuizAnswerAction(input: {
  notebookId: string;
  surface: ReferenceSurface;
  question: QuizQuestion;
  answer: string;
  isCorrect: boolean;
  score?: number;
  sessionId?: string;
  turnId?: string;
  runId?: string;
}): Promise<InteractiveLearningActionResponse> {
  const quizBlock = findQuizBlock(input.surface);
  if (!quizBlock) {
    throw new Error("Quiz interactive block not found on reference surface.");
  }
  const explanation = input.question.explanation ?? input.question.referenceAnswer;
  const envelope = buildQuizAnswerSubmittedEnvelope({
    notebookId: input.notebookId,
    surface: {
      id: input.surface.id,
      nodeRef: input.surface.nodeRef,
      ...(quizBlock.artifactRef ? { artifactRef: quizBlock.artifactRef } : {}),
      interactiveBlocks: input.surface.interactiveBlocks?.map((block) => ({ id: block.id, kind: block.kind })),
    },
    questionId: input.question.id,
    answer: input.answer,
    conceptIds: input.question.conceptIds,
    ...(explanation ? { explanation } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.turnId ? { turnId: input.turnId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
  });

  const response = await fetch(`/api/v1/notebooks/${encodeURIComponent(input.notebookId)}/interactive-learning/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });
  if (!response.ok) {
    throw new Error(`Interactive learning action failed (${response.status})`);
  }
  return (await response.json()) as InteractiveLearningActionResponse;
}

export { dispatchInteractiveLearningAction };
