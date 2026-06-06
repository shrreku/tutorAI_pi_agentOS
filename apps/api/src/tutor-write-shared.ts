import { and, eq, inArray } from "drizzle-orm";
import {
  chunks,
  concepts,
  sourceVersions,
  sources,
  type DbClient,
} from "@studyagent/db";
import { ToolError } from "@studyagent/tools";

export type ResolvedEvidence = {
  sourceId: string;
  sourceVersionId: string;
  sourceChunkIds: string[];
  warnings: Array<{ code: string; message: string }>;
};

export type CoverageScope = {
  curriculumId: string | null;
  moduleId: string | null;
  objectiveListId: string | null;
  sessionPlanId: string | null;
};

export function isJsonRecordLocal(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function resolveConceptIds(dbClient: DbClient, notebookId: string, requestedIds: string[]): Promise<string[]> {
  if (!requestedIds.length) return [];

  const rows = await dbClient.db
    .select({ id: concepts.id })
    .from(concepts)
    .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, requestedIds)));

  return rows.map((row) => row.id);
}

export async function resolveEvidence(
  dbClient: DbClient,
  notebookId: string,
  refs: Array<{ refType: string; refId: string }>,
): Promise<ResolvedEvidence> {
  const warnings: ResolvedEvidence["warnings"] = [];

  for (const ref of refs) {
    if (ref.refType === "chunk") {
      const [row] = await dbClient.db
        .select({
          sourceId: sources.id,
          sourceVersionId: sourceVersions.id,
          chunkId: chunks.id,
        })
        .from(chunks)
        .innerJoin(sourceVersions, eq(chunks.sourceVersionId, sourceVersions.id))
        .innerJoin(sources, eq(sourceVersions.sourceId, sources.id))
        .where(and(eq(chunks.id, ref.refId), eq(sources.notebookId, notebookId)))
        .limit(1);

      if (row) {
        return {
          sourceId: row.sourceId,
          sourceVersionId: row.sourceVersionId,
          sourceChunkIds: [row.chunkId],
          warnings,
        };
      }
    }

    if (ref.refType === "source_version") {
      const [row] = await dbClient.db
        .select({
          sourceId: sources.id,
          sourceVersionId: sourceVersions.id,
        })
        .from(sourceVersions)
        .innerJoin(sources, eq(sourceVersions.sourceId, sources.id))
        .where(and(eq(sourceVersions.id, ref.refId), eq(sources.notebookId, notebookId)))
        .limit(1);

      if (row) {
        return {
          sourceId: row.sourceId,
          sourceVersionId: row.sourceVersionId,
          sourceChunkIds: [],
          warnings,
        };
      }
    }

    if (ref.refType === "source") {
      const [row] = await dbClient.db
        .select({
          sourceId: sources.id,
          sourceVersionId: sourceVersions.id,
        })
        .from(sources)
        .innerJoin(sourceVersions, eq(sourceVersions.sourceId, sources.id))
        .where(and(eq(sources.id, ref.refId), eq(sources.notebookId, notebookId)))
        .limit(1);

      if (row) {
        return {
          sourceId: row.sourceId,
          sourceVersionId: row.sourceVersionId,
          sourceChunkIds: [],
          warnings,
        };
      }
    }

    warnings.push({
      code: "source_ref_unresolved",
      message: `Could not resolve notebook-scoped evidence for ${ref.refType}:${ref.refId}`,
    });
  }

  throw new ToolError("missing_source_evidence", "Write tools require at least one notebook-scoped source reference.");
}
