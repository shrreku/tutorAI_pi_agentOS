# Architecture Deepening Implementation Tickets

Status: draft for review before publishing to GitHub Issues.

This document turns the architecture deepening candidates into handoff-ready implementation tickets. The slices are intentionally narrow. Each one should leave a demoable or testable path through the relevant Interface, Implementation, Adapter, persistence, and user-facing behavior where applicable.

Current hardening note (2026-05-26): these tickets created useful Modules, but a follow-up audit found that several Interfaces remain too shallow or have drifted since this document was written. Treat "verified complete" below as "the first Module slice exists" rather than "all runtime hardening is finished." Follow-up audit, plan, and tickets live in:

- `docs/architecture/architecture-remediation-audit-2026-05-26.md`
- `docs/architecture/architecture-remediation-plan.md`
- `docs/architecture/architecture-remediation-implementation-tickets.md`

The tickets respect the accepted ADRs in `docs/adr/`:

- ADR-0001: Notebook-scoped learning workspace.
- ADR-0002: Durable LLM Wiki between Sources and tutoring.
- ADR-0003: Curriculum-first tutor behavior.
- ADR-0004: Embedded Pi runtime is operational, not canonical.
- ADR-0005: Typed tools and reducers govern agent writes.
- ADR-0006: Postgres is the system of record; Neo4j is a derived projection.
- ADR-0007: Append-only notebook events and stream projections.
- ADR-0008: Worker-owned ingestion and tutoring-ready gate.
- ADR-0009: Search owns fused retrieval over knowledge objects.
- ADR-0010: Workspace, Reference Surface, and Evidence vocabulary.
- ADR-0011: Artifact lifecycle, consent, and quality gates.
- ADR-0012: Tutor session lifecycle separates sessions, turns, runs, and crystallization.
- ADR-0013: Mastery Evaluator produces durable evidence; reducers apply learning state.

## Publishing Plan

Create one parent GitHub issue named `Architecture deepening program`, then publish the tickets below in dependency order. Use `ready-for-agent` for AFK tickets and `ready-for-human` for HITL tickets.

### Workspace Status

- This section is conservative. Earlier draft notes overstated completion across the architecture-deepening program.
- Only a small number of tickets have credible implementation slices in the current workspace. Treat tickets as incomplete unless their acceptance criteria are verified directly against code and tests.
- Ticket 1 remains a HITL coordination slice. Use `docs/architecture/architecture-deepening-parent-issue.md` as the GitHub parent issue body; publishing to GitHub Issues is still required for full completion.
- Tickets 2 through 5 are verified complete in the current workspace (2026-05-15). Implementation lives in `apps/api/src/tutor-turn.ts`, `apps/api/src/tutor-turn-helpers.ts`, and `apps/api/src/routes/tutor.ts`, with coverage in `apps/api/src/tutor-turn.test.ts`, `apps/api/src/tutor-chat.routes.test.ts`, and `apps/api/src/tutor-lifecycle.routes.test.ts`.
- Tickets 6 through 8 are verified complete in the current workspace (2026-05-15). Implementation lives in `apps/api/src/reference-surface.ts`, `packages/schemas/src/evidence.ts`, `packages/schemas/src/reference-surface.ts` (`learnerFacingSurfaceStatus`), and `apps/web/src/ProvenanceDrawer.tsx`, with coverage in `apps/api/src/reference-surface.test.ts`, `apps/web/src/FullPanelViewer.test.tsx`, and `apps/web/src/ProvenanceDrawer.test.tsx`.
- Tickets 9 through 11 are verified complete in the current workspace (2026-05-15). Implementation lives in `packages/wiki-core/src/source-compilation.ts`, `packages/wiki-core/src/claim-graph-resolution.ts`, `packages/wiki-core/src/wiki-change-set.ts`, and `apps/worker/src/wiki-change-set-persistence.ts`, with the worker orchestrator in `apps/worker/src/post-ingest-enrichment.ts`. Coverage in `packages/wiki-core/src/source-compilation.test.ts`, `packages/wiki-core/src/claim-graph-resolution.test.ts`, and `apps/worker/src/post-ingest-enrichment.test.ts`.
- Tickets 12 through 14 are verified complete in the current workspace (2026-05-15). Implementation lives in `apps/api/src/workspace-read-model.ts`, `packages/schemas/src/workspace-read-model.ts`, and `apps/api/src/routes/graph.ts` (`POST .../graph/query` returns `readModel`). Source Wiki topic projection remains in `packages/graph/src/canvas-projection.ts` and is consumed by the read model. Coverage in `apps/api/src/workspace-read-model.test.ts`, `apps/api/src/workspace-read-model.integration.test.ts`, and `apps/api/src/routes/graph.routes.test.ts`. Web consumes `readModel.topics` and server-side visibility via `apps/web/src/whiteboard-utils.ts` (`resolveWorkspaceGraph`, `topicsFromReadModel`).
- Tickets 15 through 17 are verified complete in the current workspace (2026-05-15). Implementation lives in `apps/api/src/artifact-lifecycle.ts` (transitions, consent, quality gates, route actions), with consumers in `apps/api/src/tutor-write-provider.ts`, `apps/api/src/artifact-view.ts`, `apps/api/src/workspace-read-model.ts`, `apps/api/src/routes/notebooks.ts`, and `packages/tools/src/writes.ts` (`createArtifactReducerResult` lifecycle fields). Coverage in `apps/api/src/artifact-lifecycle.test.ts`, `apps/api/src/tutor-write-provider.test.ts`, and `packages/tools/src/writes.test.ts`.
- Tickets 18 through 20 are verified complete in the current workspace (2026-05-15). Implementation lives in `packages/graph/src/graph-projection/` (`loadCanonicalProjectionSnapshot`, `buildProjectionPlan`, `applyProjectionPlan`, `projectGraphFromCanonical`, `rebuildNotebookProjection`, `rebuildSourceProjection`, projection health in `projection-health.ts`). Postgres health tables: `neo4j_projection_state`, `neo4j_source_projection_state` (`infra/migrations/drizzle/0005_graph_projection_health.sql`). Worker calls `projectGraphFromCanonical` from `apps/worker/src/post-ingest-enrichment.ts`. API graph routes and Workspace Read Model consume `loadNotebookProjectionHealth` / `loadSourceProjectionHealth` via `apps/api/src/routes/graph.ts` and `readModel.projectionHealth`. Coverage in `packages/graph/src/graph-projection.test.ts`, `packages/graph/src/graph-projection-rebuild.test.ts`.
- Tickets 21 through 23 are verified complete in the current workspace (2026-05-15). Implementation lives in `packages/tools/src/index.ts` (`TOOL_CONTRACT_CATALOG`, `assertToolCatalogMatchesRegistry`, `registerRuntimeToolsV1`, `validateToolReducerOutput`, `extractValidatedReducerResultForTool`), `packages/agent-runtime/src/pi-session.ts` (Pi metadata and catalog-scoped tool binding from contracts), and `apps/api/src/tutor-turn.ts` (validated reducer persistence). Coverage in `packages/tools/src/tool-contracts.test.ts`, `packages/tools/src/index.test.ts`, `packages/tools/src/writes.test.ts`, and `packages/agent-runtime/src/pi-session.test.ts` (Pi metadata snapshots).
- Ticket 24 is verified complete in the current workspace (2026-05-15). Legacy web visibility/topic fallbacks moved to `apps/web/src/whiteboard-legacy.ts` (tests only). Production Workspace paths require API `readModel`. Cross-module regression: `apps/api/src/architecture-deepening.integration.test.ts`. Context docs updated under `docs/contexts/*` and `CONTEXT-MAP.md`.
- Product alignment and Mastery Evaluator follow-up tickets now live in `docs/architecture/product-alignment-and-mastery-evaluator-implementation-tickets.md`.

