import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { chunks, enqueueIngestionJob, notebooks, sourceVersions, sources } from "@studyagent/db";
import { toSourceLearnerView } from "@studyagent/schemas";
import type { AppContext } from "../context.js";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "../agentic-cache-invalidation.js";
import {
  hasAdminAccess,
  requireBetaConsent,
  requireIngestionAccess,
  sendAuthOrEntitlementError,
} from "../hosted-beta/entitlements.js";
import { requireLearner } from "../hosted-beta/learner-gate.js";
import { getContentNotebookId, requireOwnedNotebook } from "../hosted-beta/notebook-context.js";
import { withLearner } from "../hosted-beta/route-guards.js";
import { resolveIngestionStatus } from "../hosted-beta/ingestion-status.js";
import { triggerIngestionWorker } from "../hosted-beta/ingestion-trigger.js";
import {
  createReservation,
  INGESTION_JOB_ESTIMATE_CENTS,
  InsufficientCreditsError,
  releaseReservation,
} from "../hosted-beta/credit-reservation.js";
import { recordProductAnalytics } from "../hosted-beta/product-analytics.js";

const QUEUED_SOURCE_STATUSES = ["uploaded", "failed", "ingestion_review"] as const;

export async function registerSourceRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/sources",
    async (request, reply) => {
      const { notebookId } = request.params;
      return withLearner(ctx, request, reply, async (actor) => {
        const owned = await requireOwnedNotebook(ctx, actor.id, notebookId);
        const { learnerNotebookId, contentNotebookId } = owned;
        const notebookIds =
          contentNotebookId === learnerNotebookId
            ? [learnerNotebookId]
            : [contentNotebookId, learnerNotebookId];

        const rows = await ctx.db.db
          .select()
          .from(sources)
          .where(inArray(sources.notebookId, notebookIds))
          .orderBy(desc(sources.createdAt));

        return reply.send({
          sources: rows.map((row) => ({
            ...toSourceLearnerView({
              id: row.id,
              title: row.title,
              status: row.status,
              metadataJson: row.metadataJson,
            }),
            metadata: {
              fromTemplate:
                row.notebookId === contentNotebookId && contentNotebookId !== learnerNotebookId,
            },
          })),
        });
      });
    },
  );

  app.post<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/sources",
    async (request, reply) => {
      let ingestionReservationId: string | null = null;
      let actorIdForAnalytics: string | null = null;
      try {
        const { actor } = await requireIngestionAccess(ctx, request);
        actorIdForAnalytics = actor.id;
        await requireBetaConsent(ctx, request);
        const { notebookId } = request.params;
        const owned = await requireOwnedNotebook(ctx, actor.id, notebookId);
        const ownedNotebook = owned.notebook;

        if (!ctx.s3) {
          return reply.status(503).send({
            code: "storage_unavailable",
            message: "Object storage is not configured. Set OBJECT_STORAGE_* env vars.",
          });
        }

        const file = await request.file();
        if (!file) {
          return reply
            .status(400)
            .send({ code: "bad_request", message: "multipart field file is required" });
        }

        if (!isAllowedUploadFile(file.mimetype, file.filename)) {
          return reply.status(400).send({
            code: "unsupported_file_type",
            message: "Only PDF, Markdown, and plain text files are supported.",
          });
        }

        const buffer = await file.toBuffer();
        if (buffer.byteLength > ctx.env.MAX_UPLOAD_BYTES) {
          return reply.status(400).send({
            code: "file_too_large",
            message: `File exceeds the ${Math.round(ctx.env.MAX_UPLOAD_BYTES / (1024 * 1024))} MB upload limit.`,
          });
        }

        const isAdmin = await hasAdminAccess(ctx, actor.id);
        if (!isAdmin) {
          const queuedCount = await countQueuedSourcesForLearner(ctx, actor.id);
          if (queuedCount >= ctx.env.MAX_QUEUED_SOURCES_PER_LEARNER) {
            return reply.status(429).send({
              code: "queued_source_limit",
              message: `You can queue at most ${ctx.env.MAX_QUEUED_SOURCES_PER_LEARNER} sources at a time.`,
            });
          }
        }

        const sourceId = `src_${crypto.randomUUID().replaceAll("-", "")}`;
        const versionId = `sv_${crypto.randomUUID().replaceAll("-", "")}`;
        const objectKey = `notebooks/${notebookId}/sources/${sourceId}/original`;
        const reservation = await createReservation(
          ctx.db,
          actor.id,
          "ingestion",
          INGESTION_JOB_ESTIMATE_CENTS,
          "source_ingestion",
          sourceId,
          ctx.env.CREDIT_RESERVATION_TTL_SECONDS,
        );
        ingestionReservationId = reservation.id;

        await recordProductAnalytics(ctx, {
          userId: actor.id,
          eventName: "ingestion_credit_reserved",
          properties: {
            sourceId,
            sourceVersionId: versionId,
            notebookId,
            reservedCents: reservation.reservedCents,
            reason: "source_upload",
          },
        });

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
            learnerRetryCount: 0,
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
            { notebookId, sourceId, sourceVersionId: versionId, ingestionReservationId },
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
            payload: {
              sourceId,
              sourceVersionId: versionId,
              jobName: "ingest_source",
              ingestionReservationId,
            },
          });
          app.log.info(
            { notebookId, sourceId, sourceVersionId: versionId, jobName: "ingest_source" },
            "ingestion job queued",
          );
        } else {
          const job = await enqueueIngestionJob(ctx.db, {
            notebookId,
            sourceId,
            sourceVersionId: versionId,
            ingestionReservationId,
            jobName: "ingest_source",
            maxAttempts: 3,
          });
          await appendEvent(ctx.db, {
            notebookId,
            eventType: "ingestion.job.queued",
            payload: {
              sourceId,
              sourceVersionId: versionId,
              jobName: "ingest_source",
              jobId: job.id,
              queueBackend: "postgres",
              ingestionReservationId,
            },
          });
          app.log.info(
            {
              notebookId,
              sourceId,
              sourceVersionId: versionId,
              jobName: "ingest_source",
              queueBackend: "postgres",
            },
            "ingestion job queued",
          );
        }

        await recordProductAnalytics(ctx, {
          userId: actor.id,
          eventName: "source_upload_queued",
          properties: {
            sourceId,
            sourceVersionId: versionId,
            notebookId,
            sizeBytes: buffer.byteLength,
            mimeType: file.mimetype,
          },
        });

        void triggerIngestionWorker(ctx, "upload", actor.id).catch((error) => {
          app.log.warn({ err: error, sourceId }, "ingestion trigger failed after upload");
        });

        const [row] = await ctx.db.db
          .select()
          .from(sources)
          .where(eq(sources.id, sourceId))
          .limit(1);

        return reply.status(201).send({
          source: toSourceLearnerView({
            id: row!.id,
            title: row!.title,
            status: row!.status,
            metadataJson: row!.metadataJson,
          }),
          event: uploaded,
        });
      } catch (error) {
        if (ingestionReservationId) {
          await releaseReservation(ctx.db, ingestionReservationId, {
            reason: "source_upload_failed_before_queue_completion",
          }).catch((releaseError) => {
            app.log.warn(
              { err: releaseError, ingestionReservationId },
              "failed to release ingestion reservation after upload error",
            );
          });
        }
        if (actorIdForAnalytics && error instanceof InsufficientCreditsError) {
          await recordProductAnalytics(ctx, {
            userId: actorIdForAnalytics,
            eventName: "credit_exhausted",
            properties: { creditType: "ingestion", action: "source_upload" },
          }).catch(() => undefined);
        }
        return sendSourceRouteError(reply, error);
      }
    },
  );

  app.get<{ Params: { sourceId: string } }>(
    "/sources/:sourceId/ingestion-status",
    async (request, reply) => {
      return withLearner(ctx, request, reply, async (actor) => {
        const source = await loadReadableSourceById(ctx, actor.id, request.params.sourceId);
        if (source === "not_found") {
          return reply.status(404).send({ code: "not_found", message: "Source not found" });
        }

        return reply.send(
          resolveIngestionStatus({
            status: source.status,
            metadataJson: source.metadataJson,
          }),
        );
      });
    },
  );

  app.post<{ Params: { sourceId: string } }>(
    "/sources/:sourceId/retry-ingestion",
    async (request, reply) => {
      let ingestionReservationId: string | null = null;
      let actorIdForAnalytics: string | null = null;
      try {
        const { actor } = await requireIngestionAccess(ctx, request);
        actorIdForAnalytics = actor.id;
        await requireBetaConsent(ctx, request);
        const source = await loadOwnedSourceById(ctx, actor.id, request.params.sourceId);
        if (source === "not_found") {
          return reply.status(404).send({ code: "not_found", message: "Source not found" });
        }

        const ingestionStatus = resolveIngestionStatus({
          status: source.status,
          metadataJson: source.metadataJson,
        });
        if (!ingestionStatus.retryNeeded) {
          return reply.status(400).send({
            code: "retry_not_allowed",
            message: ingestionStatus.reviewNeeded
              ? "This source is in ingestion review."
              : "This source cannot be retried.",
          });
        }

        const metadata = isJsonRecord(source.metadataJson) ? { ...source.metadataJson } : {};
        const learnerRetryCount =
          typeof metadata.learnerRetryCount === "number" ? metadata.learnerRetryCount : 0;
        metadata.learnerRetryCount = learnerRetryCount + 1;

        const [version] = await ctx.db.db
          .select()
          .from(sourceVersions)
          .where(eq(sourceVersions.sourceId, source.id))
          .orderBy(desc(sourceVersions.version))
          .limit(1);
        if (!version) {
          return reply.status(400).send({ code: "bad_request", message: "Source version missing" });
        }

        const reservation = await createReservation(
          ctx.db,
          actor.id,
          "ingestion",
          INGESTION_JOB_ESTIMATE_CENTS,
          "source_ingestion_retry",
          source.id,
          ctx.env.CREDIT_RESERVATION_TTL_SECONDS,
        );
        ingestionReservationId = reservation.id;

        const now = new Date();
        await ctx.db.db
          .update(sources)
          .set({ status: "uploaded", metadataJson: metadata, updatedAt: now })
          .where(eq(sources.id, source.id));

        const job = await enqueueIngestionJob(ctx.db, {
          notebookId: source.notebookId,
          sourceId: source.id,
          sourceVersionId: version.id,
          ingestionReservationId,
          jobName: "ingest_source",
          maxAttempts: 3,
        });

        await appendEvent(ctx.db, {
          notebookId: source.notebookId,
          eventType: "ingestion.job.queued",
          payload: {
            sourceId: source.id,
            sourceVersionId: version.id,
            jobName: "ingest_source",
            jobId: job.id,
            queueBackend: "postgres",
            learnerRetry: true,
            ingestionReservationId,
          },
        });

        await recordProductAnalytics(ctx, {
          userId: actor.id,
          eventName: "ingestion_retry_queued",
          properties: {
            sourceId: source.id,
            sourceVersionId: version.id,
            notebookId: source.notebookId,
            retryCount: metadata.learnerRetryCount,
          },
        });

        void triggerIngestionWorker(ctx, "retry", actor.id).catch((error) => {
          app.log.warn({ err: error, sourceId: source.id }, "ingestion trigger failed after retry");
        });

        return reply.status(202).send({
          ok: true,
          sourceId: source.id,
          ingestionStatus: resolveIngestionStatus({ status: "uploaded", metadataJson: metadata }),
        });
      } catch (error) {
        if (ingestionReservationId) {
          await releaseReservation(ctx.db, ingestionReservationId, {
            reason: "source_retry_failed_before_queue_completion",
          }).catch((releaseError) => {
            app.log.warn(
              { err: releaseError, ingestionReservationId },
              "failed to release ingestion reservation after retry error",
            );
          });
        }
        if (actorIdForAnalytics && error instanceof InsufficientCreditsError) {
          await recordProductAnalytics(ctx, {
            userId: actorIdForAnalytics,
            eventName: "credit_exhausted",
            properties: { creditType: "ingestion", action: "ingestion_retry" },
          }).catch(() => undefined);
        }
        return sendSourceRouteError(reply, error);
      }
    },
  );

  app.get<{ Params: { notebookId: string; sourceId: string } }>(
    "/notebooks/:notebookId/sources/:sourceId/file",
    async (request, reply) => {
      const { notebookId, sourceId } = request.params;
      return withLearner(ctx, request, reply, async (actor) => {
        const source = await loadReadableSource(ctx, actor.id, notebookId, sourceId);
        if (source === "notebook_missing") {
          return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
        }
        if (!source) {
          return reply.status(404).send({ code: "not_found", message: "Source not found" });
        }
        if (!ctx.s3) {
          return reply
            .status(503)
            .send({ code: "storage_unavailable", message: "Object storage is not configured." });
        }

        const object = await ctx.s3.send(
          new GetObjectCommand({
            Bucket: ctx.env.OBJECT_STORAGE_BUCKET,
            Key: source.originalObjectKey,
          }),
        );
        const metadata = isJsonRecord(source.metadataJson) ? source.metadataJson : {};
        const filename = typeof metadata.filename === "string" ? metadata.filename : source.title;
        const mimeType =
          typeof metadata.mimeType === "string"
            ? metadata.mimeType
            : (object.ContentType ?? "application/octet-stream");
        reply.header("Content-Type", mimeType);
        reply.header("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
        await appendEvent(ctx.db, {
          notebookId,
          eventType: "source.viewer.opened",
          payload: { sourceId, viewer: "original", mimeType },
        });
        return reply.send(object.Body);
      });
    },
  );

  app.get<{ Params: { notebookId: string; sourceId: string } }>(
    "/notebooks/:notebookId/sources/:sourceId/extracted",
    async (request, reply) => {
      const { notebookId, sourceId } = request.params;
      return withLearner(ctx, request, reply, async (actor) => {
        const source = await loadReadableSource(ctx, actor.id, notebookId, sourceId);
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
          payload: {
            sourceId,
            sourceVersionId: version?.id ?? null,
            viewer: "extracted",
            chunkCount: textChunks.length,
          },
        });
        return reply.send({
          source: {
            ...toSourceLearnerView({
              id: source.id,
              title: source.title,
              status: source.status,
              metadataJson: source.metadataJson,
            }),
            sourceType: source.sourceType,
          },
          sourceVersionId: version?.id ?? null,
          chunks: textChunks,
          text: textChunks.map((chunk) => chunk.text).join("\n\n"),
        });
      });
    },
  );
}

