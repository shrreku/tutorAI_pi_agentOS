# Interactive Learning Surfaces Implementation Plan

Status: implemented in-repo (2026-06-09); implementation tickets live in `docs/architecture/interactive-learning-surfaces-implementation-tickets.md`.

This plan turns the MCP, MCP Apps, declarative UI, and generative UI research into a StudyAgent-specific architecture for rich, source-grounded, personalized, adaptive learning interactions.

The product goal is not "apps everywhere." The goal is a tutor-led learning loop where the Workspace hosts rich Interactive Learning Surfaces, the tutor launches and steers them, Evidence remains visible, and durable learning state changes remain reducer-governed.

## Research Anchors

MCP:

- Standard protocol for tools, resources, prompts, sampling, roots, elicitation, progress, cancellation, error reporting, and logging.
- Useful later for exposing StudyAgent capabilities to external hosts.
- Not part of this phase as an external server surface.

MCP Apps:

- Tools can declare a `_meta.ui.resourceUri` pointing to a `ui://` resource.
- Hosts render the resource in a sandboxed iframe and exchange data/actions over JSON-RPC style `postMessage`.
- App UI can call tools, receive tool input/result notifications, send messages, and update model context when the host allows it.
- In StudyAgent, this becomes an internal rendering/runtime pattern, not an external MCP server for now.

Declarative UI and A2UI-style catalogs:

- Agents emit structured UI descriptions against a trusted component catalog.
- The client owns native rendering, accessibility, styling, and validation.
- This maps well to StudyAgent because the model should speak learning blocks, not raw UI primitives.

AG-UI:

- Event-based protocol for streaming agent messages, tool calls, state deltas, custom events, and user interactions.
- StudyAgent already has an AG-UI-like tutor stream. This plan should align with that direction instead of inventing another live-agent event model.

Open-ended generative UI:

- Models can generate bespoke HTML/CSS/JS tools and simulations.
- This is useful as a drafting path for Simulation Templates, but not as learner-facing product state in this phase.

## Scope

In scope for this implementation program:

- Interactive Learning Surfaces in the Workspace.
- Interactive Learning Blocks as model-facing declarative learning units.
- Internal MCP App Bridge for sandboxed iframe rendering.
- MCP App Bundles for quiz, flashcards, worked examples, Evidence explorer, Live Plan view, Dev Mode dashboards, and Simulation Templates.
- Unified Interactive Learning Action dispatcher.
- Quiz, flashcard, worked-example, Evidence, Live Plan, source-reader, personalization-control, tutor-steered, and Dev Mode interactive paths.
- Template-based simulations and a pipeline for generating, testing, and promoting Simulation Drafts into Simulation Templates.
- Native fallback rendering where practical.
- Synthetic Learner and browser regression coverage for the new interactive flows.

Out of scope for this phase:

- External StudyAgent MCP server.
- MCP App marketplace or third-party plugin distribution.
- Arbitrary generated-code mini-apps in learner-facing flows.
- Teacher/authoring studio.
- Voice lab or broader multimodal lab.

## Accepted Product Boundaries

Interactive Learning Surface:

- A learner-facing Reference Surface with interactive controls for practice, exploration, review, or Evidence inspection.
- It lives primarily in the Workspace.
- It is not a separate durable object by default.
- Durable learner outputs remain Artifacts, Mastery Evidence, or learning state.
- Tutor chat remains the teaching spine.

Interactive Learning Block:

- A model-facing declarative unit inside an Interactive Learning Surface.
- It is named for learning purpose: Quiz, Flashcard Deck, Worked Example, Evidence Map, Simulation, Live Plan, Comparison, Concept Timeline, Source Reader, or Dev Mode dashboard.
- Generic UI primitives remain renderer-owned implementation details.

MCP App Renderer:

- The default rich renderer for new Interactive Learning Blocks.
- It is an iframe implementation detail behind the Interactive Learning Block contract.
- Quiz and flashcard blocks should also move to MCP App rendering by default because the current built-in versions are subpar and need redesign anyway.
- Native rendering remains available as a fallback where practical.

