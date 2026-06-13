import type { StudyAgentEnv } from "@studyagent/config";
import type { DbClient } from "@studyagent/db";
import {
  appendEvent,
  concepts,
  curriculumModules,
  objectiveLists,
  objectives,
  sessionPlans,
  studyPlans,
  wikiPages,
} from "@studyagent/db";
import { loadTopicPagesForObjectiveConcepts } from "@studyagent/wiki-core";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { fetchOpenRouterJsonCompletion } from "@studyagent/llm-client";
import {
  executeWikiPagePolish,
  type WikiPolishExecutorResult,
  type WikiPolishExecutorTarget,
} from "./wiki-polish-executor.js";

const moduleObjectivesPlanSchema = z.object({
  objectiveTitles: z.array(z.string().min(1).max(140)).min(1).max(4),
  sessionGoal: z.string().min(1).max(220).optional(),
});

export type PagePolishJobTarget = WikiPolishExecutorTarget;

export async function loadModulePage(
  dbClient: DbClient,
  notebookId: string,
  moduleId: string,
): Promise<{ id: string; pageKey: string } | null> {
  const pageKey = `module:${moduleId}`;
  const [row] = await dbClient.db
    .select({ id: wikiPages.id, pageKey: wikiPages.pageKey })
    .from(wikiPages)
    .where(and(eq(wikiPages.notebookId, notebookId), eq(wikiPages.pageKey, pageKey)))
    .limit(1);
  return row ?? null;
}

export async function loadTopicPagesForConcepts(
  dbClient: DbClient,
  notebookId: string,
  conceptIds: string[],
  moduleTopicTitles: string[] = [],
): Promise<Array<{ id: string; pageKey: string; title: string }>> {
  if (conceptIds.length === 0) return [];
  const conceptRows = await dbClient.db
    .select({ id: concepts.id, canonicalName: concepts.canonicalName })
    .from(concepts)
    .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, conceptIds)));
  const topicPages = await dbClient.db
    .select({ id: wikiPages.id, pageKey: wikiPages.pageKey, title: wikiPages.title, structuredJson: wikiPages.structuredJson })
    .from(wikiPages)
    .where(and(eq(wikiPages.notebookId, notebookId), eq(wikiPages.pageType, "topic")));
  return loadTopicPagesForObjectiveConcepts({
    topicPages,
    conceptRows,
    objectiveConceptIds: conceptIds,
    moduleTopicTitles,
  });
}

export async function loadConceptPages(
  dbClient: DbClient,
  notebookId: string,
  conceptIds: string[],
): Promise<Array<{ id: string; pageKey: string; title: string; conceptId: string }>> {
  if (conceptIds.length === 0) return [];
  const pages = await dbClient.db
    .select({
      id: wikiPages.id,
      pageKey: wikiPages.pageKey,
      title: wikiPages.title,
      structuredJson: wikiPages.structuredJson,
    })
    .from(wikiPages)
    .where(and(eq(wikiPages.notebookId, notebookId), eq(wikiPages.pageType, "concept")));
  const wanted = new Set(conceptIds);
  return pages
    .filter((page) => {
      const conceptId = typeof page.structuredJson?.conceptId === "string" ? page.structuredJson.conceptId : null;
      return conceptId ? wanted.has(conceptId) : false;
    })
    .map((page) => ({
      id: page.id,
      pageKey: page.pageKey,
      title: page.title,
      conceptId: page.structuredJson!.conceptId as string,
    }));
}

export function selectCoreConceptIdsForFirstObjective(
  objectiveConceptIds: string[],
  maxConcepts = 3,
): string[] {
  return objectiveConceptIds.slice(0, maxConcepts);
}

export function isPolishFailure(result: WikiPolishExecutorResult): boolean {
  return !result.ok && result.reason !== "idempotent_skip";
}

export async function runPolishJobTracked(
  env: StudyAgentEnv,
  dbClient: DbClient,
  target: PagePolishJobTarget,
): Promise<WikiPolishExecutorResult> {
  return runPagePolishJob(env, dbClient, target);
}

export async function syncStudyPlanForModule(
  dbClient: DbClient,
  notebookId: string,
  objectiveIds: string[],
  weakConceptIds: string[],
): Promise<void> {
  const [studyPlan] = await dbClient.db
    .select({ id: studyPlans.id })
    .from(studyPlans)
    .where(eq(studyPlans.notebookId, notebookId))
    .limit(1);
  if (!studyPlan) return;
  const now = new Date();
  await dbClient.db
    .update(studyPlans)
    .set({
      currentObjectiveId: objectiveIds[0] ?? null,
      upcomingObjectiveIds: objectiveIds.slice(1),
      weakConceptIds,
      updatedAt: now,
    })
    .where(eq(studyPlans.id, studyPlan.id));
}

