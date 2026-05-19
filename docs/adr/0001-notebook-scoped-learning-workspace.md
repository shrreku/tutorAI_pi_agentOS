# ADR-0001: Notebook-Scoped Learning Workspace

Status: Accepted

Date: 2026-05-15

## Context

StudyAgent has grown beyond chat over uploaded sources. The current product and schema model use a notebook as the ownership and learning boundary for sources, wiki pages, concepts, claims, curricula, study plans, artifacts, tutor sessions, graph state, and events.

The code reflects this boundary across the Drizzle schema, API route ownership checks, graph/query APIs, event streams, and web routing.

## Decision

Use the notebook as the primary product and system boundary.

A notebook owns the learner's sources, compiled wiki, curriculum path, Live Plan, tutor sessions, learner state, generated artifacts, graph layout, and event log. Cross-notebook learning, source sharing, or curriculum sharing must be explicit future features rather than implicit joins across notebook state.

## Consequences

- Authorization and deletion can be reasoned about at notebook scope.
- Retrieval, graph projection, event sequencing, and tutor context selection are notebook-scoped by default.
- The UI can route around `/notebooks/:notebookId` and treat the notebook as the active workspace.
- Cross-notebook personalization will need a separate, intentional model instead of reaching through notebook-local tables.

## Current Implementation

- `packages/db/src/schema/index.ts` has notebook-scoped sources, concepts, curricula, objectives, study plans, claims, wiki pages, artifacts, sessions, events, and whiteboard state.
- `apps/api/src/routes/*` generally resolve an actor and verify notebook ownership before returning notebook resources.
- `CONTEXT-MAP.md` and `docs/contexts/product-domain/CONTEXT.md` document notebook-first product vocabulary.

## References

- `docs/contexts/product-domain/CONTEXT.md`
- `greenfield-studyagent/docs/00-product-vision.md`
- `greenfield-studyagent/docs/06-data-model-storage.md`
