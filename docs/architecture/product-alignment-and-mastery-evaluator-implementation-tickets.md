# Product Alignment And Mastery Evaluator Implementation Tickets

Status: tickets 1–14 implemented in-repo (2026-05-16).

This document turns the May 15, 2026 product-goal grilling, critical gap audit, and Mastery Evaluator design grilling into handoff-ready implementation tickets.

The tickets respect the accepted ADRs in `docs/adr/`, especially:

- ADR-0002: Durable LLM Wiki between Sources and tutoring.
- ADR-0003: Curriculum-first tutor behavior.
- ADR-0005: Typed tools and reducers govern agent writes.
- ADR-0008: Worker-owned ingestion and tutoring-ready gate.
- ADR-0010: Workspace, Reference Surface, and Evidence vocabulary.
- ADR-0011: Artifact lifecycle, consent, and quality gates.
- ADR-0012: Tutor session lifecycle separates sessions, turns, runs, and crystallization.
- ADR-0013: Mastery Evaluator produces durable evidence; reducers apply learning state.

## Publishing Plan

Create one parent GitHub issue named `Product alignment and mastery evaluator program`, then publish the tickets below in dependency order. Use `ready-for-agent` for AFK tickets and `ready-for-human` where a product decision is still required.

The current breakdown has 14 slices:

1. Reference Surface: remove learner-facing claim/debug leakage.
2. Source Wiki: generate learner-readable topic and concept pages.
3. Source and Learner Level contracts.
4. Source-scoped tutoring policy.
5. Personalized note metadata and rendering.
6. Rolling Source Wiki polish queue.
7. Adaptive plan signal vocabulary.
8. Mastery Evidence schema and persistence.
9. Mastery Evaluator service and `learning.evaluate_response` tool.
10. Runtime-triggered mastery evaluation.
11. Reducer-applied mastery updates with uncertainty gating.
12. Adaptive curriculum updates from Mastery Evidence.
13. Learner progress summaries and Dev Mode evaluator trace.
14. End-to-end mastery tutoring regression scenarios.

## 1. Reference Surface: Remove Learner-Facing Claim/Debug Leakage

Status: implemented (`apps/api/src/reference-surface.ts`, Evidence drawer unchanged).

Type: AFK

Blocked by: None.

User stories covered:

- As a learner, I want Concept pages and Source Wiki pages to read like study notes, not raw claim/debug output.
- As a maintainer, I want learner surfaces and Dev Mode evidence/debug surfaces to be separated.

What to build:

Update Reference Surface construction so learner-facing Concept and Wiki Page surfaces do not expose claim IDs, claim statuses, confidence scores, extraction statistics, or raw pipeline metadata. Keep detailed claim/debug information available through Evidence or Dev Mode.

Acceptance criteria:

- Concept Reference Surface blocks contain readable prose, definitions, formulas, examples, misconceptions, and source-backed notes without raw claim IDs or claim statuses.
- Learner mode does not expose confidence scores or raw claim metadata in Reference Surface blocks.
- Dev Mode or Evidence can still expose claim IDs, statuses, confidence, and support details.
- Tests cover concept surfaces with accepted claims, candidate claims, low-confidence claims, and no claims.
- Existing Evidence drawer flows still let a learner inspect source excerpts and supporting notes.

Implementation notes:

- Learner Reference Surfaces are built in `apps/api/src/reference-surface.ts` (graph routes delegate there). Wiki page markdown assembly lives in `packages/wiki-core/src/source-compilation.ts`.
- Preserve ADR-0010 vocabulary: Evidence, Reference Surface, Source Wiki, Study Map.

## 2. Source Wiki: Generate Learner-Readable Topic And Concept Pages

Status: implemented (`packages/wiki-core/src/source-compilation.ts`).

Type: AFK

Blocked by:

- 1. Reference Surface: remove learner-facing claim/debug leakage.

User stories covered:

- As a learner, I want Source Wiki topic and concept pages to be useful notes I can study from.
- As a tutor, I want Source Wiki pages to support teaching without needing full-source rereads.

What to build:

Refactor wiki page generation so user-facing Source Wiki Pages are polished source-grounded notes rather than claim lists. Pages should include readable definitions, intuition, formal details, examples, common confusions, practice prompts, and Evidence references.

