# Interactive Learning Pipeline Implementation Tickets

Status: GitHub-ready local ticket packet.

These are implementation-ticket drafts for [`interactive-learning-pipeline-implementation-plan.md`](./interactive-learning-pipeline-implementation-plan.md). They are intentionally written as vertical slices: each ticket should produce a demoable or verifiable path through the system, not a disconnected layer.

Implementation work should ultimately be tracked in GitHub Issues for `shrreku/tutorAI_pi_agentOS`. Publish these drafts to GitHub before assigning AFK implementation work.

## Breakdown Review

| ID      | Title                                                                | Type | Blocked by               |
| ------- | -------------------------------------------------------------------- | ---- | ------------------------ |
| ILP-001 | Protect the current Interactive Learning baseline                    | AFK  | None                     |
| ILP-002 | Add the typed template SDK with a diagnostics tracer template        | AFK  | ILP-001                  |
| ILP-003 | Build immutable template manifests and generated catalog locally     | AFK  | ILP-002                  |
| ILP-004 | Load the diagnostics template through the official MCP App Host path | AFK  | ILP-003                  |
| ILP-005 | Route app-visible tool calls into validated StudyAgent actions       | AFK  | ILP-004                  |
| ILP-006 | Replace the handwritten registry with the generated catalog path     | AFK  | ILP-004                  |
| ILP-007 | Resolve Learning Interaction Requests to exact template versions     | AFK  | ILP-003, ILP-006         |
| ILP-008 | Promote `quiz` as the first learner-facing template                  | AFK  | ILP-005, ILP-007         |
| ILP-009 | Persist promotion runs and evidence references                       | AFK  | ILP-003                  |
| ILP-010 | Build the Template Promotion Lab queue and detail review surface     | AFK  | ILP-009                  |
| ILP-011 | Add Git-bound approval, publication, and revocation                  | HITL | ILP-010                  |
| ILP-012 | Show dependency, sandbox, CSP, and network evidence in the Lab       | AFK  | ILP-010                  |
| ILP-013 | Enforce Template-Only vs Platform-Extension classification           | AFK  | ILP-010, ILP-012         |
| ILP-014 | Build the local generated-code draft executor                        | AFK  | ILP-003, ILP-004         |
| ILP-015 | Add Template Builder Agent draft generation and draft PR automation  | HITL | ILP-014                  |
| ILP-016 | Promote `function-explorer`                                          | AFK  | ILP-008, ILP-011         |
| ILP-017 | Promote `flashcard-review`                                           | AFK  | ILP-008, ILP-011         |
| ILP-018 | Promote `worked-example-stepper`                                     | AFK  | ILP-008, ILP-011         |
| ILP-019 | Promote `evidence-comparator`                                        | AFK  | ILP-008, ILP-011         |
| ILP-020 | Promote `live-plan`                                                  | AFK  | ILP-008, ILP-011         |
| ILP-021 | Add Workspace Stage and Surface Anchors                              | AFK  | ILP-004                  |
| ILP-022 | Add ordered Surface Cues and Choreography Snapshot recovery          | AFK  | ILP-021                  |
| ILP-023 | Promote `animated-process` with tutor-synchronized staging           | AFK  | ILP-022                  |
| ILP-024 | Promote `electron-flow-lab` as the complex simulation benchmark      | HITL | ILP-016, ILP-022         |
| ILP-025 | Decide and implement the optional SceneryStack renderer adapter      | HITL | ILP-024                  |
| ILP-026 | Add the Interaction Director Agent                                   | HITL | ILP-016-ILP-024          |
| ILP-027 | Harden the full pipeline for hosted runtime and promotion operations | AFK  | ILP-011, ILP-016-ILP-024 |

## Ticket Drafts

### ILP-001: Protect the current Interactive Learning baseline

Type: AFK

Blocked by: None - can start immediately.

#### What to build

