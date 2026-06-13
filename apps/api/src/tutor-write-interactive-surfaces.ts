import type { ToolContext } from "@studyagent/schemas";
import {
  buildReducerResult,
  type LaunchInteractiveSurfaceInput,
  type LaunchInteractiveSurfaceOutput,
} from "@studyagent/tools";
import type { AppContext } from "./context.js";
import { requestInteractiveSurfaceLaunch } from "./interactive-surface-launch.js";

export function createInteractiveSurfaceWriteHandlers(
  appCtx: AppContext,
): {
  launchInteractiveSurface(
    input: LaunchInteractiveSurfaceInput,
    ctx: ToolContext,
  ): Promise<LaunchInteractiveSurfaceOutput>;
} {
  return {
    async launchInteractiveSurface(input, ctx) {
      const nodeRef = {
        refType: input.nodeRefType,
        refId: input.nodeId,
      };

      const { eventId } = await requestInteractiveSurfaceLaunch(appCtx, {
        notebookId: ctx.notebookId,
        nodeRef,
        ...(input.blockKind ? { blockKind: input.blockKind } : {}),
        launchedBy: "tutor",
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
        ...(ctx.runId ? { runId: ctx.runId } : {}),
      });

      return {
        launched: true,
        nodeId: input.nodeId,
        nodeRefType: input.nodeRefType,
        blockKind: input.blockKind ?? null,
        warnings: [],
        reducerResult: buildReducerResult(
          "session.focus.updated",
          {
            notebookId: ctx.notebookId,
            sessionId: ctx.sessionId,
            surfaceNodeId: input.nodeId,
            surfaceNodeRefType: input.nodeRefType,
            nodeRef,
            blockKind: input.blockKind ?? null,
            intent: "interactive_surface_launch",
          },
          [eventId],
        ),
      };
    },
  };
}
