import { and, eq } from "drizzle-orm";
import { coverageItems, coverageRecords } from "@studyagent/db";
import {
  buildReducerResult,
  type CoverageGetGapsInput,
  type CoverageGetGapsOutput,
  type CoverageMarkInput,
  type CoverageMarkOutput,
  type RuntimeWriteToolProvider,
} from "@studyagent/tools";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";
import type { AppContext } from "./context.js";
import { type CoverageScope } from "./tutor-write-shared.js";

function normalizeScopeValue(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function findCoverageRecordForScope<T extends CoverageScope>(
  rows: T[],
  scope: CoverageScope,
): T | undefined {
  return rows.find(
    (row) =>
      normalizeScopeValue(row.curriculumId) === normalizeScopeValue(scope.curriculumId) &&
      normalizeScopeValue(row.moduleId) === normalizeScopeValue(scope.moduleId) &&
      normalizeScopeValue(row.objectiveListId) === normalizeScopeValue(scope.objectiveListId) &&
      normalizeScopeValue(row.sessionPlanId) === normalizeScopeValue(scope.sessionPlanId),
  );
}

export function selectPreferredCoverageGapRow<
  T extends {
    curriculumId: string | null;
    moduleId: string | null;
    objectiveListId: string | null;
    sessionPlanId: string | null;
  },
>(rows: T[], input: CoverageGetGapsInput): T | null {
  const scope = {
    curriculumId: normalizeScopeValue(input.curriculumId),
    moduleId: normalizeScopeValue(input.moduleId),
    objectiveListId: normalizeScopeValue(input.objectiveListId),
    sessionPlanId: normalizeScopeValue(input.sessionPlanId),
  };
  const compatible = rows.filter((row) => {
    const tuple = {
      curriculumId: normalizeScopeValue(row.curriculumId),
      moduleId: normalizeScopeValue(row.moduleId),
      objectiveListId: normalizeScopeValue(row.objectiveListId),
      sessionPlanId: normalizeScopeValue(row.sessionPlanId),
    };
    return (
      (!scope.curriculumId || !tuple.curriculumId || tuple.curriculumId === scope.curriculumId) &&
      (!scope.moduleId || !tuple.moduleId || tuple.moduleId === scope.moduleId) &&
      (!scope.objectiveListId ||
        !tuple.objectiveListId ||
        tuple.objectiveListId === scope.objectiveListId) &&
      (!scope.sessionPlanId || !tuple.sessionPlanId || tuple.sessionPlanId === scope.sessionPlanId)
    );
  });
  if (compatible.length === 0) return null;
  const score = (row: T): number => {
    if (scope.sessionPlanId && normalizeScopeValue(row.sessionPlanId) === scope.sessionPlanId)
      return 40;
    if (scope.objectiveListId && normalizeScopeValue(row.objectiveListId) === scope.objectiveListId)
      return 30;
    if (scope.moduleId && normalizeScopeValue(row.moduleId) === scope.moduleId) return 20;
    if (scope.curriculumId && normalizeScopeValue(row.curriculumId) === scope.curriculumId)
      return 10;
    if (
      !normalizeScopeValue(row.curriculumId) &&
      !normalizeScopeValue(row.moduleId) &&
      !normalizeScopeValue(row.objectiveListId) &&
      !normalizeScopeValue(row.sessionPlanId)
    ) {
      return 1;
    }
    return 0;
  };
  return compatible.sort((left, right) => score(right) - score(left))[0] ?? null;
}

async function upsertCoverageRecord(
  appCtx: AppContext,
  notebookId: string,
  input: CoverageMarkInput,
  runId?: string,
): Promise<{
  id: string;
  notebookId: string;
  coverageItemId: string;
  curriculumId: string | null;
  moduleId: string | null;
  objectiveListId: string | null;
  sessionPlanId: string | null;
  status: string;
  evidenceJson: Record<string, unknown>;
  updatedAt: Date;
} | null> {
  const [coverageItem] = await appCtx.db.db
    .select({ id: coverageItems.id })
    .from(coverageItems)
    .where(
      and(eq(coverageItems.id, input.coverageItemId), eq(coverageItems.notebookId, notebookId)),
    )
    .limit(1);
  if (!coverageItem) return null;

  const existingRows = await appCtx.db.db
    .select()
    .from(coverageRecords)
    .where(
      and(
        eq(coverageRecords.notebookId, notebookId),
        eq(coverageRecords.coverageItemId, input.coverageItemId),
      ),
    );

  const targetScope: CoverageScope = {
    curriculumId: input.curriculumId ?? null,
    moduleId: input.moduleId ?? null,
    objectiveListId: input.objectiveListId ?? null,
    sessionPlanId: input.sessionPlanId ?? null,
  };
  const existing = findCoverageRecordForScope(existingRows, targetScope);

  const now = new Date();
  const status = input.status ?? "introduced";
  const values = {
    notebookId,
    coverageItemId: input.coverageItemId,
    curriculumId: input.curriculumId ?? null,
    moduleId: input.moduleId ?? null,
    objectiveListId: input.objectiveListId ?? null,
    sessionPlanId: input.sessionPlanId ?? null,
    status,
    evidenceJson: input.evidenceJson,
    updatedByRunId: runId,
    updatedAt: now,
  } as const;

  if (existing) {
    await appCtx.db.db
      .update(coverageRecords)
      .set(values)
      .where(eq(coverageRecords.id, existing.id));
    return { id: existing.id, ...values, updatedAt: now };
  }

  const id = `coverage_${crypto.randomUUID().replaceAll("-", "")}`;
  await appCtx.db.db.insert(coverageRecords).values({ id, ...values });
  return { id, ...values, updatedAt: now };
}

async function getCoverageGaps(
  appCtx: AppContext,
  notebookId: string,
  input: CoverageGetGapsInput,
): Promise<CoverageGetGapsOutput["gaps"]> {
  const rows = await appCtx.db.db
    .select({
      coverageItemId: coverageItems.id,
      title: coverageItems.title,
      itemFamily: coverageItems.itemFamily,
      description: coverageItems.description,
      recordStatus: coverageRecords.status,
      curriculumId: coverageRecords.curriculumId,
      moduleId: coverageRecords.moduleId,
      objectiveListId: coverageRecords.objectiveListId,
      sessionPlanId: coverageRecords.sessionPlanId,
    })
    .from(coverageItems)
    .leftJoin(
      coverageRecords,
      and(
        eq(coverageRecords.coverageItemId, coverageItems.id),
        eq(coverageRecords.notebookId, notebookId),
      ),
    )
    .where(eq(coverageItems.notebookId, notebookId));

  const groupedRows = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = groupedRows.get(row.coverageItemId);
    if (existing) existing.push(row);
    else groupedRows.set(row.coverageItemId, [row]);
  }

  const scopedRows = [...groupedRows.values()]
    .map((group) => selectPreferredCoverageGapRow(group, input))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return scopedRows
    .filter((row) => !row.recordStatus || input.statuses.includes(row.recordStatus as never))
    .filter((row) => (input.curriculumId ? row.curriculumId === input.curriculumId : true))
    .filter((row) => (input.moduleId ? row.moduleId === input.moduleId : true))
    .filter((row) => (input.objectiveListId ? row.objectiveListId === input.objectiveListId : true))
    .filter((row) => (input.sessionPlanId ? row.sessionPlanId === input.sessionPlanId : true))
    .slice(0, input.limit)
    .map((row) => ({
      coverageItemId: row.coverageItemId,
      title: row.title,
      itemFamily: row.itemFamily,
      description: row.description,
      status: (row.recordStatus ?? "planned") as
        | "planned"
        | "introduced"
        | "checked"
        | "mastered"
        | "needs_review",
      curriculumId: row.curriculumId,
      moduleId: row.moduleId,
      objectiveListId: row.objectiveListId,
      sessionPlanId: row.sessionPlanId,
    }));
}

