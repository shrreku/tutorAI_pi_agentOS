# StudyAgent Context Map

StudyAgent is a multi-context TypeScript monorepo. Before changing code, pick the context files that match the area you are touching and read them first.

## Contexts

| Context | Read When Working On | Context File |
| --- | --- | --- |
| Product Domain | Product vocabulary, user journeys, curriculum-first behavior, artifacts, Live Plan, Evidence, Workspace semantics | `docs/contexts/product-domain/CONTEXT.md` |
| API Runtime | Fastify routes, tutor chat, session lifecycle, Pi runtime, tool registry, event streams, reducers, DB-backed tutor writes | `docs/contexts/api-runtime/CONTEXT.md` |
| Web Workspace | React app, tutor panel, Study Map, Source Wiki, reference surfaces, artifact viewer, Evidence drawer, dev timeline | `docs/contexts/web-workspace/CONTEXT.md` |
| Knowledge Graph | Ingestion, source versions, chunks, wiki compilation, claims, search, embeddings, graph projection, Neo4j | `docs/contexts/knowledge-graph/CONTEXT.md` |

## How To Choose

- If a change touches learner-facing language or UX concepts, read Product Domain first.
- If a change touches tutor behavior, read Product Domain and API Runtime.
- If a change touches `apps/web`, read Web Workspace and Product Domain.
- If a change touches ingestion, search, wiki, graph, or worker jobs, read Knowledge Graph and Product Domain.
- If a change crosses route contracts or shared schemas, read API Runtime plus the consuming context.

## Architecture deepening modules

The implementation tickets in `docs/architecture/architecture-deepening-implementation-tickets.md` map to these runtime modules:

| Module | Primary code |
| --- | --- |
| Tutor Turn | `apps/api/src/tutor-turn.ts` |
| Reference Surface | `apps/api/src/reference-surface.ts` |
| Source-to-LLM-Wiki Compilation | `packages/wiki-core/src/source-compilation.ts` |
| Workspace Read Model | `apps/api/src/workspace-read-model.ts` |
| Artifact Lifecycle | `apps/api/src/artifact-lifecycle.ts` |
| Graph Projection | `packages/graph/src/graph-projection/` |
| Tool Contract | `packages/tools/src/index.ts` |

Cross-module regression: `apps/api/src/architecture-deepening.integration.test.ts`.

## Source Documents

The `greenfield-studyagent/` folder is the design record behind these contexts. Treat the context files as the short operational map, and use the greenfield docs for deeper product intent.
