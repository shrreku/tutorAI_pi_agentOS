# Synthetic Learner Evals Implementation Tickets

Status: first local slices are present; runtime hardening remains open.

This document breaks the Synthetic Learner Evals PRD into dependency-ordered vertical slices. All slices are AFK unless noted otherwise.

Current hardening note (2026-05-26): the scripted and LLM-mode contracts exist locally, but live dashboard observation, required persistence snapshots, warning issue candidates, and some browser/CI claims need remediation before they should be considered fully verified. Follow-up tickets live in `docs/architecture/architecture-remediation-implementation-tickets.md`.

## Publishing Plan

Create one parent GitHub issue named `PRD: Synthetic Learner evals`, then publish the tickets below in dependency order with `ready-for-agent`.

## Slice Summary

1. Eval Source Fixture manifest and seeded notebook import. Implemented.
2. Eval Run persistence and report export. Implemented.
3. Synthetic Learner fixture contracts and validation. Implemented.
4. API-only runner with live CLI transcript. Implemented.
5. Deterministic assertion engine. Implemented.
6. Dashboard read model and Eval Run page. Implemented.
7. First 1 x 3 x 3 Synthetic Learner eval matrix. Implemented.
8. Fixture freshness and explicit regeneration command. Implemented.
9. Browser/UI golden journey steps. Implemented.
10. Autonomous Synthetic Learner Runs. Implemented.
11. Optional LLM judge rubrics. Implemented.
12. Optional Trigger.dev adapter. Implemented.

## 1. Eval Source Fixture Manifest And Seeded Notebook Import

Type: AFK

Blocked by: None.

User stories covered:

- As a maintainer, I want evals to use pre-ingested Eval Source Fixtures, so that tutor evals do not rerun expensive ingestion each time.
- As a maintainer, I want fresh eval-owned notebooks seeded from fixtures, so that scenario runs are isolated and repeatable.

What to build:

Build the first vertical path for seeding an eval-owned notebook from an Eval Source Fixture. The fixture should include manifest metadata and source-derived tutoring-ready state sufficient for API-only tutor scenarios. The seeded notebook must be clearly eval-owned and must not mutate the shared fixture source-of-truth.

Acceptance criteria:

- [x] An Eval Source Fixture manifest can describe fixture ID/version, source content hash, generation metadata, readiness checks, expected topics/concepts/citations, and compatibility status.
- [x] A command or API path can create an eval-owned notebook from a fixture without rerunning ingestion.
- [x] Seeded notebook state includes source-derived tutoring-ready data needed for tutor chat.
- [x] Learner-specific state is not included in the fixture by default.
- [x] Tests verify that fixture import creates isolated notebook-scoped rows and leaves the fixture unchanged.

## 2. Eval Run Persistence And Report Export

Type: AFK

Blocked by: 1.

User stories covered:

- As a maintainer, I want a dashboard backed by persisted Eval Runs, so that I can inspect history, trends, traces, failures, and artifacts.
- As a maintainer, I want CI-friendly JSON/NDJSON reports, so that eval suites can become automation gates.

What to build:

Persist Eval Runs, scenario runs, steps, assertion results, artifact references, trace references, and exported report metadata separately from learner-facing notebook state. Provide a report export that can be consumed by local runs and CI.

Acceptance criteria:

- [x] Eval Run state is persisted separately from learner-facing notebook state.
- [x] Scenario runs, steps, assertion results, artifact refs, trace refs, fixture version, persona ID, scenario ID, duration, and status are recorded.
- [x] JSON or NDJSON export is available for a completed Eval Run.
- [x] Eval-owned notebook references are traceable from the Eval Run.
- [x] Tests cover persistence and report export for passing and failing scenario runs.

## 3. Synthetic Learner Fixture Contracts And Validation

Type: AFK

Blocked by: 2.

User stories covered:

- As a maintainer, I want Synthetic Learner Personas as structured fixtures, so that learner behavior is versioned, diffable, and reusable.
- As a maintainer, I want constrained beat-driven scenarios, so that each eval covers the intended feature path.

What to build:

Define structured contracts for Synthetic Learner Personas, Synthetic Learner Scenarios, scenario beats, response policies, allowed actions, stop conditions, and assertion references. Include prompt rendering for live LLM mode and deterministic message rendering for scripted mode.

Acceptance criteria:

- [x] Persona fixtures validate goal, background, learner level, source familiarity, behaviors, misconceptions, study habits, and response policy.
- [x] Scenario fixtures validate source fixture reference, personas, beats, max turns, stop conditions, allowed actions, and assertion references.
- [x] Beat-driven scenarios can render deterministic learner messages.
- [x] Live LLM prompt rendering preserves scenario constraints.
- [x] Tests cover valid fixtures, invalid fixtures, prompt rendering, and deterministic rendering.

## 4. API-Only Runner With Live CLI Transcript

Type: AFK

Blocked by: 1, 2, 3.