Create a baseline compatibility map and regression coverage for the current Interactive Learning implementation before replacing the private iframe bridge and handwritten registry. The result should make current block kinds, action dispatch, native fallbacks, tutor launch seams, and registered bundle identities explicit.

#### Acceptance criteria

- [ ] Current block kinds are mapped to target Interaction Families and candidate template IDs.
- [ ] Current action names are mapped to canonical Interactive Learning Actions.
- [ ] Existing `apps/web/src/interactive-learning/` registry and bridge behavior is documented as migration source, not target architecture.
- [ ] Focused tests protect existing action dispatch and native fallback rendering before migration.
- [ ] The implementation plan identifies which current `unknown` payload paths must be replaced by typed schemas.
- [ ] No unrelated Folio/frontend work is changed.

### ILP-002: Add the typed template SDK with a diagnostics tracer template

Type: AFK

Blocked by: ILP-001.

#### What to build

Create the first vertical path for authoring a template with `defineInteractiveTemplate()`. The diagnostics template should prove typed instance input, deterministic model state, commands, canonical action payload schemas, migrations, and test fixtures without yet depending on the full MCP host path.

#### Acceptance criteria

- [ ] `@studyagent/interactive-core` exists with a typed template definition API.
- [ ] Zod is the source of truth for Template Instance, Template Model State, commands, action payloads, Canonical Learning State projection, and migrations.
- [ ] `interactive-templates/template-diagnostics/` defines a minimal template through the SDK.
- [ ] Valid and invalid fixture tests prove schema enforcement.
- [ ] A reducer/replay test proves deterministic Template Model State with explicit seed handling.
- [ ] Generated TypeScript types are usable by host/build code.

### ILP-003: Build immutable template manifests and generated catalog locally

Type: AFK

Blocked by: ILP-002.

#### What to build

Add local build tooling that turns the diagnostics template into a self-contained compiled resource, manifest, hashes, and generated catalog entry. This is the first proof that the catalog will replace the handwritten runtime registry.

#### Acceptance criteria

- [ ] `@studyagent/interactive-build` validates template definitions and emits manifest JSON.
- [ ] The diagnostics template builds into a self-contained HTML resource.
- [ ] The build emits content hash, manifest hash, source identity, schema versions, renderer profile, capabilities, dependency graph hash, and sandbox/CSP requirements.
- [ ] A generated catalog file can be consumed by Node tests.
- [ ] The generated catalog contains exact-version `ui://` resource IDs and does not expose a mutable `latest` for durable use.
- [ ] Build failure messages are bounded and useful for Admin Lab display.

### ILP-004: Load the diagnostics template through the official MCP App Host path

Type: AFK

Blocked by: ILP-003.

#### What to build

Replace the first slice of the private iframe bridge with an official-protocol Internal MCP App Host path. Load the compiled diagnostics template in a sandboxed iframe, negotiate capabilities, deliver tool input/results, and surface protocol diagnostics.

#### Acceptance criteria

- [ ] `@studyagent/mcp-app-host` loads a catalog resource by exact `ui://` URI.
- [ ] `@studyagent/mcp-app-view` initializes through the official MCP Apps lifecycle.
- [ ] Protocol messages use JSON-RPC 2.0 over the sandbox proxy transport.
- [ ] Default sandbox policy blocks same-origin, notebook API access, auth cookies, subframes, popups, top navigation, direct durable storage, and runtime network access.
- [ ] The diagnostics template shows lifecycle, capability, tool input/result, sandbox, and error-state information.
- [ ] A browser or component test proves the compiled diagnostics View mounts through the production-equivalent host path.

### ILP-005: Route app-visible tool calls into validated StudyAgent actions

Type: AFK

Blocked by: ILP-004.

#### What to build

Complete the first end-to-end action path from a sandboxed View to the existing Interactive Learning Action dispatcher. The diagnostics template should call an app-visible tool, the host should adapt it to the canonical action envelope, and the API should validate and return updated Canonical Learning State.

#### Acceptance criteria