export async function upsertActiveSessionPlan(
  dbClient: DbClient,
  input: {
    notebookId: string;
    curriculumId: string;
    moduleId: string;
    objectiveListId: string;
    moduleTitle: string;
    plannedObjectiveIds: string[];
    teachingArcDrafts: Array<{ id: string; objectiveId: string }>;
  },
): Promise<string> {
  const now = new Date();
  const [existingForModule] = await dbClient.db
    .select({ id: sessionPlans.id })
    .from(sessionPlans)
    .where(and(eq(sessionPlans.notebookId, input.notebookId), eq(sessionPlans.moduleId, input.moduleId)))
    .orderBy(desc(sessionPlans.updatedAt))
    .limit(1);

  if (existingForModule) {
    await dbClient.db
      .update(sessionPlans)
      .set({ status: "archived", updatedAt: now })
      .where(and(eq(sessionPlans.notebookId, input.notebookId), eq(sessionPlans.status, "active")));
    await dbClient.db
      .update(sessionPlans)
      .set({
        status: "active",
        plannedObjectiveIds: input.plannedObjectiveIds,
        sessionGoal: `Continue with ${input.moduleTitle}`,
        recommendationReasonJson: {
          reason: "rolling_module_build",
          teachingArcDrafts: input.teachingArcDrafts,
        },
        updatedAt: now,
      })
      .where(eq(sessionPlans.id, existingForModule.id));
    return existingForModule.id;
  }

  const sessionPlanId = `sessplan_${crypto.randomUUID().replaceAll("-", "")}`;
  await dbClient.db
    .update(sessionPlans)
    .set({ status: "archived", updatedAt: now })
    .where(and(eq(sessionPlans.notebookId, input.notebookId), eq(sessionPlans.status, "active")));
  await dbClient.db.insert(sessionPlans).values({
    id: sessionPlanId,
    notebookId: input.notebookId,
    curriculumId: input.curriculumId,
    moduleId: input.moduleId,
    objectiveListId: input.objectiveListId,
    title: `${input.moduleTitle} session`,
    status: "active",
    sessionGoal: `Continue with ${input.moduleTitle}`,
    plannedObjectiveIds: input.plannedObjectiveIds,
    openerJson: {},
    diagnosticQuestionIds: [],
    teachingArcIds: [],
    artifactRefsJson: [],
    exitCriteriaJson: {},
    recommendationReasonJson: {
      reason: "rolling_module_build",
      teachingArcDrafts: input.teachingArcDrafts,
    },
    createdByRunId: null,
    createdAt: now,
    updatedAt: now,
  });
  return sessionPlanId;
}

export async function lightlyRefreshFollowingModuleOutline(
  dbClient: DbClient,
  input: {
    notebookId: string;
    curriculumId: string;
    nextModuleOrderIndex: number;
    weakConceptNames: string[];
  },
): Promise<void> {
  const [followingModule] = await dbClient.db
    .select()
    .from(curriculumModules)
    .where(
      and(
        eq(curriculumModules.notebookId, input.notebookId),
        eq(curriculumModules.curriculumId, input.curriculumId),
        eq(curriculumModules.orderIndex, input.nextModuleOrderIndex + 1),
      ),
    )
    .limit(1);
  if (!followingModule) return;

  const followingPage = await loadModulePage(dbClient, input.notebookId, followingModule.id);
  if (!followingPage) return;

  const [pageRow] = await dbClient.db
    .select({ structuredJson: wikiPages.structuredJson })
    .from(wikiPages)
    .where(eq(wikiPages.id, followingPage.id))
    .limit(1);
  if (pageRow?.structuredJson?.deepBuilt === true) return;

  const now = new Date();
  await dbClient.db
    .update(wikiPages)
    .set({
      structuredJson: {
        ...(pageRow?.structuredJson ?? {}),
        outlineRefreshedAt: now.toISOString(),
        outlineRefreshSignals: {
          weakConceptNames: input.weakConceptNames.slice(0, 5),
          refreshedAfterModuleOrderIndex: input.nextModuleOrderIndex,
        },
      },
      updatedAt: now,
    })
    .where(eq(wikiPages.id, followingPage.id));
}

export async function planModuleObjectivesWithLlm(
  env: StudyAgentEnv,
  input: {
    moduleTitle: string;
    moduleSummary: string;
    conceptNames: string[];
    weakConceptNames?: string[];
  },
): Promise<z.infer<typeof moduleObjectivesPlanSchema> | null> {
  if (!env.OPENROUTER_API_KEY) return null;
  try {
    const raw = await fetchOpenRouterJsonCompletion(
      {
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: env.OPENROUTER_BASE_URL,
        model: env.DEFAULT_EXTRACTION_MODEL,
        timeoutMs: env.LLM_REQUEST_TIMEOUT_MS,
        label: "rolling_module_objectives",
      },
      [
        {
          role: "system",
          content: [
            "You create module objectives for a study notebook.",
            "Return ONLY JSON with keys objectiveTitles and optional sessionGoal.",
            "Create 2-4 practical objectives ordered foundational -> applied.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Module: ${input.moduleTitle}`,
            `Summary: ${input.moduleSummary}`,
            `Concepts: ${input.conceptNames.join(", ") || "none"}`,
            ...(input.weakConceptNames?.length ? [`Weak concepts to reinforce: ${input.weakConceptNames.join(", ")}`] : []),
          ].join("\n"),
        },
      ],
    );
    return moduleObjectivesPlanSchema.parse(raw);
  } catch {
    return null;
  }
}

