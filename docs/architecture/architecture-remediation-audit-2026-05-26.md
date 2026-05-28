# Architecture Remediation Audit - 2026-05-26

Status: critical audit for follow-up planning.

This audit follows the `improve-codebase-architecture` vocabulary: Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, Locality, and deletion test. It does not reopen accepted ADRs by default. It identifies places where implementation drifted after the first architecture-deepening program or where the earlier docs now overclaim completion.

## Executive Summary

The first architecture-deepening program created useful Modules: Tutor Turn, Reference Surface, Source-to-LLM-Wiki Compilation, Workspace Read Model, Artifact Lifecycle, Graph Projection, and Tool Contract. Those Modules are real, but newer development has started to accumulate policy back in routes, worker orchestration, web shells, and eval runners.

The highest-risk problems are:

- Tutor Turn preparation still lives mostly in the tutor route, so the route remains a tutoring policy Adapter rather than a protocol Adapter.
- Pi runtime caching can reuse an SDK session even when fresh StudyAgent host state changed.
- `learning.evaluate_response` calls executed through Pi can miss the current Tutor Turn identity.
- Wiki and enrichment persistence is not atomic, so failed ingestion can leave canonical knowledge half-replaced.
- Source projection rebuild is additive in important cases and can leave stale Neo4j edges.
- `tutoring_ready` does not prove Source Wiki or graph read surfaces are learner-ready.
- Workspace refresh is a web-local allowlist and currently misses regeneration events.
- Synthetic Learner persistence assertions are optional, so passing evals can skip the very state checks they claim to cover.
- Learner Trait Signals and Estimates have good schemas, but signal capture and estimation cadence are drifting into route/session-end convenience logic.

## Audit Scope

### Runtime And Tutor

Files inspected include:

- `apps/api/src/routes/tutor.ts`
- `apps/api/src/tutor-turn.ts`
- `apps/api/src/tutor-tool-provider.ts`
- `apps/api/src/tutor-write-provider.ts`
- `apps/api/src/tutor-session-lifecycle.ts`
- `apps/api/src/mastery-runtime.ts`
- `apps/api/src/mastery-session.ts`
- `apps/api/src/mastery-pipeline.ts`
- `packages/agent-runtime/src/pi-session.ts`
- `packages/tools/src/index.ts`

### Knowledge And Workspace

Files inspected include:

- `apps/worker/src/index.ts`
- `apps/worker/src/post-ingest-enrichment.ts`
- `apps/worker/src/wiki-change-set-persistence.ts`
- `packages/wiki-core/src/source-compilation.ts`
- `packages/search/src/notebook-graph-search.ts`
- `packages/graph/src/graph-projection/*`
- `packages/graph/src/neo4j-projection.ts`
- `packages/graph/src/neo4j-queries.ts`
- `apps/api/src/workspace-read-model.ts`
- `apps/api/src/reference-surface.ts`

### Web And Evals

Files inspected include:

- `apps/web/src/App.tsx`
- `apps/web/src/Whiteboard.tsx`
- `apps/web/src/FullPanelViewer.tsx`
- `apps/web/src/TutorPanel.tsx`
- `apps/web/src/NodeDetailPanel.tsx`
- `apps/web/src/EvalRunsDashboard.tsx`
- `packages/schemas/src/synthetic-learner-evals.runner.ts`
- `packages/schemas/src/synthetic-learner-evals.assertions.ts`
- `apps/worker/src/synthetic-learner-evals.ts`
- `apps/api/src/routes/eval-runs.ts`
- `apps/api/src/learner-trait-estimation.ts`
- `apps/api/src/learner-trait-store.ts`

## Findings

### 1. Tutor Turn Interface Is Still Too Wide

Priority: P0

Files:

- `apps/api/src/routes/tutor.ts`
- `apps/api/src/tutor-turn.ts`
- `apps/api/src/tutor-tool-provider.ts`
- `apps/api/src/mastery-session.ts`

Problem:

`executeTutorTurn` owns turn/run persistence and stream projection, but its Interface requires the HTTP route to preassemble the actual tutoring lifecycle: study state, open artifact context, prompt context, personalization recommendations, intent opener instructions, strict source-scope instructions, context selection, runtime mastery preflight, tool registry, and runtime run.

Deletion test:

Deleting `executeTutorTurn` would move persistence and streaming code back into the route, so the Module is not useless. But deleting the route-local orchestration does not delete tutoring behavior; it reveals that the Tutor Turn Module has not absorbed curriculum-first turn preparation.