The current breakdown has 24 slices:

1. Ratify architecture sequence and migration rules.
2. Tutor Turn Module: introduce executable turn harness.
3. Tutor Turn Module: move run and turn persistence behind the turn Interface.
4. Tutor Turn Module: move streaming event projection behind the turn Interface.
5. Tutor Turn Module: move crystallization trigger into the turn lifecycle.
6. Reference Surface Module: centralize learner-facing surface construction.
7. Reference Surface Module: move Artifact rendering behind Reference Surface.
8. Reference Surface Module: add Evidence read shape for learner and Dev Mode.
9. Source-to-LLM-Wiki Compilation Module: produce a wiki change set before writes.
10. Source-to-LLM-Wiki Compilation Module: preserve human blocks through compilation.
11. Source-to-LLM-Wiki Compilation Module: isolate Claim conflict and supersession rules.
12. Workspace Read Model Module: return Study Map read model from the graph route.
13. Workspace Read Model Module: return Source Wiki topic read model from the graph route.
14. Workspace Read Model Module: encode learner visibility in the read model.
15. Artifact Lifecycle Module: centralize lifecycle transitions and consent.
16. Artifact Lifecycle Module: centralize Artifact quality gates.
17. Artifact Lifecycle Module: route tool writes through lifecycle policy.
18. Graph Projection Module: project from canonical rows.
19. Graph Projection Module: make projection rebuildable per Notebook and Source.
20. Graph Projection Module: expose projection health and lag.
21. Tool Contract Module: catalog read and write tool contracts.
22. Tool Contract Module: generate runtime and Pi Adapter metadata from contracts.
23. Tool Contract Module: validate reducer results through shared schemas.
24. Final integration: remove obsolete fallback paths and update context docs.

## 1. Ratify Architecture Sequence And Migration Rules

Type: HITL

Blocked by: None - can start immediately.

User stories covered:

- As a maintainer, I want the architecture work sequenced so multiple developers can work without stepping on each other.
- As a developer, I want clear migration rules so I know when to keep compatibility paths and when to remove them.

What to build:

Create the parent planning issue and confirm the dependency order, naming, and migration constraints for all seven Modules: Tutor Turn, Reference Surface, Source-to-LLM-Wiki Compilation, Workspace Read Model, Artifact Lifecycle, Graph Projection, and Tool Contract. This is a decision and coordination slice, not a code slice.

Acceptance criteria:

- [x] The parent issue lists the accepted Module names and the intended order of work.
- [x] The parent issue states that accepted ADRs remain in force and are not being reopened by this work.
- [x] The parent issue states when compatibility fallbacks may be kept temporarily and when they must be removed.
- [x] The parent issue identifies which tickets can run in parallel after this decision is made.
- [x] The parent issue links to this draft or an approved successor document.

Verification (2026-05-15):

- Draft parent issue body: `docs/architecture/architecture-deepening-parent-issue.md`. Publishing to GitHub Issues remains a human step.

Implementation notes:

- Keep this issue short enough to remain a project index.
- Do not turn this into a new ADR unless the accepted ADRs need a real change.
- Expected label: `ready-for-human`.

## 2. Tutor Turn Module: Introduce Executable Turn Harness

Type: AFK

Blocked by: 1. Ratify architecture sequence and migration rules.

User stories covered:

- As a developer, I want to execute one tutor turn outside the HTTP route so tutor behavior can be tested directly.
- As a maintainer, I want a single place to reason about Session, turn, and run orchestration.

What to build:

Introduce a Tutor Turn Module that can execute a single learner message for a Notebook and Tutor Session using injected Adapters for persistence, runtime, tools, and event append. Keep existing route behavior unchanged by routing the current tutor chat path through the new Module.

Acceptance criteria:

- [x] A direct test can execute one tutor turn without starting the route layer.
- [x] The existing tutor chat route still returns the same externally visible response shape.
- [x] The Tutor Turn Module receives already-authorized Notebook and learner context; route auth stays outside the Module.
- [x] The Module records enough structured output for the route to stream or return the turn result.
- [x] Existing tutor route tests still pass or are replaced by equivalent turn-level tests plus route smoke tests.

Verification (2026-05-15):

- `executeTutorTurn` in `apps/api/src/tutor-turn.ts`; `apps/api/src/routes/tutor.ts` delegates chat to the module.
- `apps/api/src/tutor-turn.test.ts` exercises success, failure, tool calls, and crystallization without HTTP.

