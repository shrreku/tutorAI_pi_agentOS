# Rolling Wiki And Curriculum Generation Implementation Plan

Status: design accepted through grilling; updated 2026-06-09 after Interactive Learning Surfaces implementation; implementation tickets live in `docs/architecture/rolling-wiki-and-curriculum-generation-implementation-tickets.md`.

This plan implements ADR-0021: a rolling generation lifecycle for curriculum, module pages, Topic Pages, Concept Pages, Page Readiness, and tutor-triggered page improvement.

The product goal is a Workspace that is useful immediately after ingestion without pretending thin pages are finished. Ingestion creates a broad heuristic baseline and a focused first-module deep build. Later modules are built one at a time from learner evidence. Tutor turns can synchronously start Concept Touch or Topic Touch when the learner needs a page now.

## Implemented Interactive Learning Baseline

The Interactive Learning Surfaces program is now implemented in-repo. Rolling wiki/curriculum generation should build on these concrete contracts instead of inventing a parallel page interaction model:

- Shared schemas live in `packages/schemas/src/interactive-learning.ts`.
- Reference Surfaces can carry `interactiveBlocks` alongside static blocks.
- `InteractiveLearningBlock` supports block kinds `quiz`, `flashcard_deck`, `worked_example`, `evidence_explorer`, `simulation`, `live_plan`, `source_reader`, `personalization_controls`, `dev_trace_dashboard`, `comparison`, and `concept_timeline`.
- Blocks include `nodeRef`, `artifactRef`, `objectiveRefs`, `conceptRefs`, `sourceRefs`, `evidenceRefs`, `content`, `canonicalState`, `allowedActions`, `rendererPreference`, `fallbackSummary`, and `quality`.
- The API validates `InteractiveLearningActionEnvelope` through `dispatchInteractiveLearningAction`.
- Workspace rendering uses the implemented interactive block renderer / MCP App bridge with native fallback.
- `ReferenceSurface` construction already emits source-reader and Evidence-oriented interactive blocks in some cases.

Important implementation constraint: current action handling requires artifact references for `quiz.answer_submitted`, `flashcard.review_rated`, `worked_example.step_answered`, and `worked_example.step_revealed`. Rolling wiki generation must not embed quiz, flashcard, or worked-example blocks as durable learner actions unless those blocks are backed by an allowed artifact created through Artifact Lifecycle policy. Non-artifact page blocks should prefer `evidence_explorer`, `simulation` when a trusted template applies, `source_reader` for source surfaces, `comparison`, `concept_timeline`, and `tutor.help_requested` affordances.

## Accepted Product Decisions

### Curriculum Scope

A Curriculum is one coherent learning path, not a generic knowledge slice. Initial ingestion creates one active curriculum by default.

The initial curriculum generation should produce the full module outline. That outline gives the learner and tutor a visible map, but only module 1 is deeply built at first.

### Initial Build Window

The Initial Build Window is the first post-ingestion learner-ready slice:

- active curriculum outline;
- deep module 1 build;
- module 1 objectives;
- polished module 1 page;
- polished notebook-global Topic Pages needed by module 1 objectives;
- polished notebook-global Concept Pages only for core concepts needed by the first objective/session;
- heuristic Topic and Concept Pages for broader discovered knowledge.

Initial Build does not generate rich interactive quick checks or worked examples. It may include deterministic Evidence affordances, related links, and learner intent actions.

### Rolling Module Build

Rolling Module Build deep-builds one next module at a time. It runs automatically at Module Milestones, learner jumps, or tutor decisions. It uses source evidence and durable learner signals from prior interaction to refine the next module's objectives and emphasis.

The system may lightly refresh the following module's outline when learner evidence suggests the path may change. It should not deeply build multiple future modules in advance.

### Global Topic And Concept Pages

Topic Pages and Concept Pages are notebook-global Source Wiki Pages.

- Concept Page: one atomic reusable idea; canonical mastery attaches to Concepts.
- Topic Page: larger source-grounded teaching surface combining multiple concepts; may display aggregate learning state but does not own mastery.

Module pages are curriculum-scoped. They can contextualize global Topic/Concept Pages for the current path.

### Heuristic Baseline

Heuristic pages are generated broadly. They are visible by default and labeled through Page Readiness. They should be useful enough to navigate, cite, and ask the tutor about, but they are not the final learning surface.

Heuristic pages should avoid rich generated pedagogy that requires LLM quality checks. They may include:

- overview based on source headings, curriculum outline, and extracted claims;
- key source-backed bullets;
- related Concept/Topic links;
- Evidence explorer affordance;
- ask-tutor intent action;
- make-flashcards intent action that routes through artifact consent/policy.

### LLM-Polished Pages

LLM-polished pages should read like source-grounded notes, not claim-list templates. They may include static reference blocks and, after Concept Touch or Topic Touch, validated page-embedded Interactive Learning Blocks using the implemented schema and dispatcher.

Initial Build and Rolling Module Build polish module pages and topic pages first. They polish only core concept pages needed for the next objective/session. Other Concept Pages remain heuristic until Concept Touch or later rolling work.

### Concept Touch And Topic Touch

Concept Touch and Topic Touch are foreground-started, time-bounded, background-continuable page-generation flows:

1. ensure a heuristic page exists;
2. start LLM polish when central to the turn;
3. wait up to roughly 8 seconds if the page is needed immediately;
4. continue the tutor turn with current/heuristic content if still running;
5. finish polish asynchronously and refresh Workspace nodes/pages.

The tutor mentions generation only when relevant to the learner's next action. The primary status channel is the Page Readiness badge on the page and graph node.

### Interactive Blocks

Generated pages are Reference Surfaces. They may contain:

- static reference blocks;
- deterministic Evidence/related-link affordances;
- validated `InteractiveLearningBlock` entries when generated by Concept Touch or Topic Touch.

Initial Build does not produce rich interactive checks/worked examples. It can emit deterministic `evidence_explorer` blocks and safe intent affordances, but should avoid evaluable or artifact-backed blocks by default.

Concept Touch and Topic Touch may add richer page-embedded blocks when useful, with these constraints:

- Use implemented block kinds and `allowedActions`; do not invent `quick_check` or generic UI primitive blocks.
- Use `evidence_explorer` for citation/source inspection when Evidence refs exist.
- Use `simulation` only when a trusted Simulation Template matches the concept/topic and the block can cite or label source grounding.
- Use `comparison` or `concept_timeline` only when the content can be produced as source-grounded or clearly labeled broader pedagogy.
- Use `tutor.help_requested` as the action for "ask the tutor" affordances.
- Do not embed `quiz`, `flashcard_deck`, or `worked_example` blocks as active learner actions unless an artifact exists and the block carries an `artifactRef`; creating that artifact must go through Artifact Lifecycle consent/policy.
- Keep lightweight review prompts as static content unless there is a governed, artifact-backed or future non-artifact action path for evaluable answers.

## Architecture Shape

### Shared Generation Services

Add shared generation services that can be called by both worker-owned automatic builds and API/tutor-triggered touch flows. Avoid separate worker-only and tutor-only implementations.

Recommended modules:

- `packages/wiki-core/src/page-readiness.ts`
- `packages/wiki-core/src/page-generation-contracts.ts`
- `packages/wiki-core/src/page-format.ts`
- `packages/wiki-core/src/topic-concept-resolution.ts`
- `packages/wiki-core/src/page-quality.ts`
- `apps/api/src/interactive-learning-blocks.ts`
- `apps/api/src/interactive-learning-actions.ts`
- `apps/worker/src/rolling-generation.ts`
- `apps/api/src/wiki-touch-service.ts`

The exact file layout can vary, but the boundary should hold:

- `wiki-core` owns pure contracts, deterministic builders, readiness derivation, lint/quality checks, and merge helpers.
- worker owns automatic ingestion/rolling jobs.
- API/tutor runtime owns synchronous touch request orchestration, streaming/turn behavior, and conversion from generated page block plans into learner-facing `InteractiveLearningBlock` entries.
- persistence remains in DB adapters, reducers, typed tools, or existing governed write providers.
- existing interactive learning modules own action validation, block sanitization, canonical block state, and renderer dispatch.

### Generation Target Model

Define a typed Generation Target to make jobs idempotent and observable.

Recommended target fields:

- `notebookId`
- `targetType`: `curriculum_outline`, `module_deep_build`, `module_page`, `topic_page`, `concept_page`
- `targetRef`: NodeRef-like reference when available
- `pageKey` when target is a page
- `sourceIds`
- `curriculumId`
- `moduleId`
- `objectiveIds`
- `topicIds`
- `conceptIds`
- `generationMode`: `heuristic`, `llm_polished`, `llm_repair`, `tutor_touch`, `rolling_module_build`
- `trigger`: `post_ingest`, `module_milestone`, `learner_jump`, `tutor_touch`, `topic_touch`, `manual_repair`
- `idempotencyKey`
- `priority`
- `timeoutMs`
- `createdByRunId` optional
- `createdByTurnId` optional

