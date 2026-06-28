import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { buildLearnerDashboardSummary } from "../dashboard-projection.js";
import { withLearner } from "../hosted-beta/route-guards.js";

export async function registerDashboardRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/dashboard", async (request, reply) => {
    return withLearner(ctx, request, reply, async (actor) => {
      const summary = await buildLearnerDashboardSummary(ctx, actor.id);
      return reply.send(summary);
    });
  });
}
