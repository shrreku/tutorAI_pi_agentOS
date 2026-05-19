import type { DbClient } from "@studyagent/db";
import {
  claimConceptLinks,
  claims,
  concepts,
  coverageItems,
  coverageRecords,
  curricula,
  curriculumModules,
  graphRelations,
  objectiveLists,
  objectives,
  sessionPlans,
  sources,
  studyPlans,
  wikiPages,
} from "@studyagent/db";
import { and, eq, inArray } from "drizzle-orm";
import type { CanonicalProjectionSnapshot } from "./types.js";

export type LoadCanonicalSnapshotInput = {
  notebookId: string;
  scope: "notebook" | "source";
  sourceId?: string | undefined;
  userId?: string | undefined;
};

function parseConceptIdFromPageKey(pageKey: string): string | null {
  if (!pageKey.startsWith("concept:")) return null;
  return pageKey.slice("concept:".length) || null;
}

export async function loadCanonicalProjectionSnapshot(
  dbClient: DbClient,
  input: LoadCanonicalSnapshotInput,
): Promise<CanonicalProjectionSnapshot> {
  const { notebookId, scope, sourceId } = input;

  const sourceRows =
    scope === "source" && sourceId
      ? await dbClient.db
          .select({ id: sources.id, title: sources.title })
          .from(sources)
          .where(and(eq(sources.notebookId, notebookId), eq(sources.id, sourceId)))
      : await dbClient.db
          .select({ id: sources.id, title: sources.title })
          .from(sources)
          .where(eq(sources.notebookId, notebookId));

  const conceptRows = await dbClient.db
    .select({ id: concepts.id, canonicalName: concepts.canonicalName })
    .from(concepts)
    .where(eq(concepts.notebookId, notebookId));

  const claimRows =
    scope === "source" && sourceId
      ? await dbClient.db
          .select({
            id: claims.id,
            sourceId: claims.sourceId,
            claimText: claims.claimText,
          })
          .from(claims)
          .where(and(eq(claims.notebookId, notebookId), eq(claims.sourceId, sourceId)))
      : await dbClient.db
          .select({
            id: claims.id,
            sourceId: claims.sourceId,
            claimText: claims.claimText,
          })
          .from(claims)
          .where(eq(claims.notebookId, notebookId));

  const claimIds = claimRows.map((c) => c.id);
  const claimLinkRows =
    claimIds.length > 0
      ? await dbClient.db
          .select({ claimId: claimConceptLinks.claimId, conceptId: claimConceptLinks.conceptId })
          .from(claimConceptLinks)
          .where(inArray(claimConceptLinks.claimId, claimIds))
      : [];

  const conceptIdsByClaim = new Map<string, string[]>();
  for (const link of claimLinkRows) {
    const list = conceptIdsByClaim.get(link.claimId) ?? [];
    list.push(link.conceptId);
    conceptIdsByClaim.set(link.claimId, list);
  }

  const wikiRows = await dbClient.db
    .select({
      id: wikiPages.id,
      pageType: wikiPages.pageType,
      pageKey: wikiPages.pageKey,
      title: wikiPages.title,
    })
    .from(wikiPages)
    .where(eq(wikiPages.notebookId, notebookId));

  const wikiPagesFiltered =
    scope === "source" && sourceId
      ? wikiRows.filter((page) => {
          if (page.pageType === "source_summary" && page.pageKey === `source:${sourceId}`) return true;
          if (page.pageType === "topic" && page.pageKey === `topic:${sourceId}`) return true;
          const conceptId = parseConceptIdFromPageKey(page.pageKey);
          if (!conceptId) return false;
          const claimConceptIds = claimRows.flatMap((c) => conceptIdsByClaim.get(c.id) ?? []);
          return claimConceptIds.includes(conceptId);
        })
      : wikiRows;

  const graphRelationRows = await dbClient.db
    .select({
      sourceNodeType: graphRelations.sourceNodeType,
      sourceNodeId: graphRelations.sourceNodeId,
      targetNodeType: graphRelations.targetNodeType,
      targetNodeId: graphRelations.targetNodeId,
      relationType: graphRelations.relationType,
      confidence: graphRelations.confidence,
      metadataJson: graphRelations.metadataJson,
    })
    .from(graphRelations)
    .where(eq(graphRelations.notebookId, notebookId));

  const graphRelationsFiltered =
    scope === "source" && sourceId
      ? graphRelationRows.filter((r) => {
          const meta = r.metadataJson ?? {};
          if (meta.ingestionSourceId === sourceId) return true;
          if (r.sourceNodeType === "claim" && claimIds.includes(r.sourceNodeId)) return true;
          if (r.targetNodeType === "claim" && claimIds.includes(r.targetNodeId)) return true;
          return false;
        })
      : graphRelationRows;

  const curriculumRows = await dbClient.db
    .select({
      id: curricula.id,
      title: curricula.title,
      sourceIds: curricula.sourceIds,
    })
    .from(curricula)
    .where(eq(curricula.notebookId, notebookId));

  const curriculaFiltered =
    scope === "source" && sourceId
      ? curriculumRows.filter((c) => (c.sourceIds ?? []).includes(sourceId))
      : curriculumRows;

  const curriculumIds = curriculaFiltered.map((c) => c.id);

  const moduleRows =
    curriculumIds.length > 0
      ? await dbClient.db
          .select({
            id: curriculumModules.id,
            curriculumId: curriculumModules.curriculumId,
            title: curriculumModules.title,
            summary: curriculumModules.summary,
            orderIndex: curriculumModules.orderIndex,
            status: curriculumModules.status,
          })
          .from(curriculumModules)
          .where(
            and(eq(curriculumModules.notebookId, notebookId), inArray(curriculumModules.curriculumId, curriculumIds)),
          )
      : [];

  const objectiveListRows =
    curriculumIds.length > 0
      ? await dbClient.db
          .select({
            id: objectiveLists.id,
            curriculumId: objectiveLists.curriculumId,
            moduleId: objectiveLists.moduleId,
            title: objectiveLists.title,
            status: objectiveLists.status,
            objectiveIdsOrdered: objectiveLists.objectiveIdsOrdered,
          })
          .from(objectiveLists)
          .where(and(eq(objectiveLists.notebookId, notebookId), inArray(objectiveLists.curriculumId, curriculumIds)))
      : [];

  const sessionPlanRows =
    curriculumIds.length > 0
      ? await dbClient.db
          .select({
            id: sessionPlans.id,
            curriculumId: sessionPlans.curriculumId,
            moduleId: sessionPlans.moduleId,
            objectiveListId: sessionPlans.objectiveListId,
            title: sessionPlans.title,
            status: sessionPlans.status,
            sessionGoal: sessionPlans.sessionGoal,
          })
          .from(sessionPlans)
          .where(and(eq(sessionPlans.notebookId, notebookId), inArray(sessionPlans.curriculumId, curriculumIds)))
      : [];

  const objectiveRows =
    curriculumIds.length > 0
      ? await dbClient.db
          .select({
            id: objectives.id,
            curriculumId: objectives.curriculumId,
            title: objectives.title,
            orderIndex: objectives.orderIndex,
            status: objectives.status,
          })
          .from(objectives)
          .where(and(eq(objectives.notebookId, notebookId), inArray(objectives.curriculumId, curriculumIds)))
      : [];

  const studyPlanRows = input.userId
    ? await dbClient.db
        .select({
          id: studyPlans.id,
          title: studyPlans.title,
          currentObjectiveId: studyPlans.currentObjectiveId,
          upcomingObjectiveIds: studyPlans.upcomingObjectiveIds,
        })
        .from(studyPlans)
        .where(and(eq(studyPlans.notebookId, notebookId), eq(studyPlans.userId, input.userId)))
    : await dbClient.db
        .select({
          id: studyPlans.id,
          title: studyPlans.title,
          currentObjectiveId: studyPlans.currentObjectiveId,
          upcomingObjectiveIds: studyPlans.upcomingObjectiveIds,
        })
        .from(studyPlans)
        .where(eq(studyPlans.notebookId, notebookId))
        .limit(1);

  const coverageItemRows =
    scope === "source" && sourceId
      ? await dbClient.db
          .select({
            id: coverageItems.id,
            sourceId: coverageItems.sourceId,
            title: coverageItems.title,
            itemFamily: coverageItems.itemFamily,
          })
          .from(coverageItems)
          .where(and(eq(coverageItems.notebookId, notebookId), eq(coverageItems.sourceId, sourceId)))
      : await dbClient.db
          .select({
            id: coverageItems.id,
            sourceId: coverageItems.sourceId,
            title: coverageItems.title,
            itemFamily: coverageItems.itemFamily,
          })
          .from(coverageItems)
          .where(eq(coverageItems.notebookId, notebookId));

  const coverageItemIds = coverageItemRows.map((i) => i.id);
  const coverageRecordRows =
    coverageItemIds.length > 0
      ? await dbClient.db
          .select({
            id: coverageRecords.id,
            coverageItemId: coverageRecords.coverageItemId,
            status: coverageRecords.status,
          })
          .from(coverageRecords)
          .where(
            and(eq(coverageRecords.notebookId, notebookId), inArray(coverageRecords.coverageItemId, coverageItemIds)),
          )
      : [];

  return {
    notebookId,
    scope,
    ...(sourceId ? { sourceId } : {}),
    sources: sourceRows,
    concepts: conceptRows,
    claims: claimRows.map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      claimText: c.claimText,
      conceptIds: conceptIdsByClaim.get(c.id) ?? [],
    })),
    wikiPages: wikiPagesFiltered.map((p) => ({
      id: p.id,
      pageType: p.pageType,
      pageKey: p.pageKey,
      title: p.title,
      linkedConceptId: parseConceptIdFromPageKey(p.pageKey),
      sourceId:
        p.pageType === "source_summary" && p.pageKey.startsWith("source:")
          ? p.pageKey.slice("source:".length)
          : scope === "source"
            ? sourceId ?? null
            : p.pageKey.startsWith("source:")
              ? p.pageKey.slice("source:".length)
              : null,
    })),
    graphRelations: graphRelationsFiltered.map((r) => ({
      sourceNodeType: r.sourceNodeType,
      sourceNodeId: r.sourceNodeId,
      targetNodeType: r.targetNodeType,
      targetNodeId: r.targetNodeId,
      relationType: r.relationType,
      confidence: r.confidence,
    })),
    curricula: curriculaFiltered.map((c) => ({
      id: c.id,
      title: c.title,
      sourceIds: Array.isArray(c.sourceIds) ? c.sourceIds : [],
    })),
    modules: moduleRows,
    objectiveLists: objectiveListRows.map((l) => ({
      ...l,
      objectiveIdsOrdered: Array.isArray(l.objectiveIdsOrdered) ? l.objectiveIdsOrdered : [],
    })),
    sessionPlans: sessionPlanRows,
    objectives: objectiveRows,
    studyPlans: studyPlanRows.map((p) => ({
      id: p.id,
      title: p.title,
      currentObjectiveId: p.currentObjectiveId,
      upcomingObjectiveIds: Array.isArray(p.upcomingObjectiveIds) ? p.upcomingObjectiveIds : [],
    })),
    coverageItems: coverageItemRows,
    coverageRecords: coverageRecordRows,
  };
}

