# Synthetic Learner Evals PRD

## Problem Statement

StudyAgent can ingest sources, compile tutoring-ready knowledge, run the Pi tutor harness, create artifacts, update Mastery Evidence, and render learner-facing Workspace surfaces. The project now needs a reliable way to test that all of those pieces work together from a student perspective. Unit and module regression tests are not enough: the system can pass focused tests while failing the actual learning journey through tutor chat, tools, reducers, artifacts, citations, session lifecycle, and UI surfaces.

Maintainers need Synthetic Learners that can simulate realistic learner personas, run bounded and autonomous evals, expose live student/tutor/tool traces while scenarios are running, and produce deterministic pass/fail evidence that proves whether StudyAgent is working.

## Solution

Build a repo-native Synthetic Learner eval system. It will use pre-ingested Eval Source Fixtures to seed eval-owned notebooks without rerunning ingestion, run multiple Synthetic Learner Personas through multiple Synthetic Learner Scenarios, observe the live tutor/runtime stream, apply deterministic assertions, persist Eval Runs for dashboard history, and export CI-friendly reports.

The first tracer bullet is a 1 x 3 x 3 matrix: one Eval Source Fixture, three personas, three API-driven scenarios, and nine scenario runs. The first dashboard and CLI should show student messages, tutor messages, agent/tool events, runtime events, assertions, artifacts, and final pass/fail state.

The scripted tracer bullet is now implemented. LLM-backed student simulation is the next phase and is specified in `docs/architecture/synthetic-learner-llm-simulator-prd.md`.

## User Stories

1. As a maintainer, I want Synthetic Learners to exercise StudyAgent end to end, so that I can detect regressions missed by module tests.
2. As a maintainer, I want evals to use pre-ingested Eval Source Fixtures, so that tutor evals do not rerun expensive ingestion each time.
3. As a maintainer, I want fresh eval-owned notebooks seeded from fixtures, so that scenario runs are isolated and repeatable.
4. As a maintainer, I want fixture freshness metadata, so that I know when fixture output no longer matches the ingestion/schema version.
5. As a maintainer, I want Synthetic Learner Personas as structured fixtures, so that learner behavior is versioned, diffable, and reusable.
6. As a maintainer, I want LLM-driven learner wording in live mode, so that scenarios feel realistic without losing test control.
7. As a maintainer, I want deterministic scripted learner mode, so that CI can run stable regression suites.
8. As a maintainer, I want constrained beat-driven scenarios, so that each eval covers the intended feature path.
9. As a maintainer, I want autonomous Synthetic Learner Runs, so that exploratory stress tests can discover unexpected failures.
10. As a maintainer, I want deterministic assertions as the primary gate, so that core correctness does not depend on model-judges-model scoring.
11. As a maintainer, I want optional LLM judge rubrics, so that qualitative tutoring quality can be reviewed without replacing deterministic gates.
12. As a maintainer, I want a live CLI transcript, so that I can watch student messages, tutor messages, tool calls, and assertions while an eval runs.
13. As a maintainer, I want a dashboard backed by persisted Eval Runs, so that I can inspect history, trends, traces, failures, and artifacts.
14. As a maintainer, I want CI-friendly JSON/NDJSON reports, so that eval suites can become automation gates.
15. As a maintainer, I want the first tracer bullet to run three personas across three scenarios, so that persona/scenario variation is proven early.
16. As a maintainer, I want the lesson/remediation scenario to verify Mastery Evidence and conservative mastery movement, so that the tutor does not over-advance weak learners.
17. As a maintainer, I want the artifact-request scenario to verify governed artifact lifecycle, so that generated study aids remain source-grounded and learner-readable.
18. As a maintainer, I want the session-completion scenario to verify session lifecycle and crystallization boundaries, so that digests are not created at noisy turn boundaries.
19. As a maintainer, I want learner-visible assertions, so that raw IDs, debug objects, `[object Object]`, and tool narration do not leak to students.
20. As a maintainer, I want runtime assertions, so that tool calls, context selection, tutor turns, and evaluator triggers can be verified.
21. As a maintainer, I want persistence assertions, so that Mastery Evidence, artifacts, session lifecycle, and reducer-applied changes are auditable.
22. As a maintainer, I want browser/UI steps in golden journeys, so that Source Wiki, Study Map, artifact, citation, and screenshot regressions can be caught later.
23. As a maintainer, I want eval-owned notebooks excluded from real learner analytics, so that test runs never pollute product data.
24. As a maintainer, I want Trigger.dev kept optional, so that eval semantics remain independent from orchestration vendor choices.

## Implementation Decisions

- Build a repo-native TypeScript eval runner before any Trigger.dev adapter.
- Use Eval Source Fixtures to seed fresh eval-owned notebooks instead of rerunning ingestion for normal tutor evals.
- Keep ingestion evals and tutor/product evals separate: ingestion prepares fixtures; Synthetic Learner scenarios exercise the seeded tutor/product harness.
- Represent Synthetic Learner Personas and Scenarios as structured fixture contracts that can render prompts for live LLM mode or scripted messages for deterministic mode. Synthetic Learner Personas should be generated from the shared Learner Trait Archetype fixtures where possible, so persona behavior and real-learner recommendation buckets use the same trait vocabulary.
- Support constrained beat-driven mode for stable regression suites and autonomous mode for invariant/stress discovery.
- Persist Eval Runs, scenario runs, steps, assertions, artifacts, and trace references separately from learner-facing notebook state.
- Use deterministic assertions as the primary correctness gate.
- Make optional LLM judge rubrics secondary qualitative signals only.
- Render live observation from one shared eval event stream in both CLI and dashboard.
- Make API-driven scenarios the fast default.
- Add first-class browser/UI steps later for golden journeys.
- Allow autonomous runs to perform real durable writes only inside eval-owned seeded notebooks.
- Do not mutate shared Eval Source Fixture source-of-truth during scenario execution.

## Testing Decisions

- Test external behavior through runner outputs, persisted Eval Runs, API-visible notebook state, and dashboard read models rather than private implementation details.
- Add unit tests for fixture/persona/scenario contract validation.
- Add focused integration tests for seeded notebook import.
- Add runner tests that simulate tutor chat streams and assert live transcript/assertion output.
- Add assertion-engine tests for learner-visible, runtime, persistence, and report assertions.
- Add dashboard read-model tests using persisted eval data fixtures.
- Reuse existing prior art: tutor regression scenarios, mastery tutoring regression scenarios, developer timeline read models, tutor trace routes, artifact lifecycle tests, and search eval fixtures.

## Out of Scope

- Trigger.dev orchestration in the first implementation.
- Full browser golden journeys in the first implementation.
- Large persona/scenario libraries beyond the 1 x 3 x 3 tracer bullet.
- LLM-backed student turn generation in the scripted tracer bullet.
- Rebuilding ingestion architecture.
- Using Synthetic Learners as learner-facing personas.
- Letting evals mutate production learner state or shared Eval Source Fixtures.

## Further Notes

- ADR-0014 requires black-box golden journeys for the most important evals.
- ADR-0015 requires a repo-native runner first, with Trigger.dev only as a possible later adapter.
- Product vocabulary is defined in `docs/contexts/product-domain/CONTEXT.md`.
- The first tracer bullet should prove the loop end to end before expanding scenario coverage.
