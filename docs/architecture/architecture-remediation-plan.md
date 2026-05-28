# Architecture Remediation Plan

Status: planning document for implementation tickets.

Current status note, 2026-05-28: this document is historical planning context. The current item-by-item audit found that the remediation program is not complete: 1 finding is fixed, 8 are partial, and 15 remain open. Use `docs/architecture/architecture-remediation-current-plan-2026-05-28.md` as the current source of truth for remaining work, ticket dependencies, and verification gates.

This plan converts the 2026-05-26 architecture audit into a concrete remediation program. It is additive to the original architecture-deepening program. The original Modules were useful; this plan targets the places where the current Interface is still too shallow, where new policy leaked into Adapters, or where verification claims are stronger than current tests prove.

## Goals

- Restore Tutor Turn, Session Lifecycle, Mastery Runtime, Knowledge Commit, Workspace Refresh, Artifact Review, Synthetic Learner Observation, Eval Evidence Snapshot, and Learner Trait Evidence to deep Modules.
- Keep accepted ADRs in force unless a ticket explicitly asks for an ADR revisit.
- Preserve current product vocabulary: Notebook, Source, Source Wiki, Study Map, Reference Surface, Evidence, Live Plan, Artifact, Mastery Evidence, Synthetic Learner, Eval Run, Learner Trait Signal, Learner Trait Estimate, Personalization Recommendation.
- Make implementation slices independently grabbable and testable.
- Avoid broad rewrites. Each slice should move one real policy Seam behind a better Interface and add tests at that Interface.

## Non-Goals

- Do not replace Pi as the tutor runtime.
- Do not make Neo4j canonical.
- Do not move agentic enrichment into low-level ingestion.
- Do not make Synthetic Learner LLM modes CI-gating by default.
- Do not turn Learner Trait Estimates into mastery, curriculum, or artifact mutators.
- Do not publish GitHub issues automatically in this pass unless explicitly requested.

## Program Tracks

### Track A: Tutor Runtime Correctness

Target Modules:

- Tutor Turn Preparation
- Tutor Session Lifecycle
- Mastery Runtime
- Runtime Host-State Binding
- Runtime Tool Context

Current issue:

The route and Pi Adapter still own product policy that should sit behind tutor runtime Modules. This creates stale runtime context, unauditable tool writes, and objective progression that can bypass mastery evidence.

Desired Module shape:

`Tutor Chat Route -> Tutor Turn Preparation -> Tutor Turn Execution -> Runtime Adapter -> Tool Contract / Providers`

The route authorizes and parses. Tutor Turn loads StudyAgent host state, produces prompt context, computes material runtime signature, creates run/turn IDs, performs mastery preflight through Mastery Runtime, binds tools with turn identity, streams structured events, and persists the turn.

Key decisions:

- Tutor Turn owns the material runtime context signature.
- Pi Adapter cache reuse is allowed only when the signature proves host state is compatible.
- Tool context must always include notebook, user, session, run, and turn IDs for write tools.
- Objective completion must be mastery-backed or governed-tool-backed; vague learner confirmations are not enough.

Verification strategy:

- Module-level tests for Tutor Turn preparation without HTTP.
- Pi Adapter regression tests showing changed host state refreshes runtime.
- `learning.evaluate_response` test through runtime tool execution.
- Objective progression tests that `continue` does not complete without recent Mastery Evidence.

### Track B: Knowledge Commit And Graph Semantics

Target Modules:

- Knowledge Commit
- Source Readiness Model
- Graph Semantics
- Source Projection Rebuild
- Source Wiki Learner View

Current issue:

The Source-to-LLM-Wiki Compilation Module is deep, but persistence and downstream bootstrap are still imperative worker code. Graph projection and search duplicate semantics. Source readiness and Source Wiki readiness are conflated.

Desired Module shape:

`Worker Job Adapter -> Source Enrichment Plan -> Knowledge Commit -> Projection Queue -> Workspace Read Models`