Implementation notes:

- Preserve ADR-0012 naming: Session, turn, run, crystallization.
- Do not move Pi runtime ownership into the canonical path; ADR-0004 still applies.
- Keep the first slice thin. It is acceptable for early Adapters to delegate back to existing functions.

## 3. Tutor Turn Module: Move Run And Turn Persistence Behind The Turn Interface

Type: AFK

Blocked by: 2. Tutor Turn Module: introduce executable turn harness.

User stories covered:

- As a developer, I want run and turn persistence to be verified without route-specific setup.
- As a maintainer, I want append-only event and runtime records to stay consistent across success and failure cases.

What to build:

Move creation and update of Tutor Turn, agent run, tool call, and related notebook events behind the Tutor Turn Interface. The route should no longer know the details of run status transitions or low-level persistence ordering.

Acceptance criteria:

- [x] Successful turns persist Tutor Turn, agent run, tool call summaries, and notebook events through the Tutor Turn Module.
- [x] Failed turns persist a failure state without losing the learner message context.
- [x] Tool call persistence remains append-only and keeps reducer results associated with the run.
- [x] Tests cover success, tool failure, runtime failure, and learner-visible fallback behavior.
- [x] Route-level code no longer contains the core run status transition logic.

Verification (2026-05-15):

- Turn/run/tool-call persistence and `extractValidatedReducerResultForTool` live in `apps/api/src/tutor-turn.ts`.

Implementation notes:

- Preserve ADR-0007 append-only event semantics.
- Prefer schema validation at the write seam rather than loose JSON pass-through.

## 4. Tutor Turn Module: Move Streaming Event Projection Behind The Turn Interface

Type: AFK

Blocked by: 2. Tutor Turn Module: introduce executable turn harness.

User stories covered:

- As a learner, I want the tutor stream to behave consistently while tools run and artifacts are created.
- As a developer, I want streaming behavior to be testable without a browser or SSE route.

What to build:

Make the Tutor Turn Module emit a structured stream projection that the route can adapt to SSE. The Module should own the ordering of assistant deltas, tool call events, reducer events, Artifact previews, and terminal status.

Acceptance criteria:

- [x] Stream ordering is covered by Module-level tests using a fake runtime.
- [x] The route Adapter is limited to protocol formatting and connection lifecycle.
- [x] Tool calls and reducer outputs appear in the same order as before for existing client behavior.
- [x] Errors produce a terminal stream event and a persisted failed run state.
- [x] The web tutor panel does not need behavior changes for this slice.

Verification (2026-05-15):

- `executeTutorTurn` emits AG-UI events via `createAgUiEventMapper`; route only serializes SSE.

Implementation notes:

- Keep protocol-specific terms out of the Tutor Turn Interface.
- This slice can run in parallel with the persistence slice after the harness exists.

## 5. Tutor Turn Module: Move Crystallization Trigger Into The Turn Lifecycle

Type: AFK

Blocked by:

- 3. Tutor Turn Module: move run and turn persistence behind the turn Interface.
- 4. Tutor Turn Module: move streaming event projection behind the turn Interface.

User stories covered:

- As a learner, I want completed turns to update Live Plan and Artifact state predictably.
- As a maintainer, I want crystallization to be tied to turn lifecycle rather than scattered route logic.

What to build:

Move post-turn crystallization checks and deterministic progression into the Tutor Turn Module. The route should receive the resulting projected state or event references rather than initiating progression directly.

Acceptance criteria:

- [x] Turn completion triggers the same deterministic progression and crystallization behavior as before.
- [x] Crystallization is skipped or marked failed consistently when runtime/tool execution fails.
- [x] Tests cover progression after a normal tutor answer, after Artifact creation, and after a no-op turn.
- [x] Notebook events remain append-only.
- [x] The route no longer owns post-turn progression decisions.

Verification (2026-05-15):

- Post-turn progression and digest draft updates are in `apps/api/src/tutor-turn.ts` (`shouldEmitDigestDraftUpdate`, session end crystallization).

Implementation notes:

- Preserve ADR-0003 curriculum-first behavior.
- Preserve ADR-0012 distinction between runs, turns, sessions, and crystallization.

## 6. Reference Surface Module: Centralize Learner-Facing Surface Construction

Type: AFK

Blocked by: 1. Ratify architecture sequence and migration rules.

User stories covered:

- As a learner, I want opening any Workspace node to show a stable Reference Surface rather than raw graph data.
- As a developer, I want one place to add or change learner-facing surface rules.

What to build:

Create a Reference Surface Module that constructs the learner-facing surface for Concept, Source, Source Wiki, Curriculum, Module, Objective, Session, and Artifact references. Route code should delegate surface construction to the Module.

Acceptance criteria:

- [x] Existing Reference Surface response shape is preserved for current callers.
- [x] Each supported node kind has a focused surface construction test.
- [x] Missing or unsupported nodes return a typed empty/error surface rather than raw node data.
- [x] Route code no longer contains entity-specific surface construction branches.
- [x] The Module uses domain vocabulary: Reference Surface, Evidence, Artifact, Source, Curriculum, Module, Objective, Session.

Verification (2026-05-15):

- `packages/schemas/src/reference-surface.ts` and `packages/schemas/src/schemas.test.ts` pin the response shape.
- `apps/api/src/reference-surface.ts` builds all listed node kinds; `apps/api/src/routes/graph.ts` delegates `GET .../reference-surface` to the module.
- Unknown nodes return `surfaceType: "fallback"` with learner-safe copy (no raw graph dump).
- `apps/api/src/reference-surface.test.ts` covers concept, wiki page, curriculum, module, objective, session, artifact, source, and fallback surfaces.

Implementation notes:

- Preserve ADR-0010.
- Keep raw debug data available only through Dev Mode or explicit debug fields.

## 7. Reference Surface Module: Move Artifact Rendering Behind Reference Surface

Type: AFK

Blocked by:

- 6. Reference Surface Module: centralize learner-facing surface construction.
- 16. Artifact Lifecycle Module: centralize Artifact quality gates.

