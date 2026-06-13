import type { DbClient } from "@studyagent/db";
import {
  completeGenerationJob,
  enqueueGenerationJob,
  failGenerationJob,
  findGenerationJobByIdempotencyKey,
  generationJobs,
  notifyGenerationJobs,
  type GenerationJobName,
  type GenerationJobRecord,
} from "@studyagent/db";
import {
  generationTargetSchema,
  type GenerationMode,
  type GenerationTargetType,
  type GenerationTrigger,
} from "@studyagent/schemas";
import { eq } from "drizzle-orm";
import { isTargetAlreadyComplete } from "./generation-target-registry.js";

export type BeginGenerationJobInput = {
  jobName: GenerationJobName;
  notebookId: string;
  idempotencyKey: string;
  targetType: GenerationTargetType;
  generationMode: GenerationMode;
  trigger: GenerationTrigger;
  payloadJson?: Record<string, unknown>;
};

export async function beginGenerationJob(
  dbClient: DbClient,
  input: BeginGenerationJobInput,
): Promise<{ job: GenerationJobRecord; skip: boolean; reason?: string }> {
  generationTargetSchema.parse({
    notebookId: input.notebookId,
    targetType: input.targetType,
    generationMode: input.generationMode,
    trigger: input.trigger,
    idempotencyKey: input.idempotencyKey,
    priority: 0,
    timeoutMs: 120_000,
    payloadJson: input.payloadJson ?? {},
  });

  const existing = await findGenerationJobByIdempotencyKey(dbClient, {
    notebookId: input.notebookId,
    idempotencyKey: input.idempotencyKey,
  });
  if (existing?.status === "completed") {
    const targetComplete = await isTargetAlreadyComplete(dbClient, input.notebookId, input.idempotencyKey);
    if (targetComplete) {
      return { job: existing, skip: true, reason: "idempotent_skip" };
    }
    const now = new Date();
    await dbClient.db
      .update(generationJobs)
      .set({
        status: "queued",
        attemptsStarted: 0,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        runAt: now,
        updatedAt: now,
      })
      .where(eq(generationJobs.id, existing.id));
    await notifyGenerationJobs(dbClient, existing.id);
    return { job: existing, skip: false, reason: "retry_degraded" };
  }
  if (existing?.status === "running") {
    return { job: existing, skip: true, reason: "in_progress" };
  }

  const job = await enqueueGenerationJob(dbClient, {
    jobName: input.jobName,
    notebookId: input.notebookId,
    idempotencyKey: input.idempotencyKey,
    targetType: input.targetType,
    generationMode: input.generationMode,
    trigger: input.trigger,
    payloadJson: input.payloadJson ?? {},
  });

  if (job.status === "failed") {
    const now = new Date();
    await dbClient.db
      .update(generationJobs)
      .set({
        status: "queued",
        attemptsStarted: 0,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        runAt: now,
        updatedAt: now,
      })
      .where(eq(generationJobs.id, job.id));
    await notifyGenerationJobs(dbClient, job.id);
  }

  const refreshed = await findGenerationJobByIdempotencyKey(dbClient, {
    notebookId: input.notebookId,
    idempotencyKey: input.idempotencyKey,
  });
  return { job: refreshed ?? job, skip: false };
}

export async function finishGenerationJob(
  dbClient: DbClient,
  input: {
    jobId: string;
    ok: boolean;
    resultJson?: Record<string, unknown>;
    error?: string;
  },
): Promise<void> {
  if (input.ok) {
    await completeGenerationJob(dbClient, {
      jobId: input.jobId,
      resultJson: input.resultJson ?? { ok: true },
    });
    return;
  }
  await failGenerationJob(dbClient, {
    jobId: input.jobId,
    error: input.error ?? "generation_failed",
  });
}
