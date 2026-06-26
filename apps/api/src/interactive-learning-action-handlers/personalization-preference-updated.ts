import { appendEventWithTutorCacheInvalidation as appendEvent } from "../agentic-cache-invalidation.js";
import { persistPersonalizationPreference } from "../interactive-learning-personalization.js";
import {
  loadInteractiveBlockState,
  mergeInteractiveBlockState,
} from "../interactive-learning-state.js";
import type { ActionContext, ActionHandlerOutcome } from "./types.js";

export async function handlePersonalizationPreferenceUpdated(
  actionCtx: ActionContext,
): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, userId, envelope, payload } = actionCtx;
  const preferencePayload = payload as {
    preference?: "pace" | "depth" | "examples" | "assessment" | "urgency";
    value?: string;
  };

  if (!preferencePayload.preference || !preferencePayload.value) {
    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "Personalization updates require preference and value.",
      },
    };
  }

  await persistPersonalizationPreference(ctx, {
    notebookId,
    userId,
    preference: preferencePayload.preference,
    value: preferencePayload.value,
    ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
    ...(envelope.runId ? { runId: envelope.runId } : {}),
  });

  const existing = await loadInteractiveBlockState(ctx, notebookId, envelope.blockId);
  const updatedPreferences = Array.isArray(existing.updatedPreferences)
    ? existing.updatedPreferences
    : [];
  updatedPreferences.push({
    preference: preferencePayload.preference,
    value: preferencePayload.value,
    updatedAt: new Date().toISOString(),
  });
  await mergeInteractiveBlockState(ctx, {
    notebookId,
    blockId: envelope.blockId,
    patch: { updatedPreferences },
  });
  await appendEvent(ctx.db, {
    notebookId,
    eventType: "student_profile.updated",
    payload: {
      preference: preferencePayload.preference,
      value: preferencePayload.value,
    },
  });

  return { ok: true, data: {} };
}
