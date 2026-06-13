import { and, desc, eq, inArray } from "drizzle-orm";
import { events } from "@studyagent/db";
import type { AppContext } from "./context.js";

const INTERACTIVE_TUTOR_EVENT_TYPES = [
  "quiz.attempt.recorded",
  "tutor.checkpoint.requested",
  "artifact.updated",
  "student_profile.updated",
  "source.viewer.opened",
] as const;

export async function loadInteractiveLearningTutorContext(
  ctx: AppContext,
  input: {
    notebookId: string;
    sessionId?: string;
    limit?: number;
  },
): Promise<string[]> {
  const rows = await ctx.db.db
    .select({
      eventType: events.eventType,
      payloadJson: events.payloadJson,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(
      and(
        eq(events.notebookId, input.notebookId),
        inArray(events.eventType, [...INTERACTIVE_TUTOR_EVENT_TYPES]),
        ...(input.sessionId ? [eq(events.sessionId, input.sessionId)] : []),
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(input.limit ?? 8);

  return rows
    .map((row) =>
      formatInteractiveTutorLine(
        row.eventType,
        row.payloadJson ?? {},
        row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date().toISOString(),
      ),
    )
    .filter((line): line is string => Boolean(line));
}

function formatInteractiveTutorLine(
  eventType: string,
  payload: Record<string, unknown>,
  createdAt: string,
): string | null {
  if (eventType === "quiz.attempt.recorded") {
    const questionId = typeof payload.questionId === "string" ? payload.questionId : "question";
    const isCorrect = payload.isCorrect === true;
    return `[${createdAt}] Learner submitted quiz answer for ${questionId}: ${isCorrect ? "correct" : "incorrect"}.`;
  }
  if (eventType === "tutor.checkpoint.requested") {
    const message = typeof payload.message === "string" ? payload.message : null;
    return `[${createdAt}] Learner requested tutor help${message ? `: ${message}` : ""}.`;
  }
  if (eventType === "artifact.updated" && payload.artifactType === "flashcards") {
    return `[${createdAt}] Learner rated a flashcard review.`;
  }
  if (eventType === "artifact.updated" && payload.artifactType === "worked_example") {
    return `[${createdAt}] Learner answered or revealed a worked-example step.`;
  }
  if (eventType === "artifact.updated" && payload.artifactType === "simulation") {
    return `[${createdAt}] Learner submitted a simulation observation.`;
  }
  if (eventType === "student_profile.updated") {
    const preference = typeof payload.preference === "string" ? payload.preference : "preference";
    const value = typeof payload.value === "string" ? payload.value : "updated";
    return `[${createdAt}] Learner updated ${preference} to ${value}.`;
  }
  if (eventType === "source.viewer.opened" && typeof payload.annotation === "string") {
    return `[${createdAt}] Learner annotated a source span: ${payload.annotation}`;
  }
  return null;
}
