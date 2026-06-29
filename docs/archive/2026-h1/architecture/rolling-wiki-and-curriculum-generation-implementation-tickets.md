# Rolling Wiki And Curriculum Generation Implementation Tickets

Status: draft for review before publishing to GitHub Issues; updated 2026-06-09 after Interactive Learning Surfaces implementation.

This document breaks `docs/architecture/rolling-wiki-and-curriculum-generation-implementation-plan.md` and ADR-0021 into dependency-ordered vertical slices. Each slice should leave a testable path across schemas, generation services, worker/API orchestration, Workspace read models, implemented Interactive Learning Block contracts, and regression coverage where applicable.

The tickets respect the accepted docs and ADRs:

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/knowledge-graph/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
- ADR-0002: Durable LLM Wiki between Sources and tutoring.
- ADR-0003: Curriculum-first tutor behavior.
- ADR-0005: Typed tools and reducers govern agent writes.
- ADR-0008: Worker-owned ingestion and tutoring-ready gate.
- ADR-0010: Workspace Reference Surfaces and Evidence vocabulary.
- ADR-0011: Artifact lifecycle, consent, and quality gates.
- ADR-0018: Postgres-first agentic coordination.
- ADR-0020: Interactive Learning Surfaces and Internal MCP App Bridge.
- ADR-0021: Rolling Wiki and Curriculum Generation Lifecycle.

## Implemented Interactive Learning Baseline

The Interactive Learning Surfaces tickets are implemented in-repo. Rolling generation work should reuse:

- `packages/schemas/src/interactive-learning.ts` for `InteractiveLearningBlock`, `InteractiveLearningActionEnvelope`, block kinds, action names, renderer kinds, bundle manifests, and Simulation Template schemas.
- `apps/api/src/interactive-learning-actions.ts` for validated action dispatch.
- `apps/api/src/interactive-learning-blocks.ts` and `apps/api/src/reference-surface.ts` for learner-facing block sanitization and Reference Surface assembly.
- `apps/web/src/interactive-learning/*` and `FullPanelViewer` for rendering through the existing interactive block renderer / MCP App bridge path.

Current action handling requires artifact refs for active quiz, flashcard, and worked-example actions. Rolling wiki generation can create Evidence explorer and other non-artifact page blocks directly, but quiz/flashcard/worked-example blocks must be artifact-backed and governed by Artifact Lifecycle consent/policy.

## Publishing Plan

Create one parent GitHub issue named `Rolling wiki and curriculum generation program`, then publish the tickets below in dependency order. Use `ready-for-agent` for AFK tickets. Use `ready-for-human` only if product review is needed before enabling generation behavior by default.

The current breakdown has 14 slices:

1. Define generation contracts, Page Readiness, and schema tests.
2. Build heuristic baseline page generators.
3. Add topic/concept resolution and stable page-key dedupe.
4. Add LLM page polish contracts and quality gates.
5. Rework post-ingest baseline to create one curriculum outline and broad heuristic pages.
6. Add Initial Build deep generation for module 1.
7. Surface Page Readiness badges in Workspace graph and Reference Surfaces.
8. Add tutor Concept Touch and Topic Touch services/tools.
9. Integrate touch-generated Interactive Learning Blocks.
10. Add foreground timeout and background continuation for touch jobs.
11. Add Rolling Module Build at Module Milestones.
12. Integrate generation events, observability, and Dev Timeline.
13. Harden fallbacks, idempotency, and optional durable generation jobs.
14. Add end-to-end and Synthetic Learner regression coverage.

## 1. Define Generation Contracts, Page Readiness, And Schema Tests

Type: AFK

Blocked by: None.

User stories covered:

- As a maintainer, I want generation targets and page readiness to be typed so worker and tutor flows do not fork behavior.
- As a learner, I want page quality labels that are clear and separate from my mastery.
- As a Workspace renderer, I want stable node/page metadata for badges and refresh.

What to build:

