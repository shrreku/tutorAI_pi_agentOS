# Interactive Learning And MCP Apps

## Product Concept

Interactive Learning Surfaces are Reference surfaces with interactive controls for practice, exploration, review, or Evidence inspection.

Interactive Learning Blocks are the designer-facing and model-facing units inside those surfaces.

Official-protocol MCP Apps are the default rich renderer implementation. They are sandboxed Views behind the StudyAgent interaction contract.

Do not present MCP Apps as third-party apps to learners. Learners should experience them as native StudyAgent learning activities.

AG-UI carries ordered Tutor Choreography cues; it does not carry or render MCP App code. Rich Views mount in the responsive Workspace Stage. Tutor chat shows compact Surface Anchors and only genuinely small native controls so transcripts remain readable and do not remount iframe applications during history replay.

Choreography is learner-authoritative. Do not steal focus or replace active/pinned surfaces. Queue blocked cues, preserve unsent input, and let learner pinning, dismissal, auto-stage preference, responsive layout, reduced motion, and accessibility needs override agent placement intent.

The v1 Workspace Stage uses semantic slots: one Primary rich surface, one optional Companion Evidence/source/reference surface on suitable desktop widths, and a learner-managed Pinned Tray. Mobile shows one active sheet or full-screen surface plus pinned anchors. Do not implement agent-controlled coordinates or a freeform multi-block lesson canvas in v1.

Surface Cues carry stable IDs and monotonic session sequence numbers. Acknowledge each as applied, deferred, or rejected with a bounded reason, ignore duplicates, and restore the Stage from the session Choreography Snapshot after reconnect. Do not treat presentation recovery state as learning progress or Mastery Evidence.

## Registered Bundle Contracts

The current code registers these intended bundle contracts. Their `ui://` identities and action mappings exist, but the source/build pipeline and corresponding `/mcp-apps/*` assets do not yet exist. The current custom bridge is a scaffold to replace with the official MCP Apps host protocol, not a completed bundle implementation.

Released bundles contain reviewed, compiled template code. Tutor/model output supplies only versioned, schema-validated template instance data; it does not supply scene programs or executable View code.

The bundle catalog is generated from validated template manifests rather than maintained by hand. Each entry uses an immutable exact-version `ui://` resource and records its content hash, schema compatibility, supported actions/capabilities, renderer profile, sandbox requirements, and fallback. Durable surfaces persist the exact version and never resolve `latest`.

In hosted learner Workspaces, the tutor supplies a structured learning-interaction request and may suggest a semantic template. A deterministic server resolver owns exact version selection, policy/capability filtering, instance validation, and fallback. The Template Promotion Lab is a separate generative lane and may build completely new View code, schemas, actions, tests, and manifests before human review.

| Bundle                   | Block kind                 | Resource URI                                     | Primary actions                             |
| ------------------------ | -------------------------- | ------------------------------------------------ | ------------------------------------------- |
| Quiz                     | `quiz`                     | `ui://studyagent/quiz/v1`                        | answer, tutor help                          |
| Flashcards               | `flashcard_deck`           | `ui://studyagent/flashcards/v1`                  | review rating, tutor help                   |
| Worked Example           | `worked_example`           | `ui://studyagent/worked-example/v1`              | step answer, step reveal, tutor help        |
| Evidence Explorer        | `evidence_explorer`        | `ui://studyagent/evidence-explorer/v1`           | source span open, tutor help                |
| Live Plan                | `live_plan`                | `ui://studyagent/live-plan/v1`                   | plan action, tutor help                     |
| Function Plotter         | `simulation` template      | `ui://studyagent/simulation/function-plotter/v1` | observation, parameter snapshot, tutor help |
| Source Reader            | `source_reader`            | `ui://studyagent/source-reader/v1`               | annotation, source span open, tutor help    |
| Personalization Controls | `personalization_controls` | `ui://studyagent/personalization-controls/v1`    | preference update, tutor help               |
| Comparison               | `comparison`               | `ui://studyagent/comparison/v1`                  | evidence open, complete, tutor help         |
| Concept Timeline         | `concept_timeline`         | `ui://studyagent/concept-timeline/v1`            | evidence open, tutor help                   |
| Dev Trace                | `dev_trace_dashboard`      | `ui://studyagent/dev-trace/v1`                   | tutor help                                  |