Risk:

New tutor behavior will continue landing in `routes/tutor.ts`, where it is harder to test without HTTP/SSE setup and easier to accidentally bypass Module invariants.

Solution direction:

Deepen Tutor Turn so it owns authorized turn preparation, host-state loading, prompt-context construction, runtime-context preparation, tool registry creation, context-selection integration, mastery preflight handoff, and structured stream projection. Keep `routes/tutor.ts` as the Adapter for auth, request parsing, and SSE serialization.

### 2. Cached Pi Sessions Can Ignore Fresh Host State

Priority: P0

Files:

- `packages/agent-runtime/src/pi-session.ts`
- `apps/api/src/routes/tutor.ts`

Problem:

`replaceStudyAgentTutorRuntime` considers notebook, session, user, mode, selected refs, and prompt template material. It does not account for host state that changes every turn: mastery state, learner progress, personalization recommendations, context-selection reasoning, strict source policy, open artifact, digest draft, or learner trait recommendations. If selected refs stay the same, the Pi SDK session can be reused with a stale system prompt.

Deletion test:

Deleting the cache would avoid the bug but lose runtime continuity. The real Seam is not "cache or no cache"; it is the material runtime context signature that decides whether cached Pi state is still valid.

Risk:

The tutor can appear adaptive in persisted state while the actual Pi session sees old host state.

Solution direction:

Make Tutor Turn compute a host-state fingerprint and pass it into the Pi Adapter. Either replace the cached session when the fingerprint changes or inject fresh host state through a per-turn context channel that the SDK actually consumes.

### 3. Pi-Executed `learning.evaluate_response` Can Lose Tutor Turn Identity

Priority: P0

Files:

- `apps/api/src/tutor-turn.ts`
- `packages/agent-runtime/src/pi-session.ts`
- `apps/api/src/tutor-write-provider.ts`
- `apps/api/src/mastery-evidence-store.ts`

Problem:

`executeTutorTurn` creates a real Tutor Turn ID before runtime execution, but the Pi Adapter builds tool context without that ID. Runtime auto-evaluation can bind to an existing turn, but a direct Pi tool call to `learning.evaluate_response` can persist Mastery Evidence with `turn_id = null`.

Deletion test:

Deleting the Mastery Evaluator tool would remove one symptom but push mastery evaluation back into prompt-only behavior. The right Seam is tool execution context: every write tool needs the run/session/turn identity it is mutating from.

Risk:

Mastery Evidence becomes less auditable, and future reducers or eval assertions cannot reliably tie evidence to a Tutor Turn.

Solution direction:

Thread `turnId` from Tutor Turn into `StudyAgentRuntimeRun` or Pi session input, then into tool context. Add a regression through `runStudyAgentTutorSession`, not only direct write-provider tests.

### 4. Session Lifecycle Is Split Across Route, Lifecycle Module, `phase7`, And Pi Runtime

Priority: P1

Files:

- `apps/api/src/routes/tutor.ts`
- `apps/api/src/tutor-session-lifecycle.ts`
- `apps/api/src/phase7.ts`

Problem:

Pause and resume mutate sessions directly in the route and call Pi disposal/replacement there. End goes through `completeTutorSessionLifecycle`. Crystallization behavior still lives in `phase7`. ADR-0012's Run, Turn, Session, and Crystallization terms are clear, but the Implementation is not local.

Deletion test:

Deleting `tutor-session-lifecycle.ts` would only displace end-session behavior. Pause, resume, runtime replacement, and some crystallization policy already live elsewhere. That is a shallow Module signal.

Solution direction:

Deepen Tutor Session Lifecycle so active/paused/resumed/completed transitions, runtime disposal/replacement, crystallization handoff, and lifecycle events cross one Interface.

### 5. Mastery Runtime Trigger Ownership Is Shallow

Priority: P1

Files:

- `apps/api/src/routes/tutor.ts`
- `apps/api/src/mastery-runtime.ts`
- `apps/api/src/mastery-session.ts`
- `apps/api/src/mastery-pipeline.ts`

Problem:

Mastery Evidence persistence and reducers are reasonably deep. Trigger orchestration is not. Regex prompt eligibility, fallback pending evaluation lookup, runtime context patching, and evaluation invocation are spread across route, runtime, and session Modules.

Additional risk:

The fallback path can reconstruct a pending evaluation from the latest assistant message but use the current request's selected refs, context selection, and current objective. If the learner changes focus before answering, mastery can be attributed to the wrong context.

Solution direction:

Deepen a Mastery Runtime Module around pending Mastery Check state, prompt-turn context, eligibility, fallback lookup, evaluation invocation, and runtime-context patching. Remove or harden current-request fallback attribution.

### 6. Deterministic Tutor Progression Completes Objectives On Vague Confirmations

Priority: P1

Files:

- `apps/api/src/tutor-turn.ts`

Problem:

`got it`, `continue`, `next`, `makes sense`, and similar phrases can complete the current Objective and update the Study Plan. This contradicts the Mastery Runtime intent: vague confidence should not strongly increase mastery or advance objectives without evidence.

Deletion test:

Deleting deterministic progression would remove a convenience path but force progression decisions back to Mastery Evidence, Objective Progress, or governed tutor tools, which is the intended deeper Seam.

Solution direction:

Route objective advancement through Mastery Evidence / Objective Progress. Learner confirmations can request continuation, but completion should require recent strong evidence, quiz success, or an explicit governed tool decision.

### 7. Wiki And Enrichment Persistence Is Not Atomic

Priority: P0

Files:

- `apps/worker/src/wiki-change-set-persistence.ts`
- `apps/worker/src/post-ingest-enrichment.ts`

Problem:

`applyWikiChangeSet` deletes old source claims and source graph relations before reinserting concepts, claims, graph relations, pages, and events. There is no explicit transaction wrapper. Post-ingest enrichment then performs curriculum, session, coverage, and projection steps outside the same atomic unit.

Deletion test:

Deleting `applyWikiChangeSet` would scatter SQL writes back into the worker, so the Adapter earns its keep. But its Interface does not give enough Leverage for atomicity, idempotency reporting, partial failure recovery, or replay.

Risk:

A mid-apply failure can leave canonical knowledge half-replaced while downstream source status or events suggest progress.

Solution direction:

Introduce a Knowledge Commit Module. It should apply WikiChangeSet, curriculum bootstrap, coverage seeding, source readiness metadata, and append-only events through one Postgres transaction or an explicit outbox. Neo4j projection should run after commit.

### 8. Source Projection Rebuild Is Not A True Rebuild

Priority: P0

Files:

- `packages/graph/src/graph-projection/clear-projection-scope.ts`
- `packages/graph/src/graph-projection/project-graph.ts`
- `packages/graph/src/neo4j-projection.ts`

Problem:

Source rebuild clears topic, claim, and wiki-page nodes. It does not reliably clear concept-concept edges, curriculum/module/objective/session-plan nodes, coverage nodes, or Study Plan edges that may have been projected for the source. Concept relations are not tagged by ingestion source, so stale relations can survive recompilation.

Deletion test:

Deleting projection rebuild would force complete notebook rebuilds or leave stale graph state. The current Source rebuild Interface is too shallow because callers expect rebuild semantics that the Implementation cannot guarantee.

Solution direction:

Add projection-scope identity to projected nodes/relationships or maintain a projection manifest. Extend source-scope clearing so a relation/page present in projection A and absent in projection B is actually removed.

### 9. `tutoring_ready` Does Not Mean Source Wiki Or Graph Surfaces Are Learner-Ready

Priority: P1

Files:

- `apps/worker/src/index.ts`
- `apps/worker/src/post-ingest-enrichment.ts`
- `apps/api/src/routes/graph.ts`
- `docs/contexts/knowledge-graph/CONTEXT.md`

Problem:

Worker readiness is based on enrichment, retrieval chunks, lexical readiness, and embedding fallback. Projection failures are non-blocking. Source Wiki graph routes can still hard-fail if Neo4j is absent, before a learner-safe degraded read model can be returned.

Deletion test:

Deleting `tutoring_ready` would not remove readiness complexity; it would force every caller to infer readiness from scattered metadata. The problem is that one status carries too many meanings.

Solution direction:

Split readiness into component states: retrieval-ready, wiki-minimum-ready, planning-ready, projection-ready, learner-source-wiki-ready. `tutoring_ready` can remain for tutor viability, but it must not imply Source Wiki readiness.

### 10. Graph Relation Semantics Are Duplicated And Inconsistent

Priority: P1

Files:

- `packages/wiki-core/src/source-compilation.ts`
- `packages/search/src/notebook-graph-search.ts`
- `packages/graph/src/neo4j-projection.ts`
- `packages/graph/src/neo4j-queries.ts`
- `packages/graph/src/canvas-projection.ts`

Problem:

Wiki compilation persists relation types such as `supports`, `example_of`, `covers`, and `depends_on`. Neo4j compresses or remaps those to uppercase relation names. Search reads Postgres relations directly and treats them as graph keyword expansion. Canvas projection adds another topic relation layer. The Source Wiki query also expects one `CITES` direction while projection writes another.

Deletion test:

Deleting `packages/graph` would not remove graph-aware retrieval because search has its own traversal semantics. Deleting search's graph channel would not remove graph semantics because projection has its own. The duplication is policy, not Leverage.

Solution direction:

Create a Graph Semantics Module that maps canonical relation intent to Postgres, Neo4j, search, canvas, and learner visibility semantics. Fix the `CITES` direction with a projection/query integration test.

### 11. Source Wiki Learner-Safety Policy Is Split Across Too Many Seams

Priority: P1

Files:

- `packages/wiki-core/src/source-compilation.ts`
- `apps/worker/src/wiki-change-set-persistence.ts`
- `apps/api/src/reference-surface.ts`
- `apps/api/src/workspace-read-model.ts`
- `apps/web/src/ProvenanceDrawer.tsx`

Problem:

Learner safety lives in generated markdown, raw wiki status, graph filters, Workspace visibility, Reference Surface construction, and client-side Evidence filtering. Wiki pages are inserted as raw `draft`; Reference Surfaces can return raw status; Workspace hides only a subset of unsafe states.

Deletion test:

Deleting one filter does not delete safety policy; it reappears as learner-facing claim/debug leakage elsewhere. That indicates the learner view Interface is not deep enough.

Solution direction:

Deepen a Source Wiki Learner View / Evidence Read Model Seam. It should produce learner-facing status, safe Evidence groups, graph visibility, Reference Surface blocks, and Dev Mode debug partitions together.

### 12. Workspace Refresh Is A Web-Local Allowlist

Priority: P1

Files:

- `apps/web/src/App.tsx`
- `apps/api/src/routes/graph.ts`
- `packages/schemas/src/events.ts`

Problem:

The web app hard-codes refresh event names. Regeneration emits `wiki.page.updated` and `reference.regenerated`, but the web refresh list does not include both. `reference.regenerated` is not in the shared event schema.

Deletion test:

Deleting the web allowlist would push invalidation rules into individual surfaces. The behavior is necessary, but Locality is wrong.

Solution direction:

Introduce a shared Workspace Refresh Policy Module that classifies event types into query invalidations: graph, study state, artifacts, reference surface, sources, timeline, eval dashboard.

### 13. Artifact Review Behavior Is Duplicated Across Tutor Chat And Reference Surface

Priority: P1

Files:

- `apps/web/src/TutorPanel.tsx`
- `apps/web/src/FullPanelViewer.tsx`
- `apps/api/src/routes/notebooks.ts`
- `apps/api/src/artifact-view.ts`

Problem:

`TutorPanel` owns approve, reject, save, quiz, and flashcard behavior. `FullPanelViewer` separately owns quiz attempts and regeneration. API routes separately implement approve/reject/update. `buildLearningArtifactView` declares actions, but web renderers do not use that action model consistently.

Deletion test:

Deleting either artifact surface would force the same behavior into the remaining one. That is a strong signal for a deeper Artifact Review Module.

Solution direction:

Create one Artifact Review Module with Interface operations for loading artifact review state, executing artifact actions, recording practice attempts, and regenerating artifact surfaces. Web renderers should consume action descriptors rather than re-derive status rules.

### 14. `Whiteboard` Owns Too Many Workspace State Machines

Priority: P2

Files:

- `apps/web/src/Whiteboard.tsx`
- `apps/web/src/whiteboard-utils.ts`

Problem:

`Whiteboard` mixes selected node, view mode, Evidence drawer, Dev Mode, right panel mode, filters, source selection, layout version, graph query state, curriculum rendering, and tutor ref propagation. This makes invalid state combinations easy to create and hard to test.

Deletion test:

Deleting `Whiteboard` would scatter complexity into `App`, `GraphCanvas`, `FullPanelViewer`, and `TutorPanel`. The Module earns its keep, but the Interface lacks Depth because maintainers must understand too many internal state machines.

Solution direction:

Introduce a Workspace Shell State Module with explicit transitions: select node, open Reference Surface, close Reference Surface, open Evidence, set mode, set Dev Mode, select Source, sync tutor refs.

### 15. Learner/Debug Vocabulary Still Leaks Through Secondary Surfaces

Priority: P2

Files:

- `apps/web/src/TutorPanel.tsx`
- `apps/web/src/NodeDetailPanel.tsx`
- `apps/api/src/artifact-view.ts`

Problem:

Reference Surface paths are cleaner, but artifact modals and detail panels still show raw artifact type/status, generated labels, source refs, note markdown labels, evidence ref/objective ref labels, confidence/status fields, and internal artifact kinds such as `session_plan` or `teaching_arc`.

Solution direction:

Enforce learner vocabulary at the read-model/view-model Seam. Dev/debug fields should require Dev Mode capability, not renderer discretion.

### 16. Reference Surface Primary Actions Are Declared But Mostly Ignored By Web

Priority: P2

Files:

- `apps/api/src/reference-surface.ts`
- `apps/web/src/FullPanelViewer.tsx`

Problem:

`ReferenceSurface.primaryActions` exists for concepts, objectives, artifacts, and sources. `FullPanelViewer` still hard-codes header buttons and derives quiz behavior from graph node properties.

Solution direction:

Make Reference Surface actions the Interface. The web Adapter should render and execute `primaryActions` consistently, including preconditions.

### 17. Synthetic Learner Live Eval Observation Is Mostly Completed-Run JSON

Priority: P1

Files:

- `apps/worker/src/synthetic-learner-evals.ts`
- `apps/api/src/routes/eval-runs.ts`
- `apps/web/src/EvalRunsDashboard.tsx`
- `docs/architecture/synthetic-learner-evals-implementation-plan.md`

Problem:

The CLI writes a transcript while running, but persistence happens after suite completion. The API exposes whole-run list/detail/post, not append/update observation ingestion. The dashboard uses manual refresh and `staleTime: Infinity`.

Deletion test:

Deleting the dashboard would not remove eval semantics; maintainers could still inspect JSON or stdout. That means the dashboard is shallow relative to Live Eval Observation intent.

Solution direction:

Introduce Eval Run Observation: create Eval Run before execution, append observation events and step snapshots during execution, and mark completion separately. Dashboard should poll or subscribe to active observation state.

### 18. Synthetic Learner Evidence Snapshots Are Optional

Priority: P1

Files:

- `packages/schemas/src/synthetic-learner-evals.runner.ts`
- `packages/schemas/src/synthetic-learner-evals.assertions.ts`
- `apps/worker/src/synthetic-learner-evals.ts`

Problem:

The assertion engine can check `persistenceEvidence`, but the worker does not supply it. Some tests allow skipped persistence assertions in otherwise passing runs. That weakens claims that Mastery Evidence, artifact lifecycle, session boundaries, and trait persistence are verified.

Deletion test:

Deleting persistence assertion refs would remove labels more than actual proof. The current runner would still execute tutor turns and produce a transcript.

Solution direction:

Add an Eval Evidence Snapshot Adapter that reads notebook events, Mastery Evidence, artifacts, trait signals/estimates, session lifecycle, source refs, and pre/post state. Required assertions should fail when required snapshot categories are missing.

### 19. Issue Candidates Only Cover Final Failed Scenarios

Priority: P2

Files:

- `packages/schemas/src/synthetic-learner-evals.runner.ts`
- `apps/web/src/EvalRunsDashboard.tsx`

Problem:

Autonomous action repair evidence records invalid model output, but issue candidates are emitted only when final status is failed. A run can pass after repair but still be suspicious enough to deserve review.

Solution direction:

Separate issue candidates from pass/fail. Add candidate types for repaired invalid action, unavailable evidence snapshot, assertion skip, required action not covered, suspicious finish, raw ID leak later repaired, and simulator/tool mismatch.

### 20. `runKind` Is Mostly Recorded While `learnerMode` Drives Behavior

Priority: P2

Files:

- `apps/worker/src/synthetic-learner-evals.ts`
- `packages/schemas/src/synthetic-learner-evals.runner.ts`
- `packages/schemas/src/synthetic-learner-evals.fixtures.ts`

Problem:

The vocabulary is correct, but `learnerMode` is a global CLI/runtime switch and `runKind` mostly passes through scenario metadata. This risks flattening "why this eval exists" into "how turns are produced."

Solution direction:

Add an Eval Run Planner that decides runKind, learnerMode, gating policy, autonomy profile, and scenario compatibility together before execution.

### 21. Learner Trait Signals Are Route-Side Durable Writes

Priority: P1

Files:

- `apps/api/src/routes/tutor.ts`
- `apps/api/src/tutor-write-provider.ts`

Problem:

The tutor route regex-records explicit preference signals before mastery evaluation, before turn creation, and before Pi execution succeeds. That bypasses the governed `learner_trait.record_signal` tool path, produces only session-level evidence refs, and can persist signals for failed turns.

Deletion test:

Deleting the route regex would remove convenience capture, but the governed tool remains. That suggests route regex is the wrong Seam for durable trait policy.

Solution direction:

Move deterministic explicit-signal extraction into a Learner Trait Signal Module called after the turn/run IDs exist, or require Pi/tool-mediated capture. Turn-level evidence refs should include the learner utterance.

### 22. Learner Trait Estimation Cadence Is Too Close To "Every Session End"

Priority: P2

Files:

- `apps/api/src/tutor-session-lifecycle.ts`
- `apps/api/src/learner-trait-estimation.ts`

Problem:

`completeTutorSessionLifecycle` invokes the estimation cycle whenever an estimator is configured. The trigger detector can skip proposal calls, but there is no explicit planner that decides whether a session boundary is eligible before entering the estimator path.

Solution direction:

Add a Learner Trait Estimation Planner before the estimator cycle. It should record why a boundary was eligible or ignored and avoid constructing model clients when ordinary session end does not warrant estimation.

### 23. Learner Trait Evidence Packets Omit Planned Context

Priority: P2

Files:

- `apps/api/src/learner-trait-estimation.ts`
- `docs/architecture/real-learner-trait-estimates-implementation-plan.md`

Problem:

The packet schema accepts mastery summaries, profile summaries, and session summaries. The session-boundary cycle currently builds packets mostly from signals and current estimates. It also reads signals session-locally, so repeated cross-session behavior is invisible.

Solution direction:

Deepen a Learner Trait Evidence Collector that owns trigger windows, notebook-scoped recent signals, current-session signals, Mastery Evidence summaries, prior session summaries, profile preferences, contradictions, and stale estimates.

### 24. Recommendation-Only Trait Assertions Are Too Shallow

Priority: P2

Files:

- `packages/schemas/src/synthetic-learner-evals.assertions.ts`
- `docs/architecture/real-learner-trait-estimates-implementation-tickets.md`

Problem:

`persistence_trait_recommendation_only` checks event names for forbidden words instead of comparing Mastery Evidence, weak concepts, objectives, curriculum, or artifact lifecycle snapshots before and after trait estimation.

Solution direction:

Make recommendation-only an Eval Evidence Snapshot assertion with forbidden delta detection.

## Docs Overclaiming

Several docs currently say "implemented locally" or "verified complete" for areas where the Module exists but critical hardening remains. This is not just documentation drift; it affects agent handoffs because future agents will skip work that the docs imply is done.

Docs that need status correction after remediation tickets are accepted:

- `docs/architecture/architecture-deepening-implementation-tickets.md`
- `docs/architecture/synthetic-learner-evals-implementation-plan.md`
- `docs/architecture/synthetic-learner-evals-implementation-tickets.md`
- `docs/architecture/synthetic-learner-llm-simulator-prd.md`
- `docs/architecture/real-learner-trait-estimates-implementation-plan.md`
- `docs/architecture/real-learner-trait-estimates-implementation-tickets.md`

## Recommended Priority Order

1. Runtime correctness:
   - Tutor Turn ownership.
   - Pi host-state freshness.
   - Tool-context turn identity.
   - Objective progression guard.
2. Knowledge correctness:
   - Knowledge Commit transactionality.
   - Source projection rebuild semantics.
   - Readiness split and degraded Source Wiki read model.
   - Graph Semantics and `CITES` direction fix.
3. Learner-facing reliability:
   - Workspace Refresh Policy.
   - Artifact Review Module.
   - Source Wiki learner-safe status and Evidence read model.
   - Workspace Shell State.
4. Eval truth:
   - Eval Evidence Snapshot.
   - Live Eval Observation.
   - Issue candidate taxonomy.
5. Learner trait governance:
   - Signal ownership.
   - Estimation planner.
   - Evidence collector.
   - Snapshot-based recommendation-only assertions.