Add shared schemas/contracts for Generation Target, Page Readiness, Generation Mode, generation triggers, page generation outputs, and page quality issues. Prefer shared schema files in `packages/schemas` and pure helpers in `packages/wiki-core`. Compose with the existing `InteractiveLearningBlock` schema for page-embedded interactive content instead of defining another interactive block contract.

Acceptance criteria:

- [ ] Page Readiness enum supports learner-facing states equivalent to `Still improving`, `Ready to study`, `Needs more source support`, and `Needs refresh`.
- [ ] Generation Mode enum distinguishes internal modes such as heuristic, LLM-polished, LLM repair, tutor touch, and rolling module build.
- [ ] Generation Target schema includes notebook, target type/ref, page key when applicable, source/curriculum/module/objective/topic/concept refs, generation mode, trigger, idempotency key, priority, timeout, and optional run/turn refs.
- [ ] Page generation output schema distinguishes static reference blocks, source-backed notes, pedagogical notes, Evidence affordances, related links, intent actions, and generated Interactive Learning Block plans that compile to the existing `InteractiveLearningBlock` schema.
- [ ] Generated interactive block plans can validate allowed block kind/action combinations and artifact-ref requirements.
- [ ] Page Readiness and Generation Mode are not modeled as learner mastery.
- [ ] Tests cover valid/invalid generation targets, readiness values, generation modes, page block refs, and quality issue payloads.

Implementation notes:

- Keep learner labels separate from stored enum values so copy can evolve.
- Do not add new DB tables in this ticket unless required by existing schema conventions.
- Reuse ADR-0020 implementation. Do not implement another rich-block schema here.

## 2. Build Heuristic Baseline Page Generators

Type: AFK

Blocked by:

- 1. Define generation contracts, Page Readiness, and schema tests.

User stories covered:

- As a learner, I want Source Wiki and curriculum pages to exist quickly after ingestion even while deeper LLM polish is still running.
- As a tutor, I want usable fallback pages when LLM generation is unavailable or times out.

What to build:

Create deterministic heuristic builders for curriculum page, module page, Topic Page, and Concept Page baselines. These should assemble learner-safe pages from source headings, extracted claims, concept refs, topic refs, module outline, and Evidence refs.

Acceptance criteria:

- [ ] Heuristic Concept Pages include definition/intuition/formal/examples/confusions/source-backed notes placeholders or source-backed bullets where available.
- [ ] Heuristic Topic Pages include overview, key concepts, source-backed notes, related concepts, Evidence affordance, and review prompts where safe.
- [ ] Heuristic Module Pages include module summary, source coverage, key topics/concepts, objective placeholder/deep-build status, and next action.
- [ ] Heuristic Curriculum Page includes path purpose, source coverage, module outline, active module, and start/resume action.
- [ ] Learner-facing output contains no raw claim IDs, confidence scores, claim statuses, extraction stats, or pipeline metadata.
- [ ] Pages include Page Readiness set to `Still improving` or `Needs more source support` as appropriate.
- [ ] Heuristic pages with Evidence refs can expose deterministic `evidence_explorer` Interactive Learning Blocks through the existing Reference Surface `interactiveBlocks` field.
- [ ] Heuristic pages do not expose active quiz, flashcard, or worked-example blocks unless those blocks are backed by approved artifacts.
- [ ] Human-authored wiki blocks are preserved when a heuristic page is regenerated.
- [ ] Tests cover pages with rich claims, sparse claims, no formula evidence, missing chunks, and existing human blocks.

Implementation notes:

- Current `buildConceptPageMarkdown` is a starting point but should be generalized and made less repetitive.
- Heuristic pages may include deterministic Evidence/related-link affordances, `evidence_explorer` blocks, and intent actions.
- Do not generate quick checks or worked examples here.

## 3. Add Topic/Concept Resolution And Stable Page-Key Dedupe

Type: AFK

Blocked by:

- 1. Define generation contracts, Page Readiness, and schema tests.
- 2. Build heuristic baseline page generators.

User stories covered:

- As a learner, I want one canonical Concept Page or Topic Page instead of duplicates across sources/modules.
- As a tutor, I want topic and concept refs that stay stable across rolling builds and touch flows.