export async function maxCanonicalUpdatedAt(
  dbClient: DbClient,
  notebookId: string,
  sourceId?: string,
): Promise<Date | null> {
  const timestamps: Date[] = [];

  const sourceTs = sourceId
    ? await dbClient.db
        .select({ updatedAt: sources.updatedAt })
        .from(sources)
        .where(and(eq(sources.notebookId, notebookId), eq(sources.id, sourceId)))
    : await dbClient.db.select({ updatedAt: sources.updatedAt }).from(sources).where(eq(sources.notebookId, notebookId));
  timestamps.push(...sourceTs.map((r) => r.updatedAt));

  const claimTs = sourceId
    ? await dbClient.db
        .select({ updatedAt: claims.updatedAt })
        .from(claims)
        .where(and(eq(claims.notebookId, notebookId), eq(claims.sourceId, sourceId)))
    : await dbClient.db.select({ updatedAt: claims.updatedAt }).from(claims).where(eq(claims.notebookId, notebookId));
  timestamps.push(...claimTs.map((r) => r.updatedAt));

  const wikiTs = await dbClient.db
    .select({ updatedAt: wikiPages.updatedAt })
    .from(wikiPages)
    .where(eq(wikiPages.notebookId, notebookId));
  timestamps.push(...wikiTs.map((r) => r.updatedAt));

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps.map((t) => t.getTime())));
}
