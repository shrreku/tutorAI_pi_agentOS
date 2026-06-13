import { appendEventWithTutorCacheInvalidation as appendEvent } from "../agentic-cache-invalidation.js";
import type { ActionContext, ActionHandlerOutcome } from "./types.js";

export async function handleLivePlanActionSelected(actionCtx: ActionContext): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, envelope, block, payload } = actionCtx;

  await appendEvent(ctx.db, {
    notebookId,
    ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
    eventType: "session.focus.updated",
    payload: {
      sessionId: envelope.sessionId,
      action: (payload as { actionId?: string }).actionId,
      nodeRef: envelope.nodeRef,
      blockKind: block.kind,
      blockId: envelope.blockId,
    },
  });

  return { ok: true, data: {} };
}