- [ ] Host only exposes allowlisted app-visible tools from the manifest/capability catalog.
- [ ] Tool calls are adapted to the existing validated Interactive Learning Action envelope.
- [ ] Invalid action payloads are rejected with learner-safe and dev-diagnostic errors.
- [ ] Successful calls reconcile updated Canonical Learning State back into the View.
- [ ] Tests cover valid action, invalid action, missing capability, and API failure fallback.
- [ ] Views still cannot call Notebook APIs directly.

### ILP-006: Replace the handwritten registry with the generated catalog path

Type: AFK

Blocked by: ILP-004.

#### What to build

Move web/API template lookup from handwritten registry assumptions toward generated catalog consumption while keeping current block-kind compatibility aliases. The diagnostics template should render from generated catalog metadata; existing blocks should continue to fall back safely.

#### Acceptance criteria

- [ ] API and web can read generated catalog metadata in development.
- [ ] Catalog entries include manifest hash, resource hash, schema versions, renderer profile, capabilities, sandbox requirements, and fallback.
- [ ] Existing block kinds resolve through compatibility aliases where possible.
- [ ] The old handwritten registry is marked as deprecated migration source in code comments or docs.
- [ ] Tests prove a catalog resource can be resolved by exact template ID/version.
- [ ] No durable state resolves a mutable `latest` alias.

### ILP-007: Resolve Learning Interaction Requests to exact template versions

Type: AFK

Blocked by: ILP-003, ILP-006.

#### What to build

Introduce the hosted runtime Template Resolver. Given a semantic Learning Interaction Request, it should filter the catalog by hard constraints, validate Template Instance data, pin an exact version, and return either an Interactive Learning Block or trusted fallback.

#### Acceptance criteria

- [ ] `LearningInteractionRequest` schema exists and is model-facing but not executable.
- [ ] Resolver filters by family, Evidence/source requirements, learner/accessibility constraints, host capabilities, action support, renderer profile, and policy.
- [ ] Resolver validates Template Instance data against the exact template schema.
- [ ] Resolver refuses resource URI, version, sandbox, action, or capability choices supplied directly by a model.
- [ ] Fallback path is deterministic and learner-safe when no template fits.
- [ ] Tests cover exact version pinning, invalid instance data, missing capability, and fallback.

### ILP-008: Promote `quiz` as the first learner-facing template

Type: AFK

Blocked by: ILP-005, ILP-007.

#### What to build

Port quiz behavior into a promoted Interactive Learning Template that proves real learner practice, feedback, Canonical Learning State, Mastery Evidence integration, and reload behavior through the official host path.

#### Acceptance criteria

- [ ] `interactive-templates/quiz/` defines typed instance/state/action schemas.
- [ ] Choice and free-response attempts use canonical response/attempt actions.
- [ ] Existing quiz block kind can resolve to the promoted template through compatibility aliases.
- [ ] Successful submission updates existing durable learning/Mastery/Artifact state paths.
- [ ] Reload reconstructs from Template Instance plus Canonical Learning State.
- [ ] Accessibility, visual, fallback, and action failure states are covered.
- [ ] Synthetic Learner scenario verifies a quiz attempt produces expected durable evidence.

### ILP-009: Persist promotion runs and evidence references

Type: AFK

Blocked by: ILP-003.

#### What to build

Add durable workflow metadata for template promotion without making PostgreSQL an executable source store. Promotion runs should track build/evidence state, classification, artifact refs, reviewer decisions, and publication records.

#### Acceptance criteria

- [ ] Database schema stores promotion runs, build/evidence refs, classification, review decisions, publication/revocation metadata, and artifact hashes.
- [ ] Executable source blobs are not stored as the authoritative source in PostgreSQL.
- [ ] Artifact storage references can point to logs, reports, screenshots, traces, and draft snapshots.
- [ ] Worker/API code can create and update promotion run state transactionally.
- [ ] Tests cover lifecycle transitions and invalid transitions.
- [ ] Migration is safe for existing installations.

