# Synthetic Learner Evals Implementation Plan

Status: planned.

This document turns the May 21, 2026 Synthetic Learner design grilling into implementation slices. It follows ADR-0014 and ADR-0015.

## Decisions

- **Synthetic Learners** are test-only harness actors, not tutors, Mastery Evaluators, durable learner profiles, or learner-facing personas.
- LLMs may drive learner behavior, but deterministic assertions are the primary correctness gate.
- Synthetic Learner evals use layered assets: Eval Source Fixtures, Synthetic Learner Personas, Synthetic Learner Scenarios, Synthetic Learner Assertions, Eval Runs, and golden journeys.
- Golden journeys are black-box through public product/API/browser surfaces; white-box evals are for focused diagnosis.
- The first runner is repo-native TypeScript with CLI and dashboard surfaces. Trigger.dev may become an optional adapter later.
- Normal tutor evals seed notebooks from pre-ingested Eval Source Fixtures instead of rerunning ingestion.
- Live Eval Observation is required in both CLI and dashboard views.
- API-driven scenarios are the fast default; browser/UI steps are first-class optional steps for golden journeys.
- Constrained beat-driven scenarios are the stable regression suite; Autonomous Synthetic Learner Runs are discovery/stress runs judged against product invariants.

## First Tracer Bullet

Build one small matrix that proves the full loop without trying to cover every product surface.

- One Eval Source Fixture.
- Three Synthetic Learner Personas.
- Three Synthetic Learner Scenarios.
- Nine scenario runs total.
- API-only tutor chat steps in the first slice.
- Live CLI transcript.
- Persisted Eval Run, Scenario Run, Step, Assertion Result, and report export.
- Dashboard page showing transcript, persona, tool calls, runtime events, assertions, and pass/fail status.

## First Personas

Beginner with misconception:

- Confuses the target concept.
- Gives a partially wrong checkpoint answer.
- Needs guided practice and remediation.

Overconfident skimmer:

- Claims prior knowledge.
- Rushes answers and asks to skip basics.
- Should trigger conservative mastery behavior instead of strong advancement from vague confidence.

Anxious exam-prep learner:

- Wants quiz or revision help.
- Requests a concrete study artifact.
- Needs source-grounded reassurance and clear next actions.

## First Scenarios

Lesson and remediation:

- Starts a lesson.
- Answers a checkpoint partially wrong.
- Expects tutor remediation, Mastery Evidence, and conservative mastery movement.

Artifact request:

- Requests a quiz or worked example.
- Expects governed artifact lifecycle, citations/source refs, and learner-readable artifact content.

Session completion:

- Continues through a short learning arc.
- Ends the session.
- Expects lifecycle events and digest/crystallization behavior only at the meaningful boundary.

## First Assertion Layers

Learner-visible assertions:

- Tutor text does not expose raw IDs, `[object Object]`, or debug/tool narration.
- Source-specific claims include citations or source refs.
- Artifact content is readable and source-grounded where expected.

Runtime assertions:

- Tutor turns and agent runs are persisted.
- Tool calls are recorded.
- Context selection events exist when retrieval runs.
- `learning.evaluate_response` fires only after evaluable learner answers.

Persistence assertions:

- Mastery Evidence is persisted for evaluable answers.
- Reducer-applied mastery movement is conservative for partial or vague answers.
- Artifact lifecycle status is valid.
- Session digest/crystallization appears only after an explicit end or meaningful boundary.

Report assertions:

- Eval run records scenario status, failed assertions, trace refs, fixture version, persona ID, scenario ID, duration, and exported report path.

## Fixture Policy

Eval Source Fixtures should contain source-derived tutoring-ready state: source metadata, source version metadata, document tree, chunks, source spans, concepts, claims, wiki pages, graph relations, coverage items/records, curriculum/module/objective/session-plan bootstrap when relevant, and graph projection seed or rebuild instructions.

Eval Source Fixtures should not contain learner-specific state by default: no mastery history, tutor sessions, learner artifacts, personalized notes, or session digests.

Fixture manifests should include fixture ID/version, source content hash, ingestion pipeline version/hash, schema/migration version, model/provider metadata, generated timestamp, readiness checks, expected topics/concepts/citations, and compatibility status.

## Runner Surfaces

CLI:

- Shows live student messages, tutor messages, tool starts/completions, runtime events, assertion results, and final pass/fail summary.

Dashboard:

- Shows Eval Run history, scenario matrix, persona coverage, source fixture coverage, live transcript, tool/event timeline, assertion status, artifacts, Mastery Evidence, screenshots when present, and run comparison.

CI export:

- Emits machine-readable JSON/NDJSON and optionally JUnit-style summaries.

## Later Slices

1. Browser/UI golden journey steps with screenshots and learner-facing regressions.
2. Autonomous Synthetic Learner Runs with invariant assertions and issue-candidate output.
3. Fixture regeneration CLI and stale fixture detection.
4. Expanded persona/scenario library.
5. Optional LLM judge rubrics for qualitative dimensions.
6. Optional Trigger.dev adapter for scheduled, batched, cloud, or long-running eval suites.
