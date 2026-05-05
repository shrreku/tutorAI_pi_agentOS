import type { UnifiedSearchHit, WikiSearchResultRow } from "@studyagent/schemas";
import { buildScoreExplanation } from "./score-explanation.js";
import type { UnifiedSearchResult } from "./rrf.js";

export function collectSourceRefs(r: UnifiedSearchResult): UnifiedSearchHit["sourceRefs"] {
  let sourceId: string | undefined;
  let sourceVersionId: string | undefined;
  for (const p of r.provenance) {
    if (p.refType === "source") sourceId = p.refId;
    if (p.refType === "source_version") sourceVersionId = p.refId;
  }
  if (!sourceId) return undefined;
  return [{ sourceId, sourceVersionId }];
}

function resultTypeForWiki(r: UnifiedSearchResult): WikiSearchResultRow["resultType"] {
  if (r.type === "artifact") return "relation";
  if (r.type === "chunk") return "chunk";
  if (r.type === "claim") return "claim";
  if (r.type === "wiki_page") return "wiki_page";
  if (r.type === "concept") return "concept";
  return "relation";
}

function primaryRef(r: UnifiedSearchResult): { refType: string; refId: string } {
  return { refType: r.type, refId: r.id };
}

export function unifiedSearchResultToWikiRow(r: UnifiedSearchResult): WikiSearchResultRow {
  const ref = primaryRef(r);
  return {
    resultType: resultTypeForWiki(r),
    refType: ref.refType,
    refId: ref.refId,
    title: r.title,
    score: r.score,
    snippet: r.snippet,
    provenanceRefs: r.provenance.map((p) => ({ refType: p.refType, refId: p.refId })),
    sourceRefs: collectSourceRefs(r),
    scoreExplanation: buildScoreExplanation(r.scoreDetails),
  };
}

export function unifiedSearchResultsToWikiRows(results: UnifiedSearchResult[]): WikiSearchResultRow[] {
  return results.map(unifiedSearchResultToWikiRow);
}
