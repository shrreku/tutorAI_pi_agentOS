import { S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "@studyagent/config";
import {
  appendEvent,
  calculateIngestionSettlementCents,
  claimNextIngestionJob,
  completeIngestionJob,
  createDb,
  failIngestionJob,
  GENERATION_JOB_CHANNEL,
  getNextQueuedIngestionJobRunAt,
  INGESTION_JOB_CHANNEL,
  releaseCreditReservation,
  settleCreditReservation,
  type ClaimedIngestionJob,
  type DbClient,
} from "@studyagent/db";
import {
  captureException,
  initializeLangfuseTracing,
  initSentry,
  recordIngestionJobMetric,
  shutdownLangfuseTracing,
  startMetricTimer,
} from "@studyagent/observability";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import postgres from "postgres";
import { processIngestionPipelineJob } from "./ingestion-pipeline.js";
import { processNextGenerationJob } from "./generation-job-processor.js";
import { enqueueDegradedInitialBuildRetries } from "./retry-degraded-generation.js";
import { applyClaimDecay } from "./wiki-decay.js";
import {
  runOneShotDrain,
  getNotebookOwnerId,
  learnerHasOtherRunningJob,
  releaseIngestionJob,
  MAX_CONSECUTIVE_LEARNER_SKIPS,
} from "./one-shot-drain.js";

function createS3(env: ReturnType<typeof loadEnv>): S3Client | null {
  if (
    !env.OBJECT_STORAGE_ENDPOINT ||
    !env.OBJECT_STORAGE_ACCESS_KEY ||
    !env.OBJECT_STORAGE_SECRET_KEY
  ) {
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

export { runOneShotDrain } from "./one-shot-drain.js";

function parseCliArgs(argv: string[]): { oneShot: boolean; maxJobs: number } {
  const oneShot = argv.includes("--one-shot");
  const maxJobsArg = argv.find((arg) => arg.startsWith("--max-jobs="));
  const maxJobs = maxJobsArg ? Number.parseInt(maxJobsArg.split("=")[1] ?? "5", 10) : 5;
  return { oneShot, maxJobs: Number.isFinite(maxJobs) && maxJobs > 0 ? maxJobs : 5 };
}

async function main() {
  const env = loadEnv();
  initSentry(env.SENTRY_DSN, env.SENTRY_ENVIRONMENT, env.SENTRY_RELEASE ?? env.LANGFUSE_RELEASE);
  const { oneShot, maxJobs } = parseCliArgs(process.argv.slice(2));
  if (oneShot) {
    initializeLangfuseTracing("studyagent-worker", env);
    const result = await runOneShotDrain(env, { maxJobs });
    console.log("one-shot drain finished", result);
    await shutdownLangfuseTracing();
    process.exit(0);
  }

  initializeLangfuseTracing("studyagent-worker", env);
  const dbClient = createDb(env.DATABASE_URL);
  const s3 = createS3(env);

  const decayTimer = startClaimDecay(dbClient);
  const generationJobWorker = startGenerationJobWorker(env, dbClient);
  const stopIngestionWorker = env.REDIS_URL
    ? await startBullMqIngestionWorker(env, dbClient, s3)
    : await startPostgresIngestionWorker(env, dbClient, s3);

  const shutdown = async () => {
    clearInterval(decayTimer);
    await generationJobWorker.stop();
    await stopIngestionWorker();
    await shutdownLangfuseTracing();
    await dbClient.sql.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

function startGenerationJobWorker(
  env: ReturnType<typeof loadEnv>,
  dbClient: DbClient,
): { interval: NodeJS.Timeout; stop: () => Promise<void> } {
  const workerId = `worker_${process.pid}`;
  let draining = false;

  const drainGenerationJobs = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    try {
      while (true) {
        const result = await processNextGenerationJob(env, dbClient, { workerId });
        if (!result.processed) break;
        console.log(
          `generation jobs: processed job=${result.jobId ?? "background"} name=${result.jobName ?? "resume"}`,
        );
      }
    } catch (error) {
      captureException(error, { worker: "generation_jobs" });
      console.error("generation job worker failed", error);
    } finally {
      draining = false;
    }
  };

  const listener = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  let listenerHandle: { unlisten: () => Promise<void> } | null = null;
  void listener
    .listen(
      GENERATION_JOB_CHANNEL,
      () => {
        void drainGenerationJobs();
      },
      () => {
        console.log("StudyAgent worker listening on Postgres generation jobs queue");
      },
    )
    .then((handle) => {
      listenerHandle = handle;
    });

  void drainGenerationJobs();
  void enqueueDegradedInitialBuildRetries(env, dbClient)
    .then((count) => {
      if (count > 0) {
        console.log(`generation jobs: enqueued ${count} degraded initial build retry(ies)`);
        void drainGenerationJobs();
      }
    })
    .catch((error) => {
      captureException(error, { worker: "degraded_initial_build_retry" });
      console.error("degraded initial build retry scan failed", error);
    });
  const interval = setInterval(() => {
    void drainGenerationJobs();
  }, 60_000);

  return {
    interval,
    stop: async () => {
      clearInterval(interval);
      if (listenerHandle) await listenerHandle.unlisten();
      await listener.end();
    },
  };
}

function startClaimDecay(dbClient: DbClient): NodeJS.Timeout {
  const runDecayTick = () => {
    void applyClaimDecay(dbClient)
      .then(({ updated }) => {
        if (updated > 0) {
          console.log(`claim decay: updated ${updated} row(s)`);
        }
      })
      .catch((e) => {
        captureException(e, { worker: "claim_decay" });
        console.error("claim decay failed", e);
      });
  };
  setTimeout(runDecayTick, 15_000);
  return setInterval(runDecayTick, 86_400_000);
}

async function startBullMqIngestionWorker(
  env: ReturnType<typeof loadEnv>,
  dbClient: DbClient,
  s3: S3Client | null,
): Promise<() => Promise<void>> {
  const connection = new Redis(env.REDIS_URL!, { maxRetriesPerRequest: null });
  const worker = new Worker(
    "ingestion",
    async (job) => {
      const stopTimer = startMetricTimer();
      recordIngestionJobMetric({ backend: "bullmq", outcome: "claimed" });
      console.info("ingestion job started", {
        backend: "bullmq",
        jobId: String(job.id ?? ""),
        jobName: job.name,
        notebookId: (job.data as { notebookId?: string }).notebookId,
        sourceId: (job.data as { sourceId?: string }).sourceId,
        sourceVersionId: (job.data as { sourceVersionId?: string }).sourceVersionId,
        attempt: job.attemptsStarted,
      });
      await processIngestionPipelineJob({
        env,
        dbClient,
        s3,
        job: {
          id: String(job.id ?? `bull_${crypto.randomUUID().replaceAll("-", "")}`),
          name: job.name,
          data: job.data as {
            notebookId: string;
            sourceId: string;
            sourceVersionId: string;
            ingestionReservationId?: string | null;
          },
          attemptsStarted: job.attemptsStarted,
        },
      });
      await settleBullMqIngestionReservation(dbClient, String(job.id ?? ""), job.data);
      const durationMs = stopTimer();
      recordIngestionJobMetric({ backend: "bullmq", outcome: "completed", durationMs });
      console.info("ingestion job completed", {
        backend: "bullmq",
        jobId: String(job.id ?? ""),
        jobName: job.name,
        notebookId: (job.data as { notebookId?: string }).notebookId,
        sourceId: (job.data as { sourceId?: string }).sourceId,
        sourceVersionId: (job.data as { sourceVersionId?: string }).sourceVersionId,
        durationMs,
      });
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    captureException(err, {
      worker: "bullmq_ingestion",
      jobId: String(job?.id ?? ""),
      sourceId: (job?.data as { sourceId?: string } | undefined)?.sourceId,
    });
    recordIngestionJobMetric({ backend: "bullmq", outcome: "failed" });
    const attempts = typeof job?.opts?.attempts === "number" ? job.opts.attempts : 1;
    const attemptsMade = job?.attemptsMade ?? attempts;
    if (job && attemptsMade >= attempts) {
      void releaseBullMqIngestionReservation(dbClient, String(job.id ?? ""), job.data, err).catch(
        (releaseError) => {
          console.error("failed to release BullMQ ingestion reservation", {
            jobId: String(job.id ?? ""),
            error: releaseError instanceof Error ? releaseError.message : String(releaseError),
          });
        },
      );
    }
    console.error("ingestion job failed", {
      backend: "bullmq",
      jobId: String(job?.id ?? ""),
      jobName: job?.name,
      notebookId: (job?.data as { notebookId?: string } | undefined)?.notebookId,
      sourceId: (job?.data as { sourceId?: string } | undefined)?.sourceId,
      sourceVersionId: (job?.data as { sourceVersionId?: string } | undefined)?.sourceVersionId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  console.log("StudyAgent worker listening on BullMQ queue ingestion");
  return async () => {
    await worker.close();
    await connection.quit();
  };
}

async function startPostgresIngestionWorker(
  env: ReturnType<typeof loadEnv>,
  dbClient: DbClient,
  s3: S3Client | null,
): Promise<() => Promise<void>> {
  const workerId = `pgworker_${crypto.randomUUID().replaceAll("-", "")}`;
  const listener = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  let drainTimer: NodeJS.Timeout | null = null;
  let draining = false;
  let pendingDrain = false;

  const clearDrainTimer = () => {
    if (!drainTimer) return;
    clearTimeout(drainTimer);
    drainTimer = null;
  };

  const scheduleDrain = (delayMs = 0) => {
    if (drainTimer) return;
    drainTimer = setTimeout(
      () => {
        drainTimer = null;
        void drainReadyJobs();
      },
      Math.max(0, delayMs),
    );
  };

  const scheduleNextQueuedJob = async () => {
    const nextRunAt = await getNextQueuedIngestionJobRunAt(dbClient);
    if (!nextRunAt) return;
    scheduleDrain(nextRunAt.getTime() - Date.now());
  };

  const drainReadyJobs = async (): Promise<void> => {
    if (draining) {
      pendingDrain = true;
      return;
    }
    draining = true;
    try {
      let consecutiveSkips = 0;
      while (true) {
        const job = await claimNextIngestionJob(dbClient, { workerId });
        if (!job) break;
        recordIngestionJobMetric({ backend: "postgres", outcome: "claimed" });

        const ownerId = await getNotebookOwnerId(dbClient, job.notebookId);
        if (ownerId && (await learnerHasOtherRunningJob(dbClient, ownerId, job.id))) {
          await releaseIngestionJob(dbClient, job.id);
          consecutiveSkips += 1;
          if (consecutiveSkips >= MAX_CONSECUTIVE_LEARNER_SKIPS) {
            break;
          }
          continue;
        }

        consecutiveSkips = 0;
        await runClaimedPostgresJob({ env, dbClient, s3, job });
      }
      await scheduleNextQueuedJob();
    } catch (error) {
      captureException(error, { worker: "postgres_ingestion_drain" });
      console.error("Postgres ingestion worker drain failed", error);
    } finally {
      draining = false;
      if (pendingDrain) {
        pendingDrain = false;
        scheduleDrain();
      }
    }
  };

  const listenerHandle = await listener.listen(
    INGESTION_JOB_CHANNEL,
    () => scheduleDrain(),
    () => {
      console.log("StudyAgent worker listening on Postgres ingestion queue");
    },
  );
  scheduleDrain();

  return async () => {
    clearDrainTimer();
    await listenerHandle.unlisten();
    await listener.end();
  };
}

async function runClaimedPostgresJob(input: {
  env: ReturnType<typeof loadEnv>;
  dbClient: DbClient;
  s3: S3Client | null;
  job: ClaimedIngestionJob;
}): Promise<void> {
  const { env, dbClient, s3, job } = input;
  const stopTimer = startMetricTimer();
  try {
    console.info("ingestion job started", {
      backend: "postgres",
      jobId: job.id,
      jobName: job.jobName,
      notebookId: job.notebookId,
      sourceId: job.sourceId,
      sourceVersionId: job.sourceVersionId,
      attempt: job.attemptsStarted,
    });
    await processIngestionPipelineJob({
      env,
      dbClient,
      s3,
      job: {
        id: job.id,
        name: job.jobName,
        data: {
          notebookId: job.notebookId,
          sourceId: job.sourceId,
          sourceVersionId: job.sourceVersionId,
          ingestionReservationId: job.ingestionReservationId ?? null,
        },
        attemptsStarted: job.attemptsStarted,
      },
    });
    await settleIngestionReservation(dbClient, job);
    await completeIngestionJob(dbClient, job.id);
    const durationMs = stopTimer();
    recordIngestionJobMetric({ backend: "postgres", outcome: "completed", durationMs });
    console.info("ingestion job completed", {
      backend: "postgres",
      jobId: job.id,
      jobName: job.jobName,
      notebookId: job.notebookId,
      sourceId: job.sourceId,
      sourceVersionId: job.sourceVersionId,
      durationMs,
    });
  } catch (error) {
    captureException(error, {
      worker: "postgres_ingestion",
      jobId: job.id,
      sourceId: job.sourceId,
    });
    const message = error instanceof Error ? error.message : String(error);
    const outcome = await failIngestionJob(dbClient, { jobId: job.id, error: message });
    if (!outcome.retry) {
      await releaseIngestionReservation(dbClient, job, message);
    }
    const durationMs = stopTimer();
    recordIngestionJobMetric({ backend: "postgres", outcome: "failed", durationMs });
    console.error("ingestion job failed", {
      backend: "postgres",
      jobId: job.id,
      jobName: job.jobName,
      notebookId: job.notebookId,
      sourceId: job.sourceId,
      sourceVersionId: job.sourceVersionId,
      retry: outcome.retry,
      durationMs,
      error: message,
    });
    if (!outcome.retry) {
      recordIngestionJobMetric({ backend: "postgres", outcome: "dead_lettered" });
      console.error("ingestion job dead-lettered", {
        backend: "postgres",
        jobId: job.id,
        jobName: job.jobName,
        notebookId: job.notebookId,
        sourceId: job.sourceId,
        sourceVersionId: job.sourceVersionId,
        error: message,
      });
      await appendEvent(dbClient, {
        notebookId: job.notebookId,
        eventType: "ingestion.job.dead_lettered",
        payload: {
          jobId: job.id,
          sourceId: job.sourceId,
          sourceVersionId: job.sourceVersionId,
          message,
        },
      });
    }
  }
}

function getBullMqIngestionReservationId(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const value = (data as { ingestionReservationId?: unknown }).ingestionReservationId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function settleBullMqIngestionReservation(
  dbClient: DbClient,
  jobId: string,
  data: unknown,
): Promise<void> {
  const reservationId = getBullMqIngestionReservationId(data);
  if (!reservationId || !data || typeof data !== "object" || Array.isArray(data)) {
    return;
  }
  const jobData = data as { sourceId?: unknown; sourceVersionId?: unknown };
  const sourceId = typeof jobData.sourceId === "string" ? jobData.sourceId : null;
  const sourceVersionId =
    typeof jobData.sourceVersionId === "string" ? jobData.sourceVersionId : null;
  const usage =
    sourceId && sourceVersionId
      ? await calculateIngestionSettlementCents(dbClient, sourceId, sourceVersionId)
      : { cents: 5, sizeBytes: 0, chunkCount: 0 };
  await settleCreditReservation(dbClient, reservationId, usage.cents, {
    jobId,
    sourceId,
    sourceVersionId,
    outcome: "completed",
    sizeBytes: usage.sizeBytes,
    chunkCount: usage.chunkCount,
    settlementBasis: "processed_size_and_chunks",
  });
}

async function releaseBullMqIngestionReservation(
  dbClient: DbClient,
  jobId: string,
  data: unknown,
  error: unknown,
): Promise<void> {
  const reservationId = getBullMqIngestionReservationId(data);
  if (!reservationId || !data || typeof data !== "object" || Array.isArray(data)) {
    return;
  }
  const jobData = data as { sourceId?: unknown; sourceVersionId?: unknown };
  const message = error instanceof Error ? error.message : String(error);
  await releaseCreditReservation(dbClient, reservationId, {
    jobId,
    sourceId: typeof jobData.sourceId === "string" ? jobData.sourceId : null,
    sourceVersionId: typeof jobData.sourceVersionId === "string" ? jobData.sourceVersionId : null,
    outcome: "failed",
    error: message.slice(0, 500),
  });
}

async function settleIngestionReservation(
  dbClient: DbClient,
  job: ClaimedIngestionJob,
): Promise<void> {
  if (!job.ingestionReservationId) {
    return;
  }
  const usage = await calculateIngestionSettlementCents(
    dbClient,
    job.sourceId,
    job.sourceVersionId,
  );
  await settleCreditReservation(dbClient, job.ingestionReservationId, usage.cents, {
    jobId: job.id,
    sourceId: job.sourceId,
    sourceVersionId: job.sourceVersionId,
    outcome: "completed",
    sizeBytes: usage.sizeBytes,
    chunkCount: usage.chunkCount,
    settlementBasis: "processed_size_and_chunks",
  });
}

async function releaseIngestionReservation(
  dbClient: DbClient,
  job: ClaimedIngestionJob,
  message: string,
): Promise<void> {
  if (!job.ingestionReservationId) {
    return;
  }
  await releaseCreditReservation(dbClient, job.ingestionReservationId, {
    jobId: job.id,
    sourceId: job.sourceId,
    sourceVersionId: job.sourceVersionId,
    outcome: "failed",
    error: message.slice(0, 500),
  });
}

void main().catch((err) => {
  captureException(err, { worker: "startup" });
  console.error(err);
  process.exit(1);
});