### ILP-010: Build the Template Promotion Lab queue and detail review surface

Type: AFK

Blocked by: ILP-009.

#### What to build

Implement the required Admin UI shell for promotion review. It should list drafts/versions, show detail state, preview evidence, and make the build identity and trust boundary obvious.

#### Acceptance criteria

- [ ] `/admin/interactive-templates` route exists behind the appropriate Admin guard.
- [ ] Queue shows draft/template/version/status/classification/build identity.
- [ ] Detail page shows manifest, schema, action, capability, dependency, sandbox, network, and version diffs.
- [ ] Evidence sections display bounded logs, reports, screenshots, traces, and performance results.
- [ ] Production-equivalent sandbox preview is available for eligible drafts.
- [ ] UI clearly distinguishes draft evidence, draft PR, accepted Git commit, and published artifact.
- [ ] Non-admin users cannot access the Lab.

### ILP-011: Add Git-bound approval, publication, and revocation

Type: HITL

Blocked by: ILP-010.

#### What to build

Complete the trust transition in the Admin Lab: approval binds an accepted Git commit to evidence and publishes an immutable artifact; revocation removes a version from new resolution without breaking reload/audit needs.

#### Acceptance criteria

- [ ] Approval requires reviewer identity, decision notes, manifest hash, artifact hash, and exact Git commit.
- [ ] Admin Lab cannot publish from draft workspace, draft snapshot, artifact-storage blob, PostgreSQL record, or uncommitted source.
- [ ] Publication creates immutable exact-version catalog metadata.
- [ ] Revocation prevents new resolver selection while preserving existing reload/audit handling.
- [ ] CLI/worker paths cannot bypass Admin approval.
- [ ] Audit record links Git commit, evidence pack, artifact, reviewer, timestamp, and decision.
- [ ] Human reviewer validates this HITL flow before enabling hosted runtime use.

### ILP-012: Show dependency, sandbox, CSP, and network evidence in the Lab

Type: AFK

Blocked by: ILP-010.

#### What to build

Add dependency and capability review evidence so new npm packages are allowed but visible, pinned, and reviewed. Runtime network access should remain disabled unless Platform-Extension review explicitly allows it.

#### Acceptance criteria

- [ ] Lab displays exact pinned dependency graph, integrity/provenance, license, security, and bundle impact.
- [ ] Lab displays CSP, sandbox, renderer profile, host capability, and action requirements.
- [ ] Runtime network declarations show empty/default-denied state for ordinary templates.
- [ ] External runtime network requests force Platform-Extension classification with exact origins and data classes.
- [ ] Evidence generation fails on undeclared network assets or unpinned dependencies.
- [ ] Tests cover new safe dependency, risky dependency evidence, and network-requiring draft classification.

### ILP-013: Enforce Template-Only vs Platform-Extension classification

Type: AFK

Blocked by: ILP-010, ILP-012.

#### What to build

Implement deterministic draft classification against deployed action, capability, renderer, sandbox, network, dependency runtime, API, and persistence catalogs. The Lab should explain why a draft is Template-Only or blocked as Platform-Extension.

#### Acceptance criteria

- [ ] Classifier compares draft requirements against deployed capability catalogs.
- [ ] New durable action/table/reducer/event/API requirements classify as Platform-Extension.
- [ ] New host capability/sandbox permission/external origin/renderer adapter/build infrastructure requirements classify as Platform-Extension.
- [ ] Reviewed third-party npm dependencies alone do not force Platform-Extension when no new runtime class/capability is needed.
- [ ] Lab shows missing requirements and publication block reasons.
- [ ] Tests cover Template-Only, dependency-only, network-required, persistence-required, and renderer-required cases.

### ILP-014: Build the local generated-code draft executor

Type: AFK

Blocked by: ILP-003, ILP-004.

#### What to build

Create the local/isolated execution environment used for generated template drafts. It should build, test, preview, and collect evidence without production data or publication authority.

#### Acceptance criteria

