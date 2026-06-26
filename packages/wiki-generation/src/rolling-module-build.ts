import type { StudyAgentEnv } from "@studyagent/config";
import type { DbClient } from "@studyagent/db";
import {
  appendEvent,
  concepts,
  curriculumModules,
  objectiveLists,
  objectives,
  studyPlans,
  wikiPages,
} from "@studyagent/db";
import {
  buildGenerationIdempotencyKey,
  requiresMaterialPathChangeConfirmation,
  type GenerationTrigger,
} from "@studyagent/schemas";
import { composeTeachingArc } from "@studyagent/wiki-core";
import { and, asc, eq, inArray } from "drizzle-orm";
import { finishGenerationJob } from "./generation-job-lifecycle.js";
import { recordGenerationMetric } from "./generation-metrics.js";
import {
  isTargetAlreadyComplete,
  markGenerationTargetComplete,
} from "./generation-target-registry.js";
import { gatherRollingLearnerSignals } from "./learner-signal-reader.js";
import {
  ensureModuleObjectives,
  isPolishFailure,
  lightlyRefreshFollowingModuleOutline,
  loadConceptPages,
  loadModulePage,
  loadTopicPagesForConcepts,
  runPolishJobTracked,
  selectCoreConceptIdsForFirstObjective,
  syncStudyPlanForModule,
  upsertActiveSessionPlan,
} from "./rolling-generation-shared.js";
import type { WikiPolishExecutorResult } from "./wiki-polish-executor.js";

export type RollingModuleBuildInput = {
  notebookId: string;
  curriculumId: string;
  completedModuleId: string;
  sourceId?: string;
  trigger?: GenerationTrigger;
  materialPathChange?: { kind: string; learnerConfirmed?: boolean };
  generationJobId?: string;
};

async function finalizeGenerationJob(
  dbClient: DbClient,
  generationJobId: string | undefined,
  outcome: { ok: boolean; reason?: string; resultJson?: Record<string, unknown> },
): Promise<void> {
  if (!generationJobId) return;
  await finishGenerationJob(dbClient, {
    jobId: generationJobId,
    ok: outcome.ok,
    ...(outcome.reason && !outcome.ok ? { error: outcome.reason } : {}),
    ...(outcome.resultJson ? { resultJson: outcome.resultJson } : {}),
  });
}

