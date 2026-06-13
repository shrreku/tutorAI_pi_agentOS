# Interactive Learning Surfaces Implementation Tickets

Status: implemented in-repo (2026-06-09). Acceptance checkboxes below are retained as the original build criteria, not as an open-work checklist.

This document breaks `docs/architecture/interactive-learning-surfaces-implementation-plan.md` into dependency-ordered vertical slices. Each implementation slice should leave a demoable or testable path through schema, API/runtime, Workspace rendering, action handling, persistence/events where applicable, and tests.

The tickets respect the accepted docs and ADRs:

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
- `docs/contexts/knowledge-graph/CONTEXT.md`
- ADR-0005: Typed tools and reducers govern agent writes.
- ADR-0010: Workspace, Reference Surface, and Evidence vocabulary.
- ADR-0011: Artifact lifecycle, consent, and quality gates.
- ADR-0013: Mastery Evaluator produces durable evidence; reducers apply learning state.
- ADR-0020: Interactive Learning Surfaces and Internal MCP App Bridge.

## Publishing Plan

Create one parent GitHub issue named `Interactive Learning Surfaces program`, then publish the tickets below in dependency order. Use `ready-for-agent` for AFK tickets. Use `ready-for-human` only for the optional ADR/coordination ticket if the team wants that decision recorded before implementation begins.

The current breakdown has 18 slices:

1. Define Interactive Learning schemas and block contracts.
2. Extend Reference Surface construction with Interactive Learning Blocks.
3. Add Interactive Learning Action dispatcher.
4. Add Internal MCP App Bridge host.
5. Add MCP App Bundle build, registry, and test harness.
6. Ship Quiz MCP App vertical slice.
7. Ship Flashcards MCP App vertical slice.
8. Ship Worked Example Stepper MCP App vertical slice.
9. Ship Evidence Explorer MCP App vertical slice.
10. Ship first Simulation Template MCP App.
11. Add Simulation Draft to Template pipeline.
12. Ship Live Plan Interactive Learning Surface.
13. Add tutor-initiated surface launch and steering.
14. Add Source Reader interactive surface.
15. Add Personalization Controls interactive surface.
16. Add Dev Mode interactive dashboards.
17. Harden refresh, fallback, sandboxing, and observability.
18. Add Synthetic Learner and browser regression coverage.

## 1. Define Interactive Learning Schemas And Block Contracts

Type: AFK

Blocked by: None.

User stories covered:

- As a maintainer, I want a typed Interactive Learning Block contract so rich learning UI is not represented as arbitrary JSON.
- As a tutor, I want to request learning-purpose blocks rather than generic UI primitives.
- As a Workspace renderer, I want one renderer-agnostic contract that can render natively or through MCP App Bundles.

What to build:

Add shared schemas for Interactive Learning Blocks, Interactive Learning Actions, renderer metadata, MCP App Bundle manifests, Simulation Templates, Simulation Drafts, Interactive Evidence, and the learning context envelope. Extend or compose with the existing Reference Surface schemas without replacing the current static block path.

Acceptance criteria:

- [ ] Shared schemas define Interactive Learning Block kinds for quiz, flashcard deck, worked example, Evidence explorer, simulation, Live Plan, source reader, personalization controls, Dev Mode dashboard, comparison, and concept timeline.
- [ ] Block schema includes learning purpose, source refs, Evidence refs, objective refs, concept refs, optional artifact ref, prompt/content payload, canonical state, allowed actions, renderer preference, fallback summary, and quality metadata.
- [ ] Action envelope schema includes notebook, surface, block, reference, source/Evidence, optional session/turn/run identity, renderer kind/version, action name, payload, and timestamp.
- [ ] Renderer metadata distinguishes MCP App Renderer from native fallback while keeping the product contract renderer-agnostic.
- [ ] MCP App Bundle manifest schema includes bundle ID, version, block kind, supported actions, sandbox policy, asset/resource metadata, and fallback capability.
- [ ] Simulation Template schema includes template ID, parameter schema, supported concept families, prompt slots, expected observation schema, action/event schema, and Evidence requirements.
- [ ] Tests cover valid and invalid blocks, action envelopes, bundle manifests, and simulation template definitions.

