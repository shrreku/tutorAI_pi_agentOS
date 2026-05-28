# Architecture Remediation Implementation Tickets

Status: draft for review before publishing to GitHub Issues.

Current status note, 2026-05-28: this ticket list is still useful, but the latest item-by-item audit should drive remaining implementation. Use `docs/architecture/architecture-remediation-current-plan-2026-05-28.md` for current fixed/partial/open status, updated dependencies, and phase verification gates.

This document breaks `docs/architecture/architecture-remediation-plan.md` into tracer-bullet implementation tickets. Each ticket is intended to be independently grabbable. Use `ready-for-agent` for AFK tickets and `ready-for-human` for decision/review tickets if these are published to GitHub Issues.

## Publishing Plan

Create one parent GitHub issue named `Architecture remediation program`, then publish the tickets below in dependency order. Use this document as the issue source of truth until the tickets are published.

## Ticket Index

1. Ratify remediation scope and downgrade overclaimed status docs.
2. Tutor Turn Preparation: move host-state assembly behind the Tutor Turn Interface.
3. Pi Adapter: refresh cached sessions when StudyAgent host state changes.
4. Runtime Tool Context: thread Tutor Turn identity into Pi tool execution.
5. Mastery Runtime: persist pending evaluation context from prompt turns.
6. Objective Progression: require mastery-backed advancement.
7. Tutor Session Lifecycle: centralize pause, resume, end, runtime disposal, and crystallization.
8. Learner Trait Signal Ownership: remove route-side durable signal writes.
9. Learner Trait Estimation Planner: make cadence explicit before estimator execution.
10. Learner Trait Evidence Collector: include cross-session signals and Mastery Evidence.
11. Knowledge Commit: apply WikiChangeSet and bootstrap writes transactionally.
12. Source Readiness Model: split tutor, wiki, planning, and projection readiness.
13. Source Wiki Degraded Read Model: handle projection absence without hard learner failure.
14. Source Projection Rebuild: delete source-owned stale projection state.
15. Graph Semantics: centralize relation direction and mapping.
16. Source Wiki Learner View: map learner-facing page status and Evidence groups.
17. Workspace Refresh Policy: move event invalidation out of `App`.
18. Artifact Review Module: unify artifact actions across TutorPanel and FullPanelViewer.
19. Reference Surface Actions: render and execute `primaryActions`.
20. Workspace Shell State: extract right-panel, Evidence, Dev Mode, and selection transitions.
21. Learner Copy Guard: prevent debug/internal copy in learner surfaces.
22. Eval Evidence Snapshot: collect real persisted state for assertions.
23. Synthetic Learner Assertion Semantics: fail missing required snapshots.
24. Live Eval Observation: persist active run events before completion.
25. Issue Candidate Builder: surface suspicious passed runs.
26. Eval Run Planner: keep `runKind`, `learnerMode`, gating, and autonomy compatible.
27. Recommendation-Only Trait Assertion: verify no forbidden state deltas.
28. End-to-end remediation regression suite.

## 1. Ratify Remediation Scope And Downgrade Overclaimed Status Docs

Type: HITL

Blocked by: None - can start immediately.

User stories covered:

- As a maintainer, I want current docs to distinguish "Module exists" from "runtime verified" so future agents do not skip real hardening work.
- As a developer, I want the remediation program sequenced before implementation begins.

What to build:

Review this remediation program, confirm which tickets should be published, and update status language in existing architecture docs so completed claims do not imply unresolved hardening is already done.

Acceptance criteria:

- [ ] Existing implementation docs link to this remediation program.
- [ ] Docs that say "implemented locally through all planned slices" clarify which parts are contract/stub implemented versus runtime verified.
- [ ] Architecture-deepening docs mark graph projection, Workspace read model, Synthetic Learner live observation, and learner trait estimates as having hardening follow-ups.
- [ ] No accepted ADR is silently contradicted.
- [ ] Human reviewer confirms ticket order and scope.

## 2. Tutor Turn Preparation: Move Host-State Assembly Behind The Tutor Turn Interface

