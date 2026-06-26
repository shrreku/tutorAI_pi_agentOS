import { appendEventWithTutorCacheInvalidation as appendEvent } from "../agentic-cache-invalidation.js";
import type { ActionContext, ActionHandlerOutcome } from "./types.js";

export async function handleTutorHelpRequested(
  actionCtx: ActionContext,
): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, envelope } = actionCtx;

  await appendEvent(ctx.db, {
    notebookId,
    ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
    eventType: "tutor.checkpoint.requested",
    payload: {
      sessionId: envelope.sessionId,
      checkpointId: envelope.blockId,
      message: (actionCtx.payload as { message?: string }).message,
    },
  });

  return { ok: true, data: {} };
}