Implementation notes:

- Use product terms from `docs/contexts/product-domain/CONTEXT.md`.
- The model-facing vocabulary should be learning blocks, not Card/Button/Slider primitives.
- Do not add database tables in this ticket.

## 2. Extend Reference Surface Construction With Interactive Learning Blocks

Type: AFK

Blocked by:

- 1. Define Interactive Learning schemas and block contracts.

User stories covered:

- As a learner, I want concept pages, artifacts, and Live Plan surfaces to contain interactive learning blocks in the Workspace.
- As a maintainer, I want interactive blocks to reuse Reference Surface ownership, Evidence, and learner visibility rules.

What to build:

Extend Reference Surface construction so API-built surfaces can include Interactive Learning Blocks alongside existing static blocks. Start with server-authored blocks for quiz, flashcard deck, worked example placeholder, Evidence explorer, and simulation placeholder where data already exists or can be built heuristically.

Acceptance criteria:

- [ ] Reference Surface responses can include Interactive Learning Blocks without breaking existing static block consumers.
- [ ] Learner-facing sanitization preserves learner-safe block data and removes internal/debug-only fields.
- [ ] Artifact-backed surfaces can expose quiz and flashcard blocks when the artifact lifecycle allows learner visibility.
- [ ] Concept/wiki/source surfaces can expose Evidence explorer and simulation placeholder blocks when source/Evidence refs exist.
- [ ] Blocks include native fallback summaries where practical.
- [ ] Tests cover learner-facing filtering, artifact lifecycle visibility, Evidence refs, and old clients/static renderers.

Implementation notes:

- Keep `ReferenceSurface` the learner-facing open-node API.
- Do not introduce a durable app-instance object.
- Preserve ADR-0010: learner mode hides raw claims, chunks, coverage records, and session-plan internals.

## 3. Add Interactive Learning Action Dispatcher

Type: AFK

Blocked by:

- 1. Define Interactive Learning schemas and block contracts.
- 2. Extend Reference Surface construction with Interactive Learning Blocks.

User stories covered:

- As a learner, I want interactions in native blocks and MCP App Renderers to update StudyAgent state consistently.
- As a maintainer, I want one validated action path rather than per-app ad hoc routes.
- As a tutor, I want submitted learner performance to become evaluable evidence when appropriate.

What to build:

Add a canonical API/runtime action dispatcher for Interactive Learning Actions. It should validate ownership, block/action compatibility, context refs, and payload schema; route durable outcomes through existing artifact, mastery, learning, planning, and event paths; return updated surface/block state; and emit notebook events.

Acceptance criteria:

- [ ] Dispatcher accepts the shared action envelope and rejects malformed or out-of-notebook actions.
- [ ] Actions do not require an active tutor session, but preserve session/turn/run identity when present.
- [ ] Dispatcher supports first action names for quiz answer submission, flashcard rating, worked-example step answer, simulation observation submission, Evidence span open, Live Plan action selected, and tutor help requested.
- [ ] Durable writes route through existing reducer-governed or artifact lifecycle paths where applicable.
- [ ] Passive or high-frequency UI actions do not create Mastery Evidence.
- [ ] Dispatcher returns updated canonical block or surface state.
- [ ] Notebook events and refresh hints are emitted for durable state changes.
- [ ] Tests cover notebook isolation, optional session identity, action validation, reducer routing, event emission, and no-mastery passive actions.

Implementation notes:

- Do not let renderer-provided canonical state overwrite server state.
- This dispatcher may internally delegate to existing routes/stores at first, but the public contract should be one action envelope.

