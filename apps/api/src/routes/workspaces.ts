import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { sendAuthOrEntitlementError } from "../hosted-beta/entitlements.js";
import { requireLearner } from "../hosted-beta/learner-gate.js";
import { withLearner } from "../hosted-beta/route-guards.js";
import {
  createWorkspaceFromTemplate,
  listPersonalWorkspaces,
  sendWorkspaceFromTemplateError,
} from "../hosted-beta/workspace-from-template.js";

export async function registerWorkspaceRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/workspaces", async (request, reply) => {
    return withLearner(ctx, request, reply, async (actor) => {
      const workspaces = await listPersonalWorkspaces(ctx, actor.id);
      return reply.send({ workspaces });
    });
  });

  app.post<{ Body: { templateId?: string } }>("/workspaces/from-template", async (request, reply) => {
    try {
      const { actor } = await requireLearner(ctx, request);
      const templateId = request.body?.templateId;
      if (!templateId || typeof templateId !== "string") {
        return reply.status(400).send({ code: "bad_request", message: "templateId is required" });
      }

      const notebookId = await createWorkspaceFromTemplate(ctx, actor.id, templateId);
      return reply.status(201).send({ notebookId });
    } catch (error) {
      try {
        return sendWorkspaceFromTemplateError(reply, error);
      } catch {
        return sendAuthOrEntitlementError(reply, error);
      }
    }
  });
}
