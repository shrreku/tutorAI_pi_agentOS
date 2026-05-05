import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { notebooks } from "@studyagent/db";
import {
  embedTextsOpenRouter,
  expandRetrievalChunksWithParents,
  hybridSearchNotebook,
  lexicalSearchNotebook,
  rrfResultsToHits,
  vectorSearchNotebook,
  type HybridSearchContext,
} from "@studyagent/search";
import { notebookSearchRequestSchema, notebookSearchResponseSchema } from "@studyagent/schemas";
import { startActiveObservation } from "@studyagent/observability";
import type { AppContext } from "../context.js";
import { resolveActor } from "../auth.js";

export async function registerSearchRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/search",
    async (request, reply) =>
      startActiveObservation(
        "notebook-search",
        async (searchObservation: any) => {
          const actor = await resolveActor(ctx, request);
          const { notebookId } = request.params;

          searchObservation.update({
            input: {
              notebookId,
              actorId: actor.id,
              body: request.body,
            },
          });

          const [owned] = await ctx.db.db
            .select()
            .from(notebooks)
            .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
            .limit(1);

          if (!owned) {
            return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
          }

          const parsed = notebookSearchRequestSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.status(400).send({ code: "bad_request", message: parsed.error.flatten() });
          }

          const { query, limit, mode, expandParents, selectedNodeRefs, conceptIds } = parsed.data;
          let hybridCtx: HybridSearchContext | undefined;
          if ((selectedNodeRefs?.length ?? 0) > 0 || (conceptIds?.length ?? 0) > 0) {
            hybridCtx = {};
            if (selectedNodeRefs?.length) {
              hybridCtx.selectedNodeRefs = selectedNodeRefs;
            }
            if (conceptIds?.length) {
              hybridCtx.conceptIds = conceptIds;
            }
          }

          if (mode === "lexical") {
            let rows = await lexicalSearchNotebook(ctx.db, notebookId, query, limit);
            if (expandParents) {
              rows = await expandRetrievalChunksWithParents(ctx.db, rows);
            }
            const hits = rrfResultsToHits(rows);
            const body = notebookSearchResponseSchema.parse({ mode, query, hits });
            searchObservation.update({ output: { mode, hitCount: hits.length } });
            return reply.send(body);
          }

          if (!ctx.env.OPENROUTER_API_KEY) {
            return reply.status(503).send({
              code: "search_unavailable",
              message: "Vector and hybrid search require OPENROUTER_API_KEY for query embeddings",
            });
          }

          const embedBase = (ctx.env.EMBEDDING_API_BASE_URL?.trim() || ctx.env.OPENROUTER_BASE_URL).replace(/\/+$/, "");
          const embedOpts = {
            baseUrl: embedBase,
            apiKey: ctx.env.OPENROUTER_API_KEY,
            model: ctx.env.EMBEDDING_MODEL,
            dimensions: ctx.env.EMBEDDING_DIMENSIONS,
          };

          if (mode === "vector") {
            const { embeddings } = await embedTextsOpenRouter([query], embedOpts);
            const qv = embeddings[0];
            if (!qv) {
              return reply.status(500).send({ code: "embedding_failed", message: "No query embedding returned" });
            }
            let rows = await vectorSearchNotebook(ctx.db, notebookId, qv, limit);
            if (expandParents) {
              rows = await expandRetrievalChunksWithParents(ctx.db, rows);
            }
            const hits = rrfResultsToHits(rows);
            const body = notebookSearchResponseSchema.parse({ mode, query, hits });
            searchObservation.update({ output: { mode, hitCount: hits.length, embeddingModel: embedOpts.model } });
            return reply.send(body);
          }

          let fused = await hybridSearchNotebook(ctx.db, notebookId, query, limit, embedOpts, hybridCtx);
          if (expandParents) {
            fused = await expandRetrievalChunksWithParents(ctx.db, fused);
          }
          const hits = rrfResultsToHits(fused);
          const body = notebookSearchResponseSchema.parse({ mode, query, hits });
          searchObservation.update({ output: { mode, hitCount: hits.length, embeddingModel: embedOpts.model } });
          return reply.send(body);
        },
        { asType: "retriever" },
      ),
  );
}
