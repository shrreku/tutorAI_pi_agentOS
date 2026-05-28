# Architecture Remediation Current Plan

Status: current remediation source of truth after the 2026-05-28 item-by-item audit.

This document supersedes optimistic status readings from the 2026-05-26 remediation docs. It does not replace the original audit; it turns the current dirty-worktree evidence into an implementation plan, ticket index, and verification gates for the remaining open and partial remediation work.

Related docs:

- `docs/architecture/architecture-remediation-audit-2026-05-26.md`
- `docs/architecture/architecture-remediation-plan.md`
- `docs/architecture/architecture-remediation-implementation-tickets.md`
- `docs/architecture/architecture-deepening-implementation-tickets.md`
- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
- `docs/contexts/knowledge-graph/CONTEXT.md`

## Current Executive Summary

The remediation program is not complete. Runtime correctness and Knowledge Commit / Graph Semantics are now verified, but Workspace, Synthetic Learner, and Learner Trait findings still include open or partial work.

Current verdict:

- Fixed: 11 findings.
- Partial: 5 findings.
- Open: 8 findings.

Highest-risk remaining gaps:

1. Workspace and Reference Surface actions remain web-local instead of server-authored.
2. Artifact review and Workspace shell state still have duplicated web-local state machines.
3. Synthetic Learner live observation is still mostly completed-run JSON, not true active observation.
4. Learner Trait Signals and Estimation still have route/lifecycle ownership leaks.
5. Recommendation-only Learner Trait assertions are still shallow.

## Status Matrix

| Finding | Current status | Remediation ticket |
| --- | --- | --- |
| 1. Tutor Turn Interface too wide | Fixed in Phase 1, verified 2026-05-28 | T01 |
| 2. Cached Pi sessions ignore fresh host state | Fixed in Phase 1, verified 2026-05-28 | T02 |
| 3. Pi-executed `learning.evaluate_response` can lose turn identity | Fixed in Phase 1, verified 2026-05-28 | T03 |
| 4. Session lifecycle split | Fixed in Phase 1, verified 2026-05-28 | T04 |
| 5. Mastery runtime trigger ownership shallow | Fixed in Phase 1, verified 2026-05-28 | T05 |
| 6. Vague confirmations complete objectives | Fixed, regression verified 2026-05-28 | T06 |
| 7. Wiki/enrichment not atomic | Fixed in Phase 2, verified 2026-05-28 | T07 |
| 8. Source projection rebuild not true rebuild | Fixed in Phase 2, verified 2026-05-28 | T08 |
| 9. `tutoring_ready` does not mean wiki/graph ready | Fixed in Phase 2, verified 2026-05-28 | T09 |
| 10. Graph relation semantics duplicated/inconsistent | Fixed in Phase 2, verified 2026-05-28 | T10 |
| 11. Source Wiki learner-safety split | Fixed in Phase 2, verified 2026-05-28 | T11 |
| 12. Workspace refresh web-local allowlist | Open | T12 |
| 13. Artifact review duplicated | Open | T13 |
| 14. Whiteboard too many state machines | Open | T14 |
| 15. Learner/debug vocabulary leaks | Open | T15 |
| 16. Reference Surface `primaryActions` ignored by web | Open | T16 |
| 17. Synthetic Learner live eval observation mostly completed-run JSON | Open | T17 |
| 18. Synthetic Learner evidence snapshots optional | Partial | T18 |
| 19. Issue candidates only final failed scenarios | Open | T19 |
| 20. `runKind` mostly recorded while `learnerMode` drives behavior | Partial | T20 |
| 21. Learner trait signals route-side durable writes | Partial | T21 |
| 22. Learner trait estimation cadence too close to every session end | Partial | T22 |
| 23. Learner trait evidence packets omit planned context | Partial | T23 |
| 24. Recommendation-only trait assertions shallow | Open | T24 |

## Program Invariants

These invariants must hold for all implementation tickets.

1. Postgres remains the system of record.
2. Neo4j remains a derived graph projection.
3. Pi remains the embedded tutor runtime, but Pi operational memory is not canonical product state.
4. Durable writes flow through typed StudyAgent tools, reducers, events, and DB-backed providers.
5. Learner-facing surfaces use StudyAgent product vocabulary: Workspace, Reference Surface, Source Wiki, Study Map, Evidence, Artifact, Live Plan, Mastery Evidence, Learner Trait Signal, Learner Trait Estimate, Personalization Recommendation.
6. Synthetic Learner remains a test-only harness. It is not learner-facing state.
7. LLM-backed Synthetic Learner modes remain non-CI-gating by default until explicitly promoted.
8. Learner Trait Estimates remain recommendation-only. They must not mutate Concept Mastery, Objective Progress, weak concepts, curriculum, artifact consent, source grounding, or learner goals.

## Target Architecture

### Tutor Runtime

