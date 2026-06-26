import { S3Client } from "@aws-sdk/client-s3";
import type { loadEnv } from "@studyagent/config";
import {
  appendEvent,
  calculateIngestionSettlementCents,
  claimNextIngestionJob,
  completeIngestionJob,
  createDb,
  failIngestionJob,
  releaseCreditReservation,
  settleCreditReservation,
  notebooks,
  type ClaimedIngestionJob,
  type DbClient,
} from "@studyagent/db";
import { recordIngestionJobMetric, startMetricTimer } from "@studyagent/observability";
import { eq, sql } from "drizzle-orm";
import { processIngestionPipelineJob } from "./ingestion-pipeline.js";

export const MAX_CONSECUTIVE_LEARNER_SKIPS = 10;

export type OneShotDrainResult = {
  jobsClaimed: number;
  jobsCompleted: number;
  jobsFailed: number;
  jobsSkipped: number;
};

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

export async function getNotebookOwnerId(
  dbClient: DbClient,
  notebookId: string,
): Promise<string | null> {
  const [row] = await dbClient.db
    .select({ ownerId: notebooks.ownerId })
    .from(notebooks)
    .where(eq(notebooks.id, notebookId))
    .limit(1);
  return row?.ownerId ?? null;
}

export async function learnerHasOtherRunningJob(
  dbClient: DbClient,
  ownerId: string,
  excludeJobId: string,
): Promise<boolean> {
  const rows = await dbClient.db.execute(sql`
    select 1
    from ingestion_jobs j
    join notebooks n on n.id = j.notebook_id
    where j.status = 'running'
      and n.owner_id = ${ownerId}
      and j.id <> ${excludeJobId}
    limit 1
  `);
  return (rows as unknown[]).length > 0;
}

export async function releaseIngestionJob(dbClient: DbClient, jobId: string): Promise<void> {
  await dbClient.db.execute(sql`
    update ingestion_jobs
    set status = 'queued',
        locked_at = null,
        locked_by = null,
        attempts_started = greatest(0, attempts_started - 1),
        updated_at = now()
    where id = ${jobId}
  `);
}

async function runClaimedPostgresJob(input: {
  env: ReturnType<typeof loadEnv>;
  dbClient: DbClient;
  s3: S3Client | null;
  job: ClaimedIngestionJob;
}): Promise<"completed" | "failed"> {
  const { env, dbClient, s3, job } = input;
  const stopTimer = startMetricTimer();
  try {
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
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const outcome = await failIngestionJob(dbClient, { jobId: job.id, error: message });
    if (!outcome.retry) {
      await releaseIngestionReservation(dbClient, job, message);
    }
    const durationMs = stopTimer();
    recordIngestionJobMetric({ backend: "postgres", outcome: "failed", durationMs });
    if (!outcome.retry) {
      recordIngestionJobMetric({ backend: "postgres", outcome: "dead_lettered" });
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
    return "failed";
  }
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

export async function runOneShotDrain(
  env: ReturnType<typeof loadEnv>,
  options?: {
    maxJobs?: number;
    dbClient?: DbClient;
    workerId?: string;
  },
): Promise<OneShotDrainResult> {
  const maxJobs = options?.maxJobs ?? 5;
  const dbClient = options?.dbClient ?? createDb(env.DATABASE_URL);
  const ownsDb = !options?.dbClient;
  const s3 = createS3(env);
  const workerId = options?.workerId ?? `oneshot_${crypto.randomUUID().replaceAll("-", "")}`;

  const result: OneShotDrainResult = {
    jobsClaimed: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
    jobsSkipped: 0,
  };

  try {
    let consecutiveSkips = 0;
    let attempts = 0;

    for (let processed = 0; processed < maxJobs; ) {
      attempts += 1;
      const job = await claimNextIngestionJob(dbClient, { workerId });
      if (!job) break;

      result.jobsClaimed += 1;
      recordIngestionJobMetric({ backend: "postgres", outcome: "claimed" });

      const ownerId = await getNotebookOwnerId(dbClient, job.notebookId);
      if (ownerId && (await learnerHasOtherRunningJob(dbClient, ownerId, job.id))) {
        await releaseIngestionJob(dbClient, job.id);
        result.jobsSkipped += 1;
        consecutiveSkips += 1;
        if (
          consecutiveSkips >= MAX_CONSECUTIVE_LEARNER_SKIPS ||
          (processed === 0 && attempts >= maxJobs)
        ) {
          break;
        }
        continue;
      }

      consecutiveSkips = 0;
      const outcome = await runClaimedPostgresJob({ env, dbClient, s3, job });
      processed += 1;
      if (outcome === "completed") {
        result.jobsCompleted += 1;
      } else {
        result.jobsFailed += 1;
      }
    }
  } finally {
    if (ownsDb) {
      await dbClient.sql.end();
    }
  }

  return result;
}
