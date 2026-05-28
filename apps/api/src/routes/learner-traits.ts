import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { notebooks } from "@studyagent/db";
import { learnerTraitKeySchema, type LearnerTraitKey } from "@studyagent/schemas";
import type { AppContext } from "../context.js";
import { resolveActor } from "../auth.js";
import {
  buildLearnerTraitReadModel,
  readCurrentLearnerTraitEstimates,
  readRecentLearnerTraitSignals,
} from "../learner-trait-store.js";
import { derivePersonalizationRecommendations } from "../learner-trait-estimation.js";

async function ensureNotebookOwner(ctx: AppContext, notebookId: string, userId: string): Promise<boolean> {
  const [row] = await ctx.db.db
    .select({ id: notebooks.id })
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function registerLearnerTraitRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: { notebookId: string }; Querystring: { devMode?: string; limit?: string; traits?: string } }>(
    "/notebooks/:notebookId/learner-traits",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;
      if (!(await ensureNotebookOwner(ctx, notebookId, actor.id))) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      const traits = parseTraitList(request.query.traits);
      const estimates = await readCurrentLearnerTraitEstimates(ctx.db, {
        notebookId,
        userId: actor.id,
        ...(traits.length ? { traits } : {}),
      });
      const recommendations = derivePersonalizationRecommendations({ notebookId, userId: actor.id, estimates });

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
    },
  );
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
