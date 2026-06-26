import type { FastifyInstance } from "fastify";
import { learnerTraitKeySchema, type LearnerTraitKey } from "@studyagent/schemas";
import type { AppContext } from "../context.js";
import {
  buildLearnerTraitReadModel,
  readCurrentLearnerTraitEstimates,
  readRecentLearnerTraitSignals,
} from "../learner-trait-store.js";
import { derivePersonalizationRecommendations } from "../learner-trait-estimation.js";
import { withOwnedNotebook } from "../hosted-beta/route-guards.js";

export async function registerLearnerTraitRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get<{
    Params: { notebookId: string };
    Querystring: { devMode?: string; limit?: string; traits?: string };
  }>("/notebooks/:notebookId/learner-traits", async (request, reply) => {
    const { notebookId } = request.params;
    return withOwnedNotebook(ctx, request, reply, notebookId, async (actor) => {
      const traits = parseTraitList(request.query.traits);
      const estimates = await readCurrentLearnerTraitEstimates(ctx.db, {
        notebookId,
        userId: actor.id,
        ...(traits.length ? { traits } : {}),
      });
      const recommendations = derivePersonalizationRecommendations({
        notebookId,
        userId: actor.id,
        estimates,
      });

      if (request.query.devMode !== "true") {
        return reply.send({ recommendations });
      }

      const signals = await readRecentLearnerTraitSignals(ctx.db, {
        notebookId,
        userId: actor.id,
        ...(traits.length ? { traits } : {}),
        limit: clampLimit(request.query.limit ?? "50"),
      });
      return reply.send({
        ...buildLearnerTraitReadModel({ signals, estimates }),
        recommendations,
      });
    });
  });
}

function parseTraitList(value: string | undefined): LearnerTraitKey[] {
  if (!value) return [];
  const traits: LearnerTraitKey[] = [];
  for (const entry of value.split(",").map((item) => item.trim())) {
    const parsed = learnerTraitKeySchema.safeParse(entry);
    if (parsed.success) traits.push(parsed.data);
  }
  return traits;
}

function clampLimit(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}