## Block Anatomy

Every Interactive Learning Block can include:

- id;
- kind;
- title;
- learning purpose;
- surface role: primary or supplemental;
- node ref;
- artifact ref when artifact-backed;
- objective refs;
- concept refs;
- source refs;
- Evidence refs;
- prompt;
- content;
- canonical state;
- allowed actions;
- renderer preference;
- fallback summary;
- quality: source-backed and needs review.

Target contracts also include a stable Interaction Family, exact `templateId`/version, Template Instance/schema version, and required host capabilities. The current specialized block kinds remain migration aliases while the resolver and catalog move to family/template/capability selection.

Each template uses a code-first typed definition with Zod schemas for instance data, deterministic model state, commands/local events, canonical action payloads, canonical state projection, and migrations. JSON Schema and static manifests are generated from those definitions. Promoted Views must not consume untyped `content`, state, parameter, or action payload records.

## Catalog Taxonomy

The stable families are Explain, Explore, Practice, Guided Work, Evidence, Plan and Reflect, and Diagnostic. Add catalog breadth through new templates and semantic tags inside those families. Do not add a platform enum/action for every visual or activity variant.

Template-local events map to compact canonical actions for response, attempt, observation, review, Evidence open, intent, completion, and tutor help. A new durable action meaning is Platform-Extension work rather than a manifest-only declaration.

## Golden Template Pack

The first promoted pack is `animated-process`, `quiz`, `flashcard-review`, `worked-example-stepper`, `evidence-comparator`, `function-explorer`, `electron-flow-lab`, `live-plan`, and Admin-only `template-diagnostics`. Treat these as real production Views and review fixtures, not Design Lab mockups. They establish the patterns and quality gates the Template Builder Agent will use to expand the library.

## State Ownership

Every template has four explicit layers:

- immutable Template Instance data, including an explicit random seed when randomness is used;
- deterministic, serializable Template Model State for interaction/simulation behavior;
- ephemeral View State for focus, hover, drag, camera, animation frame, and layout;
- server-owned Canonical Learning State for attempts, observations, Mastery Evidence, progress, and durable outcomes.

StudyAgent owns canonical state:

- quiz attempts;
- flashcard ratings;
- worked-example step completion;
- Mastery Evidence;
- artifact lifecycle;
- Evidence refs;
- tutor/session identity;
- planning and learning state;
- notebook events.

MCP app renderers may own temporary presentation state:

- selected answer before submit;
- card flip state;
- slider position;
- animation playback;
- open accordion state;
- local layout.

If an iframe reloads, it should reconstruct from StudyAgent state.

High-frequency manipulation stays local. Only meaningful learning actions and bounded checkpoints invoke app-visible tools; a submitted action may attach the relevant model snapshot when its schema requires it.

Templates must not invent arbitrary durable learner state, tables, event meanings, or persistence paths. Template-local events and model snapshots map to canonical Interactive Learning Actions and server-owned Canonical Learning State. A new durable outcome type, table, reducer, event, migration, or API persistence contract is Platform-Extension work.

## MCP App Host Protocol

Use the official MCP Apps JSON-RPC lifecycle rather than private `ready`, `action`, `block-state`, or `tool-result` message shapes:

- the View and host negotiate capabilities through `ui/initialize` and `ui/notifications/initialized`;
- the host supplies block input and canonical results through MCP Apps tool-input and tool-result notifications;
- the View invokes allowlisted app-visible tools through `tools/call`;
- the host adapts those calls to validated Interactive Learning Actions;
- teardown uses the MCP Apps resource lifecycle;
- protocol messages are JSON-RPC 2.0 over the sandbox proxy's `postMessage` transport.

StudyAgent-specific block and learning context belong in tool arguments/results. They must not create a parallel transport protocol.

Design states:

- loading app;
- ready;
- saving;
- saved;
- action failed;
- app failed to load;
- fallback rendering;
- Dev Mode diagnostics.

## Sandbox Policy

Default iframe sandbox:

- allow scripts;
- no same-origin permission;
- no top navigation;
- no popups;
- no direct notebook API calls;
- no auth cookies;
- no external runtime network access unless a Platform-Extension review explicitly allowlists exact origins;
- no iframe-owned durable storage.