export function deterministicObjectiveTitles(moduleTitle: string, conceptNames: string[]): string[] {
  const primary = conceptNames[0] ?? moduleTitle;
  const secondary = conceptNames[1] ?? primary;
  return [`Explain ${primary}`, secondary === primary ? `Apply ${primary}` : `Connect ${primary} with ${secondary}`];
}

export async function ensureModuleObjectives(
  env: StudyAgentEnv,
  dbClient: DbClient,
  input: {
    notebookId: string;
    curriculumId: string;
    moduleId: string;
    moduleTitle: string;
    moduleSummary: string;
    targetConceptIds: string[];
    sourceId?: string;
    weakConceptIds?: string[];
    now?: Date;
  },
): Promise<string[]> {
  const existing = await dbClient.db
    .select({ id: objectives.id })
    .from(objectives)
    .where(and(eq(objectives.notebookId, input.notebookId), eq(objectives.curriculumId, input.curriculumId)))
    .orderBy(asc(objectives.orderIndex));
  const objectiveList = await dbClient.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.notebookId, input.notebookId), eq(objectiveLists.moduleId, input.moduleId)))
    .limit(1);
  const listObjectiveIds = objectiveList[0]?.objectiveIdsOrdered ?? [];
  if (listObjectiveIds.length > 0) return listObjectiveIds;

  const conceptRows = await dbClient.db
    .select({ id: concepts.id, canonicalName: concepts.canonicalName })
    .from(concepts)
    .where(and(eq(concepts.notebookId, input.notebookId), inArray(concepts.id, input.targetConceptIds)));
  const conceptNames = conceptRows.map((row) => row.canonicalName);
  const weakConceptNames =
    input.weakConceptIds && input.weakConceptIds.length
      ? (
          await dbClient.db
            .select({ canonicalName: concepts.canonicalName })
            .from(concepts)
            .where(and(eq(concepts.notebookId, input.notebookId), inArray(concepts.id, input.weakConceptIds)))
        ).map((row) => row.canonicalName)
      : [];

  const llmPlan = await planModuleObjectivesWithLlm(env, {
    moduleTitle: input.moduleTitle,
    moduleSummary: input.moduleSummary,
    conceptNames,
    weakConceptNames,
  });
  const objectiveTitles = llmPlan?.objectiveTitles ?? deterministicObjectiveTitles(input.moduleTitle, conceptNames);
  const now = input.now ?? new Date();
  const objectiveIds: string[] = [];

  for (let index = 0; index < objectiveTitles.length; index += 1) {
    const objectiveId = `obj_${crypto.randomUUID().replaceAll("-", "")}`;
    objectiveIds.push(objectiveId);
    await dbClient.db.insert(objectives).values({
      id: objectiveId,
      notebookId: input.notebookId,
      curriculumId: input.curriculumId,
      title: objectiveTitles[index]!,
      status: "not_started",
      orderIndex: index,
      prerequisiteConceptIds: [],
      targetConceptIds: input.targetConceptIds.slice(0, 3),
      successCriteriaJson: { minClaimsReviewed: 2 },
      sourceRefsJson: input.sourceId ? [{ sourceId: input.sourceId }] : [],
      suggestedMode: "explore",
      readinessScore: 0.6,
      createdAt: now,
      updatedAt: now,
    });
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "objective.generated",
      payload: {
        objectiveId,
        moduleId: input.moduleId,
        curriculumId: input.curriculumId,
        orderIndex: index,
        title: objectiveTitles[index],
      },
    });
  }

  const objectiveListId = objectiveList[0]?.id ?? `objlist_${crypto.randomUUID().replaceAll("-", "")}`;
  if (!objectiveList[0]) {
    await dbClient.db.insert(objectiveLists).values({
      id: objectiveListId,
      notebookId: input.notebookId,
      curriculumId: input.curriculumId,
      moduleId: input.moduleId,
      title: "Active objective list",
      status: "active",
      currentObjectiveId: objectiveIds[0] ?? null,
      objectiveIdsOrdered: objectiveIds,
      coverageSnapshotJson: {},
      createdByRunId: null,
      createdAt: now,
      updatedAt: now,
    });
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "objective_list.generated",
      payload: {
        objectiveListId,
        curriculumId: input.curriculumId,
        moduleId: input.moduleId,
        currentObjectiveId: objectiveIds[0] ?? null,
      },
    });
  } else {
    await dbClient.db
      .update(objectiveLists)
      .set({
        objectiveIdsOrdered: objectiveIds,
        currentObjectiveId: objectiveIds[0] ?? null,
        updatedAt: now,
      })
      .where(eq(objectiveLists.id, objectiveListId));
  }

  return objectiveIds;
}

export async function runPagePolishJob(
  env: StudyAgentEnv,
  dbClient: DbClient,
  target: PagePolishJobTarget,
): Promise<Awaited<ReturnType<typeof executeWikiPagePolish>>> {
  return executeWikiPagePolish(env, dbClient, target);
}
