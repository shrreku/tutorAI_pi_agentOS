import type { ProvenanceRef } from "@studyagent/schemas";

export type SearchResultType = "chunk" | "claim" | "wiki_page" | "concept" | "artifact";

export type UnifiedSearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  snippet: string;
  score: number;
  scoreDetails: Record<string, number>;
  provenance: ProvenanceRef[];
};

export type RerankContext = {
  /** Keys like `concept:cnc_…` built from selected whiteboard / session refs. */
  affinityKeys?: Set<string>;
  affinityWeight?: number;
};

export function reciprocalRankFusion(resultLists: UnifiedSearchResult[][], k = 60): UnifiedSearchResult[] {
  const byId = new Map<string, UnifiedSearchResult>();
  const scores = new Map<string, number>();

  for (const results of resultLists) {
    results.forEach((result, index) => {
      byId.set(result.id, result);
      scores.set(result.id, (scores.get(result.id) ?? 0) + 1 / (k + index + 1));
    });
  }

  return [...byId.values()]
    .map((result) => {
      const rrf = scores.get(result.id) ?? result.score;
      return {
        ...result,
        score: rrf,
        scoreDetails: { ...result.scoreDetails, rrf },
      };
    })
    .sort((a, b) => b.score - a.score);
}

function affinityStrength(hit: UnifiedSearchResult, keys: Set<string> | undefined): number {
  if (!keys?.size) return 0;
  if (keys.has(`${hit.type}:${hit.id}`)) return 1;
  for (const p of hit.provenance) {
    if (keys.has(`${p.refType}:${p.refId}`)) return 0.78;
  }
  return 0;
}

/**
 * Deterministic rerank on top of RRF (GF-0303): confidence, source support, graph distance,
 * recency, lexical/vector channel, selected-node affinity.
 */
export function applyRrfRerankFactors(results: UnifiedSearchResult[], ctx?: RerankContext): UnifiedSearchResult[] {
  const affW = ctx?.affinityWeight ?? 0.09;
  const keys = ctx?.affinityKeys;
  return results
    .map((h) => {
      const conf = h.scoreDetails.confidence ?? 0;
      const graphBoost = (h.scoreDetails.graphLexical ?? 0) * 0.02 + (h.scoreDetails.graphNeighbor ?? 0) * 0.015;
      const lexVec = (h.scoreDetails.lexical ?? 0) * 0.01 + (h.scoreDetails.vectorSim ?? 0) * 0.01;
      const support = (h.scoreDetails.sourceSupport ?? 0) * 0.022;
      const recency = (h.scoreDetails.recency ?? 0) * 0.018;
      const depth = h.scoreDetails.graphDepth;
      const graphDistBoost = depth != null ? 0.04 / (1 + depth) : 0;
      const aff = affinityStrength(h, keys);
      const bump = conf * 0.025 + graphBoost + lexVec + support + recency + graphDistBoost + aff * affW;
      return {
        ...h,
        score: h.score + bump,
        scoreDetails: {
          ...h.scoreDetails,
          rerankBump: bump,
          affinityMatch: aff,
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}
