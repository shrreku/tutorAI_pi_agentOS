import type { DbClient } from "@studyagent/db";
import { buildGenerationIdempotencyKey, type GenerationTrigger } from "@studyagent/schemas";
import { beginGenerationJob } from "./generation-job-lifecycle.js";

export type EnqueueInitialBuildInput = {
  notebookId: string;
  curriculumId: string;
  moduleId: string;
  sourceId: string;
};

export type EnqueueRollingModuleBuildInput = {
  notebookId: string;
  curriculumId: string;
  completedModuleId: string;
  nextModuleId: string;
  sourceId?: string;
  trigger?: GenerationTrigger;
};

export async function enqueueInitialBuildJob(
  dbClient: DbClient,
  input: EnqueueInitialBuildInput,
): Promise<{ enqueued: boolean; jobId: string; reason?: string }> {
  const idempotencyKey = buildGenerationIdempotencyKey({
    notebookId: input.notebookId,
    targetType: "initial_build",
    targetRef: input.moduleId,
    generationMode: "initial_build",
    trigger: "initial_build",
  });
  const begun = await beginGenerationJob(dbClient, {
    jobName: "initial_build",
    notebookId: input.notebookId,
    idempotencyKey,
    targetType: "initial_build",
    generationMode: "initial_build",
    trigger: "initial_build",
    payloadJson: {
      curriculumId: input.curriculumId,
      moduleId: input.moduleId,
      sourceId: input.sourceId,
    },
  });
  return {
    enqueued: !begun.skip,
    jobId: begun.job.id,
    ...(begun.reason ? { reason: begun.reason } : {}),
  };
}

export async function enqueueRollingModuleBuildJob(
  dbClient: DbClient,
  input: EnqueueRollingModuleBuildInput,
): Promise<{ enqueued: boolean; jobId: string; reason?: string }> {
  const trigger = input.trigger ?? "module_milestone";
  const idempotencyKey = buildGenerationIdempotencyKey({
    notebookId: input.notebookId,
    targetType: "module_deep_build",
    targetRef: input.nextModuleId,
    generationMode: "rolling_module_build",
    trigger,
  });
  const begun = await beginGenerationJob(dbClient, {
    jobName: "rolling_module_build",
    notebookId: input.notebookId,
    idempotencyKey,
    targetType: "module_deep_build",
    generationMode: "rolling_module_build",
    trigger,
    payloadJson: {
      curriculumId: input.curriculumId,
      completedModuleId: input.completedModuleId,
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      trigger,
    },
  });
  return {
    enqueued: !begun.skip,
    jobId: begun.job.id,
    ...(begun.reason ? { reason: begun.reason } : {}),
  };
}