Knowledge Commit applies WikiChangeSet, curriculum/session/coverage bootstrap, readiness metadata, and notebook events atomically. Projection runs after commit and can rebuild source-owned projection state precisely. Graph Semantics maps canonical relation intent to Postgres, Neo4j, search, canvas, and learner visibility.

Key decisions:

- Projection is derived and can lag; Source Wiki must have a degraded Postgres-backed read model when projection is absent.
- `tutoring_ready` means tutor viability, not full Source Wiki readiness.
- Source Wiki learner-facing status is separate from raw `wiki_pages.status`.
- Relation direction and type mapping live in Graph Semantics, not scattered switches.

Verification strategy:

- Transaction rollback tests around mid-apply WikiChangeSet failures.
- Rebuild tests proving stale source-owned Neo4j edges disappear.
- Graph Semantics adapter tests from canonical relation to Neo4j/search/canvas.
- Source Wiki degraded-mode API tests without Neo4j.
- Learner-safe status tests for draft, candidate, failed, and published pages.

### Track C: Workspace And Artifact Surfaces

Target Modules:

- Workspace Refresh Policy
- Artifact Review
- Workspace Shell State
- Reference Surface Action Adapter
- Learner Copy Guard

Current issue:

The web shell contains local allowlists, duplicated artifact actions, multiple state machines in `Whiteboard`, and secondary surfaces that still leak internal vocabulary.

Desired Module shape:

`Notebook Event -> Workspace Refresh Policy -> Query Invalidations`

`Artifact View -> Artifact Review Module -> TutorPanel / FullPanelViewer Adapters`

`Workspace Shell State -> Study Map / Source Wiki / Reference Surface / Evidence panes`

Key decisions:

- Event invalidation belongs to a shared policy, not `App.tsx`.
- Artifact actions should come from a single artifact review Interface.
- Reference Surface `primaryActions` should drive web actions rather than graph-node property inference.
- Learner copy should be enforced at view-model/read-model seams and tested.

Verification strategy:

- Event classification tests for `wiki.page.updated`, `reference.regenerated`, quiz attempts, artifact failures, and source failures.
- Artifact parity tests showing the same artifact exposes the same actions in TutorPanel and FullPanelViewer.
- Workspace state reducer tests for invalid transition combinations.
- Learner-visible copy denylist tests for raw IDs, `LLM`, `debug`, `raw`, `provenance`, `*_ref`, and internal artifact names.

### Track D: Synthetic Learner Truth And Observation

Target Modules:

- Eval Run Planner
- Eval Evidence Snapshot
- Live Eval Observation
- Issue Candidate Builder

Current issue:

Synthetic Learner vocabulary is good, but the runner still relies heavily on transcript and final JSON. Persistence assertions are optional. Live dashboard observation is not truly live. Issue candidates are tied too narrowly to final failure.

Desired Module shape:

`Eval Run Planner -> Scenario Runner -> Eval Observation Events -> Eval Evidence Snapshot -> Assertions -> Issue Candidates -> Dashboard Read Model`

Key decisions:

- `runKind` and `learnerMode` stay separate and are planned together.
- Required persistence assertions fail if required snapshot categories are unavailable.
- Live observation is append-only and visible while the run is executing.
- Issue candidates can be warnings from suspicious behavior, not only failed scenarios.

Verification strategy:

- Runner tests where missing required snapshot fails.
- Integration test showing active Eval Run visible before completion.
- Dashboard active-run polling or stream tests.
- Passing autonomous run with repaired invalid action still produces a warning candidate.

### Track E: Learner Trait Governance

Target Modules:

- Learner Trait Signal Ownership
- Learner Trait Estimation Planner
- Learner Trait Evidence Collector
- Recommendation-Only Assertion

Current issue:

Learner Trait schemas are useful, but durable signal capture is currently route-local, estimation is invoked by default at session end when an estimator exists, and evidence packets omit some planned context. Recommendation-only assertions are too shallow.