export function createCoverageWriteHandlers(
  appCtx: AppContext,
): Pick<RuntimeWriteToolProvider, "markCoverage" | "getCoverageGaps"> {
  return {
    async markCoverage(input, ctx): Promise<CoverageMarkOutput> {
      const result = await upsertCoverageRecord(appCtx, ctx.notebookId, input, ctx.runId);
      const status = (input.status ?? "introduced") as
        | "planned"
        | "introduced"
        | "checked"
        | "mastered"
        | "needs_review";
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "coverage.record.updated",
            payload: {
              coverageRecordId: result.id,
              coverageItemId: result.coverageItemId,
              status,
              curriculumId: result.curriculumId,
              moduleId: result.moduleId,
              objectiveListId: result.objectiveListId,
              sessionPlanId: result.sessionPlanId,
              evidenceJson: result.evidenceJson,
              traceId: ctx.traceId,
            },
          })
        : null;

      return {
        coverageRecord: result
          ? {
              id: result.id,
              notebookId: result.notebookId,
              coverageItemId: result.coverageItemId,
              curriculumId: result.curriculumId,
              moduleId: result.moduleId,
              objectiveListId: result.objectiveListId,
              sessionPlanId: result.sessionPlanId,
              status,
              evidenceJson: result.evidenceJson,
              updatedAt: result.updatedAt.toISOString(),
            }
          : null,
        warnings: result
          ? []
          : [
              {
                code: "coverage_item_missing",
                message: "Coverage item was not found in this notebook.",
              },
            ],
        reducerResult: buildReducerResult(
          "coverage.record.updated",
          {
            notebookId: ctx.notebookId,
            coverageItemId: input.coverageItemId,
            status,
            curriculumId: input.curriculumId ?? null,
            moduleId: input.moduleId ?? null,
            objectiveListId: input.objectiveListId ?? null,
            sessionPlanId: input.sessionPlanId ?? null,
            evidenceJson: input.evidenceJson,
          },
          event ? [event.id] : [],
        ),
      };
    },

    async getCoverageGaps(input, ctx): Promise<CoverageGetGapsOutput> {
      const gaps = await getCoverageGaps(appCtx, ctx.notebookId, input);
      return { gaps };
    },
  };
}