Target call shape:

```text
Tutor Chat Route
  -> Tutor Turn Preparation
  -> Tutor Turn Execution
  -> Runtime Adapter
  -> Tool Contract / Providers
  -> Reducers / Events / Read Models
```

The route should authorize, parse, and stream. It should not assemble pedagogical policy. Tutor Turn Preparation should load and sign material host state, select retrieval/context, prepare current objective and open artifact state, create run/turn identity, and create a runtime tool context that includes every required write identity.

### Session Lifecycle

Target call shape:

```text
Tutor Session Route
  -> Tutor Session Lifecycle
  -> Runtime Session Adapter
  -> Crystallization / Trait Estimation / Session Events
```

Pause, resume, completion, runtime disposal/replacement, and crystallization should cross one Session Lifecycle interface. The lifecycle module should decide when a boundary is meaningful enough to crystallize or estimate traits.

### Knowledge Commit And Projection

Target call shape:

```text
Worker Job
  -> Source Enrichment Plan
  -> Knowledge Commit
  -> Readiness State
  -> Projection Queue
  -> Source Wiki / Study Map Read Models
```

Knowledge Commit should atomically apply WikiChangeSet, curriculum/bootstrap writes, readiness metadata, and notebook events. Graph projection should run after durable commit and should be rebuildable by deleting all source-owned derived projection state.

### Workspace And Reference Surfaces

Target call shape:

```text
Notebook Event
  -> Workspace Refresh Policy
  -> Query Invalidations

Reference Surface
  -> Server-Authored Actions
  -> Web Action Adapter

Artifact
  -> Artifact Review Module
  -> TutorPanel / FullPanelViewer
```

The web shell should render product view models and execute server-authored actions. It should not infer artifact, source, wiki, or quiz behavior from graph-node property details.

### Synthetic Learner

Target call shape:

```text
Eval Run Planner
  -> Scenario Runner
  -> Live Eval Observation Event Stream
  -> Eval Evidence Snapshot
  -> Assertions
  -> Issue Candidates
  -> CLI / Dashboard
```

Live Eval Observation should be visible while the run executes. Assertions should inspect persisted state and runtime traces through a snapshot adapter. Issue candidates should represent suspicious behavior as well as final failures.

### Learner Traits

Target call shape:

```text
Tutor Turn / Settings / Governed Tool / Reflective Extractor
  -> Learner Trait Signal Module
  -> Learner Trait Estimation Planner
  -> Evidence Collector
  -> LLM-Assisted Estimator
  -> Guardrails
  -> Learner Trait Estimates
  -> Personalization Recommendations
```

Route regex extraction should not own durable trait writes. Estimation should be planned before the estimator is invoked. Evidence packets should include bounded cross-session signals, Mastery Evidence patterns, profile data, current estimates, and contradiction context.

## Implementation Phases

### Phase 0: Current-State Guardrails

Purpose: keep future implementation agents from trusting stale completion claims.

Deliverables:

- Link older remediation docs to this current plan.
- Keep a current status matrix for all 24 findings.
- Preserve explicit fixed/partial/open language until each ticket is verified.
- Require evidence before changing a status to fixed.

Exit criteria:

- `docs/architecture/architecture-remediation-plan.md` and `docs/architecture/architecture-remediation-implementation-tickets.md` point here as the current source of truth.
- Every remaining finding maps to a concrete ticket.

### Phase 1: Runtime Correctness

Purpose: fix tutor correctness bugs that can corrupt learner state or use stale context.

Implementation status, 2026-05-28: complete and verified. Tutor Turn Preparation now owns host-state assembly, prompt/context construction, runtime mastery preflight, tool registry creation, and run creation. Pi runtime cache replacement uses a material host-state signature. Pi-executed write tools receive Tutor Turn identity and write-tool execution rejects missing turn identity. Session lifecycle runtime disposal/replacement is behind lifecycle helpers. Runtime mastery evaluation uses persisted prompt-turn refs rather than current Workspace focus, and vague objective advancement remains regression-covered.

Tickets:

- T01 Tutor Turn Preparation Interface
- T02 Runtime Host-State Signature
- T03 Runtime Tool Context Turn Identity
- T04 Tutor Session Lifecycle Boundary
- T05 Mastery Runtime Prompt Context
- T06 Objective Progression Regression Guard

Exit criteria:

- [x] Pi runtime receives fresh material host state.
- [x] All runtime write tools have run and turn identity.
- [x] Mastery evaluation is attributed to the prompt context the learner actually answered.
- [x] Vague confirmations never complete objectives without evidence.

Verification:

- `pnpm --filter @studyagent/agent-runtime exec vitest run src/pi-session.test.ts --reporter=dot`
- `pnpm --filter @studyagent/api exec vitest run src/routes/tutor-chat.routes.test.ts src/routes/tutor-runtime.test.ts src/mastery-session.test.ts --reporter=dot`
- `pnpm --filter @studyagent/tools exec vitest run src/index.test.ts src/tool-contracts.test.ts --reporter=dot`
- `pnpm check`
- `pnpm test`