Acceptance criteria:

- Generated concept pages do not embed raw claim IDs in markdown.
- Generated source summary/topic pages use learner-readable section titles and prose.
- Pages distinguish missing source support using learner-safe language such as "Still improving" or "Needs more source support."
- Human wiki blocks are preserved when pages regenerate.
- Tests cover a large-source fixture with multiple concepts and topics.

Implementation notes:

- Keep Source Wiki Pages separate from Artifacts. They are governed by wiki compilation, not artifact consent.
- This ticket can be implemented before the rolling polish queue; it improves bootstrap page quality.

## 3. Source And Learner Level Contracts

Status: implemented (`packages/schemas/src/learning-levels.ts`, `apps/api/src/study-state.ts`, worker source metadata).

Type: AFK

Blocked by: None.

User stories covered:

- As a learner, I want tutoring to match both the level of the source and my current readiness.
- As a tutor, I need typed level signals rather than loose prompt text.

What to build:

Add typed schemas/contracts for Source Level and Learner Level. Source Level captures the intended academic level of a Source. Learner Level captures readiness relative to a concept, objective, or source using mastery, mistakes, checkpoints, profile, and self-report.

Acceptance criteria:

- Shared schemas define Source Level values such as `high_school`, `undergraduate`, `graduate`, `professional`, and `unknown`.
- Shared schemas define Learner Level/readiness shape with target ref, inferred level/readiness, evidence refs, confidence, and last-updated reason.
- Source upload/enrichment can store or infer Source Level without relying only on untyped metadata.
- Study state exposes learner readiness where tutor prompt construction can consume it.
- Tests cover unknown level, self-reported level, inferred source level, and concept-specific learner readiness.

Implementation notes:

- It is acceptable to store these in JSON first if the schema is typed and validated.
- Do not collapse Learner Level into global profile only; it is relative to concepts/objectives/sources.

## 4. Source-Scoped Tutoring Policy

Status: implemented (`apps/api/src/tutor-tool-provider.ts`, `apps/api/src/routes/tutor.ts`).

Type: AFK

Blocked by:

- 1. Source and Learner Level contracts.

User stories covered:

- As a learner, I want to study one selected source while still benefiting from my notebook plan unless I ask for strict source scope.
- As a tutor, I need to know when it may leave selected sources for prerequisites or remediation.

What to build:

Introduce a source-scope policy with at least `soft_source_scope` and `strict_source_scope`. Soft scope prioritizes selected Sources but may use notebook curriculum, prerequisites, weak concepts, and learner state. Strict scope stays within selected Sources and surfaces source coverage gaps when it cannot support a claim.

Acceptance criteria:

- Tutor chat request/context supports a source-scope policy.
- Retrieval and prompt context distinguish soft selected-source priority from strict source-only behavior.
- Strict source scope refuses or qualifies unsupported source-specific claims.
- Source coverage gaps are represented in context-selection reasoning or Mastery Evidence where relevant.
- Tests cover selected-source retrieval success, fallback under soft scope, and no fallback under strict scope.

Implementation notes:

- Current context selection filters selected sources but falls back notebook-wide when no rows match.
- Preserve notebook-scoped tutoring as the default.

## 5. Personalized Note Metadata And Rendering

Status: implemented (`packages/schemas/src/note-personalization.ts`, `apps/api/src/artifact-view.ts`, `apps/api/src/routes/notebooks.ts`).

Type: AFK

Blocked by:

- 1. Source and Learner Level contracts.

User stories covered:

- As a learner, I want notes to include points specific to my learning, performance, weak concepts, and mistakes.
- As a learner, I want to edit notes without turning them into a separate artifact type.

What to build:

Extend note artifact payloads and rendering with optional personalization metadata. Keep artifact type `note`, but record why it is personalized: learner level/readiness, weak concepts addressed, mistakes addressed, source refs, objective/session refs, and source-specific vs learner-specific sections.

Acceptance criteria:

- Note payload schema supports personalization metadata without requiring it for ordinary notes.
- Note rendering can show learner-safe sections such as "From your source" and "For your mistakes."
- User editing preserves personalization metadata unless intentionally cleared.
- Artifact quality gates understand personalized notes.
- Tests cover ordinary note, personalized note, edited personalized note, and missing evidence.

