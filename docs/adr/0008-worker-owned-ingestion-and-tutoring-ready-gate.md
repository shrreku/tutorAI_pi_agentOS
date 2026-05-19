# ADR-0008: Worker-Owned Ingestion And Tutoring-Ready Gate

Status: Accepted

Date: 2026-05-15

## Context

Ingestion has deterministic, retryable stages: parse, normalize, chunk, index, embed, enrich, compile, and project. The API upload route persists source metadata and queues work, while worker code owns parsing/chunking/enrichment/indexing and readiness transitions.

## Decision

Keep low-level ingestion worker-owned. Pi may review, repair, refine curriculum/wiki, and crystallize sessions after structured evidence exists, but Pi does not own raw parsing, deterministic chunking, embedding writes, index writes, source-span persistence, or idempotent graph projection sync.

The ingestion pipeline should reach a minimum tutoring-ready gate before the first useful lesson: parsed text, retrievable chunks, source evidence, source summary, concept inventory, curriculum skeleton, current/next objectives, and visible warnings for incomplete quality.

## Consequences

- Ingestion remains cheaper, more reproducible, easier to retry, and easier to audit than an agent-driven parser.
- The API does not hide ingestion work inside request-time tutor calls.
- The tutor can start before the entire wiki is complete, but it must know which evidence/planning state is incomplete.
- Worker failures should emit events and preserve enough metadata for recovery.

## Current Implementation

- `apps/api/src/routes/sources.ts` handles source upload, object storage, source/source-version rows, events, and queueing.
- `packages/ingestion/src/*` defines parser adapters, normalized document nodes, and chunking.
- `apps/worker/src/index.ts` runs ingestion jobs.
- `apps/worker/src/post-ingest-enrichment.ts` orchestrates LLM extraction, wiki change-set compilation, and apply, then emits projection/readiness events.
- `packages/wiki-core/src/source-compilation.ts` and `apps/worker/src/wiki-change-set-persistence.ts` separate wiki semantics from worker queue orchestration.

## References

- `docs/contexts/knowledge-graph/CONTEXT.md`
- `greenfield-studyagent/docs/03-ingestion-indexing-pipeline.md`
- `greenfield-studyagent/docs/04-pi-agentic-harness.md`
