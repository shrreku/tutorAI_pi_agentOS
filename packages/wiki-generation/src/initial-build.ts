import type { StudyAgentEnv } from "@studyagent/config";
import type { DbClient } from "@studyagent/db";
import { appendEvent, curriculumModules, objectives, wikiPages } from "@studyagent/db";
import { buildGenerationIdempotencyKey } from "@studyagent/schemas";
import { and, eq } from "drizzle-orm";
import { finishGenerationJob } from "./generation-job-lifecycle.js";
import { recordGenerationMetric } from "./generation-metrics.js";
import { markGenerationTargetComplete } from "./generation-target-registry.js";
import {
  ensureModuleObjectives,
  isPolishFailure,
  loadConceptPages,
  loadModulePage,
  loadTopicPagesForConcepts,
  runPolishJobTracked,
  selectCoreConceptIdsForFirstObjective,
} from "./rolling-generation-shared.js";
import type { WikiPolishExecutorResult } from "./wiki-polish-executor.js";

export type InitialBuildInput = {
  notebookId: string;
  curriculumId: string;
  moduleId: string;
  sourceId: string;
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

export async function runInitialBuild(
  env: StudyAgentEnv,
  dbClient: DbClient,
  input: InitialBuildInput,
): Promise<{ ok: boolean; reason?: string }> {
  const generationJobId = input.generationJobId;
  const idempotencyKey = buildGenerationIdempotencyKey({
    notebookId: input.notebookId,
    targetType: "initial_build",
    targetRef: input.moduleId,
    generationMode: "initial_build",
    trigger: "initial_build",
  });

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: "generation.initial_build.started",
    payload: {
      curriculumId: input.curriculumId,
      moduleId: input.moduleId,
      sourceId: input.sourceId,
      idempotencyKey,
    },
  });

  const [moduleRow] = await dbClient.db
    .select()
    .from(curriculumModules)
    .where(
      and(
        eq(curriculumModules.id, input.moduleId),
        eq(curriculumModules.notebookId, input.notebookId),
      ),
    )
    .limit(1);
  if (!moduleRow) {
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "generation.initial_build.failed",
      payload: {
        curriculumId: input.curriculumId,
        moduleId: input.moduleId,
        ok: false,
        reason: "module_missing",
      },
    });
    recordGenerationMetric({
      eventType: "generation.initial_build.failed",
      outcome: "failure",
      generationMode: "initial_build",
      trigger: "initial_build",
    });
    await finalizeGenerationJob(dbClient, generationJobId, { ok: false, reason: "module_missing" });
    return { ok: false, reason: "module_missing" };
  }

  const objectiveIds = await ensureModuleObjectives(env, dbClient, {
    notebookId: input.notebookId,
    curriculumId: input.curriculumId,
    moduleId: input.moduleId,
    moduleTitle: moduleRow.title,
    moduleSummary: moduleRow.summary ?? moduleRow.title,
    targetConceptIds: moduleRow.targetConceptIds ?? [],
    sourceId: input.sourceId,
  });

  const polishResults: WikiPolishExecutorResult[] = [];
  let modulePolishFailed = false;
  const modulePage = await loadModulePage(dbClient, input.notebookId, input.moduleId);
  if (modulePage) {
    const modulePolishResult = await runPolishJobTracked(env, dbClient, {
      notebookId: input.notebookId,
      pageId: modulePage.id,
      pageKey: modulePage.pageKey,
      pageType: "module",
      title: moduleRow.title,
      generationMode: "initial_build",
      trigger: "initial_build",
      sourceId: input.sourceId,
      curriculumId: input.curriculumId,
      moduleId: input.moduleId,
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
    firstObjective?.targetConceptIds ?? moduleRow.targetConceptIds ?? [],
  );

  const topicPages = await loadTopicPagesForConcepts(dbClient, input.notebookId, coreConceptIds, [
    moduleRow.title,
  ]);
  for (const topicPage of topicPages) {
    polishResults.push(
      await runPolishJobTracked(env, dbClient, {
        notebookId: input.notebookId,
        pageId: topicPage.id,
        pageKey: topicPage.pageKey,
        pageType: "topic",
        title: topicPage.title,
        generationMode: "initial_build",
        trigger: "initial_build",
        sourceId: input.sourceId,
        curriculumId: input.curriculumId,
        moduleId: input.moduleId,
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
        generationMode: "initial_build",
        trigger: "initial_build",
        sourceId: input.sourceId,
        curriculumId: input.curriculumId,
        moduleId: input.moduleId,
        conceptId: conceptPage.conceptId,
        idempotencyKey: `${idempotencyKey}:concept:${conceptPage.conceptId}`,
      }),
    );
  }

  await dbClient.db
    .update(curriculumModules)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(curriculumModules.id, input.moduleId));

  if (modulePage && !modulePolishFailed) {
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
        updatedAt: new Date(),
      })
      .where(eq(wikiPages.id, modulePage.id));
  }
  markGenerationTargetComplete(idempotencyKey);

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: "generation.initial_build.completed",
    payload: {
      curriculumId: input.curriculumId,
      moduleId: input.moduleId,
      sourceId: input.sourceId,
      ok: true,
      polishedTopicCount: topicPages.length,
      polishedConceptCount: conceptPages.length,
      polishFailureCount: polishResults.filter(isPolishFailure).length,
      degraded: polishResults.some(isPolishFailure),
      modulePagePolishFailed: modulePolishFailed,
      idempotencyKey,
    },
  });
  recordGenerationMetric({
    eventType: "generation.initial_build.completed",
    outcome: "success",
    generationMode: "initial_build",
    trigger: "initial_build",
  });
  await finalizeGenerationJob(dbClient, generationJobId, {
    ok: true,
    resultJson: {
      moduleId: input.moduleId,
      idempotencyKey,
      degraded: polishResults.some(isPolishFailure),
      polishFailureCount: polishResults.filter(isPolishFailure).length,
      modulePagePolishFailed: modulePolishFailed,
    },
  });

  return { ok: true };
}