Implementation notes:

- Preserve ADR-0011 consent and quality gates.
- Do not create a separate `personalized_note` artifact type.

## 6. Rolling Source Wiki Polish Queue

Status: implemented (`packages/wiki-core/src/wiki-polish-queue.ts`, `apps/worker/src/wiki-polish-enqueue.ts`, `apps/api/src/wiki-polish.ts`).

Type: AFK

Blocked by:

- 1. Source Wiki: generate learner-readable topic and concept pages.
- 1. Source and Learner Level contracts.

User stories covered:

- As a learner with a large source, I want the system to become more useful over time without blocking the first lesson.
- As a maintainer, I want wiki polish to be prioritized by learning value, not done eagerly for everything.

What to build:

Create a deterministic wiki polish queue/read model for high-value Source Wiki Pages. Priority should consider curriculum importance, source structure, learner activity, weak concepts, tutor/search usage, page quality, and source coverage gaps. Background enrichment can then polish pages incrementally.

Acceptance criteria:

- A page polish candidate includes page ref, priority score, reasons, source refs, learner-signal refs, status, and last-polished time.
- Worker can enqueue or process polish candidates without blocking tutoring-ready state.
- Tutor-triggered repair can enqueue a missing/weak page.
- Learner-facing status uses simple language, not raw quality scores.
- Tests cover large source, weak-concept priority, recently used page priority, and no-op when pages are already polished.

Implementation notes:

- Start with deterministic priority scoring before adding more LLM generation.
- Preserve minimum tutoring-ready gate before full wiki polish.

## 7. Adaptive Plan Signal Vocabulary

Status: implemented (`packages/schemas/src/adaptive-plan-signals.ts`, `apps/api/src/phase7.ts`).

Type: AFK

Blocked by:

- 1. Source and Learner Level contracts.

User stories covered:

- As a maintainer, I want durable curriculum changes to explain why the path changed.
- As a learner, I want adaptation to be based on real signals, not every casual message.

What to build:

Define a small adaptive plan signal shape or event vocabulary. Signals should include checkpoint performance, repeated mistake, explicit learner self-report, mastery change, weak concept recurrence, source coverage gap, and multi-turn confusion.

Acceptance criteria:

- Shared schema defines adaptive plan signal type, target refs, confidence, source/turn refs, learner confirmation state, and reason.
- Session-plan updates can cite one or more adaptive plan signals.
- Low-confidence signals do not cause durable syllabus changes alone.
- Tests cover each signal type and a no-durable-change path for vague messages.
- Existing adaptive session-plan patch metadata is migrated or wrapped to include signal refs.

Implementation notes:

- This ticket prepares the path for Mastery Evidence-driven adaptation but can be implemented independently.

## 8. Mastery Evidence Schema And Persistence

Status: implemented (`packages/schemas/src/mastery-evidence.ts`, `apps/api/src/mastery-evidence-store.ts`, `infra/migrations/drizzle/0006_mastery_evidence.sql`).

Type: AFK

Blocked by:

- 1. Adaptive plan signal vocabulary.

User stories covered:

- As a maintainer, I want every mastery change to be traceable to the evidence that caused it.
- As a tutor, I need structured evidence from learner responses before updating learning state.

What to build:

Implement the durable Mastery Evidence contract from ADR-0013. Persist evaluator inputs and outputs before reducer-applied learning state changes.

Acceptance criteria:

- Shared schema defines correctness label, overall score, per-concept scores/deltas, concept roles, misconception evidence, readiness, tutoring intervention, uncertainty, source/context refs, trigger source, session/turn/run refs, and evaluator provenance.
- Persistence stores Mastery Evidence as a durable row or event before mastery updates.
- Mastery Evidence can represent low-confidence "needs more evidence" results.
- Tests cover valid evidence, invalid schema rejection, source-backed evidence, self-report evidence, and low-confidence evidence.
- Existing `learning.mastery.updated` events can reference Mastery Evidence.

Implementation notes:

- Keep raw evaluator details internal/Dev Mode.
- Do not let Mastery Evidence itself mutate learning state.

## 9. Mastery Evaluator Service And `learning.evaluate_response` Tool

Status: implemented (`apps/api/src/mastery-evaluator.ts`, `packages/tools/src/writes.ts` `learning.evaluate_response`, `apps/api/src/tutor-write-provider.ts`).

