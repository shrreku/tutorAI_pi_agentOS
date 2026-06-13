import type { NodeRef } from "@studyagent/schemas";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";
import type { AppContext } from "./context.js";

export async function requestInteractiveSurfaceLaunch(
  ctx: AppContext,
  input: {
    notebookId: string;
    nodeRef: NodeRef;
    blockKind?: string | undefined;
    blockId?: string | undefined;
    sessionId?: string;
    turnId?: string;
    runId?: string;
    launchedBy: "tutor" | "learner";
  },
): Promise<{ eventId: string }> {
  const event = await appendEvent(ctx.db, {
    notebookId: input.notebookId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "session.focus.updated",
    payload: {
      sessionId: input.sessionId,
      launchedBy: input.launchedBy,
      surfaceNodeId: input.nodeRef.refId,
      surfaceNodeRefType: input.nodeRef.refType,
      nodeRef: input.nodeRef,
      blockKind: input.blockKind ?? null,
      blockId: input.blockId ?? null,
      turnId: input.turnId ?? null,
      intent: "interactive_surface_launch",
    },
  });
  return { eventId: event.id };
}
