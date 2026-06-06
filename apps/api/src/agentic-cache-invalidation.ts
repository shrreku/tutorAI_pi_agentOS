import {
  appendEvent,
  invalidateAgenticCacheScope,
  type AppendEventInput,
  type DbClient,
} from "@studyagent/db";
import {
  DurableEventSummaryCollector,
  recordAgenticCacheMetric,
  recordDurableEventMetric,
  startMetricTimer,
} from "@studyagent/observability";

export const TUTOR_AGENTIC_CACHE_NAMESPACES = {
  retrievalRows: "tutor_turn.retrieval_rows",
} as const;

export type TutorReadCacheNamespace =
  | typeof TUTOR_AGENTIC_CACHE_NAMESPACES.retrievalRows;

const RETRIEVAL_ROWS_INVALIDATING_EVENT_TYPES = new Set([
  "graph.node.created",
  "source.chunk.completed",
  "source.enrichment.completed",
  "source.index.completed",
  "source.ingestion.ready",
  "source.parse.completed",
  "source.readiness.updated",
  "source.tutoring_ready",
  "source.uploaded",
  "wiki.change_set.committed",
  "wiki.claim.admitted",
  "wiki.claim.contradicted",
  "wiki.claim.promoted",
  "wiki.claim.proposed",
  "wiki.claim.superseded",
  "wiki.page.compiled",
  "wiki.page.invalidated",
  "wiki.page.updated",
]);

export function selectTutorReadCacheNamespacesForEvent(eventType: string): TutorReadCacheNamespace[] {
  const namespaces: TutorReadCacheNamespace[] = [];
  if (RETRIEVAL_ROWS_INVALIDATING_EVENT_TYPES.has(eventType)) {
    namespaces.push(TUTOR_AGENTIC_CACHE_NAMESPACES.retrievalRows);
  }
  return namespaces;
}

export function shouldInvalidateTutorReadCachesForEvent(eventType: string): boolean {
  return selectTutorReadCacheNamespacesForEvent(eventType).length > 0;
}

export async function invalidateTutorReadCachesForNotebookEvent(
  dbClient: DbClient,
  input: { notebookId: string; eventType: string },
): Promise<{
  deleted: number;
  errors: string[];
  namespaces: TutorReadCacheNamespace[];
  skipped: boolean;
}> {
  const namespaces = selectTutorReadCacheNamespacesForEvent(input.eventType);
  if (!namespaces.length) {
    recordAgenticCacheMetric({
      namespace: "none",
      operation: "invalidate",
      outcome: "skipped",
    });
    return { deleted: 0, errors: [], namespaces, skipped: true };
  }

  let deleted = 0;
  const errors: string[] = [];
  for (const namespace of namespaces) {
    const stopTimer = startMetricTimer();
    try {
      const deletedForNamespace = await invalidateAgenticCacheScope(dbClient, {
        namespace,
        scopeType: "notebook",
        scopeId: input.notebookId,
      });
      deleted += deletedForNamespace;
      recordAgenticCacheMetric({
        namespace,
        operation: "invalidate",
        outcome: "success",
        deleted: deletedForNamespace,
        durationMs: stopTimer(),
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      recordAgenticCacheMetric({
        namespace,
        operation: "invalidate",
        outcome: "error",
        durationMs: stopTimer(),
      });
    }
  }

  return { deleted, errors, namespaces, skipped: false };
}

export async function appendEventWithTutorCacheInvalidation(
  dbClient: DbClient,
  input: AppendEventInput,
  collector?: DurableEventSummaryCollector,
): Promise<{ id: string; sequenceNo: number }> {
  const stopTimer = startMetricTimer();
  let event: { id: string; sequenceNo: number };
  try {
    event = await appendEvent(dbClient, input);
    collector?.recordSuccess(input.eventType);
    recordDurableEventMetric({
      eventType: input.eventType,
      outcome: "success",
      durationMs: stopTimer(),
    });
  } catch (error) {
    collector?.recordError(input.eventType);
    recordDurableEventMetric({
      eventType: input.eventType,
      outcome: "error",
      durationMs: stopTimer(),
    });
    throw error;
  }
  await invalidateTutorReadCachesForNotebookEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: input.eventType,
  });
  return event;
}
