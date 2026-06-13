import { S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "@studyagent/config";
import {
  appendEvent,
  claimNextIngestionJob,
  completeIngestionJob,
  createDb,
  failIngestionJob,
  GENERATION_JOB_CHANNEL,
  getNextQueuedIngestionJobRunAt,
  INGESTION_JOB_CHANNEL,
  type ClaimedIngestionJob,
  type DbClient,
} from "@studyagent/db";
import {
  initializeLangfuseTracing,
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

async function main() {
  const env = loadEnv();
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
      .catch((e) => console.error("claim decay failed", e));
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
          data: job.data as { notebookId: string; sourceId: string; sourceVersionId: string },
          attemptsStarted: job.attemptsStarted,
        },
      });
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
    recordIngestionJobMetric({ backend: "bullmq", outcome: "failed" });
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
    drainTimer = setTimeout(() => {
      drainTimer = null;
      void drainReadyJobs();
    }, Math.max(0, delayMs));
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
      while (true) {
        const job = await claimNextIngestionJob(dbClient, { workerId });
        if (!job) break;
        recordIngestionJobMetric({ backend: "postgres", outcome: "claimed" });
        await runClaimedPostgresJob({ env, dbClient, s3, job });
      }
      await scheduleNextQueuedJob();
    } catch (error) {
      console.error("Postgres ingestion worker drain failed", error);
    } finally {
      draining = false;
      if (pendingDrain) {
        pendingDrain = false;
        scheduleDrain();
      }
    }
  };

  const listenerHandle = await listener.listen(INGESTION_JOB_CHANNEL, () => scheduleDrain(), () => {
    console.log("StudyAgent worker listening on Postgres ingestion queue");
  });
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
        },
        attemptsStarted: job.attemptsStarted,
      },
    });
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
    const message = error instanceof Error ? error.message : String(error);
    const outcome = await failIngestionJob(dbClient, { jobId: job.id, error: message });
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

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
