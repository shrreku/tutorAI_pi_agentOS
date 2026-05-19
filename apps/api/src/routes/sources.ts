import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { appendEvent, chunks, notebooks, sourceVersions, sources } from "@studyagent/db";
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
        app.log.info({ notebookId, sourceId, sourceVersionId: versionId, jobName: "ingest_source" }, "ingestion job queued");
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
        app.log.warn({ notebookId, sourceId, sourceVersionId: versionId }, "ingestion queue unavailable");
      }

      const [row] = await ctx.db.db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);

      return reply.status(201).send({ source: row, event: uploaded });
    },
  );

  app.get<{ Params: { notebookId: string; sourceId: string } }>(
    "/notebooks/:notebookId/sources/:sourceId/file",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId, sourceId } = request.params;
      const source = await loadOwnedSource(ctx, actor.id, notebookId, sourceId);
      if (source === "notebook_missing") {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }
      if (!source) {
        return reply.status(404).send({ code: "not_found", message: "Source not found" });
      }
      if (!ctx.s3) {
        return reply.status(503).send({ code: "storage_unavailable", message: "Object storage is not configured." });
      }

      const object = await ctx.s3.send(
        new GetObjectCommand({
          Bucket: ctx.env.OBJECT_STORAGE_BUCKET,
          Key: source.originalObjectKey,
        }),
      );
      const metadata = isJsonRecord(source.metadataJson) ? source.metadataJson : {};
      const filename = typeof metadata.filename === "string" ? metadata.filename : source.title;
      const mimeType = typeof metadata.mimeType === "string" ? metadata.mimeType : object.ContentType ?? "application/octet-stream";
      reply.header("Content-Type", mimeType);
      reply.header("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
      await appendEvent(ctx.db, {
        notebookId,
        eventType: "source.viewer.opened",
        payload: { sourceId, viewer: "original", mimeType },
      });
      return reply.send(object.Body);
    },
  );

  app.get<{ Params: { notebookId: string; sourceId: string } }>(
    "/notebooks/:notebookId/sources/:sourceId/extracted",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId, sourceId } = request.params;
      const source = await loadOwnedSource(ctx, actor.id, notebookId, sourceId);
      if (source === "notebook_missing") {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }
      if (!source) {
        return reply.status(404).send({ code: "not_found", message: "Source not found" });
      }
      const [version] = await ctx.db.db
        .select()
        .from(sourceVersions)
        .where(eq(sourceVersions.sourceId, sourceId))
        .orderBy(desc(sourceVersions.version))
        .limit(1);
      const textChunks = version
        ? await ctx.db.db
            .select({
              id: chunks.id,
              text: chunks.text,
              pageStart: chunks.pageStart,
              pageEnd: chunks.pageEnd,
              headingPath: chunks.headingPath,
            })
            .from(chunks)
            .where(eq(chunks.sourceVersionId, version.id))
            .orderBy(asc(chunks.pageStart), asc(chunks.id))
        : [];
      await appendEvent(ctx.db, {
        notebookId,
        eventType: "source.viewer.opened",
        payload: { sourceId, sourceVersionId: version?.id ?? null, viewer: "extracted", chunkCount: textChunks.length },
      });
      return reply.send({
        source: {
          id: source.id,
          title: source.title,
          sourceType: source.sourceType,
          status: source.status,
          metadata: source.metadataJson ?? {},
        },
        sourceVersionId: version?.id ?? null,
        chunks: textChunks,
        text: textChunks.map((chunk) => chunk.text).join("\n\n"),
      });
    },
  );
}

async function loadOwnedSource(ctx: AppContext, ownerId: string, notebookId: string, sourceId: string) {
  const [owned] = await ctx.db.db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, ownerId)))
    .limit(1);
  if (!owned) return "notebook_missing" as const;
  const [source] = await ctx.db.db
    .select()
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.notebookId, notebookId)))
    .limit(1);
  return source ?? null;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inferSourceType(mime: string | undefined, filename: string | undefined): string {
  const m = (mime ?? "").toLowerCase();
  const name = filename?.toLowerCase() ?? "";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("markdown") || name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  if (m.includes("html")) return "html";
  if (m.includes("word") || m.includes("officedocument.wordprocessingml") || name.endsWith(".docx") || name.endsWith(".doc")) return "document";
  if (m.includes("presentation") || m.includes("officedocument.presentationml") || name.endsWith(".pptx") || name.endsWith(".ppt")) return "presentation";
  if (m.startsWith("text/")) return "text";
  return "binary";
}
