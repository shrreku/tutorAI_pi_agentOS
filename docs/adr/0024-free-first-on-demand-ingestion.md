# ADR-0024: Free-First On-Demand Ingestion

Status: Accepted

Date: 2026-06-17

## Context

The hosted beta should minimize always-on infrastructure cost. StudyAgent's existing architecture already persists upload metadata and queues ingestion jobs durably in Postgres when Redis/BullMQ is absent. The worker owns parsing, chunking, indexing, embedding, enrichment, wiki compilation, readiness transitions, and projection work.

Running an always-on worker is convenient but not required for early product validation, especially when pre-ingested Published Study Templates are the default study path and Ingestion Access is gated.

## Decision

Use On-Demand Ingestion for the free-first hosted beta. Uploads from learners with Ingestion Access enqueue durable Postgres ingestion work and return quickly with learner-visible Ingestion Status. A protected Ingestion Trigger starts a one-shot worker run that claims ready ingestion jobs, processes bounded work, and exits. The Admin Console provides a fallback to trigger or retry worker runs when automatic triggering fails.

The frontend must show Ingestion Status clearly: queued, processing, ready to study, failed, and retry-needed. Learners get one self-serve retry for failed ingestion; after that, the source enters Ingestion Review for admin handling.

Multiple uploads may be queued. Launch Usage Guardrails are: five Personal Learner Workspaces per learner, ten queued Private Learner Sources per learner, one actively processing ingestion job per learner, 25 MB maximum file size, PDF/Markdown/plain text file types first, and admin override for trusted learners.

## Consequences

- The beta can offer real ingestion without paying for a continuously running worker.
- Ingestion becomes eventually processed rather than instant; the product must make queue and processing state visible.
- Postgres remains the durable queue and coordination layer, consistent with the existing architecture.
- The worker-owned ingestion boundary is preserved; ingestion is not hidden inside tutor request handling.
- Cold starts, provider trigger failures, and delayed processing become expected operational cases that need admin visibility.

## References

- `docs/adr/0008-worker-owned-ingestion-and-tutoring-ready-gate.md`
- `docs/adr/0018-postgres-first-agentic-coordination.md`
- `docs/contexts/product-domain/CONTEXT.md`
- `apps/api/src/routes/sources.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/ingestion-pipeline.ts`

