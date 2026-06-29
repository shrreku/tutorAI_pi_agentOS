# StudyAgent Context Map

StudyAgent is a multi-context TypeScript monorepo. Before changing code, pick the context files that match the area you are touching and read them first.

## Contexts

| Context         | Read When Working On                                                                                                      | Context File                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Product Domain  | Product vocabulary, user journeys, curriculum-first behavior, artifacts, Live Plan, Evidence, Workspace semantics         | `docs/contexts/product-domain/CONTEXT.md`  |
| API Runtime     | Fastify routes, tutor chat, session lifecycle, Pi runtime, tool registry, event streams, reducers, DB-backed tutor writes | `docs/contexts/api-runtime/CONTEXT.md`     |
| Web Workspace   | React app, tutor panel, Study Map, Source Wiki, reference surfaces, artifact viewer, Evidence drawer, dev timeline        | `docs/contexts/web-workspace/CONTEXT.md`   |
| Knowledge Graph | Ingestion, source versions, chunks, wiki compilation, claims, search, embeddings, graph projection, Neo4j                 | `docs/contexts/knowledge-graph/CONTEXT.md` |

## How To Choose

- If a change touches learner-facing language or UX concepts, read Product Domain first.
- If a change touches tutor behavior, read Product Domain and API Runtime.
- If a change touches `apps/web`, read Web Workspace and Product Domain.
- If a change touches ingestion, search, wiki, graph, or worker jobs, read Knowledge Graph and Product Domain.
- If a change crosses route contracts or shared schemas, read API Runtime plus the consuming context.

## Runtime Modules

The current architecture index maps the main runtime modules:

| Module                         | Primary code                                   |
| ------------------------------ | ---------------------------------------------- |
| Tutor Turn                     | `apps/api/src/tutor-turn.ts`                   |
| Reference Surface              | `apps/api/src/reference-surface.ts`            |
| Source-to-LLM-Wiki Compilation | `packages/wiki-core/src/source-compilation.ts` |
| Workspace Read Model           | `apps/api/src/workspace-read-model.ts`         |
| Artifact Lifecycle             | `apps/api/src/artifact-lifecycle.ts`           |
| Graph Projection               | `packages/graph/src/graph-projection/`         |
| Tool Contract                  | `packages/tools/src/index.ts`                  |

Cross-module regression: `apps/api/src/architecture-deepening.integration.test.ts`. See `docs/architecture/README.md` for current architecture routing.

## Interactive Learning Surfaces

The current baseline is tracked in:

- `docs/adr/0020-interactive-learning-surfaces-and-internal-mcp-app-bridge.md`
- `docs/frontend/09-interactive-learning-and-mcp-apps.md`
- `docs/architecture/README.md`

Read these when working on Interactive Learning Surfaces, Interactive Learning Blocks, the Internal MCP App Host, MCP App Bundles, Interactive Learning Actions, Simulation Templates, or Simulation Drafts.

## Folio Production Frontend

The complete Folio replacement architecture and delivery program are tracked in:

- `docs/adr/0027-folio-replaces-legacy-frontend.md`
- `docs/adr/0028-study-activity-intervals-separate-time-from-session-liveness.md`
- `docs/adr/0029-react-vite-tanstack-fastify-folio-foundation.md`
- `docs/frontend/14-folio-production-architecture.md`
- `docs/frontend/15-folio-end-to-end-implementation-plan.md`
- `docs/frontend/16-folio-ticket-drafts.md`

Read these before changing the production router, browser API client, Dashboard Summary, Notebook Workspace shell, Folio route coverage, Study Activity, or frontend cutover boundaries.

## Source Documents

Treat the context files as the short operational map, `PRODUCT.md` as product intent, ADRs as durable decisions, and current code/contracts as implemented truth. Historical design records live under `docs/archive/` and in Git history.