function sendSourceRouteError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof InsufficientCreditsError) {
    return reply.status(402).send({ code: error.code, message: error.message });
  }
  return sendAuthOrEntitlementError(reply, error);
}

async function countQueuedSourcesForLearner(ctx: AppContext, ownerId: string): Promise<number> {
  const [row] = await ctx.db.db
    .select({ value: sql<number>`count(*)::int` })
    .from(sources)
    .innerJoin(notebooks, eq(notebooks.id, sources.notebookId))
    .where(
      and(eq(notebooks.ownerId, ownerId), inArray(sources.status, [...QUEUED_SOURCE_STATUSES])),
    );
  return Number(row?.value ?? 0);
}

async function loadOwnedSourceById(ctx: AppContext, ownerId: string, sourceId: string) {
  const [row] = await ctx.db.db
    .select({ source: sources, ownerId: notebooks.ownerId })
    .from(sources)
    .innerJoin(notebooks, eq(notebooks.id, sources.notebookId))
    .where(eq(sources.id, sourceId))
    .limit(1);
  if (!row || row.ownerId !== ownerId) {
    return "not_found" as const;
  }
  return row.source;
}

async function loadReadableSourceById(ctx: AppContext, ownerId: string, sourceId: string) {
  const [row] = await ctx.db.db
    .select({ source: sources, ownerId: notebooks.ownerId, notebookId: notebooks.id })
    .from(sources)
    .innerJoin(notebooks, eq(notebooks.id, sources.notebookId))
    .where(eq(sources.id, sourceId))
    .limit(1);
  if (!row) {
    return "not_found" as const;
  }
  if (row.ownerId === ownerId) {
    return row.source;
  }
  const [linkedWorkspace] = await ctx.db.db
    .select({ id: notebooks.id, disabledAt: notebooks.disabledAt })
    .from(notebooks)
    .where(
      and(
        eq(notebooks.ownerId, ownerId),
        sql`${notebooks.settingsJson}->>'templateNotebookId' = ${row.notebookId}`,
      ),
    )
    .limit(1);
  if (!linkedWorkspace || linkedWorkspace.disabledAt) {
    return "not_found" as const;
  }
  return row.source;
}