Type: AFK

Blocked by:

- 1. Mastery Evidence schema and persistence.

User stories covered:

- As a tutor, I want to evaluate open-ended learner explanations and worked-problem attempts.
- As a maintainer, I want evaluator outputs schema-validated and fallback-safe.

What to build:

Implement a governed Mastery Evaluator service and expose it through `learning.evaluate_response`. The evaluator should be hybrid: deterministic rules for exact quiz-style scoring and obvious signals, LLM judgment for open-ended explanations and misconceptions, schema validation for all outputs, and deterministic fallback when LLM judgment fails or is uncertain.

Acceptance criteria:

- Tool contract exists in the shared tool catalog.
- Evaluator input includes tutor question, learner answer, current objective, concept roles, mastery snapshot, selected context, source refs, and optional reference answer.
- Evaluator output conforms to Mastery Evidence schema.
- The evaluator does not directly mutate mastery, coverage, weak concepts, session plans, or artifacts.
- Tests cover deterministic exact scoring, open-ended LLM path with stub, LLM failure fallback, uncertainty gating, and source-specific evaluation.

Implementation notes:

- Use older evaluator implementations only as design references; do not port Python architecture directly.
- The evaluator is internal and not a learner-facing persona.

## 10. Runtime-Triggered Mastery Evaluation

Status: implemented (`apps/api/src/mastery-runtime.ts`, `apps/api/src/mastery-session.ts`, `apps/api/src/routes/tutor.ts`, `apps/api/src/tutor-turn.ts`).

Type: AFK

Blocked by:

- 1. Mastery Evaluator service and `learning.evaluate_response` tool.

User stories covered:

- As a learner, I want the tutor to recognize answers to checks without manually asking for evaluation.
- As a maintainer, I do not want mastery updates after every irrelevant chat turn.

What to build:

Add runtime-triggered evaluation for eligible learner turns. The runtime should evaluate the next learner answer when the previous tutor turn asked a Mastery Check or quiz-like prompt. The tutor can still call `learning.evaluate_response` explicitly for open-ended evaluation.

Acceptance criteria:

- Runtime records whether a tutor turn created an evaluable prompt.
- The next learner answer triggers evaluation when eligible.
- General navigation, source upload requests, note requests, "ok", and vague acknowledgements do not trigger evaluation unless they answer an evaluable prompt.
- Evaluation trigger source is recorded as automatic runtime evaluation or tutor tool call.
- Tests cover eligible answer, ineligible answer, explicit tutor tool call, and duplicate-trigger prevention.

Implementation notes:

- Preserve ADR-0012 turn/session/run separation.
- Runtime-triggered evaluation should not create a second learner-facing voice.

## 11. Reducer-Applied Mastery Updates With Uncertainty Gating

Status: implemented (`apps/api/src/mastery-reducer.ts`, `apps/api/src/mastery-learning.ts`, `apps/api/src/phase7.ts` legacy outcome bridge).

Type: AFK

Blocked by:

- 1. Mastery Evidence schema and persistence.
- 1. Runtime-triggered mastery evaluation.

User stories covered:

- As a learner, I want mastery updates to reflect real evidence and avoid noisy overconfidence.
- As a maintainer, I want weighted mastery updates by evidence type.

What to build:

Replace hardcoded outcome-only mastery deltas with reducer-applied weighted updates from Mastery Evidence. Weight evidence by source: explicit mastery check, quiz artifact attempt, repeated mistake, open explanation, self-report, and tutor observation. Low-confidence or high-uncertainty evidence should trigger clarification/quick check or neutral/minimal updates.

Acceptance criteria:

- Mastery update reducer consumes Mastery Evidence, not raw outcome labels alone.
- Evidence type and uncertainty affect delta size.
- Low-confidence evidence does not strongly increase mastery.
- Self-reported confusion can produce a minimal/negative update or quick-check recommendation.
- Tests cover each evidence type, uncertainty gate, weak-concept threshold changes, and event references back to Mastery Evidence.

Implementation notes:

- Start with simple weighted deltas. Preserve enough evidence for a future BKT-style reducer.

## 12. Adaptive Curriculum Updates From Mastery Evidence