Design implication:

- apps must receive all learning content from host-provided tool data;
- apps must call allowlisted tools through the host;
- apps should have self-contained assets.

## Shared Visual Direction

MCP apps should inherit the StudyAgent design language:

- same typography;
- same radius and button hierarchy;
- OKLCH token alignment with host;
- compact headers;
- Evidence affordances;
- clear saving and saved states;
- strong keyboard and focus states.

The shared MCP App visual package still needs to be built; there is no current `public/mcp-apps/shared/v1/shell.css` asset to preserve.

## Renderer Profiles

Use semantic DOM and SVG by default for quizzes, flashcards, timelines, diagrams, ordinary manipulatives, and text-heavy activities. These Views should use native semantic elements before recreating controls in graphics.

Complex 2D simulations may use the optional SceneryStack profile after it passes representative bundle-size, startup, frame-time, memory, mobile, keyboard, screen-reader, and sandbox tests. The first library version should not create a proprietary scene graph. Template Model State must remain independent of the selected View renderer.

## Template Promotion

Every new executable template version must pass automated security, protocol, schema, determinism, replay, accessibility, responsive, visual, performance, pedagogical, and Synthetic Learner gates, then receive explicit human maintainer approval in the authenticated Template Promotion Lab Admin UI. Automation may reject a draft but cannot publish it. Ordinary Template Instances from an approved version remain automatic after schema validation.

Generated UI and simulation code may be created and tested locally through the promotion runner. That runner is the generated-code execution boundary: it can build, preview, test, and capture evidence for unreviewed drafts, but it is not the hosted learner Workspace and cannot publish to the trusted catalog.

Direct React/Vite-style previews may speed authoring, but they are not approval evidence. Promotion evidence and Admin review previews must mount the compiled draft through the production-equivalent Internal MCP App Host, sandbox, MCP Apps protocol lifecycle, action adapter, and responsive Workspace Stage shell where relevant.

Promoted templates may bring new third-party npm dependencies. The Lab should show the exact pinned dependency graph, integrity/provenance, license/security findings, bundle and performance impact, and any sandbox/CSP/network/runtime implications. A new dependency is acceptable when the compiled View still satisfies the existing promoted-template constraints; it becomes Platform-Extension only when it requires new host capability, sandbox permission, renderer adapter, dependency runtime class, or build infrastructure.

Runtime network access is off by default. Views receive learner, source, Evidence, and configuration data through the host/tool boundary. If a draft needs external calls, the Lab must treat it as Platform-Extension and show exact origin allowlists, transmitted data classes, privacy review, fallback behavior, timeout/caching behavior, telemetry, and CSP/sandbox changes.

Durable learner data follows the same rule. The Lab may approve a Template-Only Draft only when its submitted data maps to existing canonical actions and Canonical Learning State. If a draft asks for a new table, durable outcome, event meaning, reducer, migration, or persistence API, the Lab must classify it as Platform-Extension and block publication until the platform change is reviewed and deployed.

The Lab needs a draft/version queue, sandboxed responsive preview, manifest/schema/action/capability diffs, automated evidence and screenshots, performance and pedagogical results, approve/reject/revoke/request-rebuild controls, and durable reviewer identity and decision notes. It is a dense operator review surface, not a drag-and-drop authoring tool.

The Lab must label each draft as Template-Only or Platform-Extension. Template-Only drafts may publish against existing capabilities after approval. Platform-Extension drafts show the missing actions/capabilities, link the generated code change and deployment status, and keep template publication disabled until the host capability catalog confirms availability.

Promotion details must show the authoritative template-source Git commit/PR, approved draft/evidence identity, build environment, manifest hash, compiled artifact hash/location, and publication/revocation status. PostgreSQL stores workflow metadata and evidence references; promoted source remains in Git and compiled Views remain in the immutable artifact registry.

The Lab must not publish directly from an ephemeral draft workspace, draft-source snapshot, artifact-storage blob, or PostgreSQL record. Approval can bind draft evidence to a reviewed Git commit, then publication builds the immutable View from that accepted source commit.

