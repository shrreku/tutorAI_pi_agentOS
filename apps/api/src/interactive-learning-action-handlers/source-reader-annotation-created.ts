import { appendEventWithTutorCacheInvalidation as appendEvent } from "../agentic-cache-invalidation.js";
import { loadInteractiveBlockState, mergeInteractiveBlockState } from "../interactive-learning-state.js";
import type { ActionContext, ActionHandlerOutcome } from "./types.js";

export async function handleSourceReaderAnnotationCreated(actionCtx: ActionContext): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, envelope, payload } = actionCtx;
  const annotationPayload = payload as { spanId?: string; annotation?: string; confusing?: boolean };

  if (!annotationPayload.spanId || !annotationPayload.annotation) {
    return {
      ok: false,
      error: { code: "bad_request", message: "Source reader annotations require spanId and annotation." },
    };
  }

  const existing = await loadInteractiveBlockState(ctx, notebookId, envelope.blockId);
  const annotations = Array.isArray(existing.annotations) ? existing.annotations : [];
  annotations.push({
    spanId: annotationPayload.spanId,
    annotation: annotationPayload.annotation,
    confusing: annotationPayload.confusing ?? false,
    createdAt: new Date().toISOString(),
  });
  await mergeInteractiveBlockState(ctx, {
    notebookId,
    blockId: envelope.blockId,
    patch: {
      annotations,
      selectedSpanId: annotationPayload.spanId,
    },
  });
  await appendEvent(ctx.db, {
    notebookId,
    eventType: "source.viewer.opened",
    payload: {
      sourceId: envelope.sourceRefs[0]?.refId ?? envelope.nodeRef.refId,
      spanId: annotationPayload.spanId,
      annotation: annotationPayload.annotation,
    },
  });

  return { ok: true, data: {} };
}