async function loadReadableSource(
  ctx: AppContext,
  ownerId: string,
  notebookId: string,
  sourceId: string,
) {
  const [owned] = await ctx.db.db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, ownerId)))
    .limit(1);
  if (!owned) return "notebook_missing" as const;
  const contentNotebookId = getContentNotebookId(owned.id, owned.settingsJson);
  const notebookIds = contentNotebookId === owned.id ? [owned.id] : [contentNotebookId, owned.id];
  const [source] = await ctx.db.db
    .select()
    .from(sources)
    .where(and(eq(sources.id, sourceId), inArray(sources.notebookId, notebookIds)))
    .limit(1);
  return source ?? null;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedUploadFile(mime: string | undefined, filename: string | undefined): boolean {
  const name = (filename ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (name.endsWith(".pdf") || m.includes("pdf")) return true;
  if (name.endsWith(".md") || name.endsWith(".markdown") || m.includes("markdown")) return true;
  if (name.endsWith(".txt") || m === "text/plain") return true;
  return false;
}

function inferSourceType(mime: string | undefined, filename: string | undefined): string {
  const m = (mime ?? "").toLowerCase();
  const name = filename?.toLowerCase() ?? "";
  if (m.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (m.includes("markdown") || name.endsWith(".md") || name.endsWith(".markdown"))
    return "markdown";
  if (m === "text/plain" || name.endsWith(".txt")) return "text";
  return "binary";
}

export { isAllowedUploadFile, countQueuedSourcesForLearner };