Desired Module shape:

`Tutor Turn / Settings / Governed Tool -> Learner Trait Signal Module -> Estimation Planner -> Evidence Collector -> Estimator -> Guardrails -> Estimates -> Personalization Recommendations`

Key decisions:

- Explicit self-report, tutor-observed preference, behavior extraction, and governed tool writes are distinct signal sources.
- Route regex must not produce high-confidence durable explicit signals before a Tutor Turn exists.
- Estimation planner decides whether the boundary is eligible before the estimator cycle runs.
- Evidence collector uses notebook-scoped bounded windows, not only current-session signals.
- Recommendation-only is verified through pre/post snapshots, not event-name filtering.

Verification strategy:

- No trait signal on failed/empty tutor turn.
- Turn/run refs included in signal evidence.
- "Give me an example" does not become durable explicit example preference.
- Repeated cross-session signals trigger estimation.
- Trait estimation does not mutate mastery, weak concepts, curriculum, objectives, or artifacts.

## Sequencing

### Phase 0: Status Correction And Guardrails

Purpose: stop future agents from trusting overclaimed docs.

Work:

- Add known-gap notes to the architecture docs.
- Mark "implemented locally" as "module exists; hardening outstanding" where appropriate.
- Add parent remediation issue body and ticket index.

### Phase 1: Runtime And Knowledge Correctness

Purpose: fix the highest-risk correctness bugs first.

Work:

- Pi host-state freshness.
- Tool-context turn identity.
- Knowledge Commit transactionality.
- Source projection rebuild ownership.
- Objective progression guard.

### Phase 2: Readiness, Graph, And Learner Surfaces

Purpose: make learner-facing surfaces honest and consistent.

Work:

- Source readiness component states.
- Degraded Source Wiki read model.
- Graph Semantics and `CITES` direction.
- Source Wiki learner-facing status.
- Workspace Refresh Policy.
- Artifact Review Module.

### Phase 3: Eval Truth

Purpose: make Synthetic Learner runs prove real product state.

Work:

- Eval Evidence Snapshot.
- Assertion availability semantics.
- Live Eval Observation.
- Issue candidate taxonomy.
- Eval Run Planner.

### Phase 4: Learner Trait Governance

Purpose: make personalization state evidence-backed and recommendation-only.

Work:

- Signal ownership.
- Estimation planner.
- Evidence collector.
- Snapshot-based recommendation-only assertions.

### Phase 5: Web State And Copy Hardening

Purpose: reduce recurrence of learner-facing leaks and fragile UI state.

Work:

- Workspace Shell State reducer.
- Reference Surface action rendering.
- Learner-copy guardrails.
- Interaction tests.

## ADR Review

No finding requires immediate ADR reversal. The friction is mostly implementation failing to live up to accepted ADRs.

Potential ADR additions after implementation:

- Knowledge Commit and readiness component states may deserve a short ADR if source readiness terminology changes persisted semantics.
- Eval Evidence Snapshot may deserve an ADR if it becomes the canonical correctness gate for Synthetic Learner persistence assertions.
- Learner Trait Signal source policy may deserve an ADR appendix to ADR-0017 if explicit vs inferred lanes need stricter product language.

## Documentation Updates Required

Update these docs after the first implementation slices land:

- `CONTEXT-MAP.md`: add remediation Modules if they become durable.
- `docs/contexts/api-runtime/CONTEXT.md`: Tutor Turn preparation, session lifecycle, mastery runtime, trait planner.
- `docs/contexts/knowledge-graph/CONTEXT.md`: Knowledge Commit, readiness components, Graph Semantics, projection rebuild ownership.
- `docs/contexts/web-workspace/CONTEXT.md`: Workspace Refresh Policy, Artifact Review, Workspace Shell State.
- `docs/contexts/product-domain/CONTEXT.md`: readiness labels and trait signal source language if terms change.
- Existing implementation ticket docs: downgrade overstated completion claims or link to remediation tickets.