Idempotency should use notebook + target type + target ref/page key + generation mode + material version where relevant.

### Page Readiness

Persist learner-facing Page Readiness as page/node state:

- `still_improving`
- `ready_to_study`
- `needs_more_source_support`
- `needs_refresh`

Learner labels:

- `Still improving`
- `Ready to study`
- `Needs more source support`
- `Needs refresh`

Keep Generation Mode separate from Page Readiness. Store internal generation metadata in page structured JSON or dedicated columns/tables depending on migration scope:

- `generationMode`
- `lastGeneratedAt`
- `lastPolishedAt`
- `generationTargetId`
- `qualityCheckVersion`
- `qualityIssues`
- `sourceMaterialVersion`
- `curriculumMaterialVersion`
- `learnerSignalVersion` where relevant

The first implementation can use `wiki_pages.structured_json` and existing status/quality fields if schema churn should stay low. Add columns once query/display needs become stable.

### Page Keys

Use stable page keys:

- Concept Page: `concept:${conceptId}`
- Topic Page: `topic:${topicId}` or `topic:${normalizedTopicKey}` until a topic table exists
- Source summary: existing source summary key
- Module page: either a dedicated module page table/surface or `module:${moduleId}` if represented as wiki/reference page
- Curriculum page: existing curriculum reference surface or `curriculum:${curriculumId}` if represented as generated page content

Do not create multiple Concept Pages for the same concept. Topic merge/dedupe should consider normalized title, aliases, source heading path, objective refs, and concept overlap.

### Event Vocabulary

Emit notebook events for progress and refresh:

- `generation.initial_build.started`
- `generation.initial_build.completed`
- `generation.initial_build.failed`
- `generation.curriculum_outline.generated`
- `generation.module_deep_build.started`
- `generation.module_deep_build.completed`
- `generation.page.heuristic.created`
- `generation.page.polish.started`
- `generation.page.polish.completed`
- `generation.page.polish.failed`
- `generation.page.readiness_changed`
- `generation.touch.started`
- `generation.touch.foreground_timeout`
- `generation.touch.completed`
- `generation.touch.failed`

If existing event naming prefers `wiki.*`, `curriculum.*`, and `module.*`, mirror these as more specific events while preserving a coherent read-model mapping:

- `wiki.page.heuristic_created`
- `wiki.page.polish.started`
- `wiki.page.polish.completed`
- `wiki.page.readiness_changed`
- `curriculum.initial_build.completed`
- `module.rolling_build.completed`

Workspace refresh policy should invalidate:

- Source Wiki graph/read model;
- Study Map graph/read model;
- Reference Surface query for touched page/node;
- study state when module/objective/session plan changes.

## Lifecycle Flows

### 1. Post-Ingest Minimum Baseline

Input:

- parsed source versions;
- chunks and source spans;
- extracted concepts/claims/relations;
- source headings/document tree;
- existing notebook concepts/pages/curriculum if any.

Steps:

1. Extract/merge concepts, claims, and relations.
2. Build or update the active curriculum outline with all module titles/summaries.
3. Create heuristic module pages for the full outline.
4. Create heuristic Topic Pages from source headings and planned topics.
5. Create heuristic Concept Pages for discovered concepts.
6. Set Page Readiness for heuristic pages.
7. Mark source/notebook tutoring-ready once minimum structure exists.
8. Start Initial Build polish work for module 1.

Output:

- navigable Workspace;
- source-ready/tutoring-ready state;
- visible Page Readiness badges;
- initial build jobs/events.

LLM failure behavior:

- fallback to heuristic outline and pages;
- mark warnings;
- do not fail ingestion solely because LLM polish is unavailable.

### 2. Curriculum Outline Generation

The curriculum outline call should define:

- curriculum title;
- intended learner level;
- source scope;
- module titles;
- module summaries;
- rough order;
- prerequisite relationships when obvious;
- topic candidates per module;
- core concept candidates per module.

This call should not deeply write objectives for all modules. It may provide optional high-level objective hints, but only module 1 objectives become committed deep-build state during Initial Build.

### 3. Module 1 Deep Build

The module deep-build call for module 1 should produce:

- module learning purpose;
- module source coverage;
- objectives for module 1;
- topic refs/titles needed by objectives;
- core concept refs/titles needed by first objective/session;
- initial session plan inputs;
- module page static content;
- generation plan for topic page polish.

Persist:

- module summary/content;
- objective list/objectives for module 1;
- session plan/current objective as appropriate;
- module page content/readiness;
- page polish jobs for module 1 topics and core concepts.

### 4. Topic Page Polish

Topic Page polish input:

- topic identity and aliases;
- related source headings/chunks;
- related claims;
- linked concepts;
- module/objective refs where it appears;
- existing page with human blocks;
- Evidence refs;
- page readiness/generation metadata.

Output should include static blocks:

- overview;
- why this topic matters;
- key concepts;
- source-backed notes;
- formal details where applicable;
- examples/applications where source-backed or clearly labeled pedagogical;
- common confusions;
- related Concept Pages;
- Evidence refs;
- lightweight review prompts;
- readiness recommendation.

Topic Page polish may discover missing Concepts through governed concept upsert with Evidence refs.

### 5. Concept Page Polish

Concept Page polish input:

- concept identity and aliases;
- related claims/chunks;
- source headings;
- linked Topic Pages;
- objective/module refs where it appears;
- mastery summary only for display context, not page rewriting;
- existing page with human blocks.

Output should include static blocks:

- definition;
- intuition;
- formal details;
- examples and non-examples;
- common confusions;
- related topics/concepts;
- source-backed notes;
- practice prompts;
- Evidence refs;
- readiness recommendation.

Concept Page polish may link existing Topic Pages. It must not create new Topic Page shells.

### 6. Rolling Module Build

Trigger:

- Module Milestone reached;
- learner jumps to an outline-only module;
- tutor decides next module needs preparation;
- explicit repair/build action.

Inputs:

- active curriculum outline;
- next module shell;
- prior module outcomes;
- Mastery Evidence;
- weak concepts;
- learner preferences/trait recommendations;
- recent mistakes/confusions;
- source evidence and available Topic/Concept Pages.

Steps:

1. Gather durable learner signals.
2. Deep-build next module objectives and module page.
3. Polish topic pages for next module.
4. Polish only core concept pages needed for the next objective/session.
5. Create/update session plan and Live Plan.
6. Emit events and refresh Workspace.

Learner confirmation is required for material path changes:

- skipping a module;
- reordering upcoming modules;
- replacing a module focus;
- switching to exam-prep path;
- narrowing strictly to selected sources;
- expanding beyond uploaded source scope;
- reducing planned depth/coverage.

Normal personalization inside the next module does not require confirmation.

### 7. Concept Touch / Topic Touch

API/tutor flow:

1. Tutor identifies a central concept/topic.
2. API service checks page existence/readiness.
3. If missing, create heuristic page synchronously.
4. If weak/stale and central, start LLM polish.
5. Race foreground wait against 8-second budget.
6. Return updated/current Reference Surface and touch status to tutor.
7. Continue background job if needed.
8. Emit events when background completes.

Touch triggers should be explicit enough to avoid page spam. Do not trigger on incidental mentions.

## Page Format Baselines

### Curriculum Page

Static baseline:

- path purpose;
- learner/source level;
- source coverage;
- module outline;
- active module;
- progress/readiness badges;
- start/resume action;
- material path-change affordances as learner intent, not direct mutation.

### Module Page

Static baseline:

- what this module teaches;
- why it matters;
- source sections covered;
- objectives when deep-built;
- key topics;
- key concepts;
- Page Readiness badge;
- next action / Live Plan link.

Heuristic module pages show outline information only.

### Topic Page

Static baseline:

- overview;
- why it matters;
- key concepts;
- source-backed notes;
- examples/applications when available;
- common confusions;
- related Concept Pages;
- practice prompts;
- Evidence refs;
- Page Readiness badge.

### Concept Page

Static baseline:

- definition;
- intuition;
- formal details;
- examples/non-examples;
- common confusions;
- related topics/concepts;
- source-backed notes;
- practice prompts;
- Evidence refs;
- Page Readiness badge.

### Flashcards And Concept Cards

Do not auto-create durable flashcard or concept-card artifacts during ingestion. Pages may include lightweight review prompts and "make flashcards" or "create concept card" intent actions that route through Artifact Lifecycle consent/policy.

### Page-Embedded Interactive Blocks