Interactive Learning Action:

- A validated learner action emitted by an Interactive Learning Block.
- It carries a learning context envelope.
- Durable outcomes route through Artifacts, Mastery Evidence, learning state, and notebook events.
- Renderer-specific state is never canonical.

Interactive Learning Signal:

- Any learner action inside an Interactive Learning Surface.
- Only evaluable performance becomes Mastery Evidence.
- Meaningful submitted actions may update tutor context.
- High-frequency UI behavior stays local or becomes aggregated telemetry, artifact/session state, or future Learner Trait Signals.

Simulation Template:

- A trusted reusable Interactive Learning Surface pattern for visualizing or manipulating a concept.
- Learner-facing simulations use Simulation Templates with tutor-generated parameters and prompts.
- Arbitrary generated simulation code is not learner-facing product state.

Simulation Draft:

- Experimental generated simulation used to explore or test a future Simulation Template.
- It is reviewed, tested, and promoted before it becomes a trusted Simulation Template.

## Existing Repo Fit

This plan builds on existing architecture rather than replacing it:

- `ReferenceSurface` is already the server-authored learner-facing open-node contract.
- `FullPanelViewer` already renders full-panel Reference Surfaces.
- `TutorPanel` already owns tutor chat, session controls, artifact review, and runtime activity display.
- `ToolContract` and write providers already enforce typed tool writes and reducer outputs.
- Artifact lifecycle already governs learner-visible study aids and consent.
- Mastery Evaluator already separates judgment from reducer-applied learning state.
- Workspace refresh already invalidates graph, reference, artifact, study state, and quiz attempt queries from notebook events.

The architectural move is to deepen the Reference Surface and Artifact Lifecycle modules with Interactive Learning Blocks and a shared action path.

## Architecture Shape

High-level flow:

1. Tutor, Workspace, or learner opens a Reference Surface.
2. API returns a Reference Surface containing Interactive Learning Blocks.
3. Workspace chooses renderer for each block:
   - MCP App Renderer by default for rich interactive blocks.
   - Native React fallback where practical.
4. Internal MCP App Bridge fetches or reuses a globally versioned MCP App Bundle.
5. Workspace passes block data, canonical state, host context, and allowed actions into the iframe.
6. Learner interacts.
7. Meaningful submitted interaction emits an Interactive Learning Action.
8. API validates the action envelope.
9. Durable outcomes route through existing artifact, mastery, learning, planning, or reducer-governed write paths.
10. API emits notebook events and returns updated surface/block state.
11. Workspace refreshes and pushes updated state into the MCP App Renderer.
12. Tutor may respond when explicitly requested, when the surface is tutor-led, or when intervention thresholds suggest a next action.

## Contract Layers

### 1. Reference Surface

Reference Surface remains the learner-facing open-node contract. It should be extended to carry Interactive Learning Blocks.

The current `ReferenceBlock` kinds are simple content blocks. The new contract should distinguish:

- static reference blocks;
- interactive learning blocks;
- renderer metadata;
- action schemas;
- canonical interaction state;
- Evidence and source refs.

The model-facing concept is the Interactive Learning Block, not the renderer.

### 2. Interactive Learning Block

Expected fields:

- `id`
- `kind`
- `title`
- `learningPurpose`
- `surfaceRole`
- `nodeRef`
- `artifactRef` when backed by an artifact
- `objectiveRefs`
- `conceptRefs`
- `sourceRefs`
- `evidenceRefs`
- `prompt`
- `content`
- `canonicalState`
- `allowedActions`
- `rendererPreference`
- `fallbackSummary`
- `quality`

Block kinds for the first program:

- `quiz`
- `flashcard_deck`
- `worked_example`
- `evidence_explorer`
- `simulation`
- `live_plan`
- `source_reader`
- `personalization_controls`
- `dev_trace_dashboard`
- `comparison`
- `concept_timeline`

The model should not output generic UI primitives such as Card, Button, Slider, or Tabs. It should request learning blocks with validated parameters. Renderer code maps those blocks into native UI or MCP App Bundles.

