import type { DbClient } from "@studyagent/db";
import { appendEvent, wikiPages } from "@studyagent/db";
import {
  buildHeuristicCurriculumPageMarkdown,
  buildHeuristicModulePageMarkdown,
  extractHumanBlocks,
  mergeAgentMarkdownWithHumanBlocks,
} from "@studyagent/wiki-core";
import { and, eq } from "drizzle-orm";

export type BaselineHeuristicPagesInput = {
  notebookId: string;
  sourceId: string;
  sourceTitle: string;
  curriculumId: string;
  curriculumTitle: string;
  modules: Array<{
    id: string;
    title: string;
    summary: string;
    orderIndex: number;
    status: string;
    conceptNames: string[];
    objectiveTitles: string[];
    deepBuilt: boolean;
  }>;
  activeModuleId?: string | null;
  now?: Date;
};

async function upsertWikiPage(
  dbClient: DbClient,
  input: {
    notebookId: string;
    pageType: string;
    pageKey: string;
    title: string;
    markdown: string;
    structuredJson: Record<string, unknown>;
    now: Date;
  },
): Promise<{ pageId: string; created: boolean }> {
  const [existing] = await dbClient.db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.notebookId, input.notebookId), eq(wikiPages.pageKey, input.pageKey)))
    .limit(1);

  if (existing) {
    const humanBlocks = extractHumanBlocks(existing.markdown);
    const merged = mergeAgentMarkdownWithHumanBlocks(input.markdown, humanBlocks);
    await dbClient.db
      .update(wikiPages)
      .set({
        title: input.title,
        markdown: merged,
        structuredJson: {
          ...(existing.structuredJson ?? {}),
          ...input.structuredJson,
        },
        updatedAt: input.now,
      })
      .where(eq(wikiPages.id, existing.id));
    return { pageId: existing.id, created: false };
  }

  const pageId = `wp_${crypto.randomUUID().replaceAll("-", "")}`;
  await dbClient.db.insert(wikiPages).values({
    id: pageId,
    notebookId: input.notebookId,
    pageType: input.pageType,
    pageKey: input.pageKey,
    title: input.title,
    markdown: input.markdown,
    structuredJson: input.structuredJson,
    sourceClaimIds: [],
    sourceChunkIds: [],
    qualityScore: 0.55,
    status: "draft",
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return { pageId, created: true };
}

export async function upsertBaselineHeuristicPages(
  dbClient: DbClient,
  input: BaselineHeuristicPagesInput,
): Promise<{ curriculumPageId: string; modulePageIds: string[] }> {
  const now = input.now ?? new Date();
  const activeModule = input.modules.find((module) => module.id === input.activeModuleId) ?? input.modules[0];
  const curriculumPageResult = buildHeuristicCurriculumPageMarkdown({
    curriculumTitle: input.curriculumTitle,
    sourceTitles: [input.sourceTitle],
    modules: input.modules.map((module) => ({
      moduleId: module.id,
      title: module.title,
      summary: module.summary,
    })),
    ...(activeModule?.id ? { activeModuleId: activeModule.id } : {}),
  });

  const curriculumPage = await upsertWikiPage(dbClient, {
    notebookId: input.notebookId,
    pageType: "curriculum",
    pageKey: `curriculum:${input.curriculumId}`,
    title: `Curriculum · ${input.curriculumTitle}`,
    markdown: curriculumPageResult.markdown,
    structuredJson: {
      curriculumId: input.curriculumId,
      sourceId: input.sourceId,
      pageReadiness: curriculumPageResult.readiness,
      generationMode: curriculumPageResult.generationMode,
      ...curriculumPageResult.structuredJson,
    },
    now,
  });

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: "generation.page.heuristic.created",
    payload: {
      pageId: curriculumPage.pageId,
      pageKey: `curriculum:${input.curriculumId}`,
      pageType: "curriculum",
      curriculumId: input.curriculumId,
      sourceId: input.sourceId,
      created: curriculumPage.created,
    },
  });

  const modulePageIds: string[] = [];
  for (const module of input.modules) {
    const modulePageResult = buildHeuristicModulePageMarkdown({
      moduleTitle: module.title,
      summary: module.summary,
      sourceSections: [input.sourceTitle],
      topics: module.conceptNames.map((name, index) => ({ id: `topic_${module.id}_${index}`, name })),
      concepts: module.conceptNames.map((name, index) => ({ id: `concept_${module.id}_${index}`, name })),
      objectives: module.objectiveTitles.map((title, index) => ({
        id: `obj_${module.id}_${index}`,
        title,
        deepBuilt: module.deepBuilt,
      })),
    });
    const modulePage = await upsertWikiPage(dbClient, {
      notebookId: input.notebookId,
      pageType: "module",
      pageKey: `module:${module.id}`,
      title: `Module · ${module.title}`,
      markdown: modulePageResult.markdown,
      structuredJson: {
        moduleId: module.id,
        curriculumId: input.curriculumId,
        sourceId: input.sourceId,
        pageReadiness: modulePageResult.readiness,
        generationMode: modulePageResult.generationMode,
        deepBuilt: module.deepBuilt,
        ...modulePageResult.structuredJson,
      },
      now,
    });
    modulePageIds.push(modulePage.pageId);
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "generation.page.heuristic.created",
      payload: {
        pageId: modulePage.pageId,
        pageKey: `module:${module.id}`,
        pageType: "module",
        moduleId: module.id,
        curriculumId: input.curriculumId,
        sourceId: input.sourceId,
        created: modulePage.created,
      },
    });
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "generation.page.readiness_changed",
      payload: {
        pageId: modulePage.pageId,
        pageKey: `module:${module.id}`,
        pageReadiness: modulePageResult.readiness,
        generationMode: modulePageResult.generationMode,
      },
    });
  }

  return { curriculumPageId: curriculumPage.pageId, modulePageIds };
}
