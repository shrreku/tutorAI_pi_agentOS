import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { resolveActor } from "../auth.js";
import { dispatchInteractiveLearningAction } from "../interactive-learning-actions.js";

export async function registerInteractiveLearningRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post<{
    Params: { notebookId: string };
    Body: Record<string, unknown>;
  }>("/notebooks/:notebookId/interactive-learning/actions", async (request, reply) => {
    const startedAt = Date.now();
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;

    const result = await dispatchInteractiveLearningAction({
      ctx,
      notebookId,
      userId: actor.id,
      envelope: request.body ?? {},
    });

    if (!result.ok) {
      const status = result.error.code === "not_found" ? 404 : result.error.code === "forbidden" ? 403 : 400;
      request.log.warn(
        {
          notebookId,
          statusCode: status,
          code: result.error.code,
          durationMs: Date.now() - startedAt,
        },
        "interactive learning action rejected",
      );
      return reply.status(status).send({ code: result.error.code, message: result.error.message });
    }

    request.log.info(
      {
        notebookId,
        actionName: result.response.actionName,
        blockId: result.response.block.id,
        blockKind: result.response.block.kind,
        emitsMasteryEvidence: result.response.emitsMasteryEvidence,
        durationMs: Date.now() - startedAt,
      },
      "interactive learning action completed",
    );
    return reply.send(result.response);
  });
}
