/** Deterministic, human-readable score breakdown for fused retrieval (GF-0303). */
export function buildScoreExplanation(details: Record<string, number>): string {
  const fmt = (n: number, d: number) => n.toFixed(d);
  const parts: string[] = [];
  if (details.rrf != null) parts.push(`RRF ${fmt(details.rrf, 4)}`);
  if (details.lexical != null) parts.push(`lexical ${fmt(details.lexical, 3)}`);
  if (details.vectorSim != null) parts.push(`vector ${fmt(details.vectorSim, 3)}`);
  if (details.graphLexical != null) parts.push("graphLex");
  if (details.graphNeighbor != null) parts.push("graphNb");
  if (details.graphDepth != null) parts.push(`graphDepth ${fmt(details.graphDepth, 2)}`);
  if (details.confidence != null) parts.push(`confidence ${fmt(details.confidence, 2)}`);
  if (details.sourceSupport != null) parts.push(`sourceSupport ${fmt(details.sourceSupport, 2)}`);
  if (details.recency != null) parts.push(`recency ${fmt(details.recency, 2)}`);
  if (details.affinityMatch != null) parts.push(`affinity ${fmt(details.affinityMatch, 2)}`);
  if (details.parentExpanded != null) parts.push("parentCtx");
  if (details.rerankBump != null) parts.push(`rerank ${fmt(details.rerankBump, 4)}`);
  return parts.join(" · ") || "fused rank";
}