What to build:

Add resolution helpers for notebook-global Topic Pages and Concept Pages. Concepts should continue using notebook-scoped canonical names/aliases. Topics should dedupe source headings and curriculum/objective topics through normalized titles, aliases, source heading paths, objective refs, and concept overlap.

Acceptance criteria:

- [ ] Concept Pages use stable `concept:${conceptId}` keys.
- [ ] Topic Pages use stable topic keys/IDs and do not duplicate obvious source-heading/objective topic matches.
- [ ] Source-heading topic pages and curriculum topic pages merge when they describe the same topic.
- [ ] Concept Page polish can link to existing Topic Pages but cannot create new Topic Page shells.
- [ ] Topic Page polish can propose/create missing Concepts only through a governed concept upsert with Evidence refs.
- [ ] Tests cover alias matches, singular/plural concept variants, heading/objective topic merges, non-merge cases, and concept-to-topic linking.

Implementation notes:

- If no topic table exists, start with stable page keys and structured metadata; introduce a topic table only if needed for graph/read-model queries.
- Avoid module-scoped Topic Pages; topic pages are notebook-global.

## 4. Add LLM Page Polish Contracts And Quality Gates

Type: AFK

Blocked by:

- 1. Define generation contracts, Page Readiness, and schema tests.
- 2. Build heuristic baseline page generators.
- 3. Add topic/concept resolution and stable page-key dedupe.

User stories covered:

- As a learner, I want polished pages to read like source-grounded notes instead of thin templates.
- As a maintainer, I want LLM page writes to be schema-validated, cited, and quality-checked.

What to build:

Create LLM contracts for Topic Page and Concept Page polish, plus deterministic quality gates. LLM output should be structured blocks with refs and citations, not unconstrained markdown. When the LLM proposes page-embedded interaction, it should output a block plan that the API compiles into the implemented `InteractiveLearningBlock` schema. Add repair behavior for quality failures.

Acceptance criteria:

- [ ] Topic Page polish schema includes overview, why it matters, key concepts, source-backed notes, formal/details, examples/applications, confusions, related links, Evidence refs, and readiness recommendation.
- [ ] Concept Page polish schema includes definition, intuition, formal details, examples/non-examples, confusions, related topics/concepts, source-backed notes, practice prompts, Evidence refs, and readiness recommendation.
- [ ] Quality gates reject learner-visible raw debug metadata, unsupported source claims, broken refs, missing required sections, absent citations for source-backed sections, and unsafe markdown/blocks.
- [ ] Quality gates reject generated Interactive Learning Blocks that fail `interactiveLearningBlockSchema`, use unsupported action names, or declare actions incompatible with the block kind.
- [ ] Quality gates reject active quiz, flashcard, or worked-example blocks without valid `artifactRef` and Artifact Lifecycle visibility.
- [ ] Outside-source pedagogy can be included only when labeled separately from source-specific claims.
- [ ] Human blocks survive polish.
- [ ] One repair attempt can run for minor quality failures; persistent failure keeps heuristic/current page and marks readiness accordingly.
- [ ] Tests cover clean polish, unsupported source claim, missing citations, human block merge, repair success, repair failure, and learner-safe fallback.

Implementation notes:

- Use `openrouter-json-client` or existing LLM JSON utilities consistently.
- Section-level citations are preferred for source-backed sections.
- Keep page polish separate from curriculum/module/objective rewrites.
- There is no implemented `quick_check` block kind. Use static prompts, tutor chat Mastery Checks, or governed quiz artifacts until a non-artifact quick-check action path exists.

## 5. Rework Post-Ingest Baseline To Create One Curriculum Outline And Broad Heuristic Pages

Type: AFK

Blocked by:

- 1. Define generation contracts, Page Readiness, and schema tests.
- 2. Build heuristic baseline page generators.
- 3. Add topic/concept resolution and stable page-key dedupe.

User stories covered:

- As a learner, I want the Workspace to show a full active curriculum outline and Source Wiki baseline soon after ingestion.
- As a tutor, I want `start studying` to route into one active curriculum, not alternate ambiguous paths.

What to build:

Update post-ingest enrichment so it creates one active curriculum outline with all module shells, heuristic module pages for the outline, heuristic Topic Pages from source headings/planned topics, and heuristic Concept Pages for discovered concepts.

Acceptance criteria:

- [ ] Ingestion creates exactly one active curriculum by default for the source/notebook path.
- [ ] Curriculum outline includes all module titles/summaries from the outline planner or deterministic fallback.
- [ ] Modules beyond module 1 are outline shells, not deep-built objectives.
- [ ] Heuristic pages are created for curriculum, modules, source-heading/planned topics, and discovered concepts.
- [ ] Source/notebook can reach tutoring-ready with heuristic pages even if LLM polish is unavailable.
- [ ] Notebook events are emitted for baseline page creation and readiness changes.
- [ ] Tests cover LLM outline success, LLM unavailable fallback, large source, sparse source, and idempotent rerun.

Implementation notes:

- This should not generate multiple curricula during initial ingestion.
- Existing post-ingest curriculum bootstrap can be adapted, but avoid deep objectives for every module.

## 6. Add Initial Build Deep Generation For Module 1

Type: AFK

Blocked by:

- 4. Add LLM page polish contracts and quality gates.
- 5. Rework post-ingest baseline to create one curriculum outline and broad heuristic pages.

User stories covered:

- As a learner, I want the first module to be ready for an actual lesson after ingestion.
- As a tutor, I want module 1 objectives and polished topic pages before teaching begins when possible.

What to build:

Implement Initial Build orchestration after baseline readiness. It should deep-build module 1, create module 1 objectives, polish the module 1 page, polish module 1 Topic Pages, and polish only core Concept Pages needed for the first objective/session.

Acceptance criteria:

- [ ] Initial Build creates/updates module 1 objectives only.
- [ ] Initial Build does not deep-build modules 2+.
- [ ] Module 1 page is LLM-polished and quality-checked when LLM is available.
- [ ] Topic Pages needed by module 1 objectives are polished.
- [ ] Only core concepts needed for the first objective/session are polished; other concept pages remain heuristic.
- [ ] Initial Build does not generate rich quick checks or worked examples.
- [ ] Tutoring-ready does not wait for all polish jobs to complete.
- [ ] Tests cover module 1 deep build, core concept selection, topic polish, LLM failure fallback, and idempotent rerun.

Implementation notes:

- The first session plan can focus on module 1/objective 1 even if later module outlines exist.
- Emit Initial Build lifecycle events.

## 7. Surface Page Readiness Badges In Workspace Graph And Reference Surfaces

Type: AFK

Blocked by:

- 1. Define generation contracts, Page Readiness, and schema tests.
- 5. Rework post-ingest baseline to create one curriculum outline and broad heuristic pages.

User stories covered:

- As a learner, I want graph nodes and pages to tell me whether content is still improving or ready to study.
- As a developer, I want Dev Mode to show generation details without leaking them into learner mode.

What to build:

Extend Workspace read models, graph node projection, node detail panels, and Reference Surface rendering to show Page Readiness badges. Keep Generation Mode and quality issues in Dev Mode only. Preserve existing Reference Surface `interactiveBlocks` rendering while adding generated page readiness metadata.

Acceptance criteria:

- [ ] Source Wiki and Study Map nodes expose learner-facing Page Readiness labels where applicable.
- [ ] Full-panel Reference Surfaces show the same Page Readiness badge as the node.
- [ ] Learner mode does not show Generation Mode, quality issue internals, raw confidence, or claim statuses.
- [ ] Dev Mode can show generation mode, last generated/polished timestamps, quality issues, and generation target refs.
- [ ] Page Readiness badge is visually distinct from learner mastery/readiness.
- [ ] Workspace refresh policy invalidates relevant graph/reference queries on page readiness events.
- [ ] Page readiness additions do not break existing interactive block rendering in `FullPanelViewer`.
- [ ] Tests cover node mapping, page display, Dev Mode separation, and event-driven refresh.

