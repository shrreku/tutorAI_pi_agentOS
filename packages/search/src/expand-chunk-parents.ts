import type { DbClient } from "@studyagent/db";
import { chunks } from "@studyagent/db";
import { inArray } from "drizzle-orm";
import type { UnifiedSearchResult } from "./rrf.js";

/**
 * For retrieval chunks with a parent structural chunk, prepend heading context (GF-0304).
 */
export async function expandRetrievalChunksWithParents(
  dbClient: DbClient,
  hits: UnifiedSearchResult[],
): Promise<UnifiedSearchResult[]> {
  const chunkHits = hits.filter((h) => h.type === "chunk");
  if (!chunkHits.length) {
    return hits;
  }

  const ids = [...new Set(chunkHits.map((h) => h.id))];
  const rows = await dbClient.db.select().from(chunks).where(inArray(chunks.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const parentIds = [...new Set(rows.map((r) => r.parentChunkId).filter(Boolean) as string[])];
  if (!parentIds.length) {
    return hits;
  }

  const parents = await dbClient.db.select().from(chunks).where(inArray(chunks.id, parentIds));
  const parentById = new Map(parents.map((p) => [p.id, p]));

  return hits.map((hit) => {
    if (hit.type !== "chunk") {
      return hit;
    }
    const row = byId.get(hit.id);
    if (!row?.parentChunkId) {
      return hit;
    }
    const p = parentById.get(row.parentChunkId);
    if (!p) {
      return hit;
    }
    const hp = (p.headingPath as string[])?.length ? (p.headingPath as string[]).join(" › ") : "";
    const prefix = hp ? `${hp}\n${p.text}` : p.text;
    const merged = `${prefix.trim()}\n---\n${hit.snippet}`.trim();
    const snippet = merged.length > 2000 ? `${merged.slice(0, 1997)}…` : merged;
    return {
      ...hit,
      snippet,
      scoreDetails: { ...hit.scoreDetails, parentExpanded: 1 },
    };
  });
}
