# ADR-0006: Postgres System Of Record, Neo4j Derived Projection

Status: Accepted

Date: 2026-05-15

## Context

StudyAgent needs transactional product truth and graph-native traversal. Current code stores notebooks, sources, chunks, concepts, claims, wiki pages, curricula, plans, artifacts, sessions, events, graph relations, and projection state in Postgres, while Neo4j is used as a graph query/projection layer.

## Decision

Postgres is the system of record for product state, including graph relation truth. Neo4j is a rebuildable derived projection used for graph traversal, graph queries, and Workspace read models.

Object storage owns original uploaded files and extracted/generated binary assets.

## Consequences

- Product writes remain auditable and transactional in Postgres.
- Neo4j projection jobs must use stable IDs and idempotent writes.
- Projection lag or failure must be observable but should not corrupt canonical state.
- Graph APIs should make clear whether they are returning canonical rows or projection read models.

## Current Implementation

- `packages/db/src/schema/index.ts` defines canonical tables, including `graphRelations`, `neo4jProjectionState`, and `neo4jSourceProjectionState`.
- `packages/graph/src/graph-projection/` loads canonical rows, builds/applies projection plans, supports rebuild, and records health/lag.
- `packages/graph/src/neo4j-projection.ts` contains Neo4j merge adapters used by the projection plan executor.
- `apps/worker/src/post-ingest-enrichment.ts` calls `projectGraphFromCanonical` and emits projection success/failure events without treating Neo4j as canonical truth.
- `packages/graph/src/canvas-projection.ts` normalizes Neo4j output into canvas-facing read models.
- `apps/api/src/routes/graph.ts` surfaces `readModel.projectionHealth` and learner-safe `projectionWarning` on graph queries.

## References

- `docs/contexts/knowledge-graph/CONTEXT.md`
- `greenfield-studyagent/docs/01-system-architecture.md`
- `greenfield-studyagent/docs/06-data-model-storage.md`