- [ ] Draft executor creates isolated workspaces with read-only SDK/toolchain and writable draft source.
- [ ] Executor has no learner data, production credentials, direct production DB access, catalog signing key, or Admin approval tool.
- [ ] Executor enforces time, memory, process, filesystem, and output-size limits appropriate for local development.
- [ ] Executor can run build, tests, accessibility checks, screenshots, and production-equivalent host preview.
- [ ] Executor returns bounded logs/reports/screenshots/artifacts.
- [ ] Direct framework preview is labeled non-authoritative.
- [ ] Tests or dry-run scripts prove executor failures are contained and reported.

### ILP-015: Add Template Builder Agent draft generation and draft PR automation

Type: HITL

Blocked by: ILP-014.

#### What to build

Implement the Template Builder Agent as a bounded promotion-lane author that can generate or revise templates, run the draft executor, and open draft PRs while preserving all authority boundaries.

#### Acceptance criteria

- [ ] Agent can read approved SDK docs/examples and edit only draft workspace files.
- [ ] Agent can run the draft executor and iterate from bounded failure reports.
- [ ] Agent can produce source, schemas, tests, fixtures, examples, and manifest changes.
- [ ] Agent can create a branch and open a draft PR.
- [ ] Agent cannot merge, approve review, mark PR ready, publish, revoke, issue Admin approval, access learner data, or access production credentials.
- [ ] Draft PR links appear in promotion evidence as provenance/review artifacts.
- [ ] Human reviewer validates the authority boundary before enabling by default.

### ILP-016: Promote `function-explorer`

Type: AFK

Blocked by: ILP-008, ILP-011.

#### What to build

Add a DOM/SVG function exploration template that proves deterministic model state, parameter manipulation, math accessibility, observation submission, and SVG performance without a scene graph.

#### Acceptance criteria

- [ ] Template defines typed function parameters, seeded initial state, commands, and observation payload.
- [ ] Slider/controls remain keyboard accessible and responsive.
- [ ] SVG output has text alternatives and reduced-motion-safe updates.
- [ ] High-frequency manipulation stays local until submitted observation/checkpoint.
- [ ] Observation action maps to canonical action and Canonical Learning State.
- [ ] Promotion evidence includes replay, accessibility, visual, and performance results.

### ILP-017: Promote `flashcard-review`

Type: AFK

Blocked by: ILP-008, ILP-011.

#### What to build

Add a flashcard review template proving local reveal state, durable review action, keyboard navigation, repeated items, and reload from canonical review state.

#### Acceptance criteria

- [ ] Template defines typed deck/card instance schema and review model state.
- [ ] Reveal/flip state is View State or Template Model State, not durable learner state by itself.
- [ ] Rating submission maps to canonical review action.
- [ ] Reload reconstructs reviewed cards and current progress from Canonical Learning State.
- [ ] Keyboard and screen-reader flows are tested.
- [ ] Promotion evidence covers repeated-card and empty-deck states.

### ILP-018: Promote `worked-example-stepper`

Type: AFK

Blocked by: ILP-008, ILP-011.

#### What to build

Add a guided-work template for stepwise examples with hints, reveal boundaries, partial completion, typed attempts, and reload-safe step state.

#### Acceptance criteria

- [ ] Template defines typed steps, prompts, hints, reveals, expected response forms, and completion model.
- [ ] Learner attempts map to canonical attempt/response actions.
- [ ] Reveal/hint behavior is bounded and pedagogically visible.
- [ ] Partial completion survives reload through Canonical Learning State.
- [ ] Accessibility and reduced-motion behavior are covered.
- [ ] Synthetic Learner scenario verifies a misconception or partial answer path.

### ILP-019: Promote `evidence-comparator`

Type: AFK

Blocked by: ILP-008, ILP-011.

#### What to build

Add an Evidence-focused template that compares source excerpts, opens source spans through host tools, and supports learner observations without exposing storage URLs or source internals.

#### Acceptance criteria

