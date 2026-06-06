import { and, asc, eq, sql } from "drizzle-orm";
import type { DbClient } from "./client.js";
import { ingestionJobs } from "./schema/index.js";

export const INGESTION_JOB_CHANNEL = "studyagent_ingestion_jobs";

export type IngestionJobStatus = "queued" | "running" | "completed" | "failed" | "dead_lettered";

export type IngestionJobPayload = {
  notebookId: string;
  sourceId: string;
  sourceVersionId: string;
};

export type ClaimedIngestionJob = IngestionJobPayload & {
  id: string;
  jobName: string;
  attemptsStarted: number;
  maxAttempts: number;
};

export async function enqueueIngestionJob(
  dbClient: DbClient,
  input: IngestionJobPayload & {
    jobName?: string;
    maxAttempts?: number;
    priority?: number;
  },
): Promise<ClaimedIngestionJob> {
  const jobId = `ijob_${crypto.randomUUID().replaceAll("-", "")}`;
  const jobName = input.jobName ?? "ingest_source";
  const maxAttempts = input.maxAttempts ?? 3;
  const priority = input.priority ?? 0;
  await dbClient.db.insert(ingestionJobs).values({
    id: jobId,
    jobName,
    notebookId: input.notebookId,
    sourceId: input.sourceId,
    sourceVersionId: input.sourceVersionId,
    maxAttempts,
    priority,
    payloadJson: {
      notebookId: input.notebookId,
      sourceId: input.sourceId,
      sourceVersionId: input.sourceVersionId,
    },
  });
  await notifyIngestionJobs(dbClient, jobId);
  return {
    id: jobId,
    jobName,
    notebookId: input.notebookId,
    sourceId: input.sourceId,
    sourceVersionId: input.sourceVersionId,
    attemptsStarted: 0,
    maxAttempts,
  };
}

export async function notifyIngestionJobs(dbClient: DbClient, payload = "wake"): Promise<void> {
  await dbClient.db.execute(sql`select pg_notify(${INGESTION_JOB_CHANNEL}, ${payload})`);
}

export async function claimNextIngestionJob(
  dbClient: DbClient,
  input: {
    workerId: string;
    staleAfterMs?: number;
  },
): Promise<ClaimedIngestionJob | null> {
  const staleAfterMs = input.staleAfterMs ?? 15 * 60_000;
  const rows = await dbClient.db.execute(sql`
    with next_job as (
      select id
      from ingestion_jobs
      where (
        (status = 'queued' and run_at <= now())
        or (status = 'running' and locked_at < now() - (${staleAfterMs} * interval '1 millisecond'))
      )
      and attempts_started < max_attempts
      order by priority desc, run_at asc, created_at asc
      for update skip locked
      limit 1
    )
    update ingestion_jobs
    set status = 'running',
        attempts_started = attempts_started + 1,
        locked_at = now(),
        locked_by = ${input.workerId},
        updated_at = now()
    from next_job
    where ingestion_jobs.id = next_job.id
    returning ingestion_jobs.id,
      ingestion_jobs.job_name,
      ingestion_jobs.notebook_id,
      ingestion_jobs.source_id,
      ingestion_jobs.source_version_id,
      ingestion_jobs.attempts_started,
      ingestion_jobs.max_attempts
  `);

  const row = (rows as unknown[])[0] as
    | {
        id: string;
        job_name: string;
        notebook_id: string;
        source_id: string;
        source_version_id: string;
        attempts_started: number;
        max_attempts: number;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    jobName: row.job_name,
    notebookId: row.notebook_id,
    sourceId: row.source_id,
    sourceVersionId: row.source_version_id,
    attemptsStarted: row.attempts_started,
    maxAttempts: row.max_attempts,
  };
}

export async function completeIngestionJob(dbClient: DbClient, jobId: string): Promise<void> {
  await dbClient.db
    .update(ingestionJobs)
    .set({
      status: "completed",
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(ingestionJobs.id, jobId));
}

export async function failIngestionJob(
  dbClient: DbClient,
  input: {
    jobId: string;
    error: string;
    retryDelayMs?: number;
  },
): Promise<{ retry: boolean; status: Extract<IngestionJobStatus, "queued" | "failed">; runAt?: Date }> {
  const [row] = await dbClient.db
    .select({
      attemptsStarted: ingestionJobs.attemptsStarted,
      maxAttempts: ingestionJobs.maxAttempts,
    })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.id, input.jobId))
    .limit(1);
  const retry = Boolean(row && row.attemptsStarted < row.maxAttempts);
  const runAt = retry ? new Date(Date.now() + (input.retryDelayMs ?? retryDelayForAttemptMs(row?.attemptsStarted ?? 1))) : undefined;

  await dbClient.db
    .update(ingestionJobs)
    .set({
      status: retry ? "queued" : "failed",
      lockedAt: null,
      lockedBy: null,
      lastError: input.error,
      ...(runAt ? { runAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ingestionJobs.id, input.jobId));

  if (retry) {
    await notifyIngestionJobs(dbClient, input.jobId);
    return { retry: true, status: "queued", ...(runAt ? { runAt } : {}) };
  }
  return { retry: false, status: "failed" };
}

export async function getNextQueuedIngestionJobRunAt(dbClient: DbClient): Promise<Date | null> {
  const [row] = await dbClient.db
    .select({ runAt: ingestionJobs.runAt })
    .from(ingestionJobs)
    .where(and(eq(ingestionJobs.status, "queued")))
    .orderBy(asc(ingestionJobs.runAt))
    .limit(1);
  return row?.runAt ?? null;
}

function retryDelayForAttemptMs(attemptsStarted: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attemptsStarted - 1));
}