### Phase 2: Knowledge Commit And Graph Semantics

Purpose: make Source Wiki, readiness, and graph projection reliable under partial failure and rebuild.

Implementation status, 2026-05-28: complete and verified. Wiki change-set persistence now runs through an atomic Knowledge Commit transaction that records one committed fingerprint; retries skip the already-committed change set and continue downstream bootstrap/projection. Downstream planning/projection uses a staged commit model: learner-ready Source Wiki/readiness is published only after bootstrap and projection checks complete, so a mid-bootstrap failure leaves recoverable canonical wiki state but does not claim full learner Source Wiki or planning readiness. Source readiness distinguishes retrieval, wiki, planning, search, projection, learner Source Wiki, and tutoring readiness. Source projection rebuild clears source-owned relationships and derived nodes before replay, records projection scope/source version, and preserves shared concept nodes. Graph relation semantics are centralized in a shared registry consumed by projection, canvas normalization, graph search, and Source Wiki read-model grouping. Source Wiki learner views hide raw claim/debug state outside Dev Mode and expose learner-safe status and Evidence groups.

Tickets:

- T07 Atomic Knowledge Commit
- T08 True Source Projection Rebuild
- T09 Source Readiness Model
- T10 Graph Semantics Registry
- T11 Source Wiki Learner View

Exit criteria:

- [x] Wiki commit rollback leaves no partial state.
- [x] Rebuild deletes stale source-owned projection state.
- [x] Learners see clear source/wiki/graph readiness rather than raw pipeline status.
- [x] Graph relation direction/type mapping is centralized and tested.

Verification:

- `pnpm exec vitest run packages/schemas/src/source-readiness.test.ts packages/schemas/src/source-wiki-learner-view.test.ts --reporter=dot`
- `pnpm exec vitest run packages/graph/src/graph-projection-rebuild.test.ts packages/graph/src/graph-projection.test.ts packages/graph/src/graph-semantics.test.ts --reporter=dot`
- `pnpm exec vitest run apps/worker/src/wiki-change-set-persistence.test.ts apps/api/src/routes/graph.routes.test.ts --reporter=dot`
- `pnpm --filter @studyagent/schemas build`
- `pnpm --filter @studyagent/graph build`
- `pnpm --filter @studyagent/search build`
- `pnpm --filter @studyagent/api check`
- `pnpm --filter @studyagent/worker check`
- `pnpm check`
- `pnpm test`

### Phase 3: Workspace And Artifact Surface Cleanup

Purpose: move learner-surface behavior behind server/read-model seams and reduce web-local state machines.

Tickets:

- T12 Workspace Refresh Policy
- T13 Artifact Review Module
- T14 Workspace Shell State Reducer
- T15 Learner Copy Guard
- T16 Reference Surface Actions

Exit criteria:

- Web invalidation policy is shared and tested.
- Artifact actions are consistent across TutorPanel and FullPanelViewer.
- Whiteboard state transitions are reduced to a tested shell reducer.
- Learner surfaces do not leak debug vocabulary.
- Reference Surface `primaryActions` drive visible web commands.

### Phase 4: Synthetic Learner Truth And Observation

Purpose: make the harness trustworthy enough to catch the architecture regressions above.

Tickets:

- T17 Live Eval Observation
- T18 Eval Evidence Snapshot Adapter
- T19 Issue Candidate Builder
- T20 Eval Run Planner
- T24 Recommendation-Only Trait Assertion

Exit criteria:

- CLI/dashboard show active runs before completion.
- Required persisted-state snapshot gaps fail assertions.
- Suspicious passing behavior can produce non-published issue candidates.
- `runKind`, `learnerMode`, autonomy, and gating are planned together.
- Trait recommendation-only assertions inspect forbidden state deltas, not event names.

### Phase 5: Learner Trait Governance

Purpose: align real Learner Trait Estimates with ADR-0017 and the product-domain context.

Tickets:

- T21 Learner Trait Signal Ownership
- T22 Learner Trait Estimation Planner
- T23 Learner Trait Evidence Collector
- T24 Recommendation-Only Trait Assertion

Exit criteria:

- Durable explicit trait signals flow through governed tools or a dedicated signal module.
- Inferred signals come from bounded reflective extraction, not route regex.
- Estimation runs only when trigger rules pass.
- Evidence packets carry enough cross-session context and contradiction context to be auditable.
- Trait estimates only produce Personalization Recommendations.

## Tickets

### T01: Tutor Turn Preparation Interface

Type: AFK.

Findings: 1.

Blocked by: Phase 0.

What to build:

Create a deeper Tutor Turn Preparation interface that accepts authorized notebook/user/session/request inputs and returns a prepared execution object. Move route-owned host-state assembly into this module: active study state, open artifact, context selection, source-scope instructions, learner trait recommendations, runtime mastery handoff, run creation, and tool registry creation.

Acceptance criteria:

- Tutor chat route delegates preparation after auth and request parsing.
- Route no longer builds prompt sections or pedagogical source-scope instructions inline.
- Prepared turn output contains material host-state signature inputs for T02.
- Module-level tests cover open artifact context, selected source strictness, context-selection failure, personalization recommendations, and missing planning state.
- Route tests remain protocol/SSE smoke tests.

Verification:

- `pnpm --filter @studyagent/api test -- tutor-turn`
- Direct API chat smoke proves tutor still streams and persists a turn.

### T02: Runtime Host-State Signature

Type: AFK.

Findings: 2.

Blocked by: T01.

What to build:

Add a material StudyAgent host-state signature to Tutor Turn Preparation and Pi Adapter cache decisions. The signature must include all state that changes tutor behavior, not just selected refs or prompt template.

Required signature inputs:

- Notebook, user, session, active mode.
- Selected refs and context-selection result.
- Current objective, upcoming objectives, weak concepts, mastery summary, learner progress summary.
- Personalization recommendations from Learner Trait Estimates.
- Open artifact/reference surface context.
- Source-scope policy and learner-facing constraints.
- Tool contract/catalog version.
- Prompt template version.

Acceptance criteria:

- Pi runtime replacement occurs when material host state changes with unchanged selected refs.
- Runtime replacement emits a trace/event reason with previous and new signature hashes.
- Non-material changes do not churn the Pi runtime.
- Tests cover changed personalization, changed current objective, changed source-scope policy, and changed tool catalog version.

Verification:

- `pnpm --filter @studyagent/agent-runtime test -- pi-session`
- API integration test where two turns with same selected refs but changed current objective refresh runtime context.

### T03: Runtime Tool Context Turn Identity

Type: AFK.

Findings: 3.

Blocked by: T01.

What to build:

Thread `turnId` into the runtime/Pi session input and the `toolContext` used by `executeTool`. Write tools executed through Pi must receive notebook, user, session, run, and turn identity.

Acceptance criteria:

- `runStudyAgentTutorSession` receives `turnId` or a fully typed runtime write context.
- `toolContext` passed to Pi custom tool execution includes `turnId`.
- `learning.evaluate_response` invoked through Pi persists Mastery Evidence with a non-null Tutor Turn reference.
- `learner_traits.record_signal` invoked through Pi persists run and turn refs.
- Type guards reject write-tool execution without required identity.

Verification:

- Pi adapter regression test invokes a write tool through custom tool execution.
- DB assertion checks persisted Mastery Evidence and Learner Trait Signal refs.

### T04: Tutor Session Lifecycle Boundary

Type: AFK.

Findings: 4.

Blocked by: T01.

What to build:

Centralize pause, resume, complete, runtime replacement/disposal, lifecycle events, crystallization, and session-boundary trait estimation behind Tutor Session Lifecycle.

Acceptance criteria:

- Pause/resume/end routes call lifecycle operations rather than mutating session/runtime state directly.
- Resume runtime replacement uses lifecycle policy and emits lifecycle diagnostics.
- Completion with no completed turns skips crystallization and trait estimation.
- Meaningful completion triggers digest/crystallization once.
- Runtime disposal failure is observable but does not leave the session in an impossible state.

Verification:

- Lifecycle tests cover active to paused, paused to active, active to completed, completed idempotency, no-turn completion, and runtime replacement failure.
- API route smoke tests continue to pass.

### T05: Mastery Runtime Prompt Context

Type: AFK.

Findings: 5.

Blocked by: T01, T03.

What to build:

Persist pending Mastery Check context when the tutor asks the question. Evaluation should read objective, concept roles, tutor question, source/context refs, and source-scope policy from the prompt-turn context rather than reconstructing from the current learner request.

Acceptance criteria:

- Assistant prompt turns that ask a Mastery Check persist pending evaluation context.
- Learner answers are evaluated against the pending prompt-turn context.
- Changing selected source/objective between prompt and answer does not reattribute the answer.
- General chat acknowledgements do not create pending evaluations.
- The Mastery Runtime owns eligibility and handoff; route code delegates.

Verification:

- Test: tutor asks about objective A, learner switches to objective B, answer still attributes to objective A.
- Test: vague acknowledgement after non-check prompt does not run evaluation.

### T06: Objective Progression Regression Guard

Type: AFK.

Findings: 6.

Blocked by: T05.

What to build:

Preserve the current fix that prevents vague confirmations from completing objectives. Move the policy behind a named Objective Progression guard if needed, and add regression coverage so future route/runtime refactors cannot weaken it.

