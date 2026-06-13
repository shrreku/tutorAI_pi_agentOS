import { and, eq } from "drizzle-orm";
import { artifacts } from "@studyagent/db";
import type { flashcardReviewRatedPayloadSchema } from "@studyagent/schemas";
import type { z } from "zod";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "../agentic-cache-invalidation.js";
import { recordFlashcardReview } from "../assessment-artifacts.js";
import type { ActionContext, ActionHandlerOutcome } from "./types.js";
import { isRecord } from "./shared.js";

export async function handleFlashcardReviewRated(actionCtx: ActionContext): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, userId, envelope, payload, artifactId } = actionCtx;
  if (!artifactId) {
    return { ok: false, error: { code: "bad_request", message: "Flashcard actions require an artifact reference." } };
  }

  const flashcardPayload = payload as z.infer<typeof flashcardReviewRatedPayloadSchema>;
  const [artifact] = await ctx.db.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, notebookId)))
    .limit(1);
  if (!artifact || artifact.artifactType !== "flashcards") {
    return { ok: false, error: { code: "not_found", message: "Flashcards artifact not found." } };
  }

  const artifactPayload = (artifact.payloadJson ?? {}) as Record<string, unknown>;
  const cards = Array.isArray(artifactPayload.cards) ? artifactPayload.cards : [];
  const selectedCard = cards.find((card) => isRecord(card) && card.id === flashcardPayload.cardId) as
    | { conceptId?: string }
    | undefined;

  const conceptIds = (
    flashcardPayload.conceptIds?.length
      ? flashcardPayload.conceptIds
      : selectedCard?.conceptId
        ? [selectedCard.conceptId]
        : []
  ).filter((value): value is string => typeof value === "string" && value.length > 0);

  const result = await recordFlashcardReview(ctx.db, {
    notebookId,
    userId,
    artifactId,
    cardId: flashcardPayload.cardId,
    result: flashcardPayload.result,
    conceptIds,
    ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
    ...(envelope.runId ? { runId: envelope.runId } : {}),
  });

  await appendEvent(ctx.db, {
    notebookId,
    ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
    ...(envelope.runId ? { runId: envelope.runId } : {}),
    eventType: "artifact.updated",
    payload: {
      artifactId,
      artifactType: "flashcards",
      status: artifact.status,
    },
  });

  return { ok: true, data: { updatedConceptStates: result.updatedConceptStates } };
}
