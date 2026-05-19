# Knowledge Graph Context

The knowledge/graph context owns the deterministic knowledge pipeline: source normalization, parsing, chunking, enrichment, wiki compilation, claim lifecycle, coverage extraction, search/indexing, graph relation persistence, and Neo4j projection.

This context turns uploaded sources into source-grounded knowledge objects that the tutor, Workspace, and search layer can trust.

## Owned Code

- `packages/ingestion/src/document-model.ts`: parser output shape and source-span model.
- `packages/ingestion/src/chunk-document.ts`: document tree to structure/retrieval chunks.
- `packages/ingestion/src/parsers/*`: parser adapters and source-type selection.
- `apps/worker/src/post-ingest-enrichment.ts`: LLM extraction orchestration, wiki change-set apply, coverage items, curriculum/module/objective/session bootstrap, Neo4j projection triggers.
- `apps/worker/src/wiki-change-set-persistence.ts`: applies `WikiChangeSet` rows to Postgres (concepts, claims, graph relations, wiki pages, events).
- `apps/worker/src/wiki-decay.ts`: stale retrieval decay for wiki/claim state.
- `packages/wiki-core/src/source-compilation.ts`: Source-to-LLM-Wiki Compilation Module (`compileSourceToWikiChangeSet`).
- `packages/wiki-core/src/wiki-change-set.ts`: durable wiki change-set types.
- `packages/wiki-core/src/claim-graph-resolution.ts`: claim supersession, contradiction, and confidence resolution during compilation.
- `packages/wiki-core/src/*`: human block preservation, concept lookup, confidence, claim resolver primitives, wiki lint, coverage extraction, teaching arcs.
- `packages/search/src/*`: lexical/vector/hybrid search, embeddings, reciprocal rank fusion, parent expansion, agent context assembly, eval metrics.
- `packages/graph/src/*`: Postgres-to-Neo4j projection, canvas projection, graph queries, traversals.
- `packages/graph/src/graph-projection/*`: Graph Projection Module — loads canonical Postgres rows, builds a deterministic projection plan, applies Neo4j merges, supports notebook/source rebuild, and records projection health.

## Knowledge Terms

Source: uploaded document metadata scoped to a notebook.

SourceVersion: parse attempt/version for a source; owns parser metadata, content hash, and `documentTreeJson`.

NormalizedDocumentNode: parser output node with type, text, source span, parent linkage, and metadata.

Chunk: persisted retrieval unit. `structure` chunks represent headings; `retrieval` chunks represent paragraphs, code, callouts, or lists.

SourceSpan: provenance coordinates including source/sourceVersion, characters/pages, and heading path.

Concept: canonical learner-facing idea, with aliases and confidence.

Claim: source-backed assertion tied to source/version/chunks and optionally concepts.

WikiPage: generated or human-augmented markdown page, usually `source_summary` or `concept`.

WikiChangeSet: reviewable compilation output for one source enrichment run. Contains concept upserts, resolved claims, wiki pages (with generated/human block metadata), graph relations, warnings, and append-only event payloads. Applied by the worker persistence adapter.

CoverageItem: pedagogical unit to teach/check, such as definition, formula, notation, procedure, or misconception.

CoverageRecord: placement/status of a coverage item in curriculum/objective/session context.

TeachingArc: ordered block plan for teaching an objective.

## Search Terms

UnifiedSearchResult: internal fused search hit across chunk, claim, concept, wiki page, and artifact.

UnifiedSearchHit: schema-facing search result with score explanation and source refs.

RRF: reciprocal rank fusion score added across lexical/vector/graph lists.

HybridSearchContext: selected Workspace/session refs and concept IDs used for affinity reranking.

ScoreExplanation: human-readable breakdown of ranking signals.

## Graph Terms

Graph node types include notebook, source, topic, curriculum, module, objective list, objective, study plan, session plan, concept, claim, wiki page, coverage item, and coverage record.

Graph relation types include `COVERS`, `CONTAINS`, `PLANS`, `HAS_TOPIC`, `CONTAINS_CONCEPT`, `CONTAINS_PAGE`, `DEPENDS_ON`, `CONTRADICTS`, `DERIVED_FROM`, `CITES`, `SUPERSEDES`, and `NEXT_OBJECTIVE`.

Topic: projected grouping from a source title, curriculum title, or heading path.

Canvas projection: UI-normalized graph nodes/edges from Neo4j records. Source Wiki topic nodes are projected in `packages/graph/src/canvas-projection.ts` and wrapped by the Workspace Read Model in `apps/api/src/workspace-read-model.ts`.

## Lifecycles

Parser selection: `markdown`, `text`, `html`, `pdf`, and `binary` source types route through ingestion adapters. PDFs use LlamaParse when configured, otherwise a development warning callout.

Parse output: bytes become parser output, parser output becomes `documentTreeJson` on `source_versions`, the document tree becomes chunks, chunks are indexed, and post-ingest enrichment can run.

