# Current Architecture Documentation

This directory contains only active design work and a routing map to current architectural sources. Historical implementation packets are archived under [`../archive/2026-h1/architecture/`](../archive/2026-h1/architecture/).

## Source Order

1. Use [`../../CONTEXT-MAP.md`](../../CONTEXT-MAP.md) and the relevant context glossary for domain language and ownership.
2. Use [`../adr/README.md`](../adr/README.md) for durable decisions and trade-offs.
3. Use code, shared schemas, migrations, and tests for current implemented behavior.
4. Use an active design document here only for a track whose decisions are still open.

## Active Design Tracks

- [Portable Knowledge Bundles](./portable-knowledge-bundles-implementation-plan.md) — design in progress.
- [Interactive Learning pipeline and authoring library](./interactive-learning-pipeline.md) — accepted design for implementation planning.
- [Interactive Learning implementation plan](./interactive-learning-pipeline-implementation-plan.md) — comprehensive build plan for MCP Apps, promotion, templates, choreography, and agents.
- [Interactive Learning implementation tickets](./interactive-learning-pipeline-implementation-tickets.md) — GitHub-ready local ticket packet; publish to GitHub Issues before assigning implementation work.

## Interactive Learning Baseline

- Product and trust boundary: [ADR-0020](../adr/0020-interactive-learning-surfaces-and-internal-mcp-app-bridge.md).
- Learner-facing frontend contract: [`../frontend/09-interactive-learning-and-mcp-apps.md`](../frontend/09-interactive-learning-and-mcp-apps.md).
- Shared block, action, template, and draft contracts: `packages/schemas/src/interactive-learning.ts`.
- API composition and action handling: `apps/api/src/interactive-learning-blocks.ts`, `apps/api/src/interactive-learning-actions.ts`, and `apps/api/src/interactive-learning-action-handlers/`.
- Current Folio renderer, bundle registry, and private bridge scaffold to replace with the official-protocol host: `apps/web/src/interactive-learning/`.
- Target package and template-source topology: [`interactive-learning-pipeline.md`](./interactive-learning-pipeline.md).

## Runtime Module Map

| Module                         | Primary implementation                         |
| ------------------------------ | ---------------------------------------------- |
| Tutor Turn                     | `apps/api/src/tutor-turn.ts`                   |
| Reference Surface              | `apps/api/src/reference-surface.ts`            |
| Source-to-LLM-Wiki Compilation | `packages/wiki-core/src/source-compilation.ts` |
| Workspace Read Model           | `apps/api/src/workspace-read-model.ts`         |
| Artifact Lifecycle             | `apps/api/src/artifact-lifecycle.ts`           |
| Graph Projection               | `packages/graph/src/graph-projection/`         |
| Tool Contract                  | `packages/tools/src/index.ts`                  |

Cross-module regression coverage starts at `apps/api/src/architecture-deepening.integration.test.ts`.

## Current Delivery Programs

- Folio frontend: [`../frontend/README.md`](../frontend/README.md), ADR-0027, ADR-0028, and ADR-0029.
- Hosted beta: [`../deployment/`](../deployment/), ADR-0022, ADR-0023, and ADR-0024.

Implementation work belongs in GitHub Issues. Local ticket packets in this directory are temporary publishing sources for active implementation programs and should be replaced by GitHub issue links once published.
