import { eq } from "drizzle-orm";
import { claimConceptLinks, claims } from "@studyagent/db";
import { combineConfidence } from "@studyagent/wiki-core";
import { buildReducerResult, type ProposeClaimInput, type ProposeClaimOutput, type RuntimeWriteToolProvider } from "@studyagent/tools";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";
import type { AppContext } from "./context.js";
import { resolveConceptIds, resolveEvidence } from "./tutor-write-shared.js";

function defaultClaimConfidence(): number {
  return combineConfidence({
    sourceSupport: 0.78,
    extractionConfidence: 0.72,
    recency: 0.8,
    contradictionPenalty: 0,
    humanApproval: 0,
    reinforcementSignal: 0,
  });
}

export function createClaimWriteHandlers(
  appCtx: AppContext,
): Pick<RuntimeWriteToolProvider, "proposeClaim"> {
  return {
    async proposeClaim(input: ProposeClaimInput, ctx): Promise<ProposeClaimOutput> {
      const evidence = await resolveEvidence(appCtx.db, ctx.notebookId, input.sourceRefs);
      const conceptIds = await resolveConceptIds(appCtx.db, ctx.notebookId, input.conceptIds);
      const candidateClaimId = `claim_${crypto.randomUUID().replaceAll("-", "")}`;
      const confidence = input.confidenceHint ?? defaultClaimConfidence();

      await appCtx.db.db.insert(claims).values({
        id: candidateClaimId,
        notebookId: ctx.notebookId,
        sourceId: evidence.sourceId,
        sourceVersionId: evidence.sourceVersionId,
        claimType: input.claimType,
        claimText: input.claimText,
        status: "candidate",
        confidence,
        qualityScore: confidence,
        supportScore: Math.max(0.6, confidence),
        confidenceComponentsJson: {
          sourceSupport: 0.78,
          extractionConfidence: input.confidenceHint ?? 0.72,
          recency: 0.8,
          contradictionPenalty: 0,
          humanApproval: 0,
          reinforcementSignal: 0,
        },
        sourceSpanJson: {
          sourceRefs: input.sourceRefs,
        },
        sourceChunkIds: evidence.sourceChunkIds,
        metadataJson: {
          createdBy: "tutor_runtime",
          traceId: ctx.traceId,
        },
      });

      if (conceptIds.length) {
        await appCtx.db.db.insert(claimConceptLinks).values(
          conceptIds.map((conceptId) => ({
            claimId: candidateClaimId,
            conceptId,
            role: "subject",
            confidence,
          })),
        );
      }

      const reducerEvent = await appendEvent(appCtx.db, {
        notebookId: ctx.notebookId,
        runId: ctx.runId,
        eventType: "wiki.claim.proposed",
        payload: {
          candidateClaimId,
          claimText: input.claimText,
          claimType: input.claimType,
          conceptIds,
          sourceRefs: input.sourceRefs,
          traceId: ctx.traceId,
        },
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
      });

      return {
        candidateClaimId,
        status: "candidate",
        warnings: [
          ...evidence.warnings,
          ...(conceptIds.length !== input.conceptIds.length
            ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
            : []),
        ],
        reducerResult: buildReducerResult(
          "wiki.claim.proposed",
          {
            candidateClaimId,
            notebookId: ctx.notebookId,
            claimText: input.claimText,
            claimType: input.claimType,
            conceptIds,
            sourceRefs: input.sourceRefs,
          },
          [reducerEvent.id],
        ),
      };
    },
  };
}
