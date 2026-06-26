import { mergeInteractiveBlockState } from "../interactive-learning-state.js";
import type { ActionContext, ActionHandlerOutcome } from "./types.js";

export async function handleSurfaceCompleted(
  actionCtx: ActionContext,
): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, envelope } = actionCtx;

  await mergeInteractiveBlockState(ctx, {
    notebookId,
    blockId: envelope.blockId,
    patch: {
      completedAt: new Date().toISOString(),
    },
  });

  return { ok: true, data: {} };
}