Status: implemented (`packages/schemas/src/adaptive-plan-signals.ts` `buildAdaptivePlanSignalsFromMasteryEvidence`, `apps/api/src/mastery-curriculum-adaptation.ts`, wired in `apps/api/src/mastery-pipeline.ts`).

Type: AFK

Blocked by:

- 1. Adaptive plan signal vocabulary.
- 1. Reducer-applied mastery updates with uncertainty gating.

User stories covered:

- As a learner, I want the syllabus path to change when performance shows the current path is wrong.
- As a maintainer, I want adaptive plan changes to be explainable and auditable.

What to build:

Update adaptive session-plan/curriculum patching to consume Mastery Evidence and adaptive plan signals. Durable plan changes should cite evidence and avoid changing the syllabus based on one vague message.

Acceptance criteria:

- Adaptive plan updates include signal/evidence refs and reason text.
- Repeated mistakes and low mastery can prioritize remediation objectives.
- Strong evidence of mastery can advance or skip objectives when appropriate.
- Source coverage gaps can trigger route changes or strict-scope warnings.
- Tests cover remediation, advancement, no-change, and source-gap scenarios.

Implementation notes:

- Preserve current objective-first behavior unless evidence warrants a change.

## 13. Learner Progress Summaries And Dev Mode Evaluator Trace

Status: implemented (`packages/schemas/src/learner-progress-summary.ts`, `apps/api/src/learner-progress.ts`, `apps/api/src/study-state.ts`, `apps/api/src/routes/developer-timeline.ts`, `apps/web/src/DeveloperTimelinePanel.tsx`).

Type: AFK

Blocked by:

- 1. Mastery Evidence schema and persistence.
- 1. Reducer-applied mastery updates with uncertainty gating.

User stories covered:

- As a learner, I want clear progress summaries without raw model scores.
- As a developer, I want to inspect evaluator evidence and reducer decisions in Dev Mode.

What to build:

Expose derived learner progress summaries and Dev Mode evaluator traces. Learners should see humane summaries like strengths, weak concepts, needs review, and ready to advance. Dev Mode can show raw Mastery Evidence scores, deltas, confidence, uncertainty, trigger source, and reducer decisions.

Acceptance criteria:

- Learner surfaces never show raw evaluator scores, deltas, confidence, uncertainty, or model reasoning by default.
- Study state or session digest includes derived progress summaries.
- Dev Mode timeline shows Mastery Evidence and reducer-applied updates.
- Tests cover learner visibility and Dev Mode visibility.
- Existing Evidence/Workspace vocabulary is preserved.

Implementation notes:

- Coordinate with `DeveloperTimelinePanel` and session digest rendering.

## 14. End-To-End Mastery Tutoring Regression Scenarios

Status: implemented (`apps/api/src/mastery-tutoring-regression.test.ts`).

Type: AFK

Blocked by:

- 1. Source-scoped tutoring policy.
- 1. Rolling Source Wiki polish queue.
- 1. Adaptive curriculum updates from Mastery Evidence.
- 1. Learner progress summaries and Dev Mode evaluator trace.

User stories covered:

- As a maintainer, I want a regression suite proving StudyAgent behaves like a mastery-optimizing tutor, not generic RAG chat.
- As a learner, I want source-grounded, adaptive tutoring that improves mastery over sessions.

What to build:

Add focused regression scenarios covering the clarified product goal end to end: source-scoped tutoring, learner/source level adaptation, in-session mastery checks, evaluator-produced evidence, mastery updates, adaptive plan changes, personalized notes, clean Source Wiki surfaces, and learner-safe progress summaries.

Acceptance criteria:

- Scenario: high-level source with beginner learner produces foundational explanation and checks.
- Scenario: selected source strict scope refuses unsupported source claims and surfaces coverage gap.
- Scenario: learner gives partial answer; evaluator recommends guided practice and reducer applies small mastery change.
- Scenario: repeated mistake creates weak concept and adaptive plan remediation.
- Scenario: strong answer advances objective after evidence threshold.
- Scenario: personalized note includes source-grounded and learner-specific sections.
- Scenario: Source Wiki concept page contains readable notes without claim/debug leakage.

Implementation notes:

- Keep scenarios deterministic with stubbed evaluator/LLM where possible.
- These tests should protect the product goal, not just individual modules.