import type { FastifyInstance } from "fastify";
import { idSchema } from "@studyagent/schemas";
import type { AppContext } from "../context.js";
import { withAdminAccess } from "../hosted-beta/route-guards.js";
import { captureNotebookEvalEvidenceSnapshot } from "../eval-evidence-snapshot-capture.js";

export async function registerEvalEvidenceSnapshotRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{
    Params: { notebookId: string };
    Querystring: { snapshotId?: string };
  }>("/eval/notebooks/:notebookId/evidence-snapshot", async (request, reply) => {
    return withAdminAccess(ctx, request, reply, async (actor) => {
      const notebookId = idSchema.parse(request.params.notebookId);
      const snapshotId = request.query.snapshotId ?? `snap_${notebookId}_${Date.now()}`;

      try {
        const snapshot = await captureNotebookEvalEvidenceSnapshot(ctx, {
          ownerId: actor.id,
          notebookId,
          snapshotId,
        });
        return reply.send({ snapshot });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to capture eval evidence snapshot";
        if (message === "Notebook not found") {
          return reply.status(404).send({ code: "not_found", message });
        }
        return reply.status(400).send({ code: "snapshot_capture_failed", message });
      }
    });
  });
}