Implementation notes:

- Use learner copy like `Still improving`, `Ready to study`, `Needs more source support`, and `Needs refresh`.
- Avoid "provenance" as learner-facing copy; use Evidence.

## 8. Add Tutor Concept Touch And Topic Touch Services/Tools

Type: AFK

Blocked by:

- 4. Add LLM page polish contracts and quality gates.
- 7. Surface Page Readiness badges in Workspace graph and Reference Surfaces.

User stories covered:

- As a learner, when I ask about a central concept/topic, I want the relevant page to exist and improve immediately.
- As a tutor, I need governed tools to ensure or polish wiki pages without arbitrary writes.

What to build:

Add shared API services and runtime tools for Concept Touch and Topic Touch. These tools should ensure heuristic pages exist, optionally start LLM polish, return the page ref/readiness/status, and emit touch lifecycle events.

Acceptance criteria:

- [ ] Runtime tool catalog includes governed touch/ensure tools for concept and topic pages.
- [ ] Tools accept canonical refs plus LLM-facing handles and validate notebook ownership.
- [ ] Missing Concept Page is created heuristically before polish.
- [ ] Missing Topic Page can be created by Topic Touch but not by Concept Touch.
- [ ] Existing weak/stale page can start LLM polish.
- [ ] Touch result includes page ref, readiness label, generation status, foreground/background status, and learner-safe message.
- [ ] Touch result can include sanitized Reference Surface data with generated `interactiveBlocks` when touch-generated blocks pass validation.
- [ ] Tutor prompt/tool guidance discourages incidental mention triggers.
- [ ] Tests cover missing concept page, missing topic page, concept linked to existing topic, concept not creating missing topic shell, weak page polish, and ownership checks.

Implementation notes:

- Trigger policy belongs in tutor prompt/tool descriptions and tests.
- Persistence should use shared services and quality gates.

## 9. Integrate Touch-Generated Interactive Learning Blocks

Type: AFK

Blocked by:

- 4. Add LLM page polish contracts and quality gates.
- 7. Surface Page Readiness badges in Workspace graph and Reference Surfaces.
- 8. Add tutor Concept Touch and Topic Touch services/tools.

User stories covered:

- As a learner, I want a touched concept/topic page to include useful Evidence inspection or tutor-help interaction when it helps my current study task.
- As a maintainer, I want generated interaction to use the implemented Interactive Learning Block path rather than arbitrary UI JSON.

What to build:

Allow Concept Touch and Topic Touch polish output to compile validated block plans into existing `InteractiveLearningBlock` entries on Reference Surfaces. Start with non-artifact page blocks such as `evidence_explorer`, `simulation` when a trusted template matches, `comparison`, `concept_timeline`, and `tutor.help_requested` affordances. Keep quiz, flashcard, and worked-example blocks artifact-backed only.

Acceptance criteria:

- [ ] Generated block plans compile to `interactiveLearningBlockSchema` and are returned through `ReferenceSurface.interactiveBlocks`.
- [ ] Generated `evidence_explorer` blocks include source/Evidence refs and allow `evidence.source_span_opened` and/or `tutor.help_requested` as appropriate.
- [ ] Generated `simulation` blocks only use trusted Simulation Templates and label whether they are source-grounded or broader pedagogy.
- [ ] Generated `comparison` and `concept_timeline` blocks carry concept/source/Evidence refs when source-grounded.
- [ ] Generated blocks include fallback summaries and learner-safe quality metadata.
- [ ] The dispatcher accepts allowed non-artifact actions for generated page blocks.
- [ ] Active `quiz`, `flashcard_deck`, and `worked_example` blocks are rejected unless backed by an allowed artifact ref and Artifact Lifecycle visibility.
- [ ] Tests cover valid Evidence explorer, valid tutor-help affordance, simulation-template mismatch, unsupported action rejection, artifact-backed block rejection without artifact ref, and Workspace render fallback.