The Template Builder Agent may create branches and open draft PRs for generated template source or Platform-Extension patches. It cannot merge, approve review, mark PRs ready for review, publish/revoke templates, or issue Admin approval. The Lab should treat draft PR links as review/provenance evidence, not as promotion authority.

Version 1 does not need a community submission UI or marketplace. If community templates are enabled later, they should appear as ordinary Git PRs and pass the same evidence, Admin review, and publication gates as maintainer-authored templates.

## Quiz App

Purpose:

- evaluable practice;
- feedback;
- mastery evidence;
- weak concept detection.

Required layout:

- title and learning purpose;
- question progress;
- question body;
- answer choices or open answer;
- submit action;
- feedback after submit;
- Evidence chips;
- Ask tutor for help.

Key states:

- no questions;
- selected choice;
- open answer typing;
- saving;
- saved;
- correct;
- needs review;
- complete;
- failed action.

## Flashcards App

Purpose:

- recall and review.

Required layout:

- deck title;
- card progress;
- front and back state;
- reveal answer;
- rating buttons: again, hard, good, easy;
- Evidence;
- tutor help.

Interaction:

- reveal is local;
- rating is submitted;
- after rating, advance to next card.

## Worked Example App

Purpose:

- guided step-level reasoning.

Required layout:

- problem statement;
- stepper;
- current step prompt;
- answer input;
- hint and reveal controls;
- feedback;
- common mistakes;
- final takeaway;
- tutor help.

Interaction:

- answer step may produce Mastery Evidence;
- reveal step is passive;
- repeated hint/reveal can update context but should not count as mastery alone.

## Evidence Explorer App

Purpose:

- inspect source grounding.

Required layout:

- compact Evidence list;
- excerpt preview;
- source title and locator;
- compare selected excerpts;
- ask tutor about citation;
- report confusing or unsupported evidence.

Learner mode:

- no raw claim statuses;
- no confidence score as primary content.

Dev Mode:

- can show draft/debug claims and IDs.

## Live Plan App

Purpose:

- current objective, next actions, weak concepts, progress, consolidation choices.

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

Plan-changing actions express learner intent for tutor or reducer-governed handling. The UI should not directly mark mastery, complete objectives, or rewrite curriculum.

## Simulation App

Initial implemented template:

- function plotter.

Future templates:

- algorithm stepper;
- probability sampler;
- graph traversal;
- vector field;
- pendulum;
- orbit;
- molecule viewer.

Required layout:

- concept or prompt;
- visual simulation area;
- parameter controls;
- observation prompt;
- submit observation;
- save parameter snapshot when meaningful;
- tutor help.

Rules:

- parameter changes are temporary or telemetry;
- submitted observations or explanations can become Mastery Evidence;
- simulation must state whether it is source-grounded or broader practice.

## Source Reader App

Purpose:

- source-aware reading with concept overlays, annotations, selected span to tutor, and Evidence.

Required layout:

- source outline or current excerpt;
- selected span affordance;
- annotation input;
- mark confusing;
- open related concept;
- ask tutor about span.

## Personalization Controls App

Purpose:

- learner can set explicit preferences.

Supported preferences:

- pace;
- depth;
- examples;
- assessment;
- urgency.

Rules:

- explicit preference update can persist quickly;
- inferred trait labels, confidence, and evidence remain internal or Dev Mode;
- preferences do not directly mutate mastery or curriculum.

## Comparison App

Purpose:

- compare concepts, methods, source sections, or examples.

Required layout:

- side-by-side comparison on desktop;
- stacked dimensions on mobile;
- Evidence per row;
- completion action;
- tutor help.

## Concept Timeline App

Purpose:

- show concept development across source, curriculum, sessions, artifacts, and mastery.

Required layout:

- timeline;
- source moments;
- lesson moments;
- artifact moments;
- practice moments;
- Evidence per item.

## Native Fallback

Every interactive block should have a fallback:

- block kind;
- summary;
- ask tutor for help if available;
- no blank iframe area.

Fallback copy:

`This interactive block is shown in simplified mode.`

Error copy:

`The interactive view failed to load. You can still review the summary above.`

## Action Names

Canonical interactive action names:

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
- `personalization.preference_updated`

Designers do not need to expose these names, but each submitted control must map to one of them.
