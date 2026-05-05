/** Claim ids embedded in tutor or wiki text (`clm_<uuid>`). */
export function extractClaimIdsFromText(text: string): string[] {
  const re = /\bclm_[a-f0-9]+\b/gi;
  return [...new Set((text.match(re) ?? []).map((id) => id.toLowerCase()))];
}

export function normalizeClaimText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

export type ClaimLite = { id: string; sourceId: string; normalized: string; createdAtMs: number };

/** Pick pairs of claims on opposite sides of a concept-level contradicts edge (GF-0402). */
export function pickContradictionClaimPairs(input: {
  relations: Array<{ fromConceptId: string; toConceptId: string; relationType: string }>;
  claims: Array<{ id: string; conceptIds: string[] }>;
}): Array<{ a: string; b: string }> {
  const pairs: Array<{ a: string; b: string }> = [];
  const contradicts = input.relations.filter((r) => r.relationType === "contradicts");
  for (const r of contradicts) {
    const claimsA = input.claims.filter((c) => c.conceptIds.includes(r.fromConceptId));
    const claimsB = input.claims.filter((c) => c.conceptIds.includes(r.toConceptId));
    if (!claimsA.length || !claimsB.length) continue;
    const ca = claimsA[0]!;
    const cb = claimsB[0]!;
    if (ca.id !== cb.id) {
      pairs.push({ a: ca.id, b: cb.id });
    }
  }
  const seen = new Set<string>();
  const deduped: Array<{ a: string; b: string }> = [];
  for (const p of pairs) {
    const key = p.a < p.b ? `${p.a}:${p.b}` : `${p.b}:${p.a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }
  return deduped;
}

/**
 * For each new claim, if another notebook claim (different source) has the same normalized text,
 * the newer claim supersedes the older (GF-0402).
 */
export function planCrossSourceSupersessions(
  newClaims: ClaimLite[],
  existingClaims: ClaimLite[],
): Array<{ olderId: string; winnerId: string }> {
  const byNorm = new Map<string, ClaimLite[]>();
  for (const c of existingClaims) {
    const arr = byNorm.get(c.normalized) ?? [];
    arr.push(c);
    byNorm.set(c.normalized, arr);
  }

  const plans: Array<{ olderId: string; winnerId: string }> = [];
  for (const n of newClaims) {
    const bucket = byNorm.get(n.normalized);
    if (!bucket?.length) continue;
    for (const old of bucket) {
      if (old.sourceId === n.sourceId) continue;
      const winner = pickWinnerClaim(old, n);
      const loser = winner.id === old.id ? n : old;
      if (loser.id === winner.id) continue;
      plans.push({ olderId: loser.id, winnerId: winner.id });
    }
  }
  return dedupeSupersedeByLoser(plans);
}

function pickWinnerClaim(a: ClaimLite, b: ClaimLite): ClaimLite {
  if (a.createdAtMs !== b.createdAtMs) {
    return a.createdAtMs > b.createdAtMs ? a : b;
  }
  return a.id > b.id ? a : b;
}

/** One losing claim can only map to a single superseding winner. */
function dedupeSupersedeByLoser(plans: Array<{ olderId: string; winnerId: string }>) {
  const byLoser = new Map<string, string>();
  for (const p of plans) {
    const cur = byLoser.get(p.olderId);
    if (!cur || p.winnerId > cur) {
      byLoser.set(p.olderId, p.winnerId);
    }
  }
  return [...byLoser.entries()].map(([olderId, winnerId]) => ({ olderId, winnerId }));
}