## 4. Add Internal MCP App Bridge Host

Type: AFK

Blocked by:

- 1. Define Interactive Learning schemas and block contracts.
- 3. Add Interactive Learning Action dispatcher.

User stories covered:

- As a learner, I want rich Interactive Learning Blocks to render as polished app-like experiences in the Workspace.
- As a maintainer, I want MCP-App-style behavior without exposing an external MCP server in this phase.

What to build:

Add the Workspace-owned Internal MCP App Bridge. It should render MCP App Bundles in sandboxed iframes, deliver host context and block state, receive Interactive Learning Actions, push updated state, handle teardown, and expose diagnostics in Dev Mode.

Acceptance criteria:

- [ ] A React host component can render an MCP App Bundle for a block.
- [ ] Iframe sandbox attributes enforce no parent DOM access and no auth-cookie dependence.
- [ ] Bridge sends initialization, host context, block input/result, state update, error, and teardown messages.
- [ ] Bridge receives action messages and forwards them to the Interactive Learning Action dispatcher.
- [ ] Bridge handles app load failure with learner-safe fallback rendering.
- [ ] Dev Mode can inspect bridge message lifecycle and errors.
- [ ] Tests cover initialization, state delivery, action dispatch, reload, teardown, failure fallback, and sandbox attributes.

Implementation notes:

- Mirror MCP Apps concepts where useful: `ui://` resource identity, tool-input/tool-result style messages, app-callable actions, host context.
- Do not implement an external MCP server.
- The iframe should not call notebook APIs directly.

## 5. Add MCP App Bundle Build, Registry, And Test Harness

Type: AFK

Blocked by:

- 1. Define Interactive Learning schemas and block contracts.
- 4. Add Internal MCP App Bridge host.

User stories covered:

- As a developer, I want globally versioned MCP App Bundles for each major learning block type.
- As a maintainer, I want app bundles to be testable, cacheable, and governed by sandbox policy.

What to build:

Create a bundle registry and build/test harness for globally versioned MCP App Bundles. Start with stub bundles for quiz, flashcards, worked example, Evidence explorer, Live Plan, Dev Mode dashboard, and one Simulation Template. Bundles should share bridge and design-system code at build time but be separate output resources.

Acceptance criteria:

- [ ] Bundle registry maps block kind/template ID to `ui://studyagent/.../vN` resource identity and local built asset.
- [ ] Bundle manifest records version, supported actions, sandbox policy, fallback support, and compatibility with block schema version.
- [ ] Bundle assets are built as static resources and served by the web/API app without notebook-specific code generation.
- [ ] Tests or checks prevent bundle manifests from declaring unsupported actions or forbidden sandbox permissions.
- [ ] A stub bundle can render test block data through the Internal MCP App Bridge.
- [ ] Bundle failures surface learner-safe fallback UI and Dev Mode diagnostics.

Implementation notes:

- One generic mega-bundle is not the target. Prefer separate bundles per major learning block type.
- Notebook-specific learning content is data, not app code.

## 6. Ship Quiz MCP App Vertical Slice

Type: AFK

Blocked by:

- 2. Extend Reference Surface construction with Interactive Learning Blocks.
- 3. Add Interactive Learning Action dispatcher.
- 4. Add Internal MCP App Bridge host.
- 5. Add MCP App Bundle build, registry, and test harness.

User stories covered:

- As a learner, I want quizzes to feel interactive, give immediate feedback, and cite Evidence.
- As a tutor, I want quiz answers to become Mastery Evidence when evaluable.
- As a maintainer, I want quiz interactions to reuse artifact lifecycle and reducer-governed learning updates.

What to build:

Replace or augment the current quiz review UI with a Quiz MCP App vertical path. A quiz artifact Reference Surface should render a quiz Interactive Learning Block using the quiz bundle. Submitting an answer emits an Interactive Learning Action, persists the attempt, evaluates when eligible, returns feedback, and refreshes the Workspace.