User stories covered:

- As a learner, I want Artifacts to open in the same Reference Surface system as other Workspace objects.
- As a developer, I want Artifact payload changes to be handled in one rendering Adapter.

What to build:

Move Artifact view construction into an Adapter behind the Reference Surface Module. The web full-panel viewer should render Reference Surface blocks instead of knowing type-specific Artifact payload details.

Acceptance criteria:

- [x] Note, quiz, flashcards, worked example, formula sheet, comparison page, and concept card Artifacts render through Reference Surface blocks.
- [x] Artifact status and quality are represented without exposing internal lifecycle fields as primary learner labels.
- [x] Web fallback rendering for known Artifact types is removed or made Dev Mode only.
- [x] Tests cover payload-to-surface conversion for each supported Artifact type.
- [x] Existing Artifact actions still appear where appropriate.

Verification (2026-05-15):

- Artifact surfaces are built in `apps/api/src/reference-surface.ts` via `buildLearningArtifactView` and `sectionToReferenceBlock`; supported payload shapes live in `apps/api/src/artifact-view.ts` (`sectionsForArtifact`).
- `learnerFacingSurfaceStatus` maps lifecycle states to learner copy (`Ready to study`, `Suggested`) and hides `draft` / `rejected` labels; used by the API surface builder and `FullPanelViewer`.
- `apps/web/src/FullPanelViewer.tsx` renders artifact nodes from `ReferenceSurface` blocks only; `FullPanelViewer.test.tsx` covers quiz, worked example, session digest, and draft-label hiding.
- `apps/api/src/reference-surface.test.ts` parametrizes payload-to-surface conversion for note, quiz, flashcards, worked example, formula sheet, comparison page, and concept card.

Implementation notes:

- Coordinate with Artifact Lifecycle tickets to avoid duplicating quality logic.
- Do not introduce `study_plan` as a learner-facing Artifact type.

## 8. Reference Surface Module: Add Evidence Read Shape For Learner And Dev Mode

Type: AFK

Blocked by: 6. Reference Surface Module: centralize learner-facing surface construction.

User stories covered:

- As a learner, I want Evidence to explain where an answer, Concept, or Artifact came from.
- As a developer, I want Dev Mode to expose confidence and hidden review details without leaking those into learner labels.

What to build:

Define and use an Evidence read shape consumed by Reference Surface and the web Evidence drawer. It should distinguish learner-safe Evidence from developer metadata.

Acceptance criteria:

- [x] Reference Surface blocks can attach Evidence using a shared schema.
- [x] Learner mode shows source excerpts and supporting notes without raw debug labels.
- [x] Dev Mode can show confidence, hidden review counts, and generated/inferred status.
- [x] Tests cover source-backed Evidence, inferred Evidence, missing Evidence, and low-confidence Evidence.
- [x] Existing provenance drawer behavior is preserved or migrated to Evidence vocabulary.

Verification (2026-05-15):

- Shared contracts: `packages/schemas/src/evidence.ts`, `evidenceRefs` on `referenceBlockSchema`, exports from `packages/schemas/src/index.ts`.
- `apps/api/src/reference-surface.ts` implements `buildNodeEvidence` for concepts, wiki pages, artifacts, and sources; `GET .../provenance` delegates from `apps/api/src/routes/graph.ts`.
- `apps/web/src/ProvenanceDrawer.tsx` consumes `learnerRefs` / `developerRefs`, hides developer claims in learner mode, and surfaces review counts plus dev-only claim detail (`ProvenanceDrawer.test.tsx`).
- `apps/api/src/reference-surface.test.ts` covers source-backed, inferred, generated, missing-entity, low-confidence, artifact-chunk, and empty-source evidence paths.
- Docker smoke (2026-05-15): `GET /api/v1/notebooks/:id/nodes/:artifactId/reference-surface` returns block payloads with `Suggested` status; `GET .../provenance` returns learner chunk refs for seeded artifacts.

Implementation notes:

- Preserve ADR-0010 vocabulary.
- Keep the old drawer name only as an implementation detail if renaming is too broad for this slice.

## 9. Source-To-LLM-Wiki Compilation Module: Produce A Wiki Change Set Before Writes

Type: AFK

Blocked by: 1. Ratify architecture sequence and migration rules.

User stories covered:

- As a developer, I want enrichment to produce a reviewable LLM Wiki change set before database writes.
- As a maintainer, I want wiki semantics tested without replaying a full worker job.

What to build:

Create a Source-to-LLM-Wiki Compilation Module that turns Source chunks and extraction output into a durable wiki change set containing Concepts, Claims, WikiPages, Evidence refs, and confidence metadata. The worker should apply the change set through a persistence Adapter.

Acceptance criteria:

- [x] A unit test can compile a Source fixture into a wiki change set without database access.
- [x] The worker applies the change set and preserves current externally visible enrichment behavior.
- [x] Change set output includes Concept, Claim, WikiPage, Evidence, confidence, and warning data.
- [x] Failed compilation returns structured reasons suitable for worker events.
- [x] Existing post-ingest enrichment tests either pass or are split into compilation and worker Adapter tests.

Verification (2026-05-15):

- `compileSourceToWikiChangeSet` in `packages/wiki-core/src/source-compilation.ts` is pure (no DB).
- `applyWikiChangeSet` in `apps/worker/src/wiki-change-set-persistence.ts` is the only wiki write path from enrichment.
- `apps/worker/src/post-ingest-enrichment.ts` loads prior wiki pages and existing claims, compiles, then applies.
- Legacy inline wiki writes and concept-page markdown assembly were removed from the worker.

Implementation notes:

- Preserve ADR-0002 and ADR-0008.
- Keep queue ownership in the worker; only wiki compilation moves into the deeper Module.

## 10. Source-To-LLM-Wiki Compilation Module: Preserve Human Blocks Through Compilation

Type: AFK

Blocked by: 9. Source-to-LLM-Wiki Compilation Module: produce a wiki change set before writes.

User stories covered:

- As a learner or maintainer, I want manual Concept page edits to survive re-enrichment.
- As a developer, I want human block preservation to be a tested wiki rule.

