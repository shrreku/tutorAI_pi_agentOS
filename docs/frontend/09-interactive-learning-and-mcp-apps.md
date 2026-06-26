# Interactive Learning And MCP Apps

## Product Concept

Interactive Learning Surfaces are Reference surfaces with interactive controls for practice, exploration, review, or Evidence inspection.

Interactive Learning Blocks are the designer-facing and model-facing units inside those surfaces.

MCP Apps are the default rich renderer implementation. They are sandboxed iframe bundles behind the StudyAgent interaction contract.

Do not present MCP Apps as third-party apps to learners. Learners should experience them as native StudyAgent learning activities.

## Current Bundle Registry

Implemented MCP app bundles:

| Bundle | Block kind | Resource URI | Primary actions |
| --- | --- | --- | --- |
| Quiz | `quiz` | `ui://studyagent/quiz/v1` | answer, tutor help |
| Flashcards | `flashcard_deck` | `ui://studyagent/flashcards/v1` | review rating, tutor help |
| Worked Example | `worked_example` | `ui://studyagent/worked-example/v1` | step answer, step reveal, tutor help |
| Evidence Explorer | `evidence_explorer` | `ui://studyagent/evidence-explorer/v1` | source span open, tutor help |
| Live Plan | `live_plan` | `ui://studyagent/live-plan/v1` | plan action, tutor help |
| Function Plotter | `simulation` template | `ui://studyagent/simulation/function-plotter/v1` | observation, parameter snapshot, tutor help |
| Source Reader | `source_reader` | `ui://studyagent/source-reader/v1` | annotation, source span open, tutor help |
| Personalization Controls | `personalization_controls` | `ui://studyagent/personalization-controls/v1` | preference update, tutor help |
| Comparison | `comparison` | `ui://studyagent/comparison/v1` | evidence open, complete, tutor help |
| Concept Timeline | `concept_timeline` | `ui://studyagent/concept-timeline/v1` | evidence open, tutor help |
| Dev Trace | `dev_trace_dashboard` | `ui://studyagent/dev-trace/v1` | tutor help |

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

## State Ownership

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

## Bridge Behavior

Host to app messages:

- initialize;
- tool input;
- block state;
- tool result;
- teardown.

App to host messages:

- ready;
- action;
- navigate;
- error.

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
- no external network unless explicitly allowlisted;
- no iframe-owned durable storage.

Design implication:

- apps must receive all learning content from host data;
- apps must emit actions through the bridge;
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

The current `public/mcp-apps/shared/v1/shell.css` is a functional baseline, not final visual quality.

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
