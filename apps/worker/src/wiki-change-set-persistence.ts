import type { DbClient } from "@studyagent/db";
import {
  claimConceptLinks,
  claims,
  concepts,
  events,
  graphRelations,
  wikiPages,
} from "@studyagent/db";
import type { WikiChangeSet } from "@studyagent/wiki-core";
import { buildSourceReadiness, sourceReadinessComponent } from "@studyagent/schemas";
import { and, eq, inArray, max, sql } from "drizzle-orm";

export type ApplyWikiChangeSetInput = {
  changeSet: WikiChangeSet;
  extractionModel?: string;
};

export type KnowledgeCommitResult = {
  fingerprint: string;
  alreadyCommitted: boolean;
  counts: {
    concepts: number;
    claims: number;
    claimLinks: number;
    graphRelations: number;
    wikiPages: number;
    events: number;
  };
  readiness: ReturnType<typeof buildSourceReadiness>;
};

type Tx = Parameters<Parameters<DbClient["db"]["transaction"]>[0]>[0];

async function appendEventTx(
  tx: Tx,
  input: { notebookId: string; eventType: string; payload: Record<string, unknown> },
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.notebookId}))`);
  const [row] = await tx
    .select({ m: max(events.sequenceNo) })
    .from(events)
    .where(eq(events.notebookId, input.notebookId));
  await tx.insert(events).values({
    id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
    notebookId: input.notebookId,
    eventType: input.eventType,
    sequenceNo: (row?.m ?? 0) + 1,
    payloadJson: input.payload,
  });
}

export async function applyWikiChangeSet(dbClient: DbClient, input: ApplyWikiChangeSetInput): Promise<KnowledgeCommitResult> {
  const { changeSet } = input;
  const now = new Date(changeSet.compiledAt);

  return dbClient.db.transaction(async (tx) => {
    const [existingCommit] = await tx
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.notebookId, changeSet.notebookId),
          eq(events.eventType, "wiki.change_set.committed"),
          sql`(${events.payloadJson}->>'fingerprint') = ${changeSet.fingerprint}`,
        ),
      )
      .limit(1);

    const counts: KnowledgeCommitResult["counts"] = {
      concepts: 0,
      claims: 0,
      claimLinks: 0,
      graphRelations: 0,
      wikiPages: 0,
      events: 0,
    };

    const readyAt = now.toISOString();
    const readiness = buildSourceReadiness({
      retrieval: sourceReadinessComponent(true, { updatedAt: readyAt }),
      wiki: sourceReadinessComponent(changeSet.wikiPages.length > 0, { updatedAt: readyAt }),
      planning: sourceReadinessComponent(false, {
        status: "pending",
        updatedAt: readyAt,
        message: "Learning plan bootstrap has not completed yet.",
      }),
      search: sourceReadinessComponent(true, { updatedAt: readyAt }),
      projection: sourceReadinessComponent(false, { status: "pending", updatedAt: readyAt, message: "Graph projection has not run yet." }),
      learnerSourceWiki: sourceReadinessComponent(false, {
        status: "pending",
        updatedAt: readyAt,
        message: "Source Wiki will be published after planning and projection checks.",
      }),
      tutoring: sourceReadinessComponent(true, { updatedAt: readyAt }),
    });

    if (existingCommit) {
      return { fingerprint: changeSet.fingerprint, alreadyCommitted: true, counts, readiness };
    }

    if (changeSet.deleteClaimsForSource) {
      await tx.delete(claims).where(eq(claims.sourceId, changeSet.sourceId));
    }

    if (changeSet.deleteGraphRelationsForSource) {
      await tx
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
        await tx.insert(concepts).values({
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
        }).onConflictDoUpdate({
          target: concepts.id,
          set: {
            aliases: concept.aliases,
            conceptType: concept.conceptType,
            updatedAt: now,
          },
        });
      } else {
        await tx
          .update(concepts)
          .set({ aliases: concept.aliases, updatedAt: now })
          .where(eq(concepts.id, concept.id));
      }
      counts.concepts += 1;
    }

    for (const claim of changeSet.claims) {
      const primaryChunk = claim.evidenceChunkIds[0];
      await tx.insert(claims).values({
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
      counts.claims += 1;

      for (const link of claim.conceptLinks) {
        await tx.insert(claimConceptLinks).values({
          claimId: claim.id,
          conceptId: link.conceptId,
          role: link.role,
          confidence: link.confidence,
        });
        counts.claimLinks += 1;
      }
    }

    for (const patch of changeSet.claimPatches) {
      await tx
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
      await tx.insert(graphRelations).values({
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
      counts.graphRelations += 1;
    }

    if (changeSet.deleteWikiPageKeys.length > 0) {
      await tx
        .delete(wikiPages)
        .where(and(eq(wikiPages.notebookId, changeSet.notebookId), inArray(wikiPages.pageKey, changeSet.deleteWikiPageKeys)));
    }

    for (const page of changeSet.wikiPages) {
      if (page.pageType === "source_summary" || page.pageType === "topic") {
        await tx.delete(wikiPages).where(and(eq(wikiPages.notebookId, changeSet.notebookId), eq(wikiPages.pageKey, page.pageKey)));
      }

      await tx.insert(wikiPages).values({
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
      counts.wikiPages += 1;
    }

    for (const event of changeSet.events) {
      await appendEventTx(tx, {
        notebookId: changeSet.notebookId,
        eventType: event.eventType,
        payload: event.payload,
      });
      counts.events += 1;
    }

    if (changeSet.warnings.length > 0) {
      await appendEventTx(tx, {
        notebookId: changeSet.notebookId,
        eventType: "wiki.compilation.warnings",
        payload: { sourceId: changeSet.sourceId, fingerprint: changeSet.fingerprint, warnings: changeSet.warnings },
      });
      counts.events += 1;
    }

    await appendEventTx(tx, {
      notebookId: changeSet.notebookId,
      eventType: "wiki.change_set.committed",
      payload: {
        sourceId: changeSet.sourceId,
        sourceVersionId: changeSet.sourceVersionId,
        fingerprint: changeSet.fingerprint,
        counts,
      },
    });
    counts.events += 1;

    return { fingerprint: changeSet.fingerprint, alreadyCommitted: false, counts, readiness };
  });
}