Acceptance criteria:

- [ ] Quiz artifact surfaces include quiz Interactive Learning Blocks when learner-visible.
- [ ] Quiz bundle renders questions, choices/free-response where available, progress, source/Evidence affordances, and feedback.
- [ ] Submitting an answer emits `quiz.answer_submitted` through the dispatcher.
- [ ] Answer submission persists a quiz attempt and invalidates/refreshes attempts, graph/read models, and study state as appropriate.
- [ ] Evaluable answers produce Mastery Evidence through the governed path.
- [ ] Feedback distinguishes correct answer, explanation, and relevant Evidence.
- [ ] Reopening the quiz reconstructs state from StudyAgent, not iframe storage.
- [ ] Tests cover correct answer, incorrect answer, missing Evidence fallback, reload, and no direct iframe API writes.

Implementation notes:

- Keep artifact consent and visibility behavior from ADR-0011.
- If the current native quiz rendering remains, use it as fallback rather than the primary path.

## 7. Ship Flashcards MCP App Vertical Slice

Type: AFK

Blocked by:

- 2. Extend Reference Surface construction with Interactive Learning Blocks.
- 3. Add Interactive Learning Action dispatcher.
- 4. Add Internal MCP App Bridge host.
- 5. Add MCP App Bundle build, registry, and test harness.

User stories covered:

- As a learner, I want flashcards to support flip, rating, review progress, and source-grounded review.
- As a tutor, I want repeated hard ratings to inform future recommendations without becoming mastery by themselves.

What to build:

Add a Flashcards MCP App vertical path for flashcard artifacts and concept review surfaces. Ratings should persist as review state and update Workspace recommendations. Card flips alone should remain local presentation state.

Acceptance criteria:

- [ ] Flashcard artifact surfaces include flashcard deck Interactive Learning Blocks when learner-visible.
- [ ] Flashcards bundle renders card front/back, deck progress, rating controls, and Evidence affordances.
- [ ] Rating emits `flashcard.review_rated` through the dispatcher.
- [ ] Ratings persist in canonical StudyAgent state and survive iframe reload.
- [ ] Card flip without rating does not create Mastery Evidence.
- [ ] Repeated hard/again ratings can surface a next-action suggestion without auto-invoking the tutor.
- [ ] Tests cover rating persistence, reload, passive flip no-mastery behavior, and source/Evidence display.

Implementation notes:

- If spaced repetition scheduling is not present, store enough review state for future scheduling without blocking the slice.

## 8. Ship Worked Example Stepper MCP App Vertical Slice

Type: AFK

Blocked by:

- 2. Extend Reference Surface construction with Interactive Learning Blocks.
- 3. Add Interactive Learning Action dispatcher.
- 4. Add Internal MCP App Bridge host.
- 5. Add MCP App Bundle build, registry, and test harness.
- 6. Ship Quiz MCP App vertical slice.

User stories covered:

- As a learner, I want worked examples to guide me step by step and check my understanding.
- As a tutor, I want step answers and self-explanations to become Mastery Evidence when evaluable.

What to build:

Add a Worked Example Stepper block and MCP App Bundle. The app should render steps, hints, answer inputs, reveal controls, source/Evidence affordances, and completion state. Step answers should route through the dispatcher and evaluator when eligible.

Acceptance criteria:

- [ ] Worked example surfaces can include a worked-example Interactive Learning Block.
- [ ] Bundle renders steps, current progress, hints, answer controls, reveal controls, and Evidence.
- [ ] Step answer emits `worked_example.step_answered`.
- [ ] Hints/reveals are tracked as context or aggregate telemetry, not mastery by themselves.
- [ ] Evaluable step answers or self-explanations produce Mastery Evidence.
- [ ] Completion state persists and survives reload.
- [ ] Tests cover answer submission, hint/reveal no-mastery behavior, completion, tutor help request, and Evidence display.

