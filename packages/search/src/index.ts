import type { UnifiedSearchHit } from "@studyagent/schemas";
import { buildScoreExplanation } from "./score-explanation.js";
import { collectSourceRefs } from "./wiki-search-mapper.js";

export { resolveOpenRouterEmbeddingModelId } from "./embedding-model.js";
export { embedTextsOpenRouter, type OpenRouterEmbedClientOptions, type EmbedTextsResult } from "./openrouter-embeddings.js";
export {
  lexicalSearchNotebook,
  vectorSearchNotebook,
  hybridSearchNotebook,
  type HybridSearchContext,
} from "./notebook-search.js";
export { graphKeywordSearchNotebook } from "./notebook-graph-search.js";
export { expandRetrievalChunksWithParents } from "./expand-chunk-parents.js";
export { assembleSearchContextForAgent, type AssembledAgentContext } from "./assemble-context.js";
export { buildScoreExplanation } from "./score-explanation.js";
export {
  unifiedSearchResultToWikiRow,
  unifiedSearchResultsToWikiRows,
  collectSourceRefs,
} from "./wiki-search-mapper.js";
export {
  reciprocalRankFusion,
  applyRrfRerankFactors,
  type RerankContext,
  type UnifiedSearchResult,
  type SearchResultType,
} from "./rrf.js";

export function rrfResultsToHits(results: import("./rrf.js").UnifiedSearchResult[]): UnifiedSearchHit[] {
  return results.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    snippet: r.snippet,
    score: r.score,
    scoreDetails: r.scoreDetails,
    provenance: r.provenance,
    scoreExplanation: buildScoreExplanation(r.scoreDetails),
    sourceRefs: collectSourceRefs(r),
  }));
}
