import { and, desc, eq, inArray } from "drizzle-orm";
import {
  artifacts,
  chunks,
  claimConceptLinks,
  claims,
  concepts,
  sourceVersions,
  sources,
  wikiPages,
} from "@studyagent/db";
import type { AppContext } from "./context.js";
import type { EvidenceReadModel, EvidenceRef } from "@studyagent/schemas";

export type NodeOpenTargetKind = "concept" | "wiki_page" | "artifact" | "source" | null;

export type ResolvedNodeOpenTarget =
  | { kind: "concept"; entity: typeof concepts.$inferSelect }
  | { kind: "wiki_page"; entity: typeof wikiPages.$inferSelect }
  | { kind: "artifact"; entity: typeof artifacts.$inferSelect }
  | { kind: "source"; entity: typeof sources.$inferSelect }
  | { kind: null; entity: null };

export async function resolveNodeOpenTarget(
  ctx: AppContext,
  notebookId: string,
  nodeId: string,
): Promise<ResolvedNodeOpenTarget> {
  const [concept] = await ctx.db.db
    .select()
    .from(concepts)
    .where(and(eq(concepts.id, nodeId), eq(concepts.notebookId, notebookId)))
    .limit(1);
  if (concept) return { kind: "concept", entity: concept };

  const [wikiPage] = await ctx.db.db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.id, nodeId), eq(wikiPages.notebookId, notebookId)))
    .limit(1);
  if (wikiPage) return { kind: "wiki_page", entity: wikiPage };

  const [artifact] = await ctx.db.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, nodeId), eq(artifacts.notebookId, notebookId)))
    .limit(1);
  if (artifact) return { kind: "artifact", entity: artifact };

  const [source] = await ctx.db.db
    .select()
    .from(sources)
    .where(and(eq(sources.id, nodeId), eq(sources.notebookId, notebookId)))
    .limit(1);
  if (source) return { kind: "source", entity: source };

  return { kind: null, entity: null };
}

export async function loadConceptClaimIds(ctx: AppContext, conceptId: string): Promise<string[]> {
  const links = await ctx.db.db
    .select({ claimId: claimConceptLinks.claimId })
    .from(claimConceptLinks)
    .where(eq(claimConceptLinks.conceptId, conceptId));
  return links.map((link) => link.claimId);
}

export async function buildEvidenceFromClaimAndChunkIds(
  ctx: AppContext,
  claimIds: string[],
  chunkIds: string[],
): Promise<Pick<EvidenceReadModel, "learnerRefs" | "developerRefs">> {
  const claimRows = claimIds.length
    ? await ctx.db.db.select().from(claims).where(inArray(claims.id, claimIds)).limit(20)
    : [];
  const linkedChunkIds = Array.from(
    new Set([...chunkIds, ...claimRows.flatMap((claim) => claim.sourceChunkIds ?? [])]),
  );
  const chunkRows = linkedChunkIds.length
    ? await ctx.db.db
        .select({
          id: chunks.id,
          chunkType: chunks.chunkType,
          text: chunks.text,
          pageStart: chunks.pageStart,
          pageEnd: chunks.pageEnd,
          sourceVersionId: chunks.sourceVersionId,
        })
        .from(chunks)
        .where(inArray(chunks.id, linkedChunkIds))
        .limit(10)
    : [];
  const learnerChunks = toChunkEvidenceRefs(
    await mapChunkRefsWithSourceTitles(ctx, chunkRows),
    "learner",
  );
  const learnerClaims = toClaimEvidenceRefs(
    claimRows.filter((claim) => isLearnerSafeClaim(claim)),
    "learner",
  );
  const developerClaims = toClaimEvidenceRefs(
    claimRows.filter((claim) => !isLearnerSafeClaim(claim)),
    "developer",
  );
  return { learnerRefs: [...learnerChunks, ...learnerClaims], developerRefs: developerClaims };
}

export async function loadSourceChunkEvidence(
  ctx: AppContext,
  sourceId: string,
  limit = 10,
): Promise<EvidenceRef[]> {
  const [latestVersion] = await ctx.db.db
    .select()
    .from(sourceVersions)
    .where(eq(sourceVersions.sourceId, sourceId))
    .orderBy(desc(sourceVersions.version))
    .limit(1);
  if (!latestVersion) return [];
  const chunkRows = await ctx.db.db
    .select({
      id: chunks.id,
      chunkType: chunks.chunkType,
      text: chunks.text,
      pageStart: chunks.pageStart,
      pageEnd: chunks.pageEnd,
      sourceVersionId: chunks.sourceVersionId,
    })
    .from(chunks)
    .where(eq(chunks.sourceVersionId, latestVersion.id))
    .limit(limit);
  return toChunkEvidenceRefs(await mapChunkRefsWithSourceTitles(ctx, chunkRows), "learner");
}