Implementation notes:

- Start with artifact-backed worked examples where possible.
- Do not require a live tutor turn for self-review step completion.

## 9. Ship Evidence Explorer MCP App Vertical Slice

Type: AFK

Blocked by:

- 2. Extend Reference Surface construction with Interactive Learning Blocks.
- 3. Add Interactive Learning Action dispatcher.
- 4. Add Internal MCP App Bridge host.
- 5. Add MCP App Bundle build, registry, and test harness.

User stories covered:

- As a learner, I want to inspect source evidence without seeing raw debug claims.
- As a tutor, I want source-grounded blocks to keep Evidence one click away.

What to build:

Add an Evidence Explorer block and MCP App Bundle for Reference Surfaces. It should show citations, source excerpts, supporting notes, source titles/pages, and learner-safe source-scope warnings. It should not expose raw claim statuses or internal provenance in learner mode.

Acceptance criteria:

- [ ] Concept/wiki/artifact/source surfaces can include Evidence Explorer blocks when Evidence refs exist.
- [ ] Bundle renders compact citation affordances, source excerpts, and supporting notes.
- [ ] Opening a source span emits an action for context/event tracking but does not create mastery.
- [ ] Learner mode hides raw claims, confidence scores, and internal provenance.
- [ ] Dev Mode can expose richer diagnostic metadata separately.
- [ ] Tests cover learner-safe filtering, source span open action, missing Evidence, and Dev Mode diagnostics.

Implementation notes:

- Keep learner-facing copy on "Evidence" rather than "provenance."

## 10. Ship First Simulation Template MCP App

Type: AFK

Blocked by:

- 2. Extend Reference Surface construction with Interactive Learning Blocks.
- 3. Add Interactive Learning Action dispatcher.
- 4. Add Internal MCP App Bridge host.
- 5. Add MCP App Bundle build, registry, and test harness.

User stories covered:

- As a learner, I want to manipulate a concept visually instead of only reading about it.
- As a tutor, I want to launch a trusted simulation with source-grounded parameters and observation prompts.

What to build:

Implement the first trusted Simulation Template as an MCP App Bundle. Prefer a narrow template such as `function_plotter` or `algorithm_stepper`. The template should be globally versioned, parameterized by block data, and capable of emitting submitted observations or answers through the dispatcher.

Acceptance criteria:

- [ ] Simulation Template schema and manifest exist for the chosen template.
- [ ] Concept/wiki/objective surfaces can include a simulation Interactive Learning Block when the concept family matches the template.
- [ ] Bundle renders from parameter data and does not fetch notebook data directly.
- [ ] Parameter changes stay local unless the learner submits an observation or snapshot.
- [ ] Submitted observation emits `simulation.observation_submitted`.
- [ ] Evaluable observations or answers can produce Mastery Evidence.
- [ ] Evidence/source grounding is shown when the simulation is source-specific; broader pedagogy is labeled when not source-specific.
- [ ] Tests cover parameter validation, local-only slider changes, observation submission, reload, and sandbox policy.

Implementation notes:

- Do not add arbitrary generated simulation code to learner flows.
- Keep template scope small and correct before adding more template families.

## 11. Add Simulation Draft To Template Pipeline

Type: AFK

Blocked by:

- 1. Define Interactive Learning schemas and block contracts.
- 5. Add MCP App Bundle build, registry, and test harness.
- 10. Ship first Simulation Template MCP App.

User stories covered:

- As a maintainer, I want to explore generated simulation ideas without exposing unreviewed generated code to learners.
- As a developer, I want a repeatable path for promoting useful Simulation Drafts into trusted Simulation Templates.

What to build:

Add a tooling pipeline for generating, sandboxing, evaluating, templating, and promoting Simulation Drafts. This is not a learner runtime. It should produce reviewed Simulation Templates and globally versioned MCP App Bundles.

Acceptance criteria:

- [ ] Simulation Draft schema records concept need, draft source, generated code/artifact refs, sandbox metadata, evaluation status, and promotion decision.
- [ ] Draft preview runs in an isolated sandbox with no notebook data access and no durable writes.
- [ ] Evaluation checklist covers concept correctness, parameter bounds, accessibility, responsiveness, sandbox safety, external network, learner instructions, event schema, and Evidence requirements.
- [ ] Promotion output includes template ID, parameter schema, supported concept families, prompt slots, expected observation schema, action/event schema, and bundle manifest.
- [ ] Rejected drafts remain non-learner-facing.
- [ ] Tests cover draft validation, failed safety check, successful promotion metadata, and template registry update.

Implementation notes:

- Generated code is a draft path. Trusted templates are the product path.
- This can begin as a local/dev CLI before any UI is built.

## 12. Ship Live Plan Interactive Learning Surface

Type: AFK

Blocked by:

- 2. Extend Reference Surface construction with Interactive Learning Blocks.
- 3. Add Interactive Learning Action dispatcher.
- 4. Add Internal MCP App Bridge host.
- 5. Add MCP App Bundle build, registry, and test harness.

User stories covered:

- As a learner, I want the Live Plan to show current objective, weak concepts, progress, and next actions in an interactive dashboard.
- As a tutor, I want learner steering actions to route through governed planning behavior.

What to build:

Add a Live Plan Interactive Learning Surface and MCP App Bundle. The app should show current objective, upcoming objectives, weak concepts, completed work, recommended study aids, and next actions. Safe actions may open/start/resume existing surfaces. Plan-changing actions should express learner intent for tutor or reducer-governed handling.

Acceptance criteria:

- [ ] Study state or Workspace route can open a Live Plan Interactive Learning Surface.
- [ ] Live Plan bundle renders current objective, next objectives, weak concepts, progress, and next actions.
- [ ] Safe actions open existing surfaces or start/resume sessions.
- [ ] Intent actions such as slow down, go deeper, skip objective, focus source, prepare for exam, or revise plan emit validated `live_plan.action_selected` actions.
- [ ] UI alone cannot mark mastery, complete objectives, remove weak concepts, or rewrite curriculum.
- [ ] Tutor/context receives explicit learner intent when appropriate.
- [ ] Tests cover safe action, intent action, blocked direct mastery mutation, and refresh after study state changes.

Implementation notes:

- Live Plan is adaptive study state, not an Artifact.
- Avoid exposing objective-list/session-plan internals as learner-facing objects.

## 13. Add Tutor-Initiated Surface Launch And Steering

Type: AFK

Blocked by:

- 2. Extend Reference Surface construction with Interactive Learning Blocks.
- 3. Add Interactive Learning Action dispatcher.
- 4. Add Internal MCP App Bridge host.
- 6. Ship Quiz MCP App vertical slice.
- 10. Ship first Simulation Template MCP App.

User stories covered:

- As a learner in a lesson, I want the tutor to open the right practice or exploration surface at the right time.
- As a tutor, I want to launch and steer Interactive Learning Surfaces without making them canonical tutor chat messages.

What to build:

Add tutor-facing surface launch behavior. The tutor should be able to request lightweight non-durable Interactive Learning Surfaces during an active lesson, such as a simulation, comparison, worked example, or Evidence explorer. Durable study aids still follow Artifact consent policy.

Acceptance criteria:

- [ ] Tutor can trigger opening or drafting a Workspace Interactive Learning Surface for the current objective/concept.
- [ ] Tutor-launched surfaces attach optional session/turn/run identity to subsequent Interactive Learning Actions.
- [ ] Tutor chat narrates and steers the surface while the Workspace hosts the rich interaction.
- [ ] Durable artifact creation still follows consent/lifecycle policy.
- [ ] If learner submits an answer/observation in a tutor-led surface, the next tutor turn can respond with the submitted context.
- [ ] Tests cover tutor-launched quiz/simulation, optional session identity, learner help request, and no artifact bypass.