Type: AFK

Blocked by:

- 1. Ratify remediation scope and downgrade overclaimed status docs.

User stories covered:

- As a maintainer, I want Tutor Turn behavior testable without HTTP/SSE setup.
- As a learner, I want every turn to use current StudyAgent state.

What to build:

Move study state loading, selected artifact context, intent routing, personalization recommendations, context selection, source-scope instructions, runtime mastery preflight handoff, tool registry creation, and run creation behind the Tutor Turn Interface. Keep the tutor chat route responsible for auth, request parsing, and SSE writing.

Acceptance criteria:

- [ ] Tutor chat route delegates turn preparation to the Tutor Turn Module after authorization.
- [ ] Tutor Turn tests cover personalization recommendations, strict source-scope instructions, open artifact context, and context-selection failure behavior.
- [ ] Route-level tests remain as protocol smoke tests.
- [ ] The Tutor Turn Interface accepts authorized notebook/user/session inputs rather than prebuilt prompt context internals.
- [ ] Existing tutor chat behavior is preserved.

## 3. Pi Adapter: Refresh Cached Sessions When StudyAgent Host State Changes

Type: AFK

Blocked by:

- 2. Tutor Turn Preparation: move host-state assembly behind the Tutor Turn Interface.

User stories covered:

- As a learner, I want the tutor to use current mastery, Source scope, artifact, and personalization state.
- As a maintainer, I want Pi session reuse to be safe and observable.

What to build:

Add a material host-state signature to Tutor Turn runtime preparation and Pi Adapter cache decisions. Refresh or replace cached Pi sessions when material prompt context changes, or inject fresh host state through a per-turn context channel that is proven to affect the SDK run.

Acceptance criteria:

- [ ] Host-state signature covers mastery summary, learner progress summary, personalization recommendations, source-scope policy, selected refs, open artifact, current objective, and context-selection reasoning.
- [ ] Tests prove changed personalization refreshes runtime state even when selected refs are unchanged.
- [ ] Tests prove changed strict Source scope refreshes runtime state.
- [ ] Runtime replacement emits a durable event or trace reason when the host-state signature changes.
- [ ] Cache reuse still works when only non-material transient fields change.

## 4. Runtime Tool Context: Thread Tutor Turn Identity Into Pi Tool Execution

Type: AFK

Blocked by:

- 2. Tutor Turn Preparation: move host-state assembly behind the Tutor Turn Interface.

User stories covered:

- As a maintainer, I want every governed write to be auditable to the Tutor Turn that caused it.
- As a developer, I want Pi tool execution and direct provider tests to share the same write context invariants.

What to build:

Thread `turnId` from Tutor Turn into runtime/Pi session input and tool context. Ensure `learning.evaluate_response` and other write tools receive notebook, user, session, run, and turn identity when invoked through the Pi Adapter.

Acceptance criteria:

- [ ] Runtime tool context includes `turnId` for tools executed through `runStudyAgentTutorSession`.
- [ ] `learning.evaluate_response` through the Pi Adapter persists Mastery Evidence with a non-null Tutor Turn ref.
- [ ] Regression test covers runtime execution, not just direct write-provider invocation.
- [ ] Tool context typing rejects write-tool execution without required identity where applicable.

## 5. Mastery Runtime: Persist Pending Evaluation Context From Prompt Turns

Type: AFK

Blocked by:

- 2. Tutor Turn Preparation: move host-state assembly behind the Tutor Turn Interface.
- 4. Runtime Tool Context: thread Tutor Turn identity into Pi tool execution.

User stories covered:

- As a learner, I want my answers evaluated against the question and context I actually received.
- As a maintainer, I want Mastery Evidence attribution to remain stable when the learner changes Workspace focus.

What to build:

Persist pending Mastery Check context when the assistant prompt turn is created. The pending context should include prompt turn ID, question text, objective/concept/source refs, selected chunks or evidence refs, and source-scope policy. Runtime answer evaluation should read this persisted prompt-turn context rather than reconstructing it from the current request.

Acceptance criteria:

- [ ] Pending evaluation context is saved with the assistant prompt turn or runtime context at question creation.
- [ ] Fallback lookup reads objective/concept/source refs from the prompt-turn context.
- [ ] Current request selected refs are not used to reattribute an older pending evaluation.
- [ ] Test covers learner changing selected Source or Objective between question and answer.
- [ ] General chat acknowledgements do not create pending evaluations.

## 6. Objective Progression: Require Mastery-Backed Advancement

Type: AFK

Blocked by:

- 5. Mastery Runtime: persist pending evaluation context from prompt turns.

User stories covered:

- As a learner, I do not want the system to mark objectives complete just because I said "got it."
- As a maintainer, I want Objective progress to be auditable through Mastery Evidence or governed decisions.

What to build:

Replace vague-confirmation objective completion with mastery-backed Objective progression. Learner confirmations may request continuation, but Objective completion should require recent strong Mastery Evidence, quiz success, or an explicit governed tutor tool decision.

Acceptance criteria:

- [ ] `continue`, `next`, `got it`, and `makes sense` do not complete an Objective by themselves.
- [ ] Recent strong Mastery Evidence can complete or advance an Objective through a reducer or governed progression path.
- [ ] Events identify the evidence or governed decision behind Objective completion.
- [ ] Tests cover vague confirmation, correct quiz answer, strong open-ended explanation, and low-confidence evidence.

## 7. Tutor Session Lifecycle: Centralize Pause, Resume, End, Runtime Disposal, And Crystallization

Type: AFK

Blocked by:

- 2. Tutor Turn Preparation: move host-state assembly behind the Tutor Turn Interface.

User stories covered:

- As a learner, I want pause, resume, and end to behave consistently.
- As a maintainer, I want Session state transitions and crystallization behind one Seam.

What to build:

Deepen Tutor Session Lifecycle so pause, resume, end, runtime disposal/replacement, lifecycle events, and crystallization handoff cross one Interface. Route handlers should call lifecycle operations and return protocol responses.

Acceptance criteria:

- [ ] Pause, resume, and end routes delegate state transition policy to Tutor Session Lifecycle.
- [ ] Runtime disposal/replacement is invoked from lifecycle policy, not route-local code.
- [ ] Crystallization is triggered only at meaningful lifecycle boundaries.
- [ ] Tests cover active to paused, paused to active, active to completed, no-turn completion, and runtime replacement failure event.

## 8. Learner Trait Signal Ownership: Remove Route-Side Durable Signal Writes

Type: AFK

Blocked by:

- 2. Tutor Turn Preparation: move host-state assembly behind the Tutor Turn Interface.
- 4. Runtime Tool Context: thread Tutor Turn identity into Pi tool execution.

User stories covered:

- As a learner, I want durable personalization signals to reflect real completed interactions, not failed turns.
- As a maintainer, I want explicit self-report, tutor observation, and behavior extraction lanes to stay distinct.

What to build:

Move deterministic trait signal extraction out of the tutor route. Either place it behind a post-turn Learner Trait Signal Module with turn/run evidence refs, or require the governed `learner_trait.record_signal` tool for durable writes. Broad regex matches should not create high-confidence explicit signals before a Tutor Turn exists.

Acceptance criteria:

- [ ] Tutor route no longer records durable Learner Trait Signals before turn creation.
- [ ] No signal is recorded for failed or empty tutor turns.
- [ ] Signal evidence refs include turn/run IDs and enough learner utterance context for audit.
- [ ] "Give me an example" does not become a durable explicit example preference unless confirmed or tool-recorded as such.
- [ ] Tests cover explicit pace request, generic example request, failed turn, and governed tool signal.

## 9. Learner Trait Estimation Planner: Make Cadence Explicit Before Estimator Execution

Type: AFK

Blocked by:

- 8. Learner Trait Signal Ownership: remove route-side durable signal writes.

User stories covered:

- As a maintainer, I want trait estimation to run only when evidence warrants it.
- As a developer, I want session boundaries to record why estimation was considered or ignored.