- [ ] Template uses source/Evidence refs rather than storage URLs.
- [ ] Source-open action uses an allowlisted app-visible tool and canonical Evidence open action.
- [ ] Comparison prompts and observations are typed.
- [ ] Unsupported or missing Evidence states fall back cleanly.
- [ ] UI is readable on mobile and supports keyboard navigation.
- [ ] Evidence behavior is covered by tests and Synthetic Learner scenario.

### ILP-020: Promote `live-plan`

Type: AFK

Blocked by: ILP-008, ILP-011.

#### What to build

Add a plan/reflect template that lets learners inspect current study plan state, express intent, and trigger existing planning actions without creating new durable planning semantics.

#### Acceptance criteria

- [ ] Template consumes existing planning/learning state through Canonical Learning State projection.
- [ ] Learner intent maps to existing canonical intent action or existing planning action path.
- [ ] No new planning tables/events/reducers are introduced by the template.
- [ ] Empty/missing plan, stale plan, and action failure states are handled.
- [ ] Admin evidence proves this is Template-Only, not Platform-Extension.
- [ ] UI works as Primary or Companion surface.

### ILP-021: Add Workspace Stage and Surface Anchors

Type: AFK

Blocked by: ILP-004.

#### What to build

Add the responsive Workspace Stage model and chat Surface Anchors so rich Views mount outside the transcript while remaining focusable and reopenable from tutor messages.

#### Acceptance criteria

- [ ] Workspace Stage supports Primary, optional Companion, and Pinned Tray slots.
- [ ] Mobile uses one active sheet/fullscreen Stage plus pinned anchors.
- [ ] Tutor chat can render compact Surface Anchors with title/status/focus/reopen.
- [ ] Rich MCP App Views are not mounted as transcript children.
- [ ] Learners can pin, dismiss, reopen, and focus surfaces.
- [ ] Layout respects reduced motion, screen-reader, zoom, and viewport constraints.

### ILP-022: Add ordered Surface Cues and Choreography Snapshot recovery

Type: AFK

Blocked by: ILP-021.

#### What to build

Use the tutor AG-UI stream to carry idempotent ordered Surface Cues and maintain a compact session-scoped Choreography Snapshot for reconnect and duplicate handling.

#### Acceptance criteria

- [ ] Surface Cue schema includes cue ID, tutor session/run/turn, sequence, action, resolved refs, slot/focus policy, timestamps, and expiry/relevance boundary.
- [ ] Client acknowledges applied/deferred/rejected with bounded reasons.
- [ ] Server records latest sequence, current slot assignments, queued cues, and learner overrides.
- [ ] Reconnect restores Stage from Choreography Snapshot without replaying transcript.
- [ ] Duplicate cue IDs/sequences are ignored.
- [ ] Active typing/manipulation/pinned surfaces prevent disruptive replacement.

### ILP-023: Promote `animated-process` with tutor-synchronized staging

Type: AFK

Blocked by: ILP-022.

#### What to build

Add an animated explanation template that proves narration-synchronized Tutor Choreography, reduced-motion alternatives, ordered sequence state, and Surface Anchor replay behavior.

#### Acceptance criteria

- [ ] Template defines typed process steps, narration anchors, animation state, and reduced-motion summary.
- [ ] Tutor Surface Cues can stage/focus the template at a narration checkpoint.
- [ ] Reduced-motion mode presents non-animated equivalent sequence.
- [ ] Animation frame state is not persisted as learning state.
- [ ] Reconnect restores the surface and sequence position appropriately.
- [ ] Promotion evidence includes choreography, accessibility, visual, and performance proof.

### ILP-024: Promote `electron-flow-lab` as the complex simulation benchmark

Type: HITL

Blocked by: ILP-016, ILP-022.

#### What to build

Add a rich electron-flow simulation template as the benchmark for complex 2D simulations, Tutor Choreography, and optional renderer escalation. Start with the simplest renderer that can satisfy the learning behavior, then collect evidence for whether SceneryStack is justified.