Implementation notes:

- Keep the lesson in tutor chat. The rich interaction lives in Workspace.
- Do not auto-invoke tutor for ordinary self-review actions outside tutor-led flows.

## 14. Add Source Reader Interactive Surface

Type: AFK

Blocked by:

- 2. Extend Reference Surface construction with Interactive Learning Blocks.
- 3. Add Interactive Learning Action dispatcher.
- 4. Add Internal MCP App Bridge host.
- 9. Ship Evidence Explorer MCP App vertical slice.

User stories covered:

- As a learner, I want uploaded sources to become interactive reading surfaces with concept overlays and tutor handoff controls.
- As a tutor, I want source selection and confusing spans to provide context without becoming mastery by themselves.

What to build:

Add Source Reader blocks and optional MCP App Bundle for source Reference Surfaces. The reader should show extracted source text or source spans, concept overlays, Evidence, source-scope summaries, and actions to ask the tutor about selected spans.

Acceptance criteria:

- [ ] Source Reference Surfaces can include source reader Interactive Learning Blocks.
- [ ] Reader supports opening source spans and related concepts.
- [ ] Learner can ask tutor about a selected span or mark a span confusing.
- [ ] Passive reading, scrolling, and span opening do not create Mastery Evidence.
- [ ] Source-scope boundaries are shown in learner-safe language when relevant.
- [ ] Tests cover source span selection, tutor handoff prompt, Evidence display, and no-mastery passive behavior.

Implementation notes:

- Reuse existing source file/extracted routes where possible.
- Keep raw chunk/debug metadata out of learner mode.

## 15. Add Personalization Controls Interactive Surface

Type: AFK

Blocked by:

- 2. Extend Reference Surface construction with Interactive Learning Blocks.
- 3. Add Interactive Learning Action dispatcher.

User stories covered:

- As a learner, I want to adjust explicit preferences such as pace, depth, examples, assessment style, and urgency.
- As a tutor, I want explicit learner preferences to shape recommendations without mutating mastery or curriculum directly.

What to build:

Add a personalization controls block/surface that lets learners set explicit preferences. It can render natively first or through an MCP App Bundle. Actions should route through the existing learner profile or Learner Trait Signal path when available.

Acceptance criteria:

- [ ] Personalization controls expose learner-facing explicit preferences only.
- [ ] Preference changes emit validated Interactive Learning Actions.
- [ ] Accepted changes persist as learner profile updates or explicit Learner Trait Signals through governed paths.
- [ ] UI does not expose inferred trait labels, confidence scores, or archetype buckets.
- [ ] Preference changes do not directly mutate mastery, weak concepts, curriculum, source grounding, or artifact consent.
- [ ] Tests cover explicit pace/depth/example/assessment/urgency updates and learner-safe visibility.

Implementation notes:

- Align with the learner trait update lanes in `docs/contexts/product-domain/CONTEXT.md`.

## 16. Add Dev Mode Interactive Dashboards

Type: AFK

Blocked by:

- 4. Add Internal MCP App Bridge host.
- 5. Add MCP App Bundle build, registry, and test harness.
- 3. Add Interactive Learning Action dispatcher.

User stories covered:

- As a maintainer, I want to inspect app bridge messages, Interactive Learning Actions, reducer outcomes, tutor traces, and eval runs.
- As a developer, I want rich dashboards without contaminating learner-facing Workspace UX.

What to build:

Add Dev Mode MCP App dashboards for bridge diagnostics, Interactive Learning Action history, tool/reducer outcomes, Runtime Work View events, and synthetic eval traces. These dashboards are developer-facing only.

Acceptance criteria:

- [ ] Dev Mode can open a dashboard for a surface/block/action sequence.
- [ ] Dashboard shows bridge lifecycle, block data summaries, emitted actions, API outcomes, notebook events, and errors.
- [ ] Dashboard distinguishes learner-visible state from internal/debug metadata.
- [ ] Dashboard does not appear in learner mode.
- [ ] Tests cover Dev Mode visibility gating and diagnostic data shape.

Implementation notes:

- This is a safe place to pilot richer MCP App rendering before broader learner rollout.

## 17. Harden Refresh, Fallback, Sandboxing, And Observability

Type: AFK

Blocked by:

- 4. Add Internal MCP App Bridge host.
- 5. Add MCP App Bundle build, registry, and test harness.
- 6. Ship Quiz MCP App vertical slice.
- 7. Ship Flashcards MCP App vertical slice.
- 10. Ship first Simulation Template MCP App.

User stories covered:

- As a learner, I want interactive surfaces to recover gracefully if an app bundle fails.
- As a maintainer, I want sandbox policy and action observability to catch regressions before they become trust issues.

What to build:

Harden Workspace refresh, native fallback, iframe reload behavior, sandbox restrictions, CSP metadata, action metrics/traces, and learner-safe error states across interactive surfaces.

Acceptance criteria:

- [ ] MCP App Bundle load failure shows native fallback or learner-readable summary where practical.
- [ ] Refresh events update app state without requiring a full page reload.
- [ ] Iframe reload reconstructs canonical state from StudyAgent.
- [ ] Sandbox policy blocks direct notebook API access, external network by default, subframes by default, and auth-cookie reliance.
- [ ] Observability captures bounded action counts, error outcomes, bundle IDs/versions, and trace IDs without high-cardinality metric labels.
- [ ] Tests cover app failure, action failure, refresh after state change, sandbox attributes, and Dev Mode diagnostics.

Implementation notes:

- High-cardinality IDs belong in traces/logs/events, not metric labels.
- Keep learner-facing errors humane and actionable.

## 18. Add Synthetic Learner And Browser Regression Coverage

Type: AFK

Blocked by:

- 6. Ship Quiz MCP App vertical slice.
- 7. Ship Flashcards MCP App vertical slice.
- 8. Ship Worked Example Stepper MCP App vertical slice.
- 9. Ship Evidence Explorer MCP App vertical slice.
- 10. Ship first Simulation Template MCP App.
- 12. Ship Live Plan Interactive Learning Surface.
- 13. Add tutor-initiated surface launch and steering.
- 17. Harden refresh, fallback, sandboxing, and observability.

User stories covered:

- As a maintainer, I want end-to-end regression coverage proving interactive surfaces preserve source grounding and reducer-governed state.
- As a product owner, I want confidence that the new interactivity improves learning without turning passive behavior into mastery.

What to build:

Add Synthetic Learner and browser/UI scenarios covering tutor-led and independent Interactive Learning Surface flows. Assertions should inspect learner-visible output, runtime traces, persisted state, app actions, Evidence refs, and fallback behavior.

Acceptance criteria:

- [ ] Scenario covers tutor opening a quiz app, learner answering incorrectly, Mastery Evidence persistence, and source-grounded feedback.
- [ ] Scenario covers independent flashcard review with no tutor auto-invocation and no mastery from card flips.
- [ ] Scenario covers worked example step answer and hint/reveal no-mastery behavior.
- [ ] Scenario covers Evidence Explorer source-span inspection with learner-safe Evidence language.
- [ ] Scenario covers simulation parameter manipulation and submitted observation.
- [ ] Scenario covers Live Plan intent action without direct mastery/curriculum mutation.
- [ ] Browser path verifies iframe rendering, bridge action dispatch, fallback on bundle failure, and Workspace refresh.
- [ ] Assertions distinguish tutor-led actions from self-review actions by learning context envelope.

Implementation notes:

- Reuse Synthetic Learner eval infrastructure and browser golden journey support.
- Keep deterministic assertions as the primary gate; optional qualitative rubrics can supplement but not replace them.