### 3. MCP App Bundle

An MCP App Bundle is a globally versioned app resource for one major Interactive Learning Block type or Simulation Template.

Examples:

- `ui://studyagent/quiz/v1`
- `ui://studyagent/flashcards/v1`
- `ui://studyagent/worked-example/v1`
- `ui://studyagent/evidence-explorer/v1`
- `ui://studyagent/live-plan/v1`
- `ui://studyagent/simulation/function-plotter/v1`
- `ui://studyagent/dev-trace/v1`

Notebook-specific learning content is data passed into the bundle. App bundles are not generated per notebook.

Bundles should be separate per major block type while sharing bridge and design-system code at build time.

### 4. Internal MCP App Bridge

The Internal MCP App Bridge is Workspace-owned. It renders MCP App Bundles in sandboxed iframes and passes block data, host context, and actions through an MCP-App-compatible message shape.

It provides MCP App behavior inside StudyAgent without exposing an external MCP server.

The bridge should support:

- app initialization;
- host context delivery;
- tool-input/tool-result style block data delivery;
- action dispatch;
- state update notifications;
- teardown;
- error reporting;
- fallback rendering;
- Dev Mode diagnostics.

It should intentionally resemble MCP Apps so future external MCP support is easier, but it should not require a public MCP server in this phase.

### 5. Interactive Learning Action Dispatcher

Native renderers and MCP App renderers should emit the same action envelope.

Example action names:

- `quiz.answer_submitted`
- `flashcard.review_rated`
- `worked_example.step_answered`
- `worked_example.step_revealed`
- `simulation.observation_submitted`
- `simulation.parameter_snapshot_submitted`
- `live_plan.action_selected`
- `evidence.source_span_opened`
- `source_reader.annotation_created`
- `surface.completed`
- `tutor.help_requested`

The dispatcher validates:

- notebook ownership;
- surface/block identity;
- artifact/source/objective/concept refs;
- optional tutor session/run/turn identity;
- allowed action for the block;
- action payload schema;
- source/Evidence scope;
- renderer identity and version where relevant.

Then it routes durable outcomes to:

- artifact attempt/review/completion storage;
- Mastery Evaluator and Mastery Evidence;
- learning state reducers;
- Artifact Lifecycle;
- Live Plan or planning tools;
- notebook events and refresh hints;
- tutor context update summaries when needed.

The dispatcher returns updated canonical block/surface state. It should not require a live tutor turn.

### 6. Learning Context Envelope

Interactive Learning Actions can happen during an active tutor lesson or during independent self-review. Therefore session identity is optional, but learning context is required.

Expected envelope:

- `notebookId`
- `surfaceId`
- `blockId`
- `nodeRef`
- `artifactId` when relevant
- `sourceRefs`
- `evidenceRefs`
- `objectiveRefs`
- `conceptRefs`
- `sessionId` optional
- `turnId` optional
- `runId` optional
- `rendererKind`
- `rendererVersion`
- `actionName`
- `actionPayload`
- `createdAt`

If the action happens during tutor-led interaction, attach session/turn/run identity. If the action happens during self-review, attach artifact/objective/source refs and current Live Plan context.

### 7. State Ownership

StudyAgent owns canonical interaction state:

- quiz attempts;
- flashcard ratings;
- worked-example step completion;
- Mastery Evidence;
- artifact lifecycle;
- Evidence refs;
- tutor/session identity;
- planning and learning state;
- notebook events.

MCP App Renderers may own temporary presentation state:

- selected answer before submit;
- card flip animation;
- local slider position;
- open accordion state;
- animation playback;
- drag position;
- viewport/layout details.

If the iframe reloads, it reconstructs from StudyAgent state. If the app fails, native fallback or learner-readable summary should remain available where practical.

## Sandbox Policy

MCP App Bundles are internal but still sandboxed.

Default policy:

- no direct notebook API calls from iframe;
- no auth cookies available to iframe;
- no parent DOM access;
- no external network access unless explicitly allowlisted;
- no subframes unless explicitly allowlisted;
- no reliance on iframe-owned durable storage;
- no CDN scripts by default;
- bundled static assets by default;
- StudyAgent data comes through the Internal MCP App Bridge;
- Interactive Learning Actions return through the bridge.

