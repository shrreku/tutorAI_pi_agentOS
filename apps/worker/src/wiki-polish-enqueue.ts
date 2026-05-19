import type { DbClient } from "@studyagent/db";
import { appendEvent, wikiPages } from "@studyagent/db";
import { buildWikiPolishQueue, type WikiPolishPageInput } from "@studyagent/wiki-core";
import { eq } from "drizzle-orm";

export async function enqueueWikiPolishCandidates(
  dbClient: DbClient,
  input: {
    notebookId: string;
    sourceId: string;
    weakConceptIds?: string[];
    targetConceptIds?: string[];
    maxCandidates?: number;
  },
): Promise<{ enqueued: number; candidates: ReturnType<typeof buildWikiPolishQueue> }> {
  const rows = await dbClient.db
    .select({
      id: wikiPages.id,
      pageKey: wikiPages.pageKey,
      pageType: wikiPages.pageType,
      title: wikiPages.title,
      qualityScore: wikiPages.qualityScore,
      status: wikiPages.status,
      sourceChunkIds: wikiPages.sourceChunkIds,
      structuredJson: wikiPages.structuredJson,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .where(eq(wikiPages.notebookId, input.notebookId));

  const pages: WikiPolishPageInput[] = rows.map((row) => ({
    id: row.id,
    pageKey: row.pageKey,
    pageType: row.pageType as "concept" | "source_summary",
    title: row.title,
    qualityScore: row.qualityScore,
    status: row.status,
    sourceId: input.sourceId,
    sourceChunkIds: row.sourceChunkIds ?? [],
    conceptId:
      typeof row.structuredJson?.conceptId === "string" ? row.structuredJson.conceptId : null,
    structuredJson: row.structuredJson ?? {},
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }));

  const conceptPageCount = pages.filter((page) => page.pageType === "concept").length;
  const queue = buildWikiPolishQueue({
    pages,
    ...(input.weakConceptIds !== undefined ? { weakConceptIds: input.weakConceptIds } : {}),
    ...(input.targetConceptIds !== undefined ? { targetConceptIds: input.targetConceptIds } : {}),
    largeSourceConceptCount: conceptPageCount,
  });

  const toEnqueue = queue.filter((candidate) => candidate.status === "queued").slice(0, input.maxCandidates ?? 5);

  for (const candidate of toEnqueue) {
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "wiki.polish.candidate.enqueued",
      payload: {
        pageId: candidate.pageRef.refId,
        pageKey: candidate.pageKey,
        priorityScore: candidate.priorityScore,
        reasons: candidate.reasons,
        learnerStatusLabel: candidate.learnerStatusLabel,
        sourceId: input.sourceId,
      },
    });
  }

  return { enqueued: toEnqueue.length, candidates: queue };
}
