import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "@studyagent/config";
import { appendEvent, chunks, createDb, sourceVersions, sources } from "@studyagent/db";
import { documentTreeToChunks, parserForSourceType, type ParserSelectionOptions } from "@studyagent/ingestion";
import { embedTextsOpenRouter } from "@studyagent/search";
import { initializeLangfuseTracing, shutdownLangfuseTracing, startActiveObservation } from "@studyagent/observability";
import { runPostIngestEnrichment } from "./post-ingest-enrichment.js";
import { applyClaimDecay } from "./wiki-decay.js";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Worker } from "bullmq";
import { Redis } from "ioredis";

function createS3(env: ReturnType<typeof loadEnv>): S3Client | null {
  if (!env.OBJECT_STORAGE_ENDPOINT || !env.OBJECT_STORAGE_ACCESS_KEY || !env.OBJECT_STORAGE_SECRET_KEY) {
    return null;
  }
  return new S3Client({
    region: env.OBJECT_STORAGE_REGION,
    endpoint: env.OBJECT_STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

function uploadFilename(source: { title: string; metadataJson: Record<string, unknown> }): string {
  const m = source.metadataJson;
  const fn = m && typeof m.filename === "string" ? m.filename.trim() : "";
  return fn || source.title || "document";
}

function isHighSignalRetrievalChunk(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^[-_*]{3,}$/.test(trimmed)) return false;
  if (/^!\[[^\]]*\]\([^)]+\)$/.test(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^(?:[A-Z]\s+){3,}[A-Z0-9]$/.test(trimmed)) return false;

  if (trimmed.length < 25) {
    const looksCompleteSentence = /[.!?:)]$/.test(trimmed);
    const looksFormula =
      (/[=<>∇Δ]/.test(trimmed) || /[A-Za-z0-9]\s*\/\s*[A-Za-z0-9]/.test(trimmed)) &&
      /[A-Za-z]/.test(trimmed);
    if (!looksCompleteSentence && !looksFormula) {
      return false;
    }
  }

  return true;
}

