import type { DbClient } from "@studyagent/db";
import {
  appendEvent,
  claimConceptLinks,
  claims,
  concepts,
  graphRelations,
  wikiPages,
} from "@studyagent/db";
import type { WikiChangeSet } from "@studyagent/wiki-core";
import { and, eq, inArray, sql } from "drizzle-orm";

export type ApplyWikiChangeSetInput = {
  changeSet: WikiChangeSet;
  extractionModel?: string;
};

export async function applyWikiChangeSet(dbClient: DbClient, input: ApplyWikiChangeSetInput): Promise<void> {
  const { changeSet } = input;
  const now = new Date(changeSet.compiledAt);

  if (changeSet.deleteClaimsForSource) {
    await dbClient.db.delete(claims).where(eq(claims.sourceId, changeSet.sourceId));
  }

  if (changeSet.deleteGraphRelationsForSource) {
    await dbClient.db
      .delete(graphRelations)
      .where(
        and(
          eq(graphRelations.notebookId, changeSet.notebookId),
          sql`(${graphRelations.metadataJson}->>'ingestionSourceId') = ${changeSet.sourceId}`,
        ),
      );
  }

  for (const concept of changeSet.concepts) {
    if (concept.action === "create") {
      await dbClient.db.insert(concepts).values({
        id: concept.id,
        notebookId: changeSet.notebookId,
        canonicalName: concept.canonicalName,
        aliases: concept.aliases,
        conceptType: concept.conceptType,
        description: null,
        confidence: 0.75,
        metadataJson: { ingestionSourceId: changeSet.sourceId },
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await dbClient.db
        .update(concepts)
        .set({ aliases: concept.aliases, updatedAt: now })
        .where(eq(concepts.id, concept.id));
    }
  }

  for (const claim of changeSet.claims) {
    const primaryChunk = claim.evidenceChunkIds[0];
    await dbClient.db.insert(claims).values({
      id: claim.id,
      notebookId: changeSet.notebookId,
      sourceId: changeSet.sourceId,
      sourceVersionId: changeSet.sourceVersionId,
      claimType: claim.claimType,
      claimText: claim.claimText,
      status: claim.status,
      confidence: claim.confidence,
      qualityScore: claim.qualityScore,
      supportScore: claim.supportScore,
      confidenceComponentsJson: claim.confidenceComponents,
      sourceSpanJson: primaryChunk ? { evidenceChunkId: primaryChunk } : {},
      sourceChunkIds: claim.evidenceChunkIds,
      metadataJson: { resolution: claim.resolution },
      createdAt: now,
      updatedAt: now,
    });

    for (const link of claim.conceptLinks) {
      await dbClient.db.insert(claimConceptLinks).values({
        claimId: claim.id,
        conceptId: link.conceptId,
        role: link.role,
        confidence: link.confidence,
      });
    }
  }

  for (const patch of changeSet.claimPatches) {
    await dbClient.db
      .update(claims)
      .set({
        status: patch.status,
        supersededByClaimId: patch.supersededByClaimId ?? null,
        confidence: patch.confidence,
        qualityScore: patch.qualityScore,
        confidenceComponentsJson: patch.confidenceComponents,
        updatedAt: now,
      })
      .where(eq(claims.id, patch.claimId));
  }

  for (const relation of changeSet.graphRelations) {
    await dbClient.db.insert(graphRelations).values({
      id: relation.id,
      notebookId: changeSet.notebookId,
      sourceNodeType: relation.sourceNodeType,
      sourceNodeId: relation.sourceNodeId,
      targetNodeType: relation.targetNodeType,
      targetNodeId: relation.targetNodeId,
      relationType: relation.relationType,
      confidence: relation.confidence,
      sourceClaimIds: relation.sourceClaimIds,
      sourceChunkIds: relation.sourceChunkIds,
      metadataJson: relation.metadataJson,
    });
  }

  if (changeSet.deleteWikiPageKeys.length > 0) {
    await dbClient.db
      .delete(wikiPages)
      .where(
        and(
          eq(wikiPages.notebookId, changeSet.notebookId),
          inArray(wikiPages.pageKey, changeSet.deleteWikiPageKeys),
        ),
      );
  }

  for (const page of changeSet.wikiPages) {
    if (page.pageType === "source_summary" || page.pageType === "topic") {
      await dbClient.db
        .delete(wikiPages)
        .where(
          and(
            eq(wikiPages.notebookId, changeSet.notebookId),
            eq(wikiPages.pageKey, page.pageKey),
          ),
        );
    }

    await dbClient.db.insert(wikiPages).values({
      id: page.id,
      notebookId: changeSet.notebookId,
      pageType: page.pageType,
      pageKey: page.pageKey,
      title: page.title,
      version: 1,
      status: "draft",
      structuredJson: {
        ...page.structuredJson,
        blockOrigins: page.blocks.map((b) => ({ origin: b.origin, id: b.id ?? null })),
      },
      markdown: page.markdown,
      sourceClaimIds: page.sourceClaimIds,
      sourceChunkIds: page.sourceChunkIds,
      confidenceSummaryJson: {
        ...page.confidenceSummaryJson,
        ...(input.extractionModel ? { extractionModel: input.extractionModel } : {}),
      },
      qualityScore: page.qualityScore,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const event of changeSet.events) {
    await appendEvent(dbClient, {
      notebookId: changeSet.notebookId,
      eventType: event.eventType,
      payload: event.payload,
    });
  }

  if (changeSet.warnings.length > 0) {
    await appendEvent(dbClient, {
      notebookId: changeSet.notebookId,
      eventType: "wiki.compilation.warnings",
      payload: {
        sourceId: changeSet.sourceId,
        fingerprint: changeSet.fingerprint,
        warnings: changeSet.warnings,
      },
    });
  }
}