Per-bundle exceptions must be explicit and test-covered. Dev Mode may have extra diagnostics, but should not weaken learner-facing sandbox rules.

## Evidence Policy

Interactive Evidence should be progressively disclosed.

Rules:

- Every source-grounded Interactive Learning Block carries Evidence refs.
- Practice blocks show compact Evidence affordances by default.
- Quiz feedback and worked-example steps reveal relevant excerpts after submit/reveal.
- Simulation blocks indicate whether they are source-grounded or broader pedagogy.
- Source-specific claims must cite Evidence.
- Outside-source pedagogical content must be labeled as broader explanation or practice, not source claim.
- Dev Mode may expose raw claims, confidence, and internal provenance.

## Tutor Behavior

Tutor chat remains the teaching spine:

- The tutor introduces, launches, and steers Interactive Learning Surfaces.
- The Workspace hosts rich interaction.
- Tutor chat may use small inline controls only for lightweight current-turn checks.
- Rich durable, reviewable, or source-heavy interaction opens in the Workspace.

Tutor invocation policy:

- Ordinary independent actions update state and Workspace surfaces without auto-invoking the tutor.
- The tutor responds when:
  - learner explicitly asks for help;
  - the tutor launched the surface and is waiting for a result;
  - an active lesson flow expects the next tutor response;
  - repeated evidence crosses an intervention threshold and the learner accepts a suggested next action.

Thresholds should suggest tutor help, not hijack the session.

## Block-Type Plan

### Quiz App

Purpose:

- Evaluable practice.
- Immediate feedback.
- Mastery Evidence.
- Weak concept detection.

Default renderer:

- MCP App Bundle.

Canonical state:

- quiz questions;
- current/saved attempts;
- score;
- per-question feedback;
- Evidence refs;
- source/objective/concept refs.

Actions:

- submit answer;
- request hint;
- view Evidence;
- request tutor explanation;
- complete quiz;
- extend/regenerate when permitted by artifact lifecycle.

Durable outcomes:

- quiz attempt record;
- Mastery Evidence when answer is evaluable;
- artifact/session state;
- notebook events and refresh.

### Flashcards App

Purpose:

- Review and spaced repetition.
- Confidence and recall practice.
- Weak concept surfacing.

Default renderer:

- MCP App Bundle.

Canonical state:

- cards;
- review history;
- current scheduling metadata if implemented;
- confidence ratings;
- Evidence refs.

Actions:

- reveal back;
- rate card;
- request example;
- request tutor help;
- complete deck.

Durable outcomes:

- review rating;
- artifact/session state;
- optional Learner Trait Signal or weak concept signal when repeated;
- Mastery Evidence only when there is evaluable answer/explanation, not flip alone.

### Worked Example Stepper

Purpose:

- Guided practice.
- Step-level reasoning.
- Misconception detection.

Default renderer:

- MCP App Bundle.

Actions:

- answer step;
- reveal hint;
- reveal solution step;
- submit self-explanation;
- request tutor explanation;
- complete example.

Durable outcomes:

- step attempt;
- Mastery Evidence for evaluable step answers or explanations;
- aggregated hint/reveal signals for tutor context.

### Evidence Explorer

Purpose:

- Trust, source grounding, citation exploration, source-scope clarity.

Default renderer:

- MCP App Bundle.

Actions:

- open source span;
- compare evidence;
- inspect supporting notes;
- ask tutor about citation;
- report confusing or unsupported evidence.

Durable outcomes:

- mostly context and events, not mastery;
- possible tutor context update;
- no claim/status exposure in learner mode unless transformed into learner-safe language.

### Live Plan App

Purpose:

- Current objective, next actions, weak concepts, progress, consolidation choices.

Default renderer:

- MCP App Bundle.

Safe direct actions:

- start or resume session;
- open objective;
- open weak concept;
- review artifact;
- open quiz or flashcards;
- open Source Wiki page.