User stories covered:

- As a maintainer, I want a live CLI transcript, so that I can watch student messages, tutor messages, tool calls, and assertions while an eval runs.
- As a maintainer, I want deterministic scripted learner mode, so that CI can run stable regression suites.

What to build:

Build the repo-native TypeScript runner path that loads an eval set, seeds an eval notebook, executes API-only tutor chat steps, subscribes to tutor/runtime/notebook events, persists steps, and renders a live CLI transcript.

Acceptance criteria:

- [x] Runner can execute one deterministic API-only Synthetic Learner Scenario end to end.
- [x] CLI prints student messages, tutor messages, tool starts/completions, runtime events, assertion status placeholders, and final status.
- [x] Runner records scenario steps and trace references in Eval Run persistence.
- [x] Runner handles tutor stream failure with a failed scenario result and useful error output.
- [x] Tests cover a successful scripted run and a tutor/API failure run.

## 5. Deterministic Assertion Engine

Type: AFK

Blocked by: 2, 4.

User stories covered:

- As a maintainer, I want deterministic assertions as the primary gate, so that core correctness does not depend on model-judges-model scoring.
- As a maintainer, I want learner-visible, runtime, and persistence assertions, so that product and state regressions are caught.

What to build:

Implement the first assertion engine over persisted Eval Runs, tutor traces, notebook events, tool calls, artifacts, Mastery Evidence, and learner-visible transcript text. Assertions should produce pass/fail/skip results with evidence refs.

Acceptance criteria:

- [x] Learner-visible assertions detect raw IDs, `[object Object]`, and debug/tool narration in tutor text.
- [x] Runtime assertions verify tutor turns, agent runs, tool calls, context selection, and `learning.evaluate_response` trigger behavior.
- [x] Persistence assertions verify Mastery Evidence, artifact lifecycle status, and session lifecycle boundaries.
- [x] Assertion results include evidence refs and clear failure messages.
- [x] Tests cover passing, failing, and skipped assertions.

## 6. Dashboard Read Model And Eval Run Page

Type: AFK

Blocked by: 2, 4, 5.

User stories covered:

- As a maintainer, I want a dashboard backed by persisted Eval Runs, so that I can inspect history, traces, failures, and artifacts.
- As a maintainer, I want live eval observation in the dashboard, so that I can see the same run state as the CLI.

What to build:

Add API read models and a web dashboard page for Eval Runs. The page should show run history, scenario matrix, persona coverage, fixture coverage, transcript, tool/runtime timeline, assertion results, artifacts, Mastery Evidence refs, and pass/fail state.

Acceptance criteria:

- [x] Dashboard lists Eval Runs with status, duration, scenario counts, failed assertions, and fixture/persona/scenario metadata.
- [x] Eval Run detail shows transcript, tool calls, runtime events, assertion results, artifacts, and trace refs.
- [x] Dashboard can refresh during an active run using the persisted eval state.
- [x] Dashboard distinguishes eval-owned notebooks from learner notebooks.
- [x] Tests cover read-model construction and UI rendering for passing and failing runs.

## 7. First 1 x 3 x 3 Synthetic Learner Eval Matrix

Type: AFK

Blocked by: 1, 3, 4, 5, 6.

User stories covered:

- As a maintainer, I want the first tracer bullet to run three personas across three scenarios, so that persona/scenario variation is proven early.
- As a maintainer, I want the lesson, artifact, and session scenarios to prove the core tutoring loop.

What to build:

Create the first eval set with one Eval Source Fixture, three Synthetic Learner Personas, and three API-only Synthetic Learner Scenarios, producing nine scenario runs. Wire it into the CLI, persistence, assertions, and dashboard.

Acceptance criteria:

- [x] Eval set includes Beginner with misconception, Overconfident skimmer, and Anxious exam-prep learner personas.
- [x] Eval set includes Lesson and remediation, Artifact request, and Session completion scenarios.
- [x] Running the suite executes nine scenario runs and persists all results.
- [x] CLI and dashboard show per-persona/per-scenario status.
- [x] Assertions cover Mastery Evidence, artifact lifecycle, session boundary, source refs, and learner-visible leakage.

## 8. Fixture Freshness And Explicit Regeneration Command

Type: AFK

Blocked by: 1, 7.

Status: implemented locally.

User stories covered:

- As a maintainer, I want fixture freshness metadata, so that I know when fixture output no longer matches the ingestion/schema version.
- As a maintainer, I want explicit regeneration, so that ingestion does not rerun during normal tutor evals.

What to build:

Add stale fixture detection and an explicit regeneration command. Normal eval runs should warn or fail on stale fixtures according to mode; regeneration should rerun ingestion once to refresh fixture packages.

Acceptance criteria:

- [x] Fixture manifest records ingestion pipeline version/hash, schema/migration version, model/provider metadata, generated timestamp, and source content hash.
- [x] Strict mode fails on stale fixtures.
- [x] Local dev mode warns and allows stale fixtures.
- [x] Regenerate mode refreshes a fixture explicitly.
- [x] Tests cover fresh, stale-warning, stale-failure, and regenerated fixture flows.

Implementation notes:

- Freshness policy lives in `packages/schemas/src/synthetic-learner-evals.ts`.
- The eval source fixture API seed route defaults to strict mode and returns freshness metadata.
- The worker CLI accepts `--freshness=warn|strict|regenerate` and `--regenerate-fixture`.

## 9. Browser/UI Golden Journey Steps

Type: AFK

Blocked by: 6, 7.

Status: implemented locally.

User stories covered:

- As a maintainer, I want browser/UI steps in golden journeys, so that Source Wiki, Study Map, artifact, citation, and screenshot regressions can be caught.

What to build:

Extend scenarios with first-class browser/UI steps and screenshot artifacts for golden journeys. Browser steps should inspect learner-facing surfaces after API-driven tutor progress.

Acceptance criteria:

- [x] Scenario contracts support browser steps such as opening Workspace views, checking text, checking absence of leakage, and taking screenshots.
- [x] Browser steps can attach screenshots and UI assertion evidence to Eval Runs.
- [x] Golden journey can verify Source Wiki, Study Map, artifact view, citation visibility, and absence of `[object Object]`.
- [x] Browser failures produce actionable dashboard and CLI output.
- [x] Tests or Playwright verification cover at least one browser golden journey.

Implementation notes:

- `browserSteps` live on Synthetic Learner Scenarios.
- The runner records browser steps when a browser executor is provided.
- Dashboard detail renders screenshot refs and browser assertion failures.

## 10. Autonomous Synthetic Learner Runs

Type: AFK

Blocked by: 4, 5, 7.

Status: implemented locally.

User stories covered:

- As a maintainer, I want autonomous Synthetic Learner Runs, so that exploratory stress tests can discover unexpected failures.

What to build:

Add autonomous mode where an LLM Synthetic Learner has broad learner freedom inside eval-owned notebooks and is judged against invariant assertions rather than narrow scripted outcomes.

Acceptance criteria:

- [x] Autonomous runs can execute with max turns, allowed product surfaces, stop conditions, and invariant assertions.
- [x] Autonomous runs may perform real durable writes only inside eval-owned seeded notebooks.
- [x] Autonomous runs never mutate shared Eval Source Fixtures or production learner state.
- [x] Results are marked as discovery/stress runs rather than stable regression gates.
- [x] Dashboard and CLI show autonomous run traces and invariant failures.

Implementation notes:

- `runKind: full_autonomous`, `learnerMode: full_autonomous_llm`, and `autonomousConfig` encode discovery-only semantics.
- Durable write scope is fixed to `eval_owned_notebooks`.

## 11. Optional LLM Judge Rubrics

Type: AFK

Blocked by: 5, 7.

Status: implemented locally.

User stories covered:

- As a maintainer, I want optional LLM judge rubrics, so that qualitative tutoring quality can be reviewed without replacing deterministic gates.

What to build:

Add optional qualitative rubric scoring for explanation clarity, remediation quality, artifact usefulness, source faithfulness, and persona realism. These scores must be clearly secondary to deterministic assertions.

Acceptance criteria:

- [x] Rubrics can be enabled per scenario or suite.
- [x] Rubric results are stored separately from deterministic gate status.
- [x] Dashboard labels LLM judge output as qualitative.
- [x] Deterministic assertion failure cannot be hidden by a positive LLM judge result.
- [x] Tests cover rubric result persistence and gate separation.

Implementation notes:

- Rubric definitions/results are qualitative only.
- Deterministic gate status is derived only from scenario assertion status.

## 12. Optional Trigger.dev Adapter

Type: AFK

Blocked by: 7, 8.

Status: implemented locally.

User stories covered:

- As a maintainer, I want Trigger.dev kept optional, so that eval semantics remain independent from orchestration vendor choices.
- As a maintainer, I may want scheduled or batched eval suites later, so that long-running evals can run outside a local CLI.

What to build:

Add an optional Trigger.dev adapter that invokes the existing repo-native scenario runner for scheduled, batched, cloud, or long-running eval suites without changing eval semantics.

Acceptance criteria:

- [x] Trigger.dev adapter calls the same scenario runner contracts as the CLI.
- [x] Adapter can trigger an eval suite and stream/persist status through existing Eval Run persistence.
- [x] Core eval runner remains usable without Trigger.dev.
- [x] Documentation explains when to use CLI, local dashboard, CI export, and Trigger.dev.
- [x] Tests or smoke verification cover adapter invocation without requiring Trigger.dev for normal local evals.

Implementation notes:

- `createSyntheticLearnerTriggerAdapter` delegates to the repo-native suite runner.
- The adapter has no hard dependency on Trigger.dev and is safe to leave unused locally.
