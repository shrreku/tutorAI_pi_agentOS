# ADR-0009: Search Owns Fused Retrieval Over Knowledge Objects

Status: Accepted

Date: 2026-05-15

## Context

Tutor context selection and notebook search need lexical, vector, graph, wiki, claim, concept, artifact, and source-span signals. Current code places ranking/fusion logic in `packages/search`, while API/runtime requests context through search-facing contracts and read tools.

## Decision

Search owns fused retrieval and ranking over Postgres knowledge objects. API/runtime may request context, selected-ref affinity, concept affinity, and parent chunk expansion, but ranking logic should remain in the search package.

## Consequences

- Retrieval quality can be tested and tuned in one package.
- Tutor routes avoid accumulating ad hoc SQL scoring logic.
- Search can evolve from Postgres FTS/pgvector toward other lexical or vector engines behind stable contracts.
- Search result explanations and citation refs remain part of the retrieval contract.

## Current Implementation

- `packages/search/src/notebook-search.ts` performs notebook search across lexical, vector, and graph signals.
- `packages/search/src/rrf.ts` performs reciprocal rank fusion and rerank factors.
- `packages/search/src/expand-chunk-parents.ts` expands chunk hits with parent heading context.
- `apps/api/src/tutor-tool-provider.ts` calls search for tutor context selection and wiki search tools.

## References

- `docs/contexts/knowledge-graph/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `greenfield-studyagent/docs/09-references-and-research.md`