async function main() {
  const env = loadEnv();
  initializeLangfuseTracing("studyagent-worker", env);
  const dbClient = createDb(env.DATABASE_URL);
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const s3 = createS3(env);

  const worker = new Worker(
    "ingestion",
    async (job) => {
      if (job.name !== "ingest_source") {
        return;
      }

      const data = job.data as {
        notebookId: string;
        sourceId: string;
        sourceVersionId: string;
      };

      const { notebookId, sourceId, sourceVersionId } = data;

      try {
        await startActiveObservation(
          "ingestion.job",
          async (jobObservation: any) => {
        await appendEvent(dbClient, {
          notebookId,
          eventType: "ingestion.job.started",
          payload: { jobId: job.id, sourceId, sourceVersionId, attempt: job.attemptsStarted },
        });

        jobObservation.update({
          input: {
            jobId: job.id,
            notebookId,
            sourceId,
            sourceVersionId,
            attempt: job.attemptsStarted,
          },
        });

        if (!s3) {
          throw new Error("OBJECT_STORAGE_* is not configured; cannot read uploaded bytes for ingestion");
        }

        const [source] = await dbClient.db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
        if (!source || source.notebookId !== notebookId) {
          throw new Error(`Source ${sourceId} missing or notebook mismatch`);
        }

        const [version] = await dbClient.db
          .select()
          .from(sourceVersions)
          .where(eq(sourceVersions.id, sourceVersionId))
          .limit(1);
        if (!version || version.sourceId !== sourceId) {
          throw new Error(`Source version ${sourceVersionId} missing or source mismatch`);
        }

        await dbClient.db.update(sources).set({ status: "parsing", updatedAt: new Date() }).where(eq(sources.id, sourceId));

        await appendEvent(dbClient, {
          notebookId,
          eventType: "source.parse.started",
          payload: { sourceId, sourceVersionId },
        });

        const obj = await s3.send(
          new GetObjectCommand({
            Bucket: env.OBJECT_STORAGE_BUCKET,
            Key: source.originalObjectKey,
          }),
        );
        const bytes = new Uint8Array(await obj.Body!.transformToByteArray());
        const contentHash = createHash("sha256").update(bytes).digest("hex");

        const parserOpts: ParserSelectionOptions = {};
        if (env.LLAMAPARSE_API_KEY != null && env.LLAMAPARSE_API_KEY.length > 0) {
          parserOpts.llamaParse = {
            apiKey: env.LLAMAPARSE_API_KEY,
            baseUrl: env.LLAMAPARSE_API_BASE_URL,
            tier: env.LLAMAPARSE_TIER,
          };
        }
        const parser = parserForSourceType(source.sourceType, parserOpts);

        const parsed = await parser.parse(bytes, {
          sourceVersionId,
          sourceId,
          filename: uploadFilename(source),
        });

        await dbClient.db
          .update(sourceVersions)
          .set({
            documentTreeJson: parsed.documentTree,
            parserName: parsed.parser.name,
            parserVersion: parsed.parser.version,
            parseConfidence: parsed.parser.confidence,
            contentHash,
          })
          .where(eq(sourceVersions.id, sourceVersionId));

        await appendEvent(dbClient, {
          notebookId,
          eventType: "source.parse.completed",
          payload: {
            sourceId,
            sourceVersionId,
            parser: parsed.parser.name,
            parserVersion: parsed.parser.version,
            confidence: parsed.parser.confidence,
            warnings: parsed.warnings,
          },
        });

        await dbClient.db.update(sources).set({ status: "chunking", updatedAt: new Date() }).where(eq(sources.id, sourceId));

        const chunkRows = documentTreeToChunks(parsed, { sourceVersionId }).filter(
          (chunk) => chunk.chunkType !== "retrieval" || isHighSignalRetrievalChunk(chunk.text),
        );

        await dbClient.db.delete(chunks).where(eq(chunks.sourceVersionId, sourceVersionId));

        if (chunkRows.length) {
          await dbClient.db.insert(chunks).values(
            chunkRows.map((c) => ({
              id: c.id,
              sourceVersionId: c.sourceVersionId,
              parentChunkId: c.parentChunkId,
              chunkType: c.chunkType,
              text: c.text,
              tokenCount: c.tokenCount,
              sourceSpanJson: c.sourceSpanJson,
              pageStart: c.pageStart,
              pageEnd: c.pageEnd,
              headingPath: c.headingPath,
              metadataJson: c.metadataJson,
            })),
          );
        }

        await appendEvent(dbClient, {
          notebookId,
          eventType: "source.chunk.completed",
          payload: {
            sourceId,
            sourceVersionId,
            chunkCount: chunkRows.length,
            retrievalCount: chunkRows.filter((c) => c.chunkType === "retrieval").length,
          },
        });

        await dbClient.db.update(sources).set({ status: "indexing", updatedAt: new Date() }).where(eq(sources.id, sourceId));

        const retrievalChunks = chunkRows.filter((c) => c.chunkType === "retrieval" && c.text.trim().length > 0);
        await dbClient.db.execute(
          sql`update chunks set fts_vector = to_tsvector('english', text)::text where source_version_id = ${sourceVersionId}`,
        );
        let vectorEmbeddings = false;
        let embeddingModel: string | null = null;
        let embeddingError: string | null = null;

        if (retrievalChunks.length && env.OPENROUTER_API_KEY) {
          const embedBase = (env.EMBEDDING_API_BASE_URL?.trim() || env.OPENROUTER_BASE_URL).replace(/\/+$/, "");
          try {
            const texts = retrievalChunks.map((c) => c.text);
            const { embeddings, model } = await embedTextsOpenRouter(texts, {
              baseUrl: embedBase,
              apiKey: env.OPENROUTER_API_KEY,
              model: env.EMBEDDING_MODEL,
              dimensions: env.EMBEDDING_DIMENSIONS,
            });
            if (embeddings.length !== retrievalChunks.length) {
              throw new Error(`embedding count mismatch: ${embeddings.length} vs ${retrievalChunks.length}`);
            }
            vectorEmbeddings = true;
            embeddingModel = model;
            for (let i = 0; i < retrievalChunks.length; i++) {
              const row = retrievalChunks[i]!;
              const vec = embeddings[i]!;
              await dbClient.db
                .update(chunks)
                .set({
                  embedding: vec,
                  metadataJson: {
                    ...row.metadataJson,
                    embeddingProvider: "openrouter",
                    embeddingModel: model,
                    embeddingDimensions: vec.length,
                  },
                })
                .where(eq(chunks.id, row.id));
            }
          } catch (e) {
            embeddingError = e instanceof Error ? e.message : String(e);
            vectorEmbeddings = false;
          }
        } else if (retrievalChunks.length && !env.OPENROUTER_API_KEY) {
          embeddingError = "OPENROUTER_API_KEY not set; skipping vector embeddings";
        }

        await appendEvent(dbClient, {
          notebookId,
          eventType: "source.index.completed",
          payload: {
            sourceId,
            sourceVersionId,
            lexicalFts: true,
            vectorEmbeddings,
            embeddingModel,
            embeddingError,
            note: "GIN FTS index on chunks.text (migration 0001)",
          },
        });

        const usedLlamaParsePdf = source.sourceType === "pdf" && Boolean(env.LLAMAPARSE_API_KEY?.length);
        const pdfNeedsReview = source.sourceType === "pdf" && !usedLlamaParsePdf;

        let enrichmentOk = false;
        let enrichmentReason: string | undefined;

        if (!pdfNeedsReview) {
          if (!retrievalChunks.length) {
            enrichmentReason = "no_retrieval_chunks";
          } else if (!env.OPENROUTER_API_KEY) {
            enrichmentReason = "OPENROUTER_API_KEY not set";
          } else {
            await dbClient.db.update(sources).set({ status: "enriching", updatedAt: new Date() }).where(eq(sources.id, sourceId));

            const enrich = await runPostIngestEnrichment(env, dbClient, {
              notebookId,
              sourceId,
              sourceVersionId,
              sourceTitle: source.title,
              chunks: retrievalChunks.map((c) => ({ id: c.id, text: c.text })),
            });
            enrichmentOk = enrich.ok;
            enrichmentReason = enrich.reason;
          }

          await appendEvent(dbClient, {
            notebookId,
            eventType: "source.enrichment.completed",
            payload: {
              sourceId,
              sourceVersionId,
              ok: enrichmentOk,
              reason: enrichmentReason,
            },
          });
        }

        const lexicalReady = true;
        const embeddingGate = retrievalChunks.length === 0 || vectorEmbeddings || Boolean(embeddingError);
        const tutoringGate =
          !pdfNeedsReview &&
          enrichmentOk &&
          retrievalChunks.length > 0 &&
          lexicalReady &&
          embeddingGate;

        if (tutoringGate) {
          await appendEvent(dbClient, {
            notebookId,
            eventType: "source.tutoring_ready",
            payload: {
              sourceId,
              sourceVersionId,
              vectorEmbeddings,
              embeddingModel,
              embeddingError: embeddingError ?? undefined,
            },
          });
        }

        const terminalStatus = pdfNeedsReview ? "needs_review" : tutoringGate ? "tutoring_ready" : "indexed";

        await dbClient.db
          .update(sources)
          .set({
            status: terminalStatus,
            updatedAt: new Date(),
            metadataJson: {
              ...source.metadataJson,
              ingestionWarnings: parsed.warnings,
              embeddingError: embeddingError ?? undefined,
              enrichmentOk,
              enrichmentReason,
              tutoringReady: tutoringGate,
              lastIngestJobId: job.id,
            },
          })
          .where(eq(sources.id, sourceId));

        await appendEvent(dbClient, {
          notebookId,
          eventType: "ingestion.job.completed",
          payload: { jobId: job.id, sourceId, sourceVersionId, terminalStatus },
        });

        jobObservation.update({
          output: {
            sourceId,
            sourceVersionId,
            terminalStatus,
            chunkCount: chunkRows.length,
            retrievalCount: retrievalChunks.length,
            vectorEmbeddings,
            embeddingModel,
            enrichmentOk,
          },
        });
          },
          { asType: "chain" },
        );
      } catch (err) {
        await appendEvent(dbClient, {
          notebookId,
          eventType: "ingestion.job.failed",
          payload: {
            jobId: job.id,
            sourceId,
            sourceVersionId,
            message: err instanceof Error ? err.message : String(err),
          },
        });

        await dbClient.db
          .update(sources)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(sources.id, sourceId));

        throw err;
      }
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error("Job failed", job?.id, err);
  });

  console.log("StudyAgent worker listening on queue ingestion");

  const runDecayTick = () => {
    void applyClaimDecay(dbClient)
      .then(({ updated }) => {
        if (updated > 0) {
          console.log(`claim decay: updated ${updated} row(s)`);
        }
      })
      .catch((e) => console.error("claim decay failed", e));
  };
  setTimeout(runDecayTick, 15_000);
  setInterval(runDecayTick, 86_400_000);

  const shutdown = async () => {
    await worker.close();
    await connection.quit();
    await shutdownLangfuseTracing();
    await dbClient.sql.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
