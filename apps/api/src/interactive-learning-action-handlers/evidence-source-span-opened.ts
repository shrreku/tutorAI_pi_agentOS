import { appendEventWithTutorCacheInvalidation as appendEvent } from "../agentic-cache-invalidation.js";
import {
  loadInteractiveBlockState,
  mergeInteractiveBlockState,
} from "../interactive-learning-state.js";
import type { ActionContext, ActionHandlerOutcome } from "./types.js";

export async function handleEvidenceSourceSpanOpened(
  actionCtx: ActionContext,
): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, envelope, payload } = actionCtx;
  const spanPayload = payload as { evidenceRefId?: string; spanId?: string; index?: number };
  const openedId = spanPayload.evidenceRefId ?? spanPayload.spanId;

  if (openedId) {
    const existing = await loadInteractiveBlockState(ctx, notebookId, envelope.blockId);
    const openedEvidenceRefIds = Array.isArray(existing.openedEvidenceRefIds)
      ? existing.openedEvidenceRefIds.filter((value): value is string => typeof value === "string")
      : [];
    if (!openedEvidenceRefIds.includes(openedId)) {
      openedEvidenceRefIds.push(openedId);
    }
    await mergeInteractiveBlockState(ctx, {
      notebookId,
      blockId: envelope.blockId,
      patch: { openedEvidenceRefIds },
    });
  }

  await appendEvent(ctx.db, {
    notebookId,
    eventType: "source.viewer.opened",
    payload: {
      sourceId: envelope.sourceRefs[0]?.refId,
      spanId: spanPayload.spanId ?? spanPayload.evidenceRefId,
    },
  });

  return { ok: true, data: {} };
}