Wiki enrichment: LLM extraction returns concepts, claims, relations, and source summary. The worker loads prior wiki pages and cross-source claims, then `compileSourceToWikiChangeSet` produces a reviewable `WikiChangeSet` (concepts, resolved claims, wiki pages with generated/human blocks, graph relations, warnings). `applyWikiChangeSet` persists the change set: source claims and source-scoped graph relations are replaced; human blocks are preserved via compilation merge, not in the persistence adapter. For large sources, background enrichment progressively polishes high-value topic and concept pages after the minimum tutoring-ready gate; tutor-triggered repair may improve missing or weak pages without blocking normal tutoring.

Claim lifecycle: new claims start as `candidate`. Duplicate cross-source normalized claims supersede older claims. Contradiction relations can mark claims `contradicted`. Stale non-terminal claims decay retrieval weight after 14 days.

Coverage lifecycle: pattern extractors identify item families from chunks. Optional LLM refinement adjusts family labels. Items and records are attached to objectives and session plans.

Search lifecycle: worker writes `fts_vector` for all chunks in a source version and embeddings for retrieval chunks when `OPENROUTER_API_KEY` is available. `hybridSearchNotebook` splits requested limit across lexical, graph keyword, and vector channels. Results are fused, reranked, optionally parent-expanded, then assembled into agent context with citation handles.

Graph lifecycle: enrichment writes Postgres `graph_relations` for concept-concept, claim supersession, and claim contradiction edges. If Neo4j config exists, post-ingest enrichment calls `projectGraphFromCanonical` (source scope, rebuild) which reloads canonical rows and replays the projection plan; it no longer assembles Neo4j merge order inline. Projection health is stored in `neo4j_projection_state` (notebook) and `neo4j_source_projection_state` (per source). `rebuildNotebookProjection` / `rebuildSourceProjection` can repair derived graph state without rerunning LLM enrichment. Projection failures update health metadata and emit `graph.neo4j_projection.failed` but do not fail enrichment.

## Persistence Boundaries

Postgres is the durable source of truth for sources, source versions, chunks, concepts, claims, wiki pages, coverage, curriculum, study plans, and graph relation rows.

LlamaParse raw JSON is not persisted on the wiki path; normalized markdown/document tree is persisted.

Wiki page markdown is persisted in `wiki_pages`; human-owned blocks survive regeneration via comment markers.

Lexical and vector indexes live on `chunks` rows in Postgres.

Search reads concepts, claims, graph relations, chunks, source versions, and sources from Postgres. Search does not write knowledge objects.

Neo4j is a derived projection/cache of notebook graph state. Canvas graph responses are read models, not source-of-truth writes.

## Invariants

- Every persisted chunk belongs to exactly one `sourceVersionId`.
- Retrieval chunks should retain source provenance through `sourceSpanJson`, `headingPath`, source/sourceVersion provenance, and optional parent structure chunk.
- Source-scoped enrichment is idempotent-ish by deleting old claims for the source and deleting graph relations tagged with `metadataJson.ingestionSourceId`. Recompilation with unchanged extraction and human blocks yields the same change-set `fingerprint`.
- Concept dedupe is notebook-scoped and uses normalized canonical names plus aliases, including singularized variants.
- Claims must not cite arbitrary chunk IDs; invalid or missing `evidenceChunkId` falls back to the first input chunk.
- Human wiki blocks must use `<!-- studyagent:owner=human id="..." -->` and `<!-- studyagent:end -->` markers to survive generated page rewrites.
- Confidence is bounded to `[0, 1]` and composed from explainable components.
- Supersession only crosses sources; same-source duplicate replacement is handled by deleting source claims before reinserting.
- Vector literals reject non-finite numbers before SQL interpolation.
- Vector embeddings are expected to match configured dimensions when dimensions are provided.
- Search excludes claims with `superseded`, `deprecated`, or `archived` statuses.
- Parent expansion only applies to chunk hits and only when the parent structure chunk exists.
- Agent context assembly dedupes by `type:id` and stops at `maxChars`.
- Citation coverage is expected via provenance refs such as `chunk`, `source`, `source_version`, or `claim`.
- All graph writes are notebook-scoped; match clauses require both endpoints to share `notebookId`.
- Neo4j projection uses `MERGE`, so node IDs must be stable for repeated projection.
- Concept relation types are normalized before persistence/projection; unsupported relation names are dropped or mapped to supported forms.
- Canvas edges are filtered out if either endpoint node is missing.
- Raw Neo4j integer values are converted to safe JS numbers or strings before returning to callers.
- Projection failure emits `graph.neo4j_projection.failed` and does not prevent wiki lint or successful enrichment return.

## Tests That Reveal Behavior

- `packages/ingestion/src/ingestion.test.ts`
- `packages/wiki-core/src/source-compilation.test.ts`
- `packages/wiki-core/src/claim-graph-resolution.test.ts`
- `packages/wiki-core/src/wiki-lifecycle.test.ts`
- `packages/wiki-core/src/coverage-extraction.test.ts`
- `packages/wiki-core/src/teaching-arc.test.ts`
- `packages/search/src/search.test.ts`
- `packages/search/src/eval/eval.test.ts`
- `packages/graph/src/canvas-projection.test.ts`
- `packages/graph/src/graph-projection.test.ts`
- `packages/graph/src/graph-projection-rebuild.test.ts`
- `apps/worker/src/post-ingest-enrichment.test.ts`
- `apps/api/src/architecture-deepening.integration.test.ts`
