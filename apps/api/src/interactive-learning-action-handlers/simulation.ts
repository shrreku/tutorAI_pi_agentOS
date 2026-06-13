import { appendEventWithTutorCacheInvalidation as appendEvent } from "../agentic-cache-invalidation.js";
import { persistSimulationObservation } from "../interactive-learning-state.js";
import type { ActionContext, ActionHandlerOutcome } from "./types.js";

export async function handleSimulationSubmitted(actionCtx: ActionContext): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, envelope, payload, nodeId, artifactId } = actionCtx;
  const simulationPayload = payload as { observation: string; parameterSnapshot?: Record<string, unknown> };

  await persistSimulationObservation(ctx, {
    notebookId,
    nodeId,
    observation: simulationPayload.observation,
    ...(simulationPayload.parameterSnapshot ? { parameterSnapshot: simulationPayload.parameterSnapshot } : {}),
  });
  await appendEvent(ctx.db, {
    notebookId,
    ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
    eventType: "artifact.updated",
    payload: {
      artifactId: artifactId ?? `surface_${nodeId}`,
      artifactType: "simulation",
    },
  });

  return { ok: true, data: {} };
}
