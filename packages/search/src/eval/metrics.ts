/** Recall@K: fraction of relevant ids appearing in the first K ranked ids (GF-0305). */
export function recallAtK(relevantIds: Set<string>, rankedIds: string[], k: number): number {
  if (relevantIds.size === 0) return 0;
  const top = rankedIds.slice(0, k);
  let hit = 0;
  for (const id of relevantIds) {
    if (top.includes(id)) hit += 1;
  }
  return hit / relevantIds.size;
}

/** Mean reciprocal rank of the first relevant hit (1-based rank). */
export function meanReciprocalRank(relevantIds: Set<string>, rankedIds: string[]): number {
  for (let i = 0; i < rankedIds.length; i += 1) {
    if (relevantIds.has(rankedIds[i]!)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Fraction of ranked items that carry at least one citation-like provenance ref
 * (chunk/source/source_version).
 */
export function citationCoverage(
  ranked: Array<{ provenance?: Array<{ refType: string }> }>,
): number {
  if (!ranked.length) return 0;
  const citeable = new Set(["chunk", "source", "source_version", "claim"]);
  let n = 0;
  for (const r of ranked) {
    const prov = r.provenance ?? [];
    if (prov.some((p) => citeable.has(p.refType))) n += 1;
  }
  return n / ranked.length;
}