#### Acceptance criteria

- [ ] Template defines deterministic simulation model state independent of renderer.
- [ ] Runtime uses exact seeded state and typed commands.
- [ ] Learner observations map to canonical observation action.
- [ ] Tutor can stage/focus the simulation during explanation without stealing learner focus.
- [ ] Evidence compares DOM/SVG or Canvas baseline against SceneryStack needs.
- [ ] Accessibility alternative exists for screen-reader/reduced-motion paths.
- [ ] Human reviewer decides whether renderer complexity is justified.

### ILP-025: Decide and implement the optional SceneryStack renderer adapter

Type: HITL

Blocked by: ILP-024.

#### What to build

If the electron-flow benchmark proves that SceneryStack is justified, add `@studyagent/interactive-scenery` as an optional renderer adapter behind the same Template Model State contract. If not justified, record the rejection and keep DOM/SVG or simpler Canvas path.

#### Acceptance criteria

- [ ] Benchmark report covers bundle size, startup, frame time, memory, mobile, keyboard, screen-reader, sandbox, and maintenance impact.
- [ ] Decision is recorded in docs/ADR if SceneryStack is accepted or explicitly rejected for v1.
- [ ] If accepted, adapter is optional and not required by ordinary templates.
- [ ] Template Model State remains renderer-independent.
- [ ] Published Views declare renderer profile and capabilities exactly.
- [ ] Human reviewer approves the renderer decision.

### ILP-026: Add the Interaction Director Agent

Type: HITL

Blocked by: ILP-016 through ILP-024.

#### What to build

Add the bounded read-only Interaction Director Agent after the catalog has enough promoted templates. It should rank eligible templates and propose Turn Interaction Plans, while deterministic resolver validation remains final.

#### Acceptance criteria

- [ ] Director receives only resolver-eligible template candidates after hard filtering.
- [ ] Director outputs learning purpose, template hint, instance content/parameters, narration checkpoint, and semantic placement intent.
- [ ] Resolver revalidates output and pins exact version.
- [ ] Director cannot write learner state, generate code, publish, modify manifests/capabilities, or bypass resolver.
- [ ] Simple interactions can bypass Director.
- [ ] Eval suite proves Director improves selection without violating policy or latency budgets.
- [ ] Human reviewer approves activation policy.

### ILP-027: Harden the full pipeline for hosted runtime and promotion operations

Type: AFK

Blocked by: ILP-011, ILP-016 through ILP-024.

#### What to build

Run a full hardening pass across hosted runtime, promotion operations, evidence, observability, performance budgets, accessibility, Synthetic Learner coverage, and documentation. This ticket turns the integrated system from feature-complete to operable.

#### Acceptance criteria

- [ ] Hosted learner runtime cannot execute unreviewed generated code under any tested flag/config combination.
- [ ] Generated catalog fully replaces handwritten registry for promoted templates.
- [ ] Admin Lab audit trail is sufficient to reconstruct who approved what source/artifact and why.
- [ ] Revoked versions behave correctly for new resolution, reload, replay, and audit.
- [ ] Performance budgets are enforced for all Golden Template Pack entries.
- [ ] Accessibility gates cover keyboard, screen-reader, contrast, zoom, reduced-motion, and mobile.
- [ ] Synthetic Learner scenarios cover quiz, function exploration, Evidence comparison, guided work, plan reflection, and choreography.
- [ ] Observability distinguishes host errors, template errors, action errors, resolver fallbacks, and promotion failures.
- [ ] Docs point to current architecture, implementation plan, and published GitHub Issues.

## Suggested Publishing Order

Publish blocker tickets first so dependencies can reference real GitHub issue numbers:

1. ILP-001 through ILP-008.
2. ILP-009 through ILP-015.
3. ILP-016 through ILP-020.
4. ILP-021 through ILP-023.
5. ILP-024 through ILP-027.

If creating issues manually, keep each issue focused on its acceptance criteria and move implementation details into PR descriptions when they become code-specific.
