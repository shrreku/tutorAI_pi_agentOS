import type { DbClient } from "@studyagent/db";
import { curriculumModules } from "@studyagent/db";
import { recordGenerationLifecycleMetric } from "@studyagent/observability";
import type { GenerationTrigger } from "@studyagent/schemas";
import { enqueueRollingModuleBuildJob } from "@studyagent/wiki-generation";
import { and, asc, eq } from "drizzle-orm";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";

export type ScheduleRollingModuleBuildInput = {
  notebookId: string;
  curriculumId: string;
  completedModuleId: string;
  sourceId?: string;
  trigger?: GenerationTrigger;
  materialPathChange?: { kind: string; learnerConfirmed?: boolean };
};

export async function scheduleRollingModuleBuild(
  dbClient: DbClient,
  input: ScheduleRollingModuleBuildInput,
): Promise<void> {
  const trigger = input.trigger ?? "module_milestone";
  try {
    const [completedModule] = await dbClient.db
      .select()
      .from(curriculumModules)
      .where(
        and(
          eq(curriculumModules.id, input.completedModuleId),
          eq(curriculumModules.notebookId, input.notebookId),
        ),
      )
      .limit(1);
    if (!completedModule) {
      throw new Error("completed_module_missing");
    }

    const nextModules = await dbClient.db
      .select()
      .from(curriculumModules)
      .where(
        and(
          eq(curriculumModules.curriculumId, input.curriculumId),
          eq(curriculumModules.notebookId, input.notebookId),
        ),
      )
      .orderBy(asc(curriculumModules.orderIndex));
    const nextModule = nextModules.find(
      (module) => module.orderIndex === completedModule.orderIndex + 1,
    );
    if (!nextModule) {
      return;
    }

    const result = await enqueueRollingModuleBuildJob(dbClient, {
      notebookId: input.notebookId,
      curriculumId: input.curriculumId,
      completedModuleId: input.completedModuleId,
      nextModuleId: nextModule.id,
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      trigger,
    });

    if (result.enqueued) {
      recordGenerationLifecycleMetric({
        eventType: "generation.module_deep_build.enqueued",
        outcome: "success",
        generationMode: "rolling_module_build",
        trigger,
      });
    }
  } catch (error) {
    recordGenerationLifecycleMetric({
      eventType: "generation.module_deep_build.completed",
      outcome: "failure",
      generationMode: "rolling_module_build",
      trigger,
    });
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "generation.module_deep_build.completed",
      payload: {
        curriculumId: input.curriculumId,
        previousModuleId: input.completedModuleId,
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        trigger,
      },
    });
  }
}
