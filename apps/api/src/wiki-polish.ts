import { eq } from "drizzle-orm";
import { appendEvent, wikiPages } from "@studyagent/db";
import { enqueueWikiPagePolishRepair, type WikiPolishPageInput } from "@studyagent/wiki-core";
import type { AppContext } from "./context.js";

export async function enqueueTutorWikiPageRepair(
  ctx: AppContext,
  input: { notebookId: string; pageId: string; sourceId?: string | null },
): Promise<{ enqueued: boolean; candidate: ReturnType<typeof enqueueWikiPagePolishRepair> }> {
  const rows = await ctx.db.db
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
    sourceId:
      input.sourceId ??
      (typeof row.structuredJson?.bootstrapSourceId === "string" ? row.structuredJson.bootstrapSourceId : null),
    sourceChunkIds: row.sourceChunkIds ?? [],
    conceptId: typeof row.structuredJson?.conceptId === "string" ? row.structuredJson.conceptId : null,
    structuredJson: row.structuredJson ?? {},
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }));

  const candidate = enqueueWikiPagePolishRepair(pages, input.pageId);
  if (!candidate) return { enqueued: false, candidate: null };

  await appendEvent(ctx.db, {
    notebookId: input.notebookId,
    eventType: "wiki.polish.candidate.enqueued",
    payload: {
      pageId: candidate.pageRef.refId,
      pageKey: candidate.pageKey,
      priorityScore: candidate.priorityScore,
      reasons: candidate.reasons,
      learnerStatusLabel: candidate.learnerStatusLabel,
      trigger: "tutor_repair",
    },
  });

  return { enqueued: true, candidate };
}
