# ADR-0002: Durable LLM Wiki Between Sources And Tutoring

Status: Accepted

Date: 2026-05-15

## Context

StudyAgent should not behave like generic RAG over chunks. The system already persists concepts, claims, graph relations, wiki pages, coverage records, and artifacts so learning can compound across sessions.

## Decision

Compile raw sources into a durable notebook LLM Wiki before and during tutoring. Tutor runs should read from and update this layer through typed tools instead of re-deriving all knowledge from chunks on every turn.

The wiki layer includes concepts, claims, wiki pages, relations, source evidence, confidence, contradiction/supersession state, coverage, and session crystallization outputs.

## Consequences

- The tutor can teach from stable notebook knowledge, not transient retrieval snippets alone.
- Claims and wiki pages need lifecycle rules for confidence, contradiction, supersession, decay, and human-preserved content.
- Generated pages and artifacts must carry evidence refs when source grounding is expected.
- Ingestion and enrichment jobs become product-critical, not background decoration.

## Current Implementation

- `packages/wiki-core/src/source-compilation.ts` compiles extraction output into a durable `WikiChangeSet` before any wiki writes (concepts, resolved claims, wiki pages, graph relations, evidence refs, warnings).
- `packages/wiki-core/src/claim-graph-resolution.ts` applies supersession, contradiction, and low-confidence rules during compilation.
- `packages/wiki-core/src/page-blocks.ts` preserves human-authored wiki regions across re-enrichment.
- `apps/worker/src/wiki-change-set-persistence.ts` applies the change set to Postgres; the worker does not embed wiki merge or claim-resolution logic.
- `apps/worker/src/post-ingest-enrichment.ts` orchestrates LLM extraction, compilation, change-set apply, coverage seeding, curriculum bootstrap, and Neo4j projection.
- `packages/search/src/*` searches across chunks, claims, concepts, wiki pages, and artifacts.

## References

- `docs/contexts/knowledge-graph/CONTEXT.md`
- `greenfield-studyagent/docs/02-llm-wiki-knowledge-plane.md`
- `greenfield-studyagent/README.md`