What to build:

Add a Learner Trait Estimation Planner that runs before estimator execution. The planner decides whether a session/crystallization boundary is eligible, why, and which evidence window should be collected. It should avoid constructing or invoking estimator clients for ordinary session ends without trait-relevant evidence.

Acceptance criteria:

- [ ] Planner records skipped reasons for ordinary no-trigger sessions.
- [ ] Planner chooses estimation for explicit preference changes, repeated trait signals, mastery/self-report contradiction, goal urgency changes, and explicit agent decision.
- [ ] Estimator cycle runs only after planner chooses estimation.
- [ ] Tests cover no-turn session, short ordinary session, explicit preference, repeated signals, and contradiction.

## 10. Learner Trait Evidence Collector: Include Cross-Session Signals And Mastery Evidence

Type: AFK

Blocked by:

- 9. Learner Trait Estimation Planner: make cadence explicit before estimator execution.

User stories covered:

- As a maintainer, I want Learner Trait Estimates to be evidence-backed across the notebook, not just one session.
- As a tutor, I want Personalization Recommendations grounded in durable evidence.

What to build:

Deepen the trait evidence packet builder into a collector that can include current-session signals, notebook-scoped recent signals, Mastery Evidence summaries, session/turn summaries, profile preferences, contradictions, and stale estimates. Treat `sessionId` as provenance and scope hint, not as the only evidence window.

Acceptance criteria:

- [ ] Evidence packets include cross-session repeated signals when relevant.
- [ ] Mastery Evidence summaries can be included for confidence/metacognitive contradiction.
- [ ] Profile preference summaries are included when explicit learner settings exist.
- [ ] Irrelevant notebook/user evidence is excluded.
- [ ] Tests cover repeated signals across two sessions triggering estimation.

## 11. Knowledge Commit: Apply WikiChangeSet And Bootstrap Writes Transactionally

Type: AFK

Blocked by:

- 1. Ratify remediation scope and downgrade overclaimed status docs.

User stories covered:

- As a maintainer, I want source enrichment retries to avoid half-replaced canonical knowledge.
- As a learner, I want Source Wiki, curriculum, and Live Plan state to appear consistently after ingestion.

What to build:

Introduce a Knowledge Commit Module that applies WikiChangeSet, curriculum/module/objective/session bootstrap, coverage seeding, source readiness metadata, and append-only events in a transaction or explicit outbox-backed commit. Neo4j projection should run after commit.

Acceptance criteria:

- [ ] WikiChangeSet deletes/inserts and event appends are covered by one transaction or equivalent outbox pattern.
- [ ] Curriculum/session/coverage bootstrap either commits atomically with wiki minimum state or is explicitly staged with recoverable status.
- [ ] Test simulates mid-apply failure and proves old canonical state is not half-deleted.
- [ ] Commit result reports applied counts and readiness components.
- [ ] Projection is queued or executed only after successful commit.

## 12. Source Readiness Model: Split Tutor, Wiki, Planning, And Projection Readiness

Type: AFK

Blocked by:

- 11. Knowledge Commit: apply WikiChangeSet and bootstrap writes transactionally.

User stories covered:

- As a learner, I want honest source status when the tutor is ready but Source Wiki is still improving.
- As a maintainer, I want readiness gates to be explicit and inspectable.

What to build:

Add persisted readiness components for retrieval-ready, wiki-minimum-ready, planning-ready, projection-ready, learner-source-wiki-ready, and tutoring-ready. Keep `tutoring_ready` as tutor viability, not full surface readiness.

Acceptance criteria:

- [ ] Source readiness payload distinguishes retrieval, wiki, planning, projection, learner-source-wiki, and tutoring readiness.
- [ ] `source.tutoring_ready` event does not imply Source Wiki projection readiness.
- [ ] Workspace and Source Wiki can display "still improving" when appropriate.
- [ ] Tests cover projection failure with tutor viability preserved.

## 13. Source Wiki Degraded Read Model: Handle Projection Absence Without Hard Learner Failure

Type: AFK

Blocked by:

- 12. Source Readiness Model: split tutor, wiki, planning, and projection readiness.

User stories covered:

- As a learner, I want Source Wiki to degrade gracefully when graph projection is unavailable.
- As a maintainer, I want projection failures observable without breaking tutor viability.

What to build:

Make Source Wiki graph/read routes return a Postgres-backed degraded read model when Neo4j is absent or projection health is failed. The read model should include learner-safe warnings and available wiki/concept pages.

Acceptance criteria:

- [ ] Source Wiki route no longer hard-fails solely because Neo4j is unavailable.
- [ ] Degraded read model includes projection health and learner-safe warning.
- [ ] Dev Mode can inspect projection failure details.
- [ ] Tests cover Neo4j absent, projection failed, and projection healthy paths.

## 14. Source Projection Rebuild: Delete Source-Owned Stale Projection State

Type: AFK

Blocked by:

- 11. Knowledge Commit: apply WikiChangeSet and bootstrap writes transactionally.

User stories covered:

- As a learner, I do not want stale Source Wiki or Study Map edges after a source is recompiled.
- As a maintainer, I want source projection rebuild to mean rebuild, not additive merge.

What to build:

Tag projected nodes/relationships with projection scope or maintain a source projection manifest, then extend source-scope clearing so stale relations and nodes owned by a source disappear before replay.

Acceptance criteria:

- [ ] Source-owned projected relationships can be identified and deleted.
- [ ] Rebuild test proves a relation present in projection A and absent in projection B is removed.
- [ ] Notebook-wide rebuild still works.
- [ ] Projection health records deletion/replay outcome.

## 15. Graph Semantics: Centralize Relation Direction And Mapping

Type: AFK

Blocked by:

- 14. Source Projection Rebuild: delete source-owned stale projection state.

User stories covered:

- As a maintainer, I want search, graph projection, and canvas to agree on relation semantics.
- As a learner, I want Source Wiki and Study Map connections to be consistent.

What to build:

Create a Graph Semantics Module that maps canonical relation intent to Postgres relation type, Neo4j relation, query direction, search expansion semantics, canvas relation name, and learner visibility. Fix the `CITES` direction mismatch through this Module.

Acceptance criteria:

- [ ] Canonical relation taxonomy is defined in one Module.
- [ ] Neo4j projection and Neo4j queries use the same direction for claim/concept citations.
- [ ] Search graph channel uses Graph Semantics rather than local relation-type switches.
- [ ] Canvas projection uses Graph Semantics for learner-visible relation labels.
- [ ] Integration test proves claim-linked concept page appears in Source Wiki.

## 16. Source Wiki Learner View: Map Learner-Facing Page Status And Evidence Groups

Type: AFK

Blocked by:

- 13. Source Wiki Degraded Read Model: handle projection absence without hard learner failure.
- 15. Graph Semantics: centralize relation direction and mapping.

User stories covered:

- As a learner, I want Source Wiki pages to show humane status and Evidence, not raw pipeline state.
- As a maintainer, I want learner and Dev Mode Source Wiki views separated.

What to build:

Add a Source Wiki Learner View Module that maps raw wiki page status, claims, confidence, support, and projection state into learner-facing status, safe Reference Surface blocks, Evidence groups, and Dev Mode debug groups.

Acceptance criteria:

- [ ] Learner-facing status is separate from raw `wiki_pages.status`.
- [ ] Draft/candidate/failed/published pages have tested learner and Dev Mode behavior.
- [ ] Candidate, low-confidence, contradicted, superseded, and raw claim details stay out of learner mode.
- [ ] Evidence groups expose source excerpts and supporting notes without raw debug leakage.

## 17. Workspace Refresh Policy: Move Event Invalidation Out Of `App`

Type: AFK

Blocked by:

- 1. Ratify remediation scope and downgrade overclaimed status docs.

User stories covered:

- As a learner, I want Workspace surfaces to refresh after source, wiki, artifact, mastery, and regeneration changes.
- As a developer, I want event invalidation rules tested in one place.

What to build:

Create a shared Workspace Refresh Policy that maps notebook event types to query invalidations and refresh domains. Add missing event schema coverage or remove unsupported events.

Acceptance criteria:

- [ ] `reference.regenerated` is either added to shared event schema or replaced with a schema-supported event.
- [ ] `wiki.page.updated`, regeneration, quiz attempt, artifact failure, source failure, mastery update, and session lifecycle events classify to correct refresh domains.
- [ ] `App` consumes the policy instead of maintaining an event allowlist.
- [ ] Tests cover query invalidation domains.

## 18. Artifact Review Module: Unify Artifact Actions Across TutorPanel And FullPanelViewer

Type: AFK

Blocked by:

- 17. Workspace Refresh Policy: move event invalidation out of `App`.

User stories covered:

- As a learner, I want artifact actions to behave consistently whether I open them from tutor chat or the Workspace.
- As a maintainer, I want artifact review behavior behind one Interface.

What to build:

Create an Artifact Review Module with one Interface for loading review state, executing approve/reject/save/review actions, recording quiz/flashcard attempts, and requesting regeneration. Web surfaces should consume action descriptors.

Acceptance criteria:

- [ ] TutorPanel artifact modal and FullPanelViewer use the same artifact action model.
- [ ] The same artifact status exposes the same actions in both surfaces.
- [ ] Quiz attempt recording path is shared or wrapped by the same Interface.
- [ ] Artifact regeneration invalidates through Workspace Refresh Policy.
- [ ] Tests cover approve, reject, save note, quiz attempt, flashcard review, and regeneration parity.

## 19. Reference Surface Actions: Render And Execute `primaryActions`

Type: AFK

Blocked by:

- 18. Artifact Review Module: unify artifact actions across TutorPanel and FullPanelViewer.

User stories covered:

- As a learner, I want Reference Surface actions to match what the API says is available.
- As a maintainer, I want web actions to be driven by Reference Surface Interface, not graph-node guesses.

What to build:

Extend and consume `ReferenceSurface.primaryActions` as the action Interface for FullPanelViewer. Include action labels, command IDs, target refs, and preconditions. Stop deriving quiz/artifact action behavior from graph node properties when the Reference Surface already says what it is.

Acceptance criteria:

- [ ] FullPanelViewer renders primary actions from Reference Surface.
- [ ] Stale graph node properties do not break quiz/action rendering when Reference Surface is current.
- [ ] API includes preconditions needed by web action rendering.
- [ ] Tests cover concept, objective, source, artifact, and fallback surfaces.

## 20. Workspace Shell State: Extract Right-Panel, Evidence, Dev Mode, And Selection Transitions

Type: AFK

Blocked by:

- 17. Workspace Refresh Policy: move event invalidation out of `App`.

User stories covered:

- As a learner, I want Workspace navigation to stay coherent when switching modes, references, Evidence, and Dev Mode.
- As a developer, I want Workspace state transitions tested without rendering the full shell.

What to build:

Extract a Workspace Shell State reducer/module that owns selected node, view mode, source selection, right-panel mode, Evidence drawer, Dev Mode, filters, and tutor-ref synchronization transitions.

Acceptance criteria:

- [ ] Reducer tests cover select node, clear missing node, open/close Reference Surface, open/close Evidence, switch view mode, toggle Dev Mode, and source selection.
- [ ] Tutor selected refs update through explicit transition effects.
- [ ] `Whiteboard` becomes an Adapter wiring state to child views.
- [ ] Invalid states such as viewer open without a selected node are impossible or auto-corrected.

## 21. Learner Copy Guard: Prevent Debug/Internal Copy In Learner Surfaces

Type: AFK

Blocked by:

- 18. Artifact Review Module: unify artifact actions across TutorPanel and FullPanelViewer.
- 20. Workspace Shell State: extract right-panel, Evidence, Dev Mode, and selection transitions.

User stories covered:

- As a learner, I want Workspace and artifact surfaces to use study vocabulary, not internal debug labels.
- As a maintainer, I want learner-copy regressions caught by tests.