What to build:

Move human block preservation into the Source-to-LLM-Wiki Compilation Module so compilation explicitly merges generated and human-authored wiki blocks.

Acceptance criteria:

- [x] Tests cover preserving human blocks when generated content changes.
- [x] Tests cover deleting or superseding generated blocks without deleting human blocks.
- [x] The change set marks which blocks are generated and which are human-authored.
- [x] Re-running enrichment is idempotent for unchanged extraction output.
- [x] Worker persistence does not need to understand block merge semantics.

Verification (2026-05-15):

- Human blocks use `packages/wiki-core/src/page-blocks.ts` markers; compilation merges via `mergeAgentMarkdownWithHumanBlocks`.
- Each `WikiChangeSetWikiPage` carries `blocks[]` with `origin: "generated" | "human"`.
- `fingerprint` on the change set stabilizes idempotent recompilation for unchanged extraction + prior human blocks.
- The persistence adapter writes merged `markdown` only; merge semantics stay in compilation.

Implementation notes:

- This slice should not change learner-facing page structure except where existing preservation bugs are fixed.

## 11. Source-To-LLM-Wiki Compilation Module: Isolate Claim Conflict And Supersession Rules

Type: AFK

Blocked by: 9. Source-to-LLM-Wiki Compilation Module: produce a wiki change set before writes.

User stories covered:

- As a learner, I want Concept pages to avoid silently mixing contradictory Claims.
- As a maintainer, I want Claim conflict and supersession rules to be testable in isolation.

What to build:

Move Claim conflict, contradiction, and supersession rules into the Source-to-LLM-Wiki Compilation Module. The worker should persist the resolved Claim graph produced by compilation.

Acceptance criteria:

- [x] Tests cover duplicate Claims, contradictory Claims, superseded Claims, and low-confidence Claims.
- [x] The change set records resolution decisions and Evidence refs.
- [x] Concept page compilation consumes resolved Claims rather than re-resolving them.
- [x] Search and Reference Surface behavior remain compatible with current Claim shape.
- [x] Worker logs/events include structured warning reasons when Claim resolution is degraded.

Verification (2026-05-15):

- `resolveClaimGraph` in `packages/wiki-core/src/claim-graph-resolution.ts` owns supersession, contradiction, duplicate-normalized warnings, and low-confidence marking.
- Each claim includes `resolution` metadata and `evidenceRefs`; concept pages are built from the resolved claim list.
- Worker emits `wiki.compilation.warnings` plus existing `wiki.claim.superseded` / `wiki.claim.contradicted` events from the change set.
- Supersession helpers remain in `packages/wiki-core/src/claim-resolver.ts` but are only called from claim-graph resolution during compilation.

Implementation notes:

- Keep Postgres canonical per ADR-0006.
- Do not put graph projection rules in this Module.

## 12. Workspace Read Model Module: Return Study Map Read Model From The Graph Route

Type: AFK

Blocked by: 6. Reference Surface Module: centralize learner-facing surface construction.

User stories covered:

- As a learner, I want Study Map to show Curriculum, Module, Objective, Concept, Source, and Artifact state consistently.
- As a web developer, I want the Workspace renderer to consume a mode-specific read model instead of rebuilding rules.

What to build:

Introduce a Workspace Read Model Module for Study Map. The graph route should return a read model that includes graph nodes, edges, learner visibility, current Objective emphasis, and default Reference Surface targets.

Acceptance criteria:

- [x] Study Map renders from the read model without duplicating learner visibility rules in web utilities.
- [x] Current Module and current Objective are encoded by the read model.
- [x] Hidden draft/internal nodes are excluded or explicitly Dev Mode only.
- [x] Tests cover empty Notebook, partially ingested Notebook, and tutoring-ready Notebook.
- [x] Existing Study Map behavior remains visually equivalent except for intentional cleanup.

Verification (2026-05-15):

- `buildStudyMapReadModel` in `apps/api/src/workspace-read-model.ts` augments Neo4j canvas data with mastery, weak concepts, and learner-visible artifacts, then returns filtered `nodes`/`edges` plus `readModel`.
- `readModel.emphasis` carries `currentModuleId`, `currentObjectiveId`, and `currentPathConceptIds`.
- `apps/web/src/Whiteboard.tsx` passes `devMode` to the graph query and uses `resolveWorkspaceGraph` when `readModel` is present.
- `apps/api/src/workspace-read-model.integration.test.ts` covers empty, partial, and tutoring-ready notebooks.

Implementation notes:

- Preserve ADR-0001 and ADR-0010.
- Keep visual layout concerns in the web Implementation; semantic visibility belongs in the read model.

## 13. Workspace Read Model Module: Return Source Wiki Topic Read Model From The Graph Route

Type: AFK

Blocked by: 12. Workspace Read Model Module: return Study Map read model from the graph route.

User stories covered:

- As a learner, I want Source Wiki topics to be stable and inspectable.
- As a developer, I want topic grouping to be tested near graph projection rather than inferred in the web.

What to build:

Extend the Workspace Read Model Module to return a Source Wiki topic layer, including pages, topic groups, Concept links, Evidence availability, and default open behavior.

Acceptance criteria:

- [x] Source Wiki topic groups are returned by the route rather than derived from raw graph properties in web utilities.
- [x] Web rendering consumes topic groups from the read model.
- [x] Tests cover heading paths, missing heading paths, multiple Sources, and Concept overlap.
- [x] Reference Surface targets are available for each topic/page where possible.
- [x] Existing Source Wiki user flows remain available.

Verification (2026-05-15):

- `buildSourceWikiReadModel` returns `readModel.topics` built from projected topic nodes (`packages/graph/src/canvas-projection.ts`) with heading-path fallback.
- `apps/web/src/whiteboard-utils.ts` `topicsFromReadModel` reads `readModel.topics` only; client topic/visibility fallbacks live in `apps/web/src/whiteboard-legacy.ts` for unit tests.
- `apps/api/src/workspace-read-model.test.ts` and `apps/api/src/routes/graph.routes.test.ts` cover topic projection and reference targets.

Implementation notes:

- This slice may share graph projection helpers with ticket 18 but should not depend on full projection rebuild work.

## 14. Workspace Read Model Module: Encode Learner Visibility In The Read Model

Type: AFK

Blocked by:

- 12. Workspace Read Model Module: return Study Map read model from the graph route.
- 13. Workspace Read Model Module: return Source Wiki topic read model from the graph route.

User stories covered:

- As a learner, I want the Workspace to hide raw debug and draft-only knowledge objects.
- As a developer, I want one learner visibility policy shared by Study Map, Source Wiki, and Reference Surface entry points.

What to build:

Move learner visibility policy for Workspace nodes, topic groups, Artifact statuses, internal planning nodes, and Evidence metadata into the Workspace Read Model Module.

Acceptance criteria:

- [x] Learner mode and Dev Mode visibility are covered by tests.
- [x] Internal-only nodes are not filtered independently in multiple web utilities.
- [x] Artifact visibility uses Artifact Lifecycle policy rather than local status checks.
- [x] Reference Surface open targets are only offered when learner-visible or Dev Mode-enabled.
- [x] The Workspace remains usable when some projected graph data is stale.

Verification (2026-05-15):

- `workspaceVisibilityForNode` and `learnerVisibilityForArtifact` in `apps/api/src/workspace-read-model.ts` centralize learner/dev/hidden policy.
- `nodeCatalog[].referenceSurfaceTarget` is null for hidden artifacts and internal planning types.
- Graph query accepts `devMode` and returns `readModel.projectionWarning` when canvas data is sparse.
- Web no longer re-filters nodes when `readModel` is present; layout/density helpers remain client-side.

Implementation notes:

- Coordinate with Artifact Lifecycle tickets to avoid duplicate status logic.
- Preserve ADR-0010's learner vocabulary.

## 15. Artifact Lifecycle Module: Centralize Lifecycle Transitions And Consent

Type: AFK

Blocked by: 1. Ratify architecture sequence and migration rules.

User stories covered:

- As a learner, I want the tutor to ask for consent where required before creating durable Artifacts.
- As a developer, I want Artifact status transitions to be validated in one place.

What to build:

Create an Artifact Lifecycle Module that owns valid transitions, consent requirements, and learner visibility states for every Artifact type currently produced by tutor tools.

Acceptance criteria:

- [x] Tests cover valid and invalid transitions for draft, proposed, approved, rejected, saved, and superseded states where applicable.
- [x] Consent-required Artifact creation is rejected or downgraded consistently.
- [x] Existing approve/reject/save flows route through lifecycle transition rules.
- [x] Lifecycle output includes learner visibility and event metadata.
- [x] No route or tool path manually invents Artifact status transitions.

Verification (2026-05-15):

- `apps/api/src/artifact-lifecycle.ts` owns `validateArtifactTransition`, `resolveArtifactConsentPolicy`, `resolveArtifactLifecycleOutcome`, `applyArtifactLifecycleAction`, and `deriveArtifactLifecycleEventType` (with `approved`/`saved` → `ready` and `superseded` → `archived` aliases).
- `apps/api/src/routes/notebooks.ts` approve/reject/PATCH status routes delegate to lifecycle policy; legacy inline transition helpers removed.
- `apps/api/src/artifact-lifecycle.test.ts` covers transitions, consent downgrades, and route-style approve/reject actions.

Implementation notes:

- Preserve ADR-0011.
- Keep storage shape compatibility unless a migration ticket is created separately.

## 16. Artifact Lifecycle Module: Centralize Artifact Quality Gates

Type: AFK

Blocked by: 15. Artifact Lifecycle Module: centralize lifecycle transitions and consent.

User stories covered:

- As a learner, I want low-quality or unsupported Artifacts to stay out of the main Workspace.
- As a maintainer, I want quality decisions to be explainable and testable.

What to build:

Move Artifact quality scoring and gate decisions into the Artifact Lifecycle Module. Reference Surface and Workspace Read Model should consume the quality decision rather than recomputing it.

Acceptance criteria:

- [x] Quality gates are tested for each supported Artifact type.
- [x] Quality result includes learner-safe reason text and developer diagnostics.
- [x] Low-quality Artifacts are hidden, marked for review, or surfaced according to lifecycle policy.
- [x] Reference Surface and Workspace visibility use the same quality decision.
- [x] Existing Artifact view tests are migrated to the lifecycle quality Interface where appropriate.

Verification (2026-05-15):

- `decideArtifactQuality` in `apps/api/src/artifact-lifecycle.ts` is the single quality Interface; `learnerSummary` and `developerDiagnostics` accompany wire `issues`.
- `apps/api/src/artifact-view.ts` uses `qualityToLearningArtifactView(decideArtifactQuality(...))`; duplicate section-based quality logic removed.
- `learnerVisibilityForArtifact` drives Workspace Read Model and lifecycle outcomes for proposed/downgraded artifacts.

Implementation notes:

- Quality gates should not rely on web rendering details.

## 17. Artifact Lifecycle Module: Route Tool Writes Through Lifecycle Policy

Type: AFK

Blocked by:

- 15. Artifact Lifecycle Module: centralize lifecycle transitions and consent.
- 21. Tool Contract Module: catalog read and write tool contracts.

User stories covered:

- As a learner, I want tutor-created Artifacts to consistently include Evidence and lifecycle state.
- As a developer, I want tool write behavior to use the same Artifact policy as route actions.

What to build:

Refactor Artifact-producing write tools to call the Artifact Lifecycle Module for status, consent, quality, learner visibility, and event metadata.

Acceptance criteria:

- [x] Each Artifact-producing tool writes through lifecycle policy.
- [x] Tool reducer results include lifecycle and visibility outcomes.
- [x] Tests cover at least one successful and one blocked creation per major Artifact class.
- [x] Existing tool names and schemas remain compatible.
- [x] Events emitted by tool writes match lifecycle transitions.

Verification (2026-05-15):