Intent actions:

- slow down;
- go deeper;
- skip objective;
- focus selected source;
- prepare for exam;
- revise plan;
- change module order.

Plan-changing actions should express learner intent for tutor or reducer-governed handling. The UI should not directly mark concept mastery, complete objectives, or rewrite curriculum.

### Simulation Template Apps

Purpose:

- Manipulate and visualize concepts.
- Support visual, experimental, and exploratory learning.

Default renderer:

- MCP App Bundle per template family.

Initial template candidates:

- `function_plotter`
- `algorithm_stepper`
- `probability_sampler`
- `graph_traversal`
- `vector_field`
- `pendulum`
- `orbit`
- `molecule_viewer`

First implementation should pick one small template such as `function_plotter` or `algorithm_stepper`.

Actions:

- submit observation;
- answer simulation prompt;
- save parameter snapshot;
- request hint;
- request tutor explanation.

Durable outcomes:

- Mastery Evidence only for submitted observations, explanations, or answers;
- parameter changes remain local or aggregated telemetry.

### Source Reader

Purpose:

- Source-aware reading with concept overlays, highlight-to-tutor, Evidence, and source-scope summaries.

Default renderer:

- MCP App Bundle or native Reference Surface depending on complexity.

Actions:

- open source span;
- ask tutor about selected span;
- mark confusing section;
- open related concept;
- open Evidence.

Durable outcomes:

- tutor context;
- possible Learner Trait Signal only after repeated behavior or explicit self-report;
- no mastery from passive reading alone.

### Personalization Controls

Purpose:

- Let learners edit explicit preferences for pace, depth, example style, assessment preference, and urgency.

Default renderer:

- Native or MCP App Bundle.

Actions:

- set explicit preference;
- update exam urgency;
- choose preferred practice style.

Durable outcomes:

- explicit Learner Trait Signal or learner profile preference update;
- no direct mastery/curriculum mutation.

### Dev Mode Dashboards

Purpose:

- Inspect traces, tool calls, runtime events, reducer writes, eval runs, app actions, and bridge diagnostics.

Default renderer:

- MCP App Bundle.

Durable outcomes:

- none in learner state;
- developer diagnostics only.

## Simulation Draft To Template Pipeline

The simulation pipeline is a product/tooling loop, not a learner runtime loop.

1. Generate draft:
   - model creates candidate simulation from a concept need;
   - draft may include HTML/JS or component code;
   - draft has no notebook data access and no durable writes.

2. Run in sandbox:
   - isolated preview;
   - strict CSP;
   - no auth;
   - no external network by default.

3. Evaluate:
   - conceptual correctness;
   - parameter bounds;
   - accessibility;
   - responsive behavior;
   - no unsafe code;
   - no undeclared network;
   - clear learner instructions;
   - event schema support;
   - ability to cite or label source-grounding.

4. Templatize:
   - extract reusable template;
   - define `templateId`;
   - define parameter schema;
   - define supported concept families;
   - define learner prompt slots;
   - define expected observation schema;
   - define action/event schema;
   - define Evidence requirements.

5. Promote:
   - add globally versioned MCP App Bundle;
   - add fixture examples;
   - add visual/smoke tests;
   - add source-grounded instantiation tests.

6. Observe and refine:
   - use interaction data and eval outcomes;
   - revise or retire weak templates.

Generated code is a draft path. Trusted templates are the product path.

## Runtime And API Integration

API/runtime responsibilities:

- serve Reference Surfaces with Interactive Learning Blocks;
- validate Interactive Learning Actions;
- route action outcomes through existing tool/reducer-governed write paths;
- return updated surface/block state;
- emit notebook events;
- expose Dev Mode diagnostics;
- maintain ownership checks and notebook isolation.

The API should not:

- trust renderer-provided canonical state;
- accept direct writes from iframe code;
- require active tutor session for independent review actions;
- auto-invoke the tutor for ordinary actions.

Workspace responsibilities:

- host MCP App Bundles in sandboxed iframes;
- deliver host context and block state;
- dispatch Interactive Learning Actions;
- reconcile returned state;
- refresh surfaces from notebook events;
- provide fallback rendering;
- show app/bridge errors in learner-safe language;
- expose bridge diagnostics in Dev Mode.

Tutor runtime responsibilities:

- launch and steer Interactive Learning Surfaces;
- request blocks through tools or surface actions;
- evaluate learner responses when eligible;
- summarize meaningful submitted actions when they matter for the next tutor move;
- avoid overinterpreting passive/high-frequency interactions.

## Testing Strategy

Schema tests:

- Interactive Learning Block contracts.
- Interactive Learning Action envelope.
- Renderer metadata.
- MCP App Bundle manifest.
- Simulation Template schema.
- Simulation Draft evaluation result.

API tests:

- action validation;
- ownership and notebook isolation;
- no active session required;
- tutor-led session identity preserved when present;
- quiz answer -> attempt -> Mastery Evidence;
- flashcard rating -> review state without mastery by default;
- worked step answer -> Mastery Evidence;
- simulation slider events ignored/aggregated;
- simulation observation -> evaluable action;
- Live Plan intent action does not directly mutate mastery/curriculum.

Web tests:

- bridge initialization;
- sandbox attributes/CSP metadata;
- tool-input/tool-result delivery;
- action dispatch;
- state update notification;
- iframe failure fallback;
- native fallback rendering;
- Evidence affordances;
- Dev Mode diagnostics.

MCP App Bundle tests:

- each bundle renders from canonical block data;
- each bundle emits only allowed action names;
- each bundle survives missing optional fields;
- no direct fetch to notebook APIs;
- no localStorage reliance for canonical state;
- accessibility smoke tests.

Simulation pipeline tests:

- draft sandbox restrictions;
- template promotion checklist;
- parameter schema validation;
- concept-family matching;
- action/event schema validation.

Synthetic Learner/browser evals:

- learner starts a lesson and tutor opens a quiz app;
- learner answers incorrectly and receives source-grounded feedback;
- learner reviews flashcards independently and receives next-action suggestion;
- learner uses worked example and asks tutor for help;
- learner opens Evidence explorer and source span;
- learner interacts with simulation and submits observation;
- no passive interaction creates mastery;
- fallback path works when MCP App Bundle fails.

## Implementation Order

1. Shared schemas for Interactive Learning Blocks, actions, renderer metadata, and bundle manifests.
2. Reference Surface support for Interactive Learning Blocks.
3. Interactive Learning Action dispatcher.
4. Internal MCP App Bridge and sandboxed iframe host.
5. MCP App Bundle build/registry/test harness.
6. Quiz MCP App vertical slice.
7. Flashcards MCP App vertical slice.
8. Worked Example Stepper vertical slice.
9. Evidence Explorer vertical slice.
10. First Simulation Template vertical slice.
11. Simulation Draft to Template pipeline.
12. Live Plan interactive surface.
13. Tutor-initiated surface launch and steering.
14. Source Reader and concept overlays.
15. Personalization controls.
16. Dev Mode interactive dashboards.
17. Refresh/fallback/security hardening.
18. Synthetic Learner and browser eval coverage.

## ADR Alignment

This plan preserves existing ADRs:

- ADR-0005: durable writes remain typed and reducer-governed.
- ADR-0010: Workspace, Reference Surface, and Evidence vocabulary remain the learner-facing organization.
- ADR-0011: durable study aids remain governed by artifact lifecycle, consent, and quality gates.
- ADR-0013: Mastery Evaluator produces durable evidence; reducers apply learning state.
- ADR-0020: Interactive Learning Surfaces and Internal MCP App Bridge are the accepted product/runtime direction.

## Non-Goals

- Do not expose raw claim/debug objects to learner mode.
- Do not let MCP App Renderers become sources of truth.
- Do not let generated HTML/JS mutate durable notebook state.
- Do not create a new durable app-instance table until a concrete resumption need is proven.
- Do not treat passive viewing, slider movement, or card flipping as mastery.
- Do not auto-invoke the tutor for ordinary independent practice actions.
