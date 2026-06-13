import type { StudyAgentEnv } from "@studyagent/config";
import type { DbClient } from "@studyagent/db";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  failGenerationJob,
  type GenerationJobRecord,
} from "@studyagent/db";
import { recordGenerationLifecycleMetric } from "@studyagent/observability";
import {
  runInitialBuild,
  runRollingModuleBuild,
  resumePendingBackgroundWikiPolishes,
} from "@studyagent/wiki-generation";

export async function processNextGenerationJob(
  env: StudyAgentEnv,
  dbClient: DbClient,
  input: { workerId: string },
): Promise<{ processed: boolean; jobId?: string; jobName?: string }> {
  const job = await claimNextGenerationJob(dbClient, {
    workerId: input.workerId,
    jobNames: ["initial_build", "rolling_module_build", "wiki_touch_background"],
  });
  if (!job) {
    const resumed = await resumePendingBackgroundWikiPolishes(env, dbClient, { maxPages: 2 });
    if (resumed.processed > 0) {
      console.info("generation background polish resumed", {
        workerId: input.workerId,
        processed: resumed.processed,
        completed: resumed.completed,
        failed: resumed.failed,
      });
    }
    return { processed: resumed.processed > 0 };
  }

  try {
    console.info("generation job started", {
      workerId: input.workerId,
      jobId: job.id,
      jobName: job.jobName,
      notebookId: job.notebookId,
      targetType: job.targetType,
      generationMode: job.generationMode,
      trigger: job.trigger,
      attempt: job.attemptsStarted,
    });
    await executeGenerationJob(env, dbClient, job);
    console.info("generation job completed", {
      workerId: input.workerId,
      jobId: job.id,
      jobName: job.jobName,
      notebookId: job.notebookId,
      targetType: job.targetType,
      generationMode: job.generationMode,
      trigger: job.trigger,
    });
    return { processed: true, jobId: job.id, jobName: job.jobName };
  } catch (error) {
    console.error("generation job failed", {
      workerId: input.workerId,
      jobId: job.id,
      jobName: job.jobName,
      notebookId: job.notebookId,
      targetType: job.targetType,
      generationMode: job.generationMode,
      trigger: job.trigger,
      error: error instanceof Error ? error.message : String(error),
    });
    await failGenerationJob(dbClient, {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { processed: true, jobId: job.id, jobName: job.jobName };
  }
}

async function executeGenerationJob(
  env: StudyAgentEnv,
  dbClient: DbClient,
  job: GenerationJobRecord,
): Promise<void> {
  const payload = job.payloadJson;
  if (job.jobName === "initial_build") {
    await runInitialBuild(env, dbClient, {
      notebookId: job.notebookId,
      curriculumId: String(payload.curriculumId ?? ""),
      moduleId: String(payload.moduleId ?? ""),
      sourceId: String(payload.sourceId ?? ""),
      generationJobId: job.id,
    });
    return;
  }

  if (job.jobName === "rolling_module_build") {
    const result = await runRollingModuleBuild(env, dbClient, {
      notebookId: job.notebookId,
      curriculumId: String(payload.curriculumId ?? ""),
      completedModuleId: String(payload.completedModuleId ?? ""),
      ...(typeof payload.sourceId === "string" ? { sourceId: payload.sourceId } : {}),
      ...(typeof payload.trigger === "string" ? { trigger: payload.trigger as never } : {}),
      generationJobId: job.id,
    });
    recordGenerationLifecycleMetric({
      eventType: "generation.module_deep_build.completed",
      outcome: result.ok ? "success" : "failure",
      generationMode: "rolling_module_build",
      trigger: typeof payload.trigger === "string" ? payload.trigger : "module_milestone",
    });
    return;
  }

  if (job.jobName === "wiki_touch_background") {
    await resumePendingBackgroundWikiPolishes(env, dbClient, {
      maxPages: 1,
      notebookId: job.notebookId,
      ...(typeof payload.pageId === "string" ? { pageId: payload.pageId } : {}),
    });
    await completeGenerationJob(dbClient, {
      jobId: job.id,
      resultJson: { ok: true, resumed: true },
    });
    return;
  }

  throw new Error(`Unsupported generation job: ${job.jobName}`);
}