Acceptance criteria:

- `continue`, `next`, `got it`, and `makes sense` do not complete an objective by themselves.
- Strong recent Mastery Evidence can advance objective progress.
- Low-confidence or high-uncertainty evidence does not advance objective progress.
- Events identify the evidence or governed decision that caused advancement.

Verification:

- Tutor turn tests for vague acknowledgement, strong answer, weak answer, and quiz answer.

### T07: Atomic Knowledge Commit

Type: AFK.

Findings: 7.

Blocked by: Phase 0.

What to build:

Introduce a Knowledge Commit module that applies WikiChangeSet, curriculum/bootstrap writes, source readiness updates, and notebook events in one transaction or in a durable staged commit model with compensating recovery.

Acceptance criteria:

- Wiki page, claim, relation, curriculum/bootstrap, and event writes either commit together or leave a recoverable staged state.
- Mid-commit failure does not publish partial learner-visible Source Wiki or planning state.
- Retry is idempotent.
- Worker uses the Knowledge Commit interface rather than calling persistence helpers imperatively.

Verification:

- Transaction rollback test injects failure after wiki pages but before events.
- Retry test proves final state contains exactly one committed change set.

### T08: True Source Projection Rebuild

Type: AFK.

Findings: 8.

Blocked by: T07.

What to build:

Make source projection rebuild delete all source-owned derived projection state before re-projecting. Define source ownership for topics, wiki pages, claims, concepts, objectives, session-plan links, coverage, and relation edges.

Acceptance criteria:

- Source projection clear removes every Neo4j node/edge that the source projection owns.
- Rebuild does not delete notebook-owned state that merely references the source.
- Rebuild removes stale relation edges that no longer exist in Postgres.
- Projection state records last projection scope and source version.

Verification:

- Graph projection test seeds stale source-owned nodes/edges, rebuilds, and asserts stale state is gone.
- Rebuild test proves shared concept nodes are preserved when still referenced by other sources.

### T09: Source Readiness Model

Type: AFK.

Findings: 9.

Blocked by: T07.

What to build:

Split source readiness into distinct tutor, wiki, planning, search, and projection readiness states. Keep `tutoring_ready` only for minimum tutor viability.

Acceptance criteria:

- Source model exposes separate readiness fields or a typed readiness object.
- Worker emits distinct readiness events.
- Workspace can show degraded but usable states.
- Tutor can start when tutor readiness is true even if Source Wiki polish or graph projection is still pending.
- Learner copy never implies that all wiki/graph surfaces are complete when only tutor readiness is true.

Verification:

- API tests for readiness combinations.
- UI view-model tests for tutor-ready/wiki-pending/projection-pending states.

### T10: Graph Semantics Registry

Type: AFK.

Findings: 10.

Blocked by: T08.

What to build:

Centralize canonical graph relation semantics in one registry that maps relation kind, direction, source ownership, learner visibility, search role, and canvas rendering hints.

Acceptance criteria:

- Projection, search, Workspace canvas, and Source Wiki read models consume the registry.
- Relation direction is tested once at the registry boundary.
- Unknown relation kinds fail closed or render in Dev Mode only.
- Learner-visible relation names use product vocabulary.

Verification:

- Registry tests for prerequisite, supports, contradicts, elaborates, source-cites, objective-covers, and session-related relations.
- Projection/read-model tests use registry snapshots.

### T11: Source Wiki Learner View

Type: AFK.

Findings: 11.

Blocked by: T09, T10.

What to build:

Create a Source Wiki learner view model that maps raw wiki page/claim/evidence state into learner-safe page status, Evidence groups, warnings, and actions. Dev Mode can expose raw confidence and provenance; learner mode cannot.

Acceptance criteria:

- Learner-facing Source Wiki pages hide raw confidence, claim status, extraction stats, and debug refs.
- Incomplete pages show humane status language.
- Evidence groups show citations and source excerpts first.
- Contradicted, unsupported, candidate, superseded, and low-confidence claims are hidden unless Dev Mode is enabled.
- API contract distinguishes learner view from Dev Mode view.

Verification:

- View-model tests for draft, candidate, unsupported, contradicted, superseded, published, and failed pages.
- Browser smoke verifies Source Wiki copy in learner mode.

### T12: Workspace Refresh Policy

Type: AFK.

Findings: 12.

Blocked by: T09.

What to build:

Move notebook event to query-invalidation mapping out of `App.tsx` into a shared Workspace Refresh Policy module. The server/read-model should author which surfaces are stale when possible.

Acceptance criteria:

- App consumes a policy function or server-authored refresh hints.
- Event handling for source updates, wiki page changes, reference regeneration, quiz attempts, artifacts, source failures, and session updates is tested outside React.
- React query invalidation uses the policy output.
- Unknown events use a conservative invalidation path without hard-coded one-off logic in `App.tsx`.

Verification:

- Policy tests for each event type.
- Web tests assert invalidation calls for policy outputs.

### T13: Artifact Review Module

Type: AFK.

Findings: 13.

Blocked by: T12.

What to build:

Create one Artifact Review module that derives review payload, learner actions, quality state, regeneration affordances, quiz attempt state, and tutor handoff text for an artifact.

Acceptance criteria:

- TutorPanel and FullPanelViewer read artifact actions from the same interface.
- Quiz artifacts expose identical practice/retry/review actions in every surface.
- Regeneration actions are derived from Artifact Lifecycle state, not hard-coded in the viewer.
- Quality failures render consistent learner-safe copy.

Verification:

- Artifact parity tests compare TutorPanel and FullPanelViewer action sets.
- Quiz reopen hydration test still passes.

### T14: Workspace Shell State Reducer

Type: AFK.

Findings: 14.

Blocked by: T12.

What to build:

Extract Workspace shell state from `Whiteboard` into a tested reducer/state machine covering selected node, right panel mode, Evidence drawer, Dev Mode, graph mode, source filter, and full-panel viewer.

Acceptance criteria:

- Invalid state combinations are impossible or normalized.
- Selecting a source/wiki/concept/artifact opens the expected Reference Surface.
- Dev Mode does not leak into learner mode when toggled off.
- Evidence drawer and full-panel viewer transitions are deterministic.
- `Whiteboard` becomes primarily rendering and event dispatch.

Verification:

- Reducer tests for navigation and mode transitions.
- Browser smoke for Study Map, Source Wiki, Evidence, and artifact viewer.

### T15: Learner Copy Guard

Type: AFK.

Findings: 15.

Blocked by: T11, T14.

What to build:

Add a learner-copy guard at view-model boundaries. It should prevent raw pipeline and debug vocabulary from appearing outside Dev Mode.

Forbidden learner-mode vocabulary examples:

- `debug`
- `raw`
- `provenance`
- `LLM`
- `candidate_claim`
- `objective_list`
- `session_plan`
- `teaching_arc`
- `*_ref`
- raw UUID-heavy labels
- raw pipeline statuses like `tutoring_ready`

Acceptance criteria:

- Learner-facing view models map internal status to product copy.
- Dev Mode still exposes diagnostics.
- Tests scan Workspace and Reference Surface view models for forbidden terms in learner mode.
- Browser smoke verifies source cards, Source Wiki, Study Map, and artifact pages use product copy.

Verification:

- `pnpm --filter @studyagent/web test`
- Playwright/browser smoke on a populated notebook.

### T16: Reference Surface Actions

Type: AFK.

Findings: 16.

Blocked by: T11, T13.

What to build:

Make `ReferenceSurface.primaryActions` the source of truth for learner actions. Web should render and execute these actions through a small action adapter.

Acceptance criteria:

- Reference Surface API returns typed actions for teach, ask, practice quiz, regenerate, open evidence, open source, and review artifact where applicable.
- FullPanelViewer renders actions from `primaryActions`.
- Action adapter maps server-authored action IDs to web behavior.
- Hard-coded graph-node action inference is removed or isolated to a compatibility adapter.

Verification:

- API tests for action sets per reference type.
- Web tests for rendering/executing action IDs.

### T17: Live Eval Observation

Type: AFK.

Findings: 17.

Blocked by: Phase 0.

What to build:

Persist and expose Live Eval Observation events while a Synthetic Learner run is executing. The CLI and dashboard should read from the same observation stream/read model.

Acceptance criteria:

- Eval run is visible as active before completion.
- Scenario start, learner messages, tutor messages, tool events, assertions, artifacts, warnings, and final status append to one stream.
- Dashboard updates active runs by polling or stream subscription.
- CLI can tail the same observation events.
- Completed-run JSON remains an export, not the only observability path.

Verification:

- Integration test starts a run and reads active observation before completion.
- Dashboard test proves active run refresh without manual reload.

### T18: Eval Evidence Snapshot Adapter

Type: AFK.

Findings: 18.

Blocked by: T17.

What to build:

Create an Eval Evidence Snapshot Adapter that captures persisted state needed by assertions: Mastery Evidence, artifacts, quiz attempts, session lifecycle, tutor turns, tool calls, learner trait signals/estimates, Workspace/reference surfaces, and relevant notebook events.

Acceptance criteria:

- Snapshot has explicit categories and availability metadata.
- Required categories missing from the snapshot fail required assertions.
- Optional categories can skip with a structured reason.
- Assertions stop scraping raw transcript when durable state is required.
- Snapshot refs are included in Eval Run output.

Verification:

- Tests where required Mastery Evidence snapshot is missing fail.
- Tests where optional artifact category is absent skip with reason.
- Synthetic Learner API run includes snapshot refs.

### T19: Issue Candidate Builder

Type: AFK.