What to build:

Add learner copy helpers or view-model mapping for artifact statuses, Evidence labels, Source refs, Objective refs, confidence/status fields, and internal artifact kinds. Add tests that deny raw debug terms in learner mode.

Acceptance criteria:

- [ ] TutorPanel artifact modal does not show raw artifact type/status, `NOTE MARKDOWN`, raw refs, or internal artifact names in learner mode.
- [ ] NodeDetailPanel hides confidence/status debug fields unless Dev Mode is enabled.
- [ ] Artifact view copy maps `session_plan` and `teaching_arc` to learner-safe labels or hides them.
- [ ] Learner-visible render tests deny `LLM`, `debug`, `raw`, `provenance`, `*_ref`, and raw internal IDs where inappropriate.

## 22. Eval Evidence Snapshot: Collect Real Persisted State For Assertions

Type: AFK

Blocked by:

- 11. Knowledge Commit: apply WikiChangeSet and bootstrap writes transactionally.
- 4. Runtime Tool Context: thread Tutor Turn identity into Pi tool execution.

User stories covered:

- As a maintainer, I want Synthetic Learner persistence assertions to prove real product state.
- As a developer, I want eval assertions to fail when required evidence is unavailable.

What to build:

Define and implement an Eval Evidence Snapshot Adapter that collects notebook events, session events, Mastery Evidence, artifacts, trait signals/estimates, source refs, tutor turns, and relevant pre/post state. Wire it into the Synthetic Learner runner.

Acceptance criteria:

- [ ] Snapshot contract distinguishes unavailable, empty, and present evidence categories.
- [ ] Worker runner supplies snapshots to assertion evaluation.
- [ ] Persistence assertions can inspect Mastery Evidence, artifacts, session lifecycle, trait signals/estimates, and notebook events.
- [ ] Tests prove required state checks use snapshots, not transcripts.

## 23. Synthetic Learner Assertion Semantics: Fail Missing Required Snapshots

Type: AFK

Blocked by:

- 22. Eval Evidence Snapshot: collect real persisted state for assertions.

User stories covered:

- As a maintainer, I want passing evals to mean required evidence was checked.
- As a developer, I want skipped assertions to be explicit and non-gating only when configured.

What to build:

Update Synthetic Learner assertion semantics so required persistence assertions fail when required snapshot categories are unavailable. Keep optional qualitative/rubric assertions skippable when explicitly marked.

Acceptance criteria:

- [ ] Required persistence assertions fail when snapshot category is unavailable.
- [ ] Optional assertions can still skip with a reason.
- [ ] Scenario run summary distinguishes failed, skipped-optional, and unavailable-required assertions.
- [ ] Tests update current skipped-persistence passing behavior.

## 24. Live Eval Observation: Persist Active Run Events Before Completion

Type: AFK

Blocked by:

- 22. Eval Evidence Snapshot: collect real persisted state for assertions.

User stories covered:

- As a maintainer, I want to watch student, tutor, tool, assertion, artifact, and issue-candidate events while an eval is running.
- As a developer, I want the dashboard and CLI to read the same observation stream.

What to build:

Create Eval Run Observation persistence. Create Eval Run records before execution, append observation events or step snapshots during execution, and mark completion separately. Dashboard should show active runs via polling or SSE.

Acceptance criteria:

- [ ] Eval Run exists with status `running` before first scenario completes.
- [ ] Student messages, tutor messages, tool events, assertion results, artifact refs, and issue candidates append during execution.
- [ ] Dashboard can show active run progress without manual completed-run refresh.
- [ ] CLI and dashboard consume the same observation/read model.
- [ ] Tests cover in-progress run visibility.

## 25. Issue Candidate Builder: Surface Suspicious Passed Runs

Type: AFK

Blocked by:

- 23. Synthetic Learner Assertion Semantics: fail missing required snapshots.
- 24. Live Eval Observation: persist active run events before completion.

User stories covered:

- As a maintainer, I want suspicious LLM learner behavior surfaced even when a run technically passes.
- As a developer, I want issue candidates to separate warnings from failures.