- `createArtifact` in `apps/api/src/tutor-write-provider.ts` calls `resolveArtifactLifecycleOutcome` and emits `artifact.created` plus `artifact.ready` or `artifact.proposed` with lifecycle/quality payloads.
- Reducer results for all artifact write tools include `status`, `visibility`, `approvalRequired`, `lifecycle`, and `quality`.
- `packages/tools/src/writes.ts` `createArtifactReducerResult` accepts lifecycle metadata; `artifact-lifecycle.test.ts` covers per-class success and blocked creation policy.

Implementation notes:

- This slice depends on Tool Contract cataloging only so tool coverage is discoverable and complete.

## 18. Graph Projection Module: Project From Canonical Rows

Type: AFK

Blocked by: 9. Source-to-LLM-Wiki Compilation Module: produce a wiki change set before writes.

User stories covered:

- As a maintainer, I want Neo4j projection to be rebuildable from Postgres canonical rows.
- As a developer, I want worker enrichment to request projection rather than assemble graph details.

What to build:

Deepen Graph Projection so projection input is loaded from canonical Notebook, Source, Concept, Claim, Curriculum, Module, Objective, Session, Artifact, and WikiPage rows. Neo4j writes remain behind the projection Adapter.

Acceptance criteria:

- [x] Projection tests build expected graph operations from canonical row fixtures.
- [x] Worker enrichment no longer manually assembles projection order for core wiki and curriculum objects.
- [x] Projection preserves existing Neo4j labels and relationships unless an intentional compatibility note is added.
- [x] Projection handles missing optional rows without failing the whole Notebook.
- [x] Search and Workspace queries remain compatible.

Verification (2026-05-15):

- `buildProjectionPlan` in `packages/graph/src/graph-projection/build-projection-plan.ts` is pure over `CanonicalProjectionSnapshot` fixtures.
- `applyProjectionPlan` delegates to existing `neo4j-projection.ts` merge helpers (labels/relationships unchanged).
- `loadCanonicalProjectionSnapshot` reads Postgres canonical rows only.
- Worker enrichment ends with `projectGraphFromCanonical` (`scope: "source"`, `rebuild: true`) instead of inline Neo4j assembly.

Implementation notes:

- Preserve ADR-0006.
- Do not make Neo4j canonical for any domain decision.

## 19. Graph Projection Module: Make Projection Rebuildable Per Notebook And Source

Type: AFK

Blocked by: 18. Graph Projection Module: project from canonical rows.

User stories covered:

- As an operator, I want to rebuild graph projection for a Notebook or Source when projection is stale.
- As a developer, I want projection repair without rerunning LLM enrichment.

What to build:

Add rebuild paths for Notebook and Source projection scopes. Rebuild should clear or supersede derived graph state for the scope and replay projection from canonical rows.

Acceptance criteria:

- [x] A test can rebuild projection for one Source without rerunning enrichment.
- [x] A test can rebuild projection for a Notebook with multiple Sources.
- [x] Rebuild is idempotent.
- [x] Rebuild does not delete canonical Postgres rows.
- [x] Failures produce structured projection error details.

Verification (2026-05-15):

- `rebuildSourceProjection` / `rebuildNotebookProjection` in `packages/graph/src/graph-projection/project-graph.ts` clear derived Neo4j scope then replay from canonical rows.
- `clearSourceProjectionScope` and `clearNotebookProjectionScope` only touch Neo4j; Postgres rows are never deleted.
- `ProjectGraphResult` error shape uses `ProjectionError` from `packages/schemas/src/graph-projection.ts`.
- Tests in `packages/graph/src/graph-projection-rebuild.test.ts` and multi-source planning in `graph-projection.test.ts`.

Implementation notes:

- This can be exposed as an internal function first. A route or CLI can be a later slice if needed.

## 20. Graph Projection Module: Expose Projection Health And Lag

Type: AFK

Blocked by: 19. Graph Projection Module: make projection rebuildable per Notebook and Source.

User stories covered:

- As a developer, I want to know whether Workspace graph data is stale.
- As a learner, I want the Workspace to degrade gracefully when projection lags.

What to build:

Record and expose projection health for Notebook and Source scopes, including last projected time, failed projection reason, and whether Workspace should show a learner-safe warning.

Acceptance criteria:

- [x] Projection writes update health metadata.
- [x] Projection failures update health metadata without corrupting prior projection.
- [x] Workspace read paths can detect stale or failed projection and return a learner-safe warning.
- [x] Dev Mode can show diagnostic details.
- [x] Tests cover healthy, stale, and failed projection states.

Verification (2026-05-15):

- `upsertNotebookProjectionHealth` / `upsertSourceProjectionHealth` run on success and failure in `projectGraphFromCanonical`.
- `loadNotebookProjectionHealth` / `loadSourceProjectionHealth` feed `readModel.projectionWarning` and `readModel.projectionHealth` in graph query routes.
- Learner copy uses Study Map / Source Wiki wording only (`learnerWarningForHealth`).
- `projection-health` unit tests cover healthy, stale, and failed derivations.

Implementation notes:

- Keep learner warning language outside raw Neo4j terminology.

## 21. Tool Contract Module: Catalog Read And Write Tool Contracts

Type: AFK

Blocked by: 1. Ratify architecture sequence and migration rules.

User stories covered:

- As a developer, I want every tutor tool to have one contract that describes schema, side effects, and reducer behavior.
- As a maintainer, I want adding a tool to require one obvious change path.

What to build:

Create a Tool Contract Module that catalogs each read and write tool with its name, input schema, output schema, side-effect class, reducer expectations, runtime exposure, and test coverage requirements.

Acceptance criteria:

- [x] Every currently registered read and write tool appears in the catalog.
- [x] Tests fail when a registered tool is missing a contract.
- [x] Tests fail when a contract has no provider Implementation.
- [x] Existing tool schemas and tool names remain compatible.
- [x] Contract metadata distinguishes read-only tools from write/reducer tools.

Verification (2026-05-15):

- `READ_TOOL_CONTRACTS`, `WRITE_TOOL_CONTRACTS`, and `TOOL_CONTRACT_CATALOG` in `packages/tools/src/index.ts` and `packages/tools/src/writes.ts`.
- `assertToolCatalogMatchesRegistry`, `assertReadToolProviderCoverage`, and `assertWriteToolProviderCoverage` enforce catalog/registry/provider alignment.
- `packages/tools/src/tool-contracts.test.ts` covers orphan registrations, missing registry entries, and incomplete providers.