Findings: 19.

Blocked by: T18.

What to build:

Build an Issue Candidate module that can emit non-published candidates for final failures, suspicious passes, repaired invalid learner actions, degraded observation, missing optional evidence, flaky retries, and quality warnings.

Acceptance criteria:

- Issue candidates can attach to scenario runs even when final status passes.
- Candidate includes severity, title, learner mode, run kind, failure or warning summary, evidence refs, reproduction command, and publish eligibility.
- Dashboard shows warning candidates separately from failed scenarios.
- No GitHub issue is published automatically.

Verification:

- Test: repaired invalid action in autonomous run passes but emits a warning candidate.
- Test: missing optional artifact evidence emits low-severity candidate.

### T20: Eval Run Planner

Type: AFK.

Findings: 20.

Blocked by: T17.

What to build:

Centralize planning of `runKind`, `learnerMode`, gating policy, autonomy level, simulator model config, scenario compatibility, and issue-candidate policy.

Acceptance criteria:

- `runKind` and `learnerMode` are validated together before execution.
- Incompatible combinations fail before any notebook mutation.
- Gating policy defaults are explicit and tested.
- CLI, worker, schema runner, and dashboard use the planner output vocabulary.
- Scripted, beat-driven LLM, scenario-autonomous LLM, and fully autonomous LLM modes remain distinct.

Verification:

- Planner tests for valid/invalid mode combinations.
- CLI test confirms planned config is printed and persisted.

### T21: Learner Trait Signal Ownership

Type: AFK.

Findings: 21.

Blocked by: T03, T04.

What to build:

Remove route-side durable trait writes. Explicit learner self-report and preference signals should flow through a governed tool or a dedicated Learner Trait Signal module that runs after a completed turn with full evidence refs. Inferred behavior signals should come from reflective extraction over completed turns/session traces, not request regex.

Acceptance criteria:

- Route no longer regex-records durable explicit signals.
- Failed, empty, or aborted tutor turns do not create trait signals.
- Explicit self-report signals carry turn, run, session, and source evidence refs.
- One-off requests like "give me an example" do not become durable explicit example preference.
- Reflective extractor stores inferred signals at lower confidence and with source evidence.

Verification:

- Route test for no signal on failed turn.
- Tool/provider test for explicit signal refs.
- Extractor test for one-off example request suppression.

### T22: Learner Trait Estimation Planner

Type: AFK.

Findings: 22.

Blocked by: T21.

What to build:

Move estimation cadence into a planner that decides whether estimation should run before invoking the estimator. The planner implements ADR-0017 triggers.

Acceptance criteria:

- Session completion calls planner first.
- Planner can return `skip` with structured reason.
- Estimator is not invoked for ordinary short sessions without trait-relevant signals.
- Repeated cross-session signals, explicit preference changes, contradiction with Mastery Evidence, and urgency changes can trigger estimation.
- Planning result is persisted or traceable.

Verification:

- Tests for ordinary completion skip, explicit preference trigger, repeated signal trigger, and contradiction trigger.

### T23: Learner Trait Evidence Collector

Type: AFK.

Findings: 23.

Blocked by: T22.

What to build:

Create an evidence collector that assembles bounded notebook-scoped evidence packets for trait estimation. Include current estimates, recent signals, cross-session repeated signals, Mastery Evidence patterns, profile/onboarding data, session summaries, contradictions, and explicit learner preferences.

Acceptance criteria:

- Evidence packet includes all planned context fields when available.
- Collector bounds token/data size and redacts learner-invisible internals from estimator prompts as needed.
- Explicit self-report is prioritized over inferred behavior.
- Contradictions are represented rather than overwritten.
- Estimator tests assert packet shape, not only output estimates.

Verification:

- Collector unit tests for repeated signals, mastery contradiction, explicit preference conflict, and empty evidence.

### T24: Recommendation-Only Trait Assertion

Type: AFK.

Findings: 24.

Blocked by: T18, T22.

What to build:

Replace shallow event-name checks with snapshot-delta assertions proving Learner Trait Estimates only produce Personalization Recommendations and do not mutate forbidden learner/product state.

Forbidden mutations:

- Concept Mastery.
- Objective Progress.
- Weak concepts.
- Curriculum or module progress.
- Artifact consent or artifact generation.
- Source grounding.
- Explicit learner goals.
- Source/wiki/graph readiness.

Acceptance criteria:

- Assertion captures before/after snapshots around trait estimation.
- It fails if forbidden state changes.
- It passes when only trait estimates, trait signals, and Personalization Recommendations change.
- It reports exact forbidden category deltas.
- Synthetic Learner scenarios can require this assertion.

Verification:

- Assertion tests for allowed recommendation deltas and forbidden mastery/objective/artifact deltas.

## Cross-Cutting Regression Suite

After all tickets in a phase land, run the phase gate below.

