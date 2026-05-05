import type { DbClient } from "@studyagent/db";
import { claims, concepts, graphRelations } from "@studyagent/db";
import { and, eq, ilike, inArray, notInArray, or } from "drizzle-orm";
import type { UnifiedSearchResult } from "./rrf.js";

export async function graphKeywordSearchNotebook(
  dbClient: DbClient,
  notebookId: string,
  query: string,
  limit: number,
): Promise<UnifiedSearchResult[]> {
  const q = `%${query.trim()}%`;
  if (q === "%%") {
    return [];
  }

  const half = Math.max(2, Math.ceil(limit / 2));
  const conceptHits = await dbClient.db
    .select()
    .from(concepts)
    .where(and(eq(concepts.notebookId, notebookId), ilike(concepts.canonicalName, q)))
    .limit(half);

  const claimHits = await dbClient.db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.notebookId, notebookId),
        ilike(claims.claimText, q),
        notInArray(claims.status, ["superseded", "deprecated", "archived"]),
      ),
    )
    .limit(half);

  const results: UnifiedSearchResult[] = [];

  const recency = (d: Date | null | undefined): number => {
    if (!d) return 0.55;
    const ageDays = (Date.now() - d.getTime()) / 86_400_000;
    return 1 / (1 + ageDays / 90);
  };

  for (const c of conceptHits) {
    const conf = typeof c.confidence === "number" ? c.confidence : 0;
    results.push({
      id: c.id,
      type: "concept",
      title: c.canonicalName,
      snippet: (c.description ?? "").length > 280 ? `${(c.description ?? "").slice(0, 277)}…` : (c.description ?? ""),
      score: 0.48,
      scoreDetails: { graphLexical: 1, confidence: conf, graphDepth: 0, recency: recency(c.updatedAt ?? null) },
      provenance: [{ refType: "concept", refId: c.id, role: "derived_from" }],
    });
  }

  for (const cl of claimHits) {
    const snippet = cl.claimText.length > 280 ? `${cl.claimText.slice(0, 277)}…` : cl.claimText;
    const support = typeof cl.supportScore === "number" ? cl.supportScore : 0;
    const rw = typeof cl.retrievalWeight === "number" ? cl.retrievalWeight : 1;
    const conf = typeof cl.confidence === "number" ? cl.confidence : 0;
    results.push({
      id: cl.id,
      type: "claim",
      title: "Claim",
      snippet,
      score: 0.46,
      scoreDetails: {
        graphLexical: 1,
        confidence: conf * rw,
        sourceSupport: support,
        recency: recency(cl.updatedAt ?? null),
        graphDepth: 0,
      },
      provenance: [
        { refType: "claim", refId: cl.id, role: "supports" },
        { refType: "source", refId: cl.sourceId, role: "derived_from" },
      ],
    });
  }

  const seedIds = conceptHits.map((c) => c.id);
  if (seedIds.length) {
    const rels = await dbClient.db
      .select()
      .from(graphRelations)
      .where(
        and(
          eq(graphRelations.notebookId, notebookId),
          eq(graphRelations.sourceNodeType, "concept"),
          eq(graphRelations.targetNodeType, "concept"),
          or(inArray(graphRelations.sourceNodeId, seedIds), inArray(graphRelations.targetNodeId, seedIds)),
        ),
      )
      .limit(limit);

    const neighborIds = new Set<string>();
    for (const gr of rels) {
      const a = gr.sourceNodeId;
      const b = gr.targetNodeId;
      if (seedIds.includes(a) && !seedIds.includes(b)) {
        neighborIds.add(b);
      }
      if (seedIds.includes(b) && !seedIds.includes(a)) {
        neighborIds.add(a);
      }
    }

    if (neighborIds.size) {
      const neigh = await dbClient.db
        .select()
        .from(concepts)
        .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, [...neighborIds])));
      for (const c of neigh) {
        const conf = typeof c.confidence === "number" ? c.confidence : 0;
        results.push({
          id: c.id,
          type: "concept",
          title: c.canonicalName,
          snippet: `Related concept (${c.canonicalName})`,
          score: 0.35,
          scoreDetails: {
            graphNeighbor: 1,
            confidence: conf,
            graphDepth: 1,
            recency: recency(c.updatedAt ?? null),
          },
          provenance: [{ refType: "concept", refId: c.id, role: "supports" }],
        });
      }
    }
  }

  const seen = new Set<string>();
  const deduped: UnifiedSearchResult[] = [];
  for (const r of results.sort((a, b) => b.score - a.score)) {
    const key = `${r.type}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
    if (deduped.length >= limit) break;
  }
  return deduped;
}
