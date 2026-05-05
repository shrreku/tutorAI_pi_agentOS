import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { appendEvent, notebooks, sourceVersions, sources } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { resolveActor } from "../auth.js";

export async function registerSourceRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/sources",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      const rows = await ctx.db.db
        .select()
        .from(sources)
        .where(eq(sources.notebookId, notebookId))
        .orderBy(desc(sources.createdAt));

      return reply.send({ sources: rows });
    },
  );

  app.post<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/sources",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      if (!ctx.s3) {
        return reply.status(503).send({
          code: "storage_unavailable",
          message: "Object storage is not configured. Set OBJECT_STORAGE_* env vars.",
        });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ code: "bad_request", message: "multipart field file is required" });
      }

      const buffer = await file.toBuffer();
      const sourceId = `src_${crypto.randomUUID().replaceAll("-", "")}`;
      const versionId = `sv_${crypto.randomUUID().replaceAll("-", "")}`;
      const objectKey = `notebooks/${notebookId}/sources/${sourceId}/original`;

      await ctx.s3.send(
        new PutObjectCommand({
          Bucket: ctx.env.OBJECT_STORAGE_BUCKET,
          Key: objectKey,
          Body: buffer,
          ContentType: file.mimetype || "application/octet-stream",
        }),
      );

      const now = new Date();
      const title = file.filename || "Untitled source";

      await ctx.db.db.insert(sources).values({
        id: sourceId,
        notebookId,
        title,
        sourceType: inferSourceType(file.mimetype, file.filename),
        originalObjectKey: objectKey,
        status: "uploaded",
        metadataJson: {
          sizeBytes: buffer.byteLength,
          filename: file.filename,
          mimeType: file.mimetype,
        },
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.db.insert(sourceVersions).values({
        id: versionId,
        sourceId,
        version: 1,
        parserName: null,
        parserVersion: null,
        contentHash: null,
        parseConfidence: null,
        documentTreeJson: null,
        createdAt: now,
      });

      const uploaded = await appendEvent(ctx.db, {
        notebookId,
        eventType: "source.uploaded",
        payload: {
          sourceId,
          sourceVersionId: versionId,
          objectKey,
          title,
          mimeType: file.mimetype,
          sizeBytes: buffer.byteLength,
        },
      });

      if (ctx.ingestionQueue) {
        await ctx.ingestionQueue.add(
          "ingest_source",
          { notebookId, sourceId, sourceVersionId: versionId },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 2000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        await appendEvent(ctx.db, {
          notebookId,
          eventType: "ingestion.job.queued",
          payload: { sourceId, sourceVersionId: versionId, jobName: "ingest_source" },
        });
      } else {
        await appendEvent(ctx.db, {
          notebookId,
          eventType: "ingestion.job.failed",
          payload: {
            sourceId,
            sourceVersionId: versionId,
            reason: "REDIS_URL not configured; BullMQ queue unavailable",
          },
        });
      }

      const [row] = await ctx.db.db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);

      return reply.status(201).send({ source: row, event: uploaded });
    },
  );
}

function inferSourceType(mime: string | undefined, filename: string | undefined): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("markdown") || filename?.toLowerCase().endsWith(".md")) return "markdown";
  if (m.includes("html")) return "html";
  if (m.startsWith("text/")) return "text";
  return "binary";
}