export async function runRollingModuleBuild(
  env: StudyAgentEnv,
  dbClient: DbClient,
  input: RollingModuleBuildInput,
): Promise<{ ok: boolean; reason?: string; moduleId?: string }> {
  const generationJobId = input.generationJobId;
  const trigger = input.trigger ?? "module_milestone";
  if (
    input.materialPathChange &&
    requiresMaterialPathChangeConfirmation(input.materialPathChange)
  ) {
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "generation.module_deep_build.completed",
      payload: {
        curriculumId: input.curriculumId,
        previousModuleId: input.completedModuleId,
        ok: false,
        reason: "path_change_confirmation_required",
        trigger,
        materialPathChange: input.materialPathChange,
      },
    });
    await finalizeGenerationJob(dbClient, generationJobId, {
      ok: false,
      reason: "path_change_confirmation_required",
    });
    return { ok: false, reason: "path_change_confirmation_required" };
  }

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
    await finalizeGenerationJob(dbClient, generationJobId, {
      ok: false,
      reason: "completed_module_missing",
    });
    return { ok: false, reason: "completed_module_missing" };
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
    await finalizeGenerationJob(dbClient, generationJobId, { ok: false, reason: "no_next_module" });
    return { ok: false, reason: "no_next_module" };
  }

  const idempotencyKey = buildGenerationIdempotencyKey({
    notebookId: input.notebookId,
    targetType: "module_deep_build",
    targetRef: nextModule.id,
    generationMode: "rolling_module_build",
    trigger,
  });
  if (await isTargetAlreadyComplete(dbClient, input.notebookId, idempotencyKey)) {
    await finalizeGenerationJob(dbClient, generationJobId, {
      ok: true,
      reason: "idempotent_skip",
      resultJson: { moduleId: nextModule.id, idempotencyKey },
    });
    return { ok: true, reason: "idempotent_skip", moduleId: nextModule.id };
  }

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: "generation.module_deep_build.started",
    payload: {
      curriculumId: input.curriculumId,
      moduleId: nextModule.id,
      previousModuleId: input.completedModuleId,
      trigger,
      idempotencyKey,
    },
  });

  const [studyPlan] = await dbClient.db
    .select({ weakConceptIds: studyPlans.weakConceptIds })
    .from(studyPlans)
    .where(eq(studyPlans.notebookId, input.notebookId))
    .limit(1);
  const learnerSignals = await gatherRollingLearnerSignals(
    dbClient,
    input.notebookId,
    studyPlan?.weakConceptIds ?? [],
  );

  const objectiveIds = await ensureModuleObjectives(env, dbClient, {
    notebookId: input.notebookId,
    curriculumId: input.curriculumId,
    moduleId: nextModule.id,
    moduleTitle: nextModule.title,
    moduleSummary: nextModule.summary ?? nextModule.title,
    targetConceptIds: nextModule.targetConceptIds ?? [],
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    weakConceptIds: learnerSignals.weakConceptIds,
  });

  const polishResults: WikiPolishExecutorResult[] = [];
  let modulePolishFailed = false;
  const modulePage = await loadModulePage(dbClient, input.notebookId, nextModule.id);
  if (modulePage) {
    const modulePolishResult = await runPolishJobTracked(env, dbClient, {
      notebookId: input.notebookId,
      pageId: modulePage.id,
      pageKey: modulePage.pageKey,
      pageType: "module",
      title: nextModule.title,
      generationMode: "rolling_module_build",
      trigger,
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      curriculumId: input.curriculumId,
      moduleId: nextModule.id,
      idempotencyKey: `${idempotencyKey}:module_page`,
    });
    polishResults.push(modulePolishResult);
    modulePolishFailed = isPolishFailure(modulePolishResult);
  }

  const firstObjectiveId = objectiveIds[0];
  const [firstObjective] = firstObjectiveId
    ? await dbClient.db
        .select()
        .from(objectives)
        .where(eq(objectives.id, firstObjectiveId))
        .limit(1)
    : [];
  const coreConceptIds = selectCoreConceptIdsForFirstObjective(
    firstObjective?.targetConceptIds ?? nextModule.targetConceptIds ?? [],
  );

  const topicPages = await loadTopicPagesForConcepts(dbClient, input.notebookId, coreConceptIds, [
    nextModule.title,
  ]);
  for (const topicPage of topicPages) {
    polishResults.push(
      await runPolishJobTracked(env, dbClient, {
        notebookId: input.notebookId,
        pageId: topicPage.id,
        pageKey: topicPage.pageKey,
        pageType: "topic",
        title: topicPage.title,
        generationMode: "rolling_module_build",
        trigger,
        ...(input.sourceId ? { sourceId: input.sourceId } : {}),
        curriculumId: input.curriculumId,
        moduleId: nextModule.id,
        idempotencyKey: `${idempotencyKey}:topic:${topicPage.pageKey}`,
      }),
    );
  }

  const conceptPages = await loadConceptPages(dbClient, input.notebookId, coreConceptIds);
  for (const conceptPage of conceptPages) {
    polishResults.push(
      await runPolishJobTracked(env, dbClient, {
        notebookId: input.notebookId,
        pageId: conceptPage.id,
        pageKey: conceptPage.pageKey,
        pageType: "concept",
        title: conceptPage.title,
        generationMode: "rolling_module_build",
        trigger,
        ...(input.sourceId ? { sourceId: input.sourceId } : {}),
        curriculumId: input.curriculumId,
        moduleId: nextModule.id,
        conceptId: conceptPage.conceptId,
        idempotencyKey: `${idempotencyKey}:concept:${conceptPage.conceptId}`,
      }),
    );
  }

  const objectiveList = await dbClient.db
    .select()
    .from(objectiveLists)
    .where(
      and(
        eq(objectiveLists.notebookId, input.notebookId),
        eq(objectiveLists.moduleId, nextModule.id),
      ),
    )
    .limit(1);
  const objectiveListId =
    objectiveList[0]?.id ?? `objlist_${crypto.randomUUID().replaceAll("-", "")}`;
  const plannedObjectiveIds = objectiveIds.slice(0, 2);
  const objectiveTitleRows =
    plannedObjectiveIds.length > 0
      ? await dbClient.db
          .select({ id: objectives.id, title: objectives.title })
          .from(objectives)
          .where(inArray(objectives.id, plannedObjectiveIds))
      : [];
  const titleByObjectiveId = new Map(objectiveTitleRows.map((row) => [row.id, row.title]));
  const teachingArcDrafts = plannedObjectiveIds.map((objectiveId) =>
    composeTeachingArc({
      objectiveId,
      objectiveTitle: titleByObjectiveId.get(objectiveId) ?? objectiveId,
      targetConceptNames: [],
    }),
  );
  const now = new Date();
  const sessionPlanId = await upsertActiveSessionPlan(dbClient, {
    notebookId: input.notebookId,
    curriculumId: input.curriculumId,
    moduleId: nextModule.id,
    objectiveListId,
    moduleTitle: nextModule.title,
    plannedObjectiveIds,
    teachingArcDrafts: teachingArcDrafts.map((arc) => ({
      id: arc.id,
      objectiveId: arc.objectiveId,
    })),
  });
  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: "session_plan.generated",
    payload: {
      sessionPlanId,
      objectiveListId,
      curriculumId: input.curriculumId,
      moduleId: nextModule.id,
      plannedObjectiveIds,
      trigger: "rolling_module_build",
    },
  });

  await syncStudyPlanForModule(
    dbClient,
    input.notebookId,
    objectiveIds,
    learnerSignals.weakConceptIds,
  );

  const weakConceptNames =
    learnerSignals.weakConceptIds.length > 0
      ? (
          await dbClient.db
            .select({ canonicalName: concepts.canonicalName })
            .from(concepts)
            .where(
              and(
                eq(concepts.notebookId, input.notebookId),
                inArray(concepts.id, learnerSignals.weakConceptIds),
              ),
            )
        ).map((row) => row.canonicalName)
      : [];
  await lightlyRefreshFollowingModuleOutline(dbClient, {
    notebookId: input.notebookId,
    curriculumId: input.curriculumId,
    nextModuleOrderIndex: nextModule.orderIndex,
    weakConceptNames,
  });

  await dbClient.db
    .update(curriculumModules)
    .set({ status: "active", updatedAt: now })
    .where(eq(curriculumModules.id, nextModule.id));

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: "generation.module_deep_build.completed",
    payload: {
      curriculumId: input.curriculumId,
      moduleId: nextModule.id,
      previousModuleId: input.completedModuleId,
      trigger,
      idempotencyKey,
      ok: true,
      polishFailureCount: polishResults.filter(isPolishFailure).length,
      degraded: polishResults.some(isPolishFailure),
      modulePagePolishFailed: modulePolishFailed,
    },
  });
  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: "module.rolling_build.completed",
    payload: {
      curriculumId: input.curriculumId,
      moduleId: nextModule.id,
      previousModuleId: input.completedModuleId,
      trigger,
    },
  });

  if (modulePage) {
    const [moduleWikiPage] = await dbClient.db
      .select({ structuredJson: wikiPages.structuredJson })
      .from(wikiPages)
      .where(eq(wikiPages.id, modulePage.id))
      .limit(1);
    await dbClient.db
      .update(wikiPages)
      .set({
        structuredJson: {
          ...(moduleWikiPage?.structuredJson ?? {}),
          lastGenerationTargetKey: idempotencyKey,
          deepBuilt: true,
        },
        updatedAt: now,
      })
      .where(eq(wikiPages.id, modulePage.id));
  }
  markGenerationTargetComplete(idempotencyKey);
  recordGenerationMetric({
    eventType: "generation.module_deep_build.completed",
    outcome: "success",
    generationMode: "rolling_module_build",
    trigger,
  });
  await finalizeGenerationJob(dbClient, generationJobId, {
    ok: true,
    resultJson: {
      moduleId: nextModule.id,
      idempotencyKey,
      degraded: polishResults.some(isPolishFailure),
      polishFailureCount: polishResults.filter(isPolishFailure).length,
      modulePagePolishFailed: modulePolishFailed,
    },
  });

  return { ok: true, moduleId: nextModule.id };
}
