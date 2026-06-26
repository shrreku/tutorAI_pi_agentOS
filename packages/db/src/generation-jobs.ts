import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "./client.js";
import { generationJobs } from "./schema/index.js";

export const GENERATION_JOB_CHANNEL = "studyagent_generation_jobs";

export type GenerationJobStatus = "queued" | "running" | "completed" | "failed";

export type GenerationJobName = "initial_build" | "rolling_module_build" | "wiki_touch_background";

export type GenerationJobRecord = {
  id: string;
  jobName: GenerationJobName;
  notebookId: string;
  idempotencyKey: string;
  targetType: string | null;
  generationMode: string | null;
  trigger: string | null;
  status: GenerationJobStatus;
  attemptsStarted: number;
  maxAttempts: number;
  payloadJson: Record<string, unknown>;
  resultJson: Record<string, unknown> | null;
};

export async function findGenerationJobByIdempotencyKey(
  dbClient: DbClient,
  input: { notebookId: string; idempotencyKey: string },
): Promise<GenerationJobRecord | null> {
  const [row] = await dbClient.db
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.notebookId, input.notebookId),
        eq(generationJobs.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  return row ? mapGenerationJob(row) : null;
}

export async function enqueueGenerationJob(
  dbClient: DbClient,
  input: {
    jobName: GenerationJobName;
    notebookId: string;
    idempotencyKey: string;
    targetType?: string;
    generationMode?: string;
    trigger?: string;
    payloadJson?: Record<string, unknown>;
    maxAttempts?: number;
    priority?: number;
  },
): Promise<GenerationJobRecord> {
  const existing = await findGenerationJobByIdempotencyKey(dbClient, {
    notebookId: input.notebookId,
    idempotencyKey: input.idempotencyKey,
  });
  if (existing) return existing;

  const jobId = `gjob_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await dbClient.db.insert(generationJobs).values({
      id: jobId,
      jobName: input.jobName,
      notebookId: input.notebookId,
      idempotencyKey: input.idempotencyKey,
      targetType: input.targetType ?? null,
      generationMode: input.generationMode ?? null,
      trigger: input.trigger ?? null,
      maxAttempts: input.maxAttempts ?? 3,
      priority: input.priority ?? 0,
      payloadJson: input.payloadJson ?? {},
    });
  } catch (error) {
    const raced = await findGenerationJobByIdempotencyKey(dbClient, {
      notebookId: input.notebookId,
      idempotencyKey: input.idempotencyKey,
    });
    if (raced) return raced;
    throw error;
  }

  await notifyGenerationJobs(dbClient, jobId);
  const created = await findGenerationJobByIdempotencyKey(dbClient, {
    notebookId: input.notebookId,
    idempotencyKey: input.idempotencyKey,
  });
  if (!created) throw new Error("Failed to create generation job");
  return created;
}

export async function notifyGenerationJobs(dbClient: DbClient, payload = "wake"): Promise<void> {
  await dbClient.db.execute(sql`select pg_notify(${GENERATION_JOB_CHANNEL}, ${payload})`);
}

export async function claimNextGenerationJob(
  dbClient: DbClient,
  input: {
    workerId: string;
    jobNames?: GenerationJobName[];
    staleAfterMs?: number;
  },
): Promise<GenerationJobRecord | null> {
  const staleAfterMs = input.staleAfterMs ?? 15 * 60_000;
  const jobNameFilter =
    input.jobNames && input.jobNames.length > 0
      ? sql`and job_name in (${sql.join(
          input.jobNames.map((name) => sql`${name}`),
          sql`, `,
        )})`
      : sql``;

  const rows = await dbClient.db.execute(sql`
    with next_job as (
      select id
      from generation_jobs
      where (
        (status = 'queued' and run_at <= now())
        or (status = 'running' and locked_at < now() - (${staleAfterMs} * interval '1 millisecond'))
      )
      and attempts_started < max_attempts
      ${jobNameFilter}
      order by priority desc, run_at asc, created_at asc
      for update skip locked
      limit 1
    )
    update generation_jobs
    set status = 'running',
        attempts_started = attempts_started + 1,
        locked_at = now(),
        locked_by = ${input.workerId},
        updated_at = now()
    from next_job
    where generation_jobs.id = next_job.id
    returning generation_jobs.*
  `);

  const row = (rows as unknown[])[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapGenerationJob(row);
}

export async function completeGenerationJob(
  dbClient: DbClient,
  input: {
    jobId: string;
    resultJson?: Record<string, unknown>;
  },
): Promise<void> {
  await dbClient.db
    .update(generationJobs)
    .set({
      status: "completed",
      lockedAt: null,
      lockedBy: null,
      resultJson: input.resultJson ?? {},
      updatedAt: new Date(),
    })
    .where(eq(generationJobs.id, input.jobId));
}

export async function failGenerationJob(
  dbClient: DbClient,
  input: {
    jobId: string;
    error: string;
    retryDelayMs?: number;
  },
): Promise<{ retry: boolean; status: Extract<GenerationJobStatus, "queued" | "failed"> }> {
  const [row] = await dbClient.db
    .select({
      attemptsStarted: generationJobs.attemptsStarted,
      maxAttempts: generationJobs.maxAttempts,
    })
    .from(generationJobs)
    .where(eq(generationJobs.id, input.jobId))
    .limit(1);
  const retry = Boolean(row && row.attemptsStarted < row.maxAttempts);
  const runAt = retry
    ? new Date(
        Date.now() + (input.retryDelayMs ?? retryDelayForAttemptMs(row?.attemptsStarted ?? 1)),
      )
    : undefined;

  await dbClient.db
    .update(generationJobs)
    .set({
      status: retry ? "queued" : "failed",
      lockedAt: null,
      lockedBy: null,
      lastError: input.error,
      ...(runAt ? { runAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(generationJobs.id, input.jobId));

  if (retry) {
    await notifyGenerationJobs(dbClient, input.jobId);
    return { retry: true, status: "queued" };
  }
  return { retry: false, status: "failed" };
}

export async function listGenerationJobsForNotebook(
  dbClient: DbClient,
  notebookId: string,
  statuses: GenerationJobStatus[] = ["queued", "running"],
): Promise<GenerationJobRecord[]> {
  const rows = await dbClient.db
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.notebookId, notebookId), inArray(generationJobs.status, statuses)))
    .orderBy(asc(generationJobs.createdAt));
  return rows.map((row) => mapGenerationJob(row));
}

function retryDelayForAttemptMs(attemptsStarted: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attemptsStarted - 1));
}

function mapGenerationJob(row: Record<string, unknown>): GenerationJobRecord {
  return {
    id: String(row.id),
    jobName: String(row.jobName ?? row.job_name) as GenerationJobName,
    notebookId: String(row.notebookId ?? row.notebook_id),
    idempotencyKey: String(row.idempotencyKey ?? row.idempotency_key),
    targetType: (row.targetType ?? row.target_type ?? null) as string | null,
    generationMode: (row.generationMode ?? row.generation_mode ?? null) as string | null,
    trigger: (row.trigger ?? null) as string | null,
    status: String(row.status) as GenerationJobStatus,
    attemptsStarted: Number(row.attemptsStarted ?? row.attempts_started ?? 0),
    maxAttempts: Number(row.maxAttempts ?? row.max_attempts ?? 3),
    payloadJson: (row.payloadJson ?? row.payload_json ?? {}) as Record<string, unknown>,
    resultJson: (row.resultJson ?? row.result_json ?? null) as Record<string, unknown> | null,
  };
}
