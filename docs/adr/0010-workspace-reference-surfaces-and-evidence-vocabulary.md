# ADR-0010: Workspace, Reference Surfaces, And Evidence Vocabulary

Status: Accepted

Date: 2026-05-15

## Context

The frontend and graph APIs now distinguish learner-facing product surfaces from raw backend graph objects. Current code has `WorkspaceViewMode`, learner visibility filters, `referenceSurfaceSchema`, `/nodes/:nodeId/reference-surface`, full-panel reference rendering, and an Evidence button/drawer.

## Decision

Learner-facing UI is organized around Workspace, Curriculum, Study Map, Source Wiki, Reference Surface, Live Plan, Artifact, and Evidence.

Raw backend objects such as claims, chunks, coverage records, objective lists, session-plan internals, teaching arcs, and draft artifacts should be hidden in learner mode unless they are transformed into useful reference surfaces or supporting notes. "Provenance" remains an internal lineage/audit term; the learner-facing trust layer is Evidence.

## Consequences

- Graph read models must filter, relabel, and progressively disclose backend nodes.
- `/reference-surface` is the preferred open-node API for learner surfaces.
- Dev Mode can expose raw/debug graph information without contaminating learner UX.
- UI copy should use product terms even where internal code still uses `Whiteboard` or `ProvenanceDrawer` component names.

## Current Implementation

- `packages/schemas/src/reference-surface.ts` defines public open-node surface shape.
- `apps/api/src/routes/graph.ts` serves `/notebooks/:notebookId/nodes/:nodeId/reference-surface` and curriculum outline read models.
- `apps/web/src/whiteboard-utils.ts` defines `WorkspaceViewMode`, learner visibility filters, label sanitization, density limiting, and source topic layers.
- `apps/web/src/FullPanelViewer.tsx` renders reference surfaces and labels the learner action as Evidence.
- `apps/web/src/ProvenanceDrawer.tsx` is still the internal component name for the Evidence drawer.

## References

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
- `greenfield-studyagent/docs/15-reference-surfaces-artifacts-workspace-contract.md`