What to build:

Create issue-candidate taxonomy and builder independent from final failed status. Include repaired invalid actions, unavailable evidence snapshots, optional assertion skips, required action not covered, suspicious finish, raw ID leak repaired later, and simulator/tool mismatch.

Acceptance criteria:

- [ ] Passing autonomous run with repaired invalid action produces warning issue candidate.
- [ ] Failed run still produces failure issue candidate.
- [ ] Dashboard groups warning and failure candidates separately.
- [ ] Candidate includes reproduction command, learner mode, run kind, persona, scenario, fixture, evidence refs, and transcript excerpt.

## 26. Eval Run Planner: Keep `runKind`, `learnerMode`, Gating, And Autonomy Compatible

Type: AFK

Blocked by:

- 24. Live Eval Observation: persist active run events before completion.

User stories covered:

- As a maintainer, I want eval intent and learner behavior mode planned together.
- As a developer, I want invalid runKind/learnerMode combinations rejected before execution.

What to build:

Add Eval Run Planner that selects scenario compatibility, runKind, learnerMode, gating policy, simulator model config, autonomy start profile, and assertion requirements before execution.

Acceptance criteria:

- [ ] Planner rejects incompatible runKind/learnerMode/scenario combinations.
- [ ] `runKind` remains "why this eval exists"; `learnerMode` remains "how turns are produced."
- [ ] CLI delegates run selection to planner instead of global learnerMode overrides alone.
- [ ] Tests cover scripted regression, beat LLM golden journey, scenario-autonomous discovery, and full-autonomous discovery.

## 27. Recommendation-Only Trait Assertion: Verify No Forbidden State Deltas

Type: AFK

Blocked by:

- 10. Learner Trait Evidence Collector: include cross-session signals and Mastery Evidence.
- 22. Eval Evidence Snapshot: collect real persisted state for assertions.

User stories covered:

- As a maintainer, I want Learner Trait Estimates to remain recommendation-only.
- As a learner, I do not want inferred traits to directly mutate mastery, curriculum, weak concepts, objectives, artifacts, or source grounding.

What to build:

Replace event-name-based recommendation-only checks with pre/post Eval Evidence Snapshot assertions. Detect forbidden deltas in Mastery Evidence, learning state, weak concepts, objectives, curriculum, study plan, artifact lifecycle, and source grounding after trait estimation.

Acceptance criteria:

- [ ] Assertion compares pre/post snapshots around trait estimation.
- [ ] Trait estimates and recommendations may change; forbidden product state deltas fail.
- [ ] Test fixture proves direct mastery/curriculum/artifact mutation fails.
- [ ] Passing fixture proves recommendations are persisted without forbidden mutations.

## 28. End-To-End Remediation Regression Suite

Type: AFK

Blocked by:

- 6. Objective Progression: require mastery-backed advancement.
- 16. Source Wiki Learner View: map learner-facing page status and Evidence groups.
- 21. Learner Copy Guard: prevent debug/internal copy in learner surfaces.
- 23. Synthetic Learner Assertion Semantics: fail missing required snapshots.
- 27. Recommendation-Only Trait Assertion: verify no forbidden state deltas.

User stories covered:

- As a maintainer, I want one suite that proves the repaired architecture holds across tutor runtime, knowledge, Workspace, evals, and traits.

What to build:

Add cross-track regression coverage that runs narrow end-to-end scenarios through public product surfaces or stable Module Interfaces. The suite should prove that the highest-risk remediations work together rather than only in isolated unit tests.

Acceptance criteria:

- [ ] Runtime scenario proves fresh host state reaches Pi and Mastery Evidence has turn refs.
- [ ] Knowledge scenario proves transactional commit and projection rebuild cleanup.
- [ ] Workspace scenario proves regeneration refresh and learner-copy guard.
- [ ] Synthetic Learner scenario proves required persistence snapshot assertions.
- [ ] Trait scenario proves recommendation-only behavior with pre/post snapshots.
- [ ] Suite is documented as the remediation acceptance gate.