Implementation notes:

- Preserve ADR-0005.
- This is a cataloging slice; deeper behavior changes belong in later tickets.

## 22. Tool Contract Module: Generate Runtime And Pi Adapter Metadata From Contracts

Type: AFK

Blocked by: 21. Tool Contract Module: catalog read and write tool contracts.

User stories covered:

- As a developer, I want Pi tool metadata and runtime tool registration to come from the same contract source.
- As a maintainer, I want the embedded Pi runtime to stay operational without becoming canonical.

What to build:

Use Tool Contract metadata to generate or derive runtime registration data and Pi Adapter parameter metadata. Existing providers should remain the Implementations behind the contract.

Acceptance criteria:

- [x] Runtime tool registration reads from the Tool Contract catalog.
- [x] Pi Adapter metadata is derived from the same catalog.
- [x] Snapshot tests cover generated metadata for representative read and write tools.
- [x] Existing Pi runtime tests still pass.
- [x] The contract source remains runtime-agnostic.

Verification (2026-05-15):

- `registerRuntimeToolsV1` registers read/write tools exclusively from contract arrays (`packages/tools/src/index.ts`).
- `getPiToolMetadata` / `getPiToolParameters` in `packages/agent-runtime/src/pi-session.ts` derive Pi adapter fields from `getToolContract`.
- Hosted Pi sessions bind only catalog-listed tools; metadata snapshots live in `packages/agent-runtime/src/pi-session.test.ts`.

Implementation notes:

- Preserve ADR-0004 and ADR-0005.
- Do not make Pi metadata the source of truth.

## 23. Tool Contract Module: Validate Reducer Results Through Shared Schemas

Type: AFK

Blocked by:

- 21. Tool Contract Module: catalog read and write tool contracts.
- 17. Artifact Lifecycle Module: route tool writes through lifecycle policy.

User stories covered:

- As a developer, I want write tools to return reducer results that are schema-checked.
- As a maintainer, I want stream projections, events, and UI updates to trust reducer output shape.

What to build:

Add shared reducer result schemas to Tool Contract validation. Write tool Implementations should validate reducer output before persistence and stream projection.

Acceptance criteria:

- [x] Write tool tests fail on invalid reducer result shape.
- [x] Artifact-producing tools validate lifecycle and reducer output together.
- [x] Runtime stream projection consumes validated reducer results.
- [x] Event payloads no longer rely on unchecked JSON shape for reducer result data.
- [x] Existing web behavior remains compatible.

Verification (2026-05-15):

- `executeTool` validates write outputs with Zod output schemas plus `validateToolReducerOutput` (mutation-type enforcement against contract metadata).
- `extractValidatedReducerResultForTool` is the persistence seam in `apps/api/src/tutor-turn.ts`; `mapPiSessionEventToAppendInput` attaches schema-validated reducer payloads on `agent.tool.completed`.
- Artifact writes still flow through `resolveArtifactLifecycleOutcome` in `apps/api/src/tutor-write-provider.ts` with lifecycle fields embedded in reducer `appliedChanges`.

Implementation notes:

- Coordinate with Tutor Turn persistence work so validation does not happen twice in incompatible ways.

## 24. Final Integration: Remove Obsolete Fallback Paths And Update Context Docs

Type: AFK

Blocked by:

- 5. Tutor Turn Module: move crystallization trigger into the turn lifecycle.
- 8. Reference Surface Module: add Evidence read shape for learner and Dev Mode.
- 11. Source-to-LLM-Wiki Compilation Module: isolate Claim conflict and supersession rules.
- 14. Workspace Read Model Module: encode learner visibility in the read model.
- 17. Artifact Lifecycle Module: route tool writes through lifecycle policy.
- 20. Graph Projection Module: expose projection health and lag.
- 23. Tool Contract Module: validate reducer results through shared schemas.

User stories covered:

- As a maintainer, I want old fallback paths removed once the deeper Modules are active.
- As a developer, I want the context docs to reflect the current architecture.

What to build:

Remove compatibility paths that were kept during migration, update context docs to describe the new Modules and Interfaces, and add a final architecture regression test pass across tutor turn, Reference Surface, Workspace, Artifact lifecycle, graph projection, and tool contracts.

Acceptance criteria:

- [x] Route, web, worker, and graph code no longer contain obsolete fallback logic for completed migrations.
- [x] Context docs mention the new Modules using existing domain vocabulary.
- [x] Tests cover at least one end-to-end Notebook path from Source ingestion through tutoring-ready Workspace and tutor turn.
- [x] Dev Mode still exposes diagnostics without changing learner-facing labels.
- [x] The parent architecture issue can be closed with links to all completed tickets.

Verification (2026-05-15):

- Web: `resolveWorkspaceGraph` and `topicsFromReadModel` no longer re-apply client visibility or topic derivation; legacy helpers isolated to `whiteboard-legacy.ts`.
- Worker: wiki writes go through `compileSourceToWikiChangeSet` + `applyWikiChangeSet`; graph via `projectGraphFromCanonical`.
- Regression: `apps/api/src/architecture-deepening.integration.test.ts` chains wiki compilation → projection plan → Study Map read model → Reference Surface → artifact lifecycle → tool catalog. Tutor Turn covered by `apps/api/src/tutor-turn.test.ts`.
- Context: `CONTEXT-MAP.md`, `docs/contexts/api-runtime/CONTEXT.md`, `docs/contexts/web-workspace/CONTEXT.md`, `docs/contexts/knowledge-graph/CONTEXT.md`, `docs/contexts/product-domain/CONTEXT.md`.
- Parent issue template: `docs/architecture/architecture-deepening-parent-issue.md`.

Implementation notes:

- This ticket should remain last.
- Intentional fallbacks kept after Ticket 24: `whiteboard-legacy.ts` (unit tests only); worker deterministic LLM fallbacks when curation is unavailable (documented in knowledge-graph context).