Generated pages should use the implemented `interactiveBlocks` Reference Surface field, not static block JSON hacks, for rich interactions. Baseline pages may include an `evidence_explorer` block when Evidence refs exist. Touch-polished pages may add `simulation`, `comparison`, or `concept_timeline` blocks when the generated content passes quality gates and the block can be rendered by the existing interactive renderer.

Do not model a quick check as an invented block kind. Until a non-artifact quick-check action exists, quick checks belong in tutor chat, static prompts, or a governed quiz artifact.

## LLM Contracts

Prefer multiple smaller calls over one large call:

1. Curriculum outline call.
2. Module deep-build call.
3. Topic page polish calls, one page or small batch.
4. Core concept page polish calls, one page or small batch.
5. Optional repair call only when deterministic quality checks fail.

All LLM outputs should be structured and schema-validated. Avoid accepting raw markdown-only blobs where structured blocks and refs are needed.

Recommended common output fields:

- `title`
- `summary`
- `blocks`
- `topicRefs`
- `conceptRefs`
- `objectiveRefs`
- `sourceRefs`
- `evidenceRefs`
- `citationsBySection`
- `readinessRecommendation`
- `qualityNotes`
- `warnings`

For page blocks, distinguish:

- `static_reference`
- `source_backed_note`
- `pedagogical_note`
- `evidence_affordance`
- `related_links`
- `intent_action`
- `interactive_learning_block`

`interactive_learning_block` outputs must be valid against the implemented `InteractiveLearningBlock` schema before they are persisted or returned in a Reference Surface. LLM output should name the learning-purpose block kind and structured content only; the API constructs canonical IDs, refs, allowed actions, renderer preference, fallback summary, quality metadata, and any required `artifactRef`.

Initial Build should not produce rich interactive quick checks/worked examples. Touch flows may propose validated Interactive Learning Blocks now that ADR-0020 schemas exist, but artifact-backed blocks must not become active unless Artifact Lifecycle policy has produced an allowed artifact.

## Quality Gates

Deterministic checks should run before saving LLM-polished pages:

- required page sections exist;
- learner mode contains no raw claim IDs/statuses/confidence/debug fields;
- source-specific claims have Evidence refs;
- Evidence refs exist and belong to the notebook;
- concept/topic/objective refs exist or are produced through governed upsert;
- human blocks are preserved;
- "Still improving" placeholders are absent from polished sections unless evidence is genuinely missing;
- outside-source pedagogy is labeled separately from source claims;
- page length is bounded;
- markdown/blocks render safely;
- Page Readiness is consistent with quality issues;
- generated Interactive Learning Blocks parse against `interactiveLearningBlockSchema`;
- generated block `allowedActions` are compatible with the block kind and dispatcher payload schemas;
- artifact-backed block kinds include valid `artifactRef` values and respect Artifact Lifecycle visibility/consent;
- non-artifact page blocks do not use quiz, flashcard, or worked-example actions until a governed non-artifact action path exists.

Repair behavior:

- If checks fail due to minor omissions, run one repair call.
- If checks still fail, persist heuristic/current page, record issues, and mark `Still improving` or `Needs more source support`.

## Persistence Strategy

First implementation should minimize schema churn where reasonable:

- use existing `wiki_pages` for Source Wiki pages;
- use `structuredJson` for generation metadata and structured blocks if no dedicated columns exist;
- use existing curriculum/module/objective/session plan tables;
- emit notebook events for refresh/observability;
- use existing worker queue if it can express generation targets.

Add dedicated columns/tables when needed:

- `page_readiness` column if graph/read model queries need efficient badge display;
- `generation_mode` column if filtering/diagnostics need it;
- durable `generation_jobs` table if partial progress/retries cannot be cleanly represented by queue/events.

## Worker/API Responsibilities

Worker:

- post-ingest baseline;
- Initial Build;
- Rolling Module Build;
- background continuation for timed-out touch jobs;
- batch/topic/concept polish jobs;
- projection/read-model refresh events.

API/tutor runtime:

- expose touch service to tutor tools/providers;
- enforce 8-second foreground budget;
- return/open current Reference Surface;
- preserve tutor latency and stream behavior;
- emit touch lifecycle events.

Workspace:

- show Page Readiness badges on graph nodes and pages;
- refresh pages/nodes from generation events;
- show learner-safe "still improving" copy;
- keep Dev Mode details separate;
- render generated Interactive Learning Blocks through the implemented ADR-0020 Reference Surface / MCP App bridge path with native fallback.