export function isLearnerSafeClaim(claim: {
  status: string;
  confidence: number;
  sourceChunkIds?: string[] | null;
}): boolean {
  return (
    ["accepted", "active", "published"].includes(claim.status) &&
    claim.confidence >= 0.45 &&
    (claim.sourceChunkIds ?? []).length > 0
  );
}

export function toLearnerClaimEvidenceRefs(
  claimRows: Array<{
    id: string;
    claimText: string;
    confidence: number;
    status: string;
    sourceChunkIds?: string[] | null;
  }>,
): EvidenceRef[] {
  return sanitizeLearnerEvidenceRefs(toClaimEvidenceRefs(claimRows, "learner"), false);
}

export async function mapChunkRefsWithSourceTitles(
  ctx: AppContext,
  chunkRows: Array<{
    id: string;
    chunkType: string;
    text: string;
    pageStart: number | null;
    pageEnd: number | null;
    sourceVersionId: string;
  }>,
): Promise<
  Array<{
    id: string;
    chunkType: string;
    text: string;
    pageStart: number | null;
    pageEnd: number | null;
    sourceId: string | null;
    sourceTitle: string | null;
  }>
> {
  const versionIds = Array.from(new Set(chunkRows.map((chunk) => chunk.sourceVersionId)));
  if (!versionIds.length) {
    return chunkRows.map((chunk) => ({
      id: chunk.id,
      chunkType: chunk.chunkType,
      text: chunk.text.slice(0, 400),
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      sourceId: null,
      sourceTitle: null,
    }));
  }

  const versions = await ctx.db.db
    .select({ id: sourceVersions.id, sourceId: sourceVersions.sourceId })
    .from(sourceVersions)
    .where(inArray(sourceVersions.id, versionIds));
  const sourceIds = Array.from(new Set(versions.map((version) => version.sourceId)));
  const sourceRows = sourceIds.length
    ? await ctx.db.db
        .select({ id: sources.id, title: sources.title })
        .from(sources)
        .where(inArray(sources.id, sourceIds))
    : [];
  const sourceIdByVersionId = new Map(
    versions.map((version) => [version.id, version.sourceId] as const),
  );
  const sourceTitleById = new Map(sourceRows.map((source) => [source.id, source.title] as const));

  return chunkRows.map((chunk) => {
    const sourceId = sourceIdByVersionId.get(chunk.sourceVersionId) ?? null;
    return {
      id: chunk.id,
      chunkType: chunk.chunkType,
      text: chunk.text.slice(0, 400),
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      sourceId,
      sourceTitle: sourceId ? (sourceTitleById.get(sourceId) ?? null) : null,
    };
  });
}

export function toChunkEvidenceRefs(
  chunkRows: Array<{
    id: string;
    chunkType: string;
    text: string;
    pageStart: number | null;
    pageEnd: number | null;
    sourceId: string | null;
    sourceTitle: string | null;
  }>,
  visibility: "learner" | "developer",
): EvidenceRef[] {
  return chunkRows.map((chunk) => ({
    id: chunk.id,
    kind: "chunk",
    visibility,
    label: chunk.sourceTitle ?? chunk.id,
    text: chunk.text.slice(0, 400),
    confidence: null,
    status: null,
    chunkType: chunk.chunkType,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    sourceId: chunk.sourceId,
    sourceTitle: chunk.sourceTitle,
    metadata: {},
  }));
}

function toClaimEvidenceRefs(
  claimRows: Array<{
    id: string;
    claimText: string;
    confidence: number;
    status: string;
    sourceChunkIds?: string[] | null;
  }>,
  visibility: "learner" | "developer",
): EvidenceRef[] {
  return claimRows.map((claim) => ({
    id: claim.id,
    kind: "claim",
    visibility,
    label: "Supporting note",
    text: claim.claimText,
    confidence: claim.confidence,
    status: claim.status,
    statementKind: classifyClaimStatement(claim),
    chunkType: null,
    pageStart: null,
    pageEnd: null,
    sourceId: null,
    sourceTitle: null,
    metadata: { sourceChunkCount: claim.sourceChunkIds?.length ?? 0 },
  }));
}

function classifyClaimStatement(claim: {
  sourceChunkIds?: string[] | null;
  confidence: number;
  status: string;
}): "source_backed" | "inferred" | "generated" {
  if (
    (claim.sourceChunkIds ?? []).length > 0 &&
    ["accepted", "active", "published"].includes(claim.status) &&
    claim.confidence >= 0.45
  ) {
    return "source_backed";
  }
  if ((claim.sourceChunkIds ?? []).length > 0) return "inferred";
  return "generated";
}

export function sanitizeLearnerEvidenceRefs(refs: EvidenceRef[], devMode: boolean): EvidenceRef[] {
  if (devMode) return refs;
  return refs.map((ref) => {
    if (ref.kind !== "claim") return ref;
    return {
      ...ref,
      id: `evidence_${stableHash(ref.id)}`,
      confidence: null,
      status: null,
      metadata: {},
    };
  });
}

function stableHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