### Phase 1 Gate

Commands:

```bash
pnpm --filter @studyagent/api test -- tutor-turn mastery tutor-session
pnpm --filter @studyagent/agent-runtime test -- pi-session
pnpm check
```

Manual/API smoke:

```bash
curl -sS http://localhost:3001/health
curl -sS http://localhost:3001/api/v1/notebooks
```

Expected evidence:

- Chat persists turn/run/tool call rows.
- Pi write tools persist non-null `turnId`.
- Vague confirmation does not advance objective.

### Phase 2 Gate

Commands:

```bash
pnpm --filter @studyagent/worker test
pnpm --filter @studyagent/graph test
pnpm --filter @studyagent/api test -- workspace-read-model reference-surface
pnpm check
```

Expected evidence:

- Failed Knowledge Commit rolls back.
- Projection rebuild removes stale source-owned graph state.
- Source Wiki degraded view works when Neo4j is absent or stale.

### Phase 3 Gate

Commands:

```bash
pnpm --filter @studyagent/web test
pnpm --filter @studyagent/api test -- reference-surface artifact
pnpm check
```

Expected evidence:

- Workspace invalidation policy tests pass.
- FullPanelViewer renders server-authored Reference Surface actions.
- Learner-mode copy scan has no forbidden debug terms.

### Phase 4 Gate

Commands:

```bash
pnpm --filter @studyagent/worker synthetic-learner-evals -- --learner-mode=scripted
pnpm --filter @studyagent/worker synthetic-learner-evals -- --learner-mode=beat_llm
pnpm --filter @studyagent/web test -- EvalRunsDashboard
pnpm check
```

Expected evidence:

- Active Eval Run visible during execution.
- Required snapshot gaps fail assertions.
- Warning issue candidates can appear for suspicious passes.

### Phase 5 Gate

Commands:

```bash
pnpm --filter @studyagent/api test -- learner-trait
pnpm --filter @studyagent/worker synthetic-learner-evals -- --learner-mode=scripted --scenario=<trait-recommendation-scenario>
pnpm check
```

Expected evidence:

- Ordinary session completion skips estimator when no trigger exists.
- Repeated trait evidence triggers estimation.
- Recommendation-only assertion catches forbidden state deltas.

### Final End-To-End Gate

Run with Docker services:

```bash
docker compose up -d
pnpm check
pnpm test
pnpm --filter @studyagent/worker synthetic-learner-evals -- --learner-mode=scripted
pnpm --filter @studyagent/worker synthetic-learner-evals -- --learner-mode=beat_llm
```

API interaction gate:

- Create or reuse a notebook.
- Seed or upload a source.
- Start a tutor session through `/api/v1/notebooks/:notebookId/tutor`.
- Ask a Mastery Check answer.
- Confirm persisted turn/run/tool/evidence rows.
- Fetch tutor trace and verify run completion.
- Fetch Workspace/Reference Surface and verify learner-safe actions/copy.

Simulator gate:

- Run the Synthetic Learner suite.
- Verify active observation is visible while the scenario is still running.
- Verify final Eval Run contains snapshot refs, assertion results, issue candidates, and reproduction commands.

## Status Update Rules

Do not mark a finding fixed unless all are true:

1. The implementation ticket acceptance criteria pass.
2. The relevant phase gate passes.
3. At least one test proves the old failure mode cannot recur.
4. The doc status names the exact verification command or evidence.

Allowed statuses:

- Open: no implementation or current implementation does not address the finding.
- Partial: meaningful implementation exists but ownership, evidence, or verification remains incomplete.
- Fixed: implementation and regression tests close the original failure mode.
- Deferred: explicitly accepted by a human with rationale and a follow-up owner.

## Publishing Guidance

If these are published as GitHub issues, create one parent issue:

Title: `Architecture remediation current plan`

Labels:

- `ready-for-agent` for AFK implementation tickets.
- `ready-for-human` only if a ticket requires design ratification.

Parent issue body:

```markdown
## What to build

Complete the remaining architecture remediation program from `docs/architecture/architecture-remediation-current-plan-2026-05-28.md`.

The current audit shows 1 fixed, 8 partial, and 15 open findings. Work through the tickets in dependency order, preserving existing ADRs and product vocabulary.

## Acceptance criteria

- [ ] Runtime correctness tickets T01-T06 are fixed and phase gate passes.
- [ ] Knowledge commit and graph tickets T07-T11 are fixed and phase gate passes.
- [ ] Workspace/artifact tickets T12-T16 are fixed and phase gate passes.
- [ ] Synthetic Learner tickets T17-T20 and T24 are fixed and phase gate passes.
- [ ] Learner Trait tickets T21-T24 are fixed and phase gate passes.
- [ ] Final Docker API and Synthetic Learner simulator gates pass.
```

Publish child issues from the ticket sections above in dependency order.