## Tutor Tooling

Add or extend governed tools for tutor-triggered page work:

- `wiki.ensure_concept_page`
- `wiki.ensure_topic_page`
- `wiki.touch_concept`
- `wiki.touch_topic`

Exact names can align with existing tool catalog style. Tools should:

- accept canonical refs plus LLM-facing handles;
- return page refs, readiness, foreground status, and whether background work continues;
- not allow arbitrary page writes;
- route persistence through shared services and quality gates;
- emit reducer/tool events.

The tutor prompt should teach the trigger policy:

- use touch when concept/topic is central to current teaching;
- avoid touch for incidental mentions;
- continue teaching if page is still improving;
- do not present unsupported source claims as source-backed.

## Workspace Read Models

Study Map and Source Wiki read models should expose:

- Page Readiness badge/label;
- generation status for learner-safe display;
- Dev Mode generation metadata;
- page open targets for heuristic and polished pages;
- distinction between page readiness and learner mastery;
- generated interactive block summaries or refs only after server-side sanitization.

Graph nodes should show Page Readiness without conflating it with mastery badges.

## Observability

Track:

- generation target counts by type/mode;
- LLM call latency and failures;
- foreground touch timeouts;
- background completion latency;
- quality check failures and repair rates;
- heuristic fallback rates;
- page readiness transitions;
- duplicate/idempotency suppression;
- Workspace refresh events.

Dev Timeline should show generation events and touch lifecycle without exposing raw debug details in learner mode.

## Testing Strategy

Schema tests:

- Generation Target;
- Page Readiness;
- Generation Mode;
- page block contracts;
- LLM output schemas;
- quality issue schema.

Wiki-core tests:

- heuristic page builders;
- topic/concept dedupe;
- human block preservation;
- readiness derivation;
- quality checks and repair decision;
- section-level citation enforcement.

Worker tests:

- post-ingest baseline creates full outline and heuristic pages;
- Initial Build deep-builds only module 1;
- LLM unavailable fallback still reaches tutoring-ready;
- Rolling Module Build deep-builds next module only;
- idempotent generation target handling;
- events emitted for readiness and polish.

API/tutor tests:

- Concept Touch creates missing heuristic page;
- Concept Touch waits up to budget then continues;
- background continuation updates page/readiness;
- Topic Touch mirrors Concept Touch;
- incidental concept mention does not trigger touch;
- touch output returns learner-safe status to tutor;
- touch-generated `evidence_explorer` or other non-artifact blocks validate against `InteractiveLearningBlock`;
- touch refuses active quiz/flashcard/worked-example actions without artifact refs.

Workspace tests:

- graph nodes show Page Readiness badge;
- page badge and node badge agree;
- learner mode hides generation metadata;
- Dev Mode shows generation mode/issues;
- event refresh updates open Reference Surface;
- generated interactive blocks render through the existing interactive block renderer or native fallback.

E2E/Synthetic Learner tests:

- upload source -> Workspace shows curriculum outline and heuristic pages;
- first lesson starts before all pages are polished;
- module 1 topic page is polished after Initial Build;
- learner asks about a weak concept -> Concept Touch improves page;
- Concept Touch adds an Evidence explorer or tutor-help interactive affordance when useful;
- module milestone triggers Rolling Module Build for module 2;
- durable flashcards are not auto-created by ingestion.

## Implementation Order

1. Shared schemas and glossary/readiness contracts.
2. Heuristic page baseline builders and page readiness metadata.
3. Curriculum outline and module 1 Initial Build orchestration.
4. LLM page polish contracts and quality gates.
5. Worker-owned Initial Build polish.
6. Workspace Page Readiness badges and refresh.
7. Tutor Concept Touch and Topic Touch service/tools.
8. Touch-generated Interactive Learning Block integration.
9. Background continuation and timeout handling.
10. Rolling Module Build.
11. Observability and Dev Timeline integration.
12. Synthetic Learner/browser regression coverage.

## Non-Goals

- Do not generate multiple curricula by default after ingestion.
- Do not deep-build all modules during ingestion.
- Do not block tutoring-ready on full page polish.
- Do not auto-create durable flashcards, quizzes, or concept-card artifacts during ingestion.
- Do not allow arbitrary generated UI/code in learner-facing pages.
- Do not let page polish rewrite curriculum/module/objective planning.
- Do not attach canonical mastery to Topic Pages.
- Do not expose raw claims/confidence/pipeline metadata in learner mode.
