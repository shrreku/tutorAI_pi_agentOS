import type { DbClient } from "@studyagent/db";
import { sql } from "drizzle-orm";
import { embedTextsOpenRouter, type OpenRouterEmbedClientOptions } from "./openrouter-embeddings.js";
import { graphKeywordSearchNotebook } from "./notebook-graph-search.js";
import { applyRrfRerankFactors, reciprocalRankFusion, type RerankContext, type UnifiedSearchResult } from "./rrf.js";

function recencyFromSourceUpdatedAt(iso: string | Date | null | undefined): number {
  if (!iso) return 0.55;
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const ageDays = (Date.now() - t) / 86_400_000;
  return 1 / (1 + ageDays / 120);
}

export type HybridSearchContext = {
  selectedNodeRefs?: Array<{ refType: string; refId: string }>;
  conceptIds?: string[];
};

function buildAffinityKeys(ctx?: HybridSearchContext): Set<string> | undefined {
  if (!ctx) return undefined;
  const s = new Set<string>();
  for (const r of ctx.selectedNodeRefs ?? []) {
    s.add(`${r.refType}:${r.refId}`);
  }
  for (const id of ctx.conceptIds ?? []) {
    s.add(`concept:${id}`);
  }
  return s.size ? s : undefined;
}

function vectorLiteral(embedding: number[]): string {
  if (!embedding.every((x) => Number.isFinite(x))) {
    throw new Error("Invalid embedding vector");
  }
  return `'[${embedding.join(",")}]'::vector`;
}

function chunkHit(row: {
  id: string;
  text: string;
  chunk_type: string;
  source_id: string;
  source_version_id: string;
  source_updated_at?: string | Date | null;
  scoreLex?: number | null;
  scoreVec?: number | null;
}): UnifiedSearchResult {
  const snippet = row.text.length > 280 ? `${row.text.slice(0, 277)}…` : row.text;
  return {
    id: row.id,
    type: "chunk",
    title: row.chunk_type === "retrieval" ? "Chunk" : "Structure",
    snippet,
    score: Number(row.scoreLex ?? row.scoreVec ?? 0),
    scoreDetails: {
      ...(row.scoreLex != null ? { lexical: Number(row.scoreLex) } : {}),
      ...(row.scoreVec != null ? { vectorSim: Number(row.scoreVec) } : {}),
      recency: recencyFromSourceUpdatedAt(row.source_updated_at ?? null),
      graphDepth: 0,
    },
    provenance: [
      { refType: "chunk", refId: row.id, role: "derived_from" },
      { refType: "source", refId: row.source_id, role: "supports" },
      { refType: "source_version", refId: row.source_version_id, role: "derived_from" },
    ],
  };
}

export async function lexicalSearchNotebook(
  dbClient: DbClient,
  notebookId: string,
  query: string,
  limit: number,
): Promise<UnifiedSearchResult[]> {
  const rows = await dbClient.db.execute(sql`
    SELECT c.id, c.text, c.chunk_type, s.id AS source_id, sv.id AS source_version_id,
      s.updated_at AS source_updated_at,
      ts_rank(to_tsvector('english', c.text), plainto_tsquery('english', ${query})) AS score_lex
    FROM chunks c
    INNER JOIN source_versions sv ON c.source_version_id = sv.id
    INNER JOIN sources s ON sv.source_id = s.id
    WHERE s.notebook_id = ${notebookId}
      AND c.chunk_type = 'retrieval'
      AND to_tsvector('english', c.text) @@ plainto_tsquery('english', ${query})
    ORDER BY score_lex DESC NULLS LAST
    LIMIT ${limit}
  `);

  const list = rows as unknown as Array<{
    id: string;
    text: string;
    chunk_type: string;
    source_id: string;
    source_version_id: string;
    source_updated_at: string | null;
    score_lex: number | null;
  }>;

  return list.map((r) =>
    chunkHit({
      id: r.id,
      text: r.text,
      chunk_type: r.chunk_type,
      source_id: r.source_id,
      source_version_id: r.source_version_id,
      source_updated_at: r.source_updated_at,
      scoreLex: r.score_lex,
    }),
  );
}

export async function vectorSearchNotebook(
  dbClient: DbClient,
  notebookId: string,
  queryEmbedding: number[],
  limit: number,
): Promise<UnifiedSearchResult[]> {
  const lit = vectorLiteral(queryEmbedding);
  const rows = await dbClient.db.execute(sql`
    SELECT c.id, c.text, c.chunk_type, s.id AS source_id, sv.id AS source_version_id,
      s.updated_at AS source_updated_at,
      (c.embedding <=> ${sql.raw(lit)})::float8 AS distance
    FROM chunks c
    INNER JOIN source_versions sv ON c.source_version_id = sv.id
    INNER JOIN sources s ON sv.source_id = s.id
    WHERE s.notebook_id = ${notebookId}
      AND c.chunk_type = 'retrieval'
      AND c.embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT ${limit}
  `);

  const list = rows as unknown as Array<{
    id: string;
    text: string;
    chunk_type: string;
    source_id: string;
    source_version_id: string;
    source_updated_at: string | null;
    distance: number;
  }>;

  return list.map((r) => {
    const sim = 1 / (1 + Number(r.distance));
    return chunkHit({
      id: r.id,
      text: r.text,
      chunk_type: r.chunk_type,
      source_id: r.source_id,
      source_version_id: r.source_version_id,
      source_updated_at: r.source_updated_at,
      scoreVec: sim,
    });
  });
}

export async function hybridSearchNotebook(
  dbClient: DbClient,
  notebookId: string,
  query: string,
  limit: number,
  embedOpts: OpenRouterEmbedClientOptions,
  hybridCtx?: HybridSearchContext,
): Promise<UnifiedSearchResult[]> {
  const third = Math.max(4, Math.ceil(limit / 3));
  const lexical = await lexicalSearchNotebook(dbClient, notebookId, query, third);
  const graph = await graphKeywordSearchNotebook(dbClient, notebookId, query, third);
  const { embeddings } = await embedTextsOpenRouter([query], embedOpts);
  const aff = buildAffinityKeys(hybridCtx);
  const rerankCtx: RerankContext | undefined = aff ? { affinityKeys: aff } : undefined;
  const qv = embeddings[0];
  if (!qv) {
    return applyRrfRerankFactors(reciprocalRankFusion([lexical, graph], 60), rerankCtx).slice(0, limit);
  }
  const vector = await vectorSearchNotebook(dbClient, notebookId, qv, third);
  return applyRrfRerankFactors(reciprocalRankFusion([lexical, vector, graph], 60), rerankCtx).slice(0, limit);
}
