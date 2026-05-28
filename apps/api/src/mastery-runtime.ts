export type PendingMasteryEvaluation = {
  turnId: string;
  tutorQuestion: string;
  conceptIds: string[];
  objectiveId: string | null;
  sourceRefs?: Array<{ refType: "source"; refId: string }>;
  contextRefs?: Array<{ refType: string; refId: string }>;
  sourceScopePolicy?: string;
  referenceAnswer?: string;
  createdAt: string;
};

const MASTERY_CHECK_PATTERN =
  /\b(quick check|mastery check|checkpoint|your turn|explain in your own words|quiz:|try this:|can you explain|what is|how would you|solve|calculate)\b/i;

const NAVIGATION_PATTERN =
  /\b(upload|add (a )?source|open (the )?wiki|switch to|show me the graph|create a note)\b/i;

const VAGUE_ACK_PATTERN = /^\s*(ok|okay|yes|yep|sure|thanks|thank you|got it|continue|next|k|cool|sounds good)\s*[.!]?$/i;

export function buildPendingEvaluationFromAssistantMessage(input: {
  turnId: string;
  assistantMessage: string;
  conceptIds: string[];
  objectiveId?: string | null;
  sourceRefs?: Array<{ refType: "source"; refId: string }>;
  contextRefs?: Array<{ refType: string; refId: string }>;
  sourceScopePolicy?: string;
  referenceAnswer?: string;
}): PendingMasteryEvaluation | null {
  const message = input.assistantMessage.trim();
  if (!message || NAVIGATION_PATTERN.test(message)) return null;
  const hasQuestion = message.includes("?") || MASTERY_CHECK_PATTERN.test(message);
  if (!hasQuestion) return null;

  return {
    turnId: input.turnId,
    tutorQuestion: message.slice(0, 1200),
    conceptIds: input.conceptIds,
    objectiveId: input.objectiveId ?? null,
    ...(input.sourceRefs?.length ? { sourceRefs: input.sourceRefs } : {}),
    ...(input.contextRefs?.length ? { contextRefs: input.contextRefs } : {}),
    ...(input.sourceScopePolicy ? { sourceScopePolicy: input.sourceScopePolicy } : {}),
    ...(input.referenceAnswer ? { referenceAnswer: input.referenceAnswer } : {}),
    createdAt: new Date().toISOString(),
  };
}

export function isVagueLearnerAcknowledgement(message: string): boolean {
  return VAGUE_ACK_PATTERN.test(message.trim());
}

export function isEligibleLearnerEvaluationAnswer(message: string, hasPendingPrompt: boolean): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (isVagueLearnerAcknowledgement(trimmed)) return false;
  if (NAVIGATION_PATTERN.test(trimmed)) return false;
  if (!hasPendingPrompt) return false;
  return trimmed.length >= 3;
}

export function shouldTriggerRuntimeMasteryEvaluation(input: {
  pendingEvaluation: PendingMasteryEvaluation | null | undefined;
  learnerMessage: string;
  alreadyEvaluatedTurnIds: string[];
}): boolean {
  if (!input.pendingEvaluation) return false;
  if (input.alreadyEvaluatedTurnIds.includes(input.pendingEvaluation.turnId)) return false;
  return isEligibleLearnerEvaluationAnswer(input.learnerMessage, true);
}

export function readPendingEvaluation(runtimeContext: Record<string, unknown> | null | undefined): PendingMasteryEvaluation | null {
  if (!runtimeContext || typeof runtimeContext !== "object") return null;
  const pending = runtimeContext.pendingMasteryEvaluation;
  if (!pending || typeof pending !== "object" || Array.isArray(pending)) return null;
  const record = pending as Record<string, unknown>;
  if (typeof record.turnId !== "string" || typeof record.tutorQuestion !== "string") return null;
  const parsed: PendingMasteryEvaluation = {
    turnId: record.turnId,
    tutorQuestion: record.tutorQuestion,
    conceptIds: Array.isArray(record.conceptIds) ? record.conceptIds.filter((v): v is string => typeof v === "string") : [],
    objectiveId: typeof record.objectiveId === "string" ? record.objectiveId : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
  };
  if (Array.isArray(record.sourceRefs)) {
    parsed.sourceRefs = record.sourceRefs
      .filter((ref): ref is Record<string, unknown> => Boolean(ref && typeof ref === "object" && !Array.isArray(ref)))
      .filter((ref): ref is { refType: "source"; refId: string } => ref.refType === "source" && typeof ref.refId === "string");
  }
  if (Array.isArray(record.contextRefs)) {
    parsed.contextRefs = record.contextRefs
      .filter((ref): ref is Record<string, unknown> => Boolean(ref && typeof ref === "object" && !Array.isArray(ref)))
      .filter((ref): ref is { refType: string; refId: string } => typeof ref.refType === "string" && typeof ref.refId === "string");
  }
  if (typeof record.sourceScopePolicy === "string") {
    parsed.sourceScopePolicy = record.sourceScopePolicy;
  }
  if (typeof record.referenceAnswer === "string") {
    parsed.referenceAnswer = record.referenceAnswer;
  }
  return parsed;
}

export function readEvaluatedTurnIds(runtimeContext: Record<string, unknown> | null | undefined): string[] {
  if (!runtimeContext || typeof runtimeContext !== "object") return [];
  const ids = runtimeContext.evaluatedMasteryTurnIds;
  return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === "string") : [];
}