Implementation notes:

- There is no `quick_check` block kind today. Keep quick checks as static prompts, tutor chat Mastery Checks, or governed quiz artifacts.
- Do not store renderer-specific state as canonical page state.
- Reuse `apps/api/src/interactive-learning-blocks.ts`, `apps/api/src/interactive-learning-actions.ts`, and existing Workspace renderer/bridge code.

## 10. Add Foreground Timeout And Background Continuation For Touch Jobs

Type: AFK

Blocked by:

- 8. Add tutor Concept Touch and Topic Touch services/tools.

User stories covered:

- As a learner, I want the tutor to keep responding even if page polish takes longer than a few seconds.
- As a tutor, I want to start page improvement synchronously but not block indefinitely.

What to build:

Implement the foreground-started, time-bounded, background-continuable touch behavior. Touch should wait up to roughly 8 seconds when needed, then continue with current/heuristic content while background polish completes.

Acceptance criteria:

- [ ] Touch service supports configurable foreground budget with default around 8 seconds.
- [ ] If polish completes within budget, result returns updated page/readiness.
- [ ] If polish exceeds budget, result returns current/heuristic page and marks background continuation.
- [ ] Background completion persists page update, emits readiness/refresh events, and does not require a live tutor turn.
- [ ] Tutor stream can continue after foreground timeout.
- [ ] Failure after timeout records learner-safe status and Dev Mode details.
- [ ] Tests cover within-budget completion, timeout continuation, background success, background failure, and duplicate touch suppression.

Implementation notes:

- Existing worker queue/events may be enough initially.
- Avoid polling loops; use durable events/queue completion where possible.

## 11. Add Rolling Module Build At Module Milestones

Type: AFK

Blocked by:

- 6. Add Initial Build deep generation for module 1.
- 10. Add foreground timeout and background continuation for touch jobs.

User stories covered:

- As a learner, I want later modules to adapt based on how I did in earlier modules.
- As a tutor, I want module 2+ objectives and pages prepared at the right time without asking for routine consent.

What to build:

Add Rolling Module Build orchestration triggered by Module Milestones, learner jumps, or tutor decisions. It deep-builds only the next module, using durable learner signals and source evidence. It updates objectives, module page, topic pages, core concept pages, session plan, and Live Plan.

Acceptance criteria:

- [ ] Module Milestone automatically triggers build for next module when one exists.
- [ ] Rolling Module Build gathers Mastery Evidence, weak concepts, learner preference/recommendation signals, recent mistakes/confusions, and source evidence.
- [ ] Build deep-generates next module objectives and module page.
- [ ] Build polishes next module Topic Pages and only core Concept Pages for next session/objective.
- [ ] Following module outline may be lightly refreshed but not deeply built.
- [ ] Material path changes require learner confirmation; ordinary personalization does not.
- [ ] Current module is not silently rewritten mid-study.
- [ ] Tests cover milestone trigger, learner jump trigger, next-module-only build, path-change confirmation, and personalization without confirmation.

Implementation notes:

- Integrate with existing objective progression, learning outcome, and curriculum adaptation modules.
- Preserve curriculum-first tutor behavior.

## 12. Integrate Generation Events, Observability, And Dev Timeline

Type: AFK

Blocked by:

- 6. Add Initial Build deep generation for module 1.
- 10. Add foreground timeout and background continuation for touch jobs.
- 11. Add Rolling Module Build at Module Milestones.

User stories covered:

- As a developer, I want to understand why pages are thin, polished, stale, or failed.
- As a learner, I want pages/nodes to update as generation completes without manual refresh.

What to build:

Add durable notebook events, metrics, and Dev Timeline entries for generation lifecycle, page readiness transitions, touch timeouts, quality failures, fallback, and rolling builds.

Acceptance criteria:

- [ ] Events cover Initial Build start/completion/failure, page heuristic create, page polish start/completion/failure, readiness changes, touch timeout/completion/failure, and rolling build completion.
- [ ] Workspace refresh policy listens to generation/wiki/curriculum/module events as appropriate.
- [ ] Dev Timeline groups generation events with page/node refs, target type, mode, duration, and quality issues.
- [ ] Metrics track generation counts, LLM latency/failures, touch timeouts, background completion latency, quality failure rates, fallback rates, readiness transitions, and idempotency suppression.
- [ ] Learner mode receives only learner-safe status.
- [ ] Tests cover event payload shape, refresh invalidation, and Dev Timeline mapping.

Implementation notes:

- Align naming with existing event conventions; do not create duplicate noisy event streams.
- ADR-0019 observability vocabulary may be useful for telemetry names.

## 13. Harden Fallbacks, Idempotency, And Optional Durable Generation Jobs

Type: AFK

Blocked by:

- 5. Rework post-ingest baseline to create one curriculum outline and broad heuristic pages.
- 10. Add foreground timeout and background continuation for touch jobs.
- 11. Add Rolling Module Build at Module Milestones.

User stories covered:

- As a learner, I do not want ingestion or tutoring to fail just because an LLM generation call failed.
- As an operator, I want retries and duplicate suppression to be safe and observable.

What to build:

Harden idempotency and fallback across generation flows. If existing queue/events cannot represent partial progress and retry state cleanly, add a durable generation job table.

Acceptance criteria:

- [ ] Generation target idempotency prevents duplicate page/module builds across retries and repeated touches.
- [ ] LLM unavailable fallback creates heuristic curriculum/module/objective/pages and visible warnings.
- [ ] Failed polish does not roll back heuristic/current page.
- [ ] Re-running ingestion/enrichment preserves human blocks and does not duplicate pages.
- [ ] Background continuation survives process restart if the selected queue/job approach supports it.
- [ ] If a generation job table is added, it records target, mode, trigger, status, attempts, error, foreground/background state, timestamps, and output refs.
- [ ] Tests cover duplicate suppression, retry after failure, process restart or simulated queue resume, and human block preservation.

Implementation notes:

- Start with existing worker queue/events if sufficient.
- Add a DB table only when needed for reliable progress/retry semantics.

## 14. Add End-To-End And Synthetic Learner Regression Coverage

Type: AFK

Blocked by:

- 7. Surface Page Readiness badges in Workspace graph and Reference Surfaces.
- 9. Integrate touch-generated Interactive Learning Blocks.
- 10. Add foreground timeout and background continuation for touch jobs.
- 11. Add Rolling Module Build at Module Milestones.
- 13. Harden fallbacks, idempotency, and optional durable generation jobs.

User stories covered:

- As a maintainer, I want confidence that ingestion, Workspace, tutor touch, and rolling builds work together.
- As a learner, I want the first lesson and later module progression to feel coherent.

What to build:

Add focused integration tests plus Synthetic Learner/browser journeys covering the rolling generation lifecycle.

Acceptance criteria:

- [ ] Upload source journey reaches tutoring-ready before all polish jobs complete.
- [ ] Workspace shows one active curriculum outline, module shells, heuristic pages, and Page Readiness badges.
- [ ] Module 1 page and Topic Pages become polished after Initial Build.
- [ ] First lesson starts from module 1 objective/session plan.
- [ ] Learner asks about a heuristic/weak concept and Concept Touch improves or starts improving the Concept Page.
- [ ] Touch-polished page can include a generated Evidence explorer or tutor-help Interactive Learning Block rendered through existing Workspace infrastructure.
- [ ] Artifact-backed interactive blocks are absent unless an approved artifact exists.
- [ ] Concept Touch timeout path still lets tutor respond.
- [ ] Module Milestone triggers Rolling Module Build for module 2.
- [ ] Durable flashcards/concept cards are not auto-created by ingestion or page generation.
- [ ] Learner mode hides raw generation/debug metadata; Dev Mode shows it.
- [ ] Tests include LLM unavailable/fallback fixture.

Implementation notes:

- Prefer deterministic fixtures and fake LLM responses for most tests.
- Add one browser-level journey only after API/read-model paths are stable.
