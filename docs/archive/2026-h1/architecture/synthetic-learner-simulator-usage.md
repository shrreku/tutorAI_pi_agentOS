# Synthetic Learner Simulator Usage

Status: current as of May 24, 2026.

This guide explains how to run the Synthetic Learner simulator, how to target a single scenario/persona pair, and how the simulation is built internally. Scripted, beat-driven LLM, scenario-autonomous LLM, and full-autonomous LLM learner modes are implemented in the worker CLI.

## What The Simulator Is

The Synthetic Learner simulator is a test-only harness for StudyAgent. It is not a learner-facing feature, not the Pi tutor, not the Mastery Evaluator, and not a durable learner profile.

It exercises the real StudyAgent tutor/product path by:

1. loading an Eval Source Fixture;
2. seeding a fresh eval-owned notebook from that fixture;
3. selecting one or more Synthetic Learner Personas;
4. selecting one or more Synthetic Learner Scenarios;
5. sending scripted learner turns through the real tutor chat API;
6. collecting tutor stream events, tool calls, runtime events, trace refs, artifacts, and persisted state;
7. evaluating deterministic assertions;
8. persisting an Eval Run for dashboard/history.

The first implemented eval set is a 1 x 3 x 3 matrix:

- one Eval Source Fixture: `fixture_synthetic_learner_001`;
- three personas;
- three scenario paths;
- nine scenario runs when run without filters.

## Quick Commands

Run from the repo root.

Start Docker services:

```bash
docker compose up -d
```

Check API health:

```bash
curl -fsS http://localhost:4000/health
```

Run the full Synthetic Learner suite against Docker:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict
```

Run the full suite from the host against a locally reachable API:

```bash
PUBLIC_API_BASE_URL=http://localhost:4000 pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict
```

Run one scenario for one persona:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --scenario=scenario_lesson_remediation --persona=persona_beginner_misconception
```

Run one scenario across all personas:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --scenario=scenario_artifact_request
```

Run one persona across all scenarios:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --persona=persona_anxious_exam_prep
```

Run multiple selected scenarios or personas with comma-separated IDs:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --scenario=scenario_lesson_remediation,scenario_session_completion --persona=persona_overconfident_skimmer
```

## Available Persona IDs

`persona_beginner_misconception`

- Beginner learner.
- Unfamiliar with the source.
- Confuses derivatives with ordinary slope formulas.
- Useful for remediation and mastery-evidence checks.

`persona_overconfident_skimmer`

- Intermediate learner.
- Somewhat familiar with the source.
- Rushes and tries to skip basics.
- Useful for checking conservative mastery movement.

`persona_anxious_exam_prep`

- Intermediate learner.
- Familiar with the source.
- Wants revision support and concrete study outputs.
- Useful for artifact and next-step quality checks.

## Available Scenario IDs

`scenario_lesson_remediation`

- Run kind: `regression`.
- Path: opening lesson, learner misconception, corrected learner answer.
- Main gates: no learner-visible ID/debug leaks, mastery evidence, conservative persistence movement.

`scenario_artifact_request`

- Run kind: `golden_journey`.
- Path: learner requests a study quiz/artifact, asks for source-grounded revision usefulness.
- Main gates: learner-visible source-grounded artifact, source refs, artifact lifecycle, persisted artifact status.
- This scenario has browser step definitions in the scenario contract, but the current worker CLI does not provide a browser executor. In CLI/Docker runs, the API/tutor/artifact path is what is exercised.

`scenario_session_completion`

- Run kind: `regression`.
- Path: learner asks for recap, then explicitly wraps the session and asks for next steps.
- Main gates: session digest/crystallization boundary and final report state.

There is also an autonomous-discovery fixture contract, `scenario_autonomous_discovery`, modeled in code as `runKind: full_autonomous` and discovery-only. It is not part of the default 3 x 3 tracer-bullet matrix run by the worker CLI today.

## Freshness Modes

The simulator checks whether the Eval Source Fixture still matches the expected fixture schema, ingestion pipeline version, model metadata, source content hash, compatibility flag, and readiness checks.

`--freshness=strict`

- Default for serious verification.
- Fails before seeding if the fixture is stale.

`--freshness=warn`

- Allows local-dev runs with stale fixture metadata.
- Prints a warning.

`--freshness=regenerate`

- Regenerates fixture manifest metadata in memory before running.
- Does not rerun ingestion and does not create learner-specific state inside the fixture.

`--regenerate-fixture`

- Prints a regenerated fixture manifest JSON and exits.
- Useful when intentionally refreshing fixture metadata.

Example:

```bash
pnpm --filter @studyagent/worker synthetic-learner-evals -- --regenerate-fixture
```

## What Happens During A Run

### 1. Matrix Load

The worker CLI calls `loadTracerBulletSyntheticLearnerEvalMatrix()`. That loads:

- the frozen derivatives Eval Source Fixture;
- the three persona fixtures;
- the three default scenario fixtures;
- the planned cross-product of persona x scenario.

The run filters `--scenario` and `--persona` are applied after this matrix is built.

### 2. Eval Notebook Seed

For each selected persona/scenario pair, the runner calls:

```text
POST /api/v1/eval/source-fixtures/:fixtureId/notebooks
```

That creates a fresh eval-owned notebook seeded from fixture state. The fixture already contains tutoring-ready state such as source metadata, chunks, concept/wiki/curriculum/session-plan seed data, and expected citations. The scenario run should not mutate the shared fixture source-of-truth.

### 3. Synthetic Learner Turns

The current CLI path uses scripted turns. Each scenario contains ordered beats. Each beat has:

- `scriptedMessage`: exact learner text sent to tutor chat;
- `liveInstruction`: prompt text for future live-LLM learner mode;
- `allowedActions`: what the learner is allowed to do in that beat;
- `stopConditions`: when the scenario may stop;
- `assertionRefs`: checks evaluated around that beat.

The worker sends each scripted learner message to:

```text
POST /api/v1/notebooks/:notebookId/tutor/chat
```

with:

```json
{
  "data": {
    "activeMode": "learn",
    "selectedNodeRefs": [],
    "action": "prompt",
    "sourceScopePolicy": "soft_source_scope"
  }
}
```

The tutor turn itself is real StudyAgent behavior. It can use LLM generation, tutor tools, retrieval, mastery evaluation, artifact tools, and runtime reducers exactly as the product path does.

### 4. Event And Trace Capture

The harness consumes tutor SSE frames and records:

- assistant text deltas and final tutor text;
- tool starts and completions;
- runtime events from tutor trace;
- session trace refs;
- notebook refs;
- artifact/runtime lifecycle events when present.

After each tutor turn, the worker also fetches:

```text
GET /api/v1/notebooks/:notebookId/tutor/trace?limit=250&sessionId=:sessionId
```

This gives the harness durable events that may not appear directly in the live stream, such as deterministic mastery evidence events.

### 5. Assertions

Assertions are deterministic gates. They inspect learner-visible text, tool/runtime events, trace refs, persistence evidence when provided, and report metadata.

Examples:

- learner-visible text should not leak raw IDs, `[object Object]`, or debug narration;
- source-grounded artifact responses should mention source grounding;
- artifact scenarios should produce artifact lifecycle events;
- mastery scenarios should produce `learning.evaluate_response` or deterministic `learning.mastery_evidence.recorded`;
- session completion should produce session digest/crystallization evidence at the correct boundary.

Deterministic assertions decide pass/fail. Qualitative rubrics are modeled separately and should not replace deterministic gates.

### 6. Stop Conditions

The runner stops early only when implemented stop logic says it should. Today the important implemented stop condition is:

`artifact_delivered`

- If a scenario or beat includes this condition, the runner stops after artifact runtime events or completed artifact tools are observed.
- This prevents artifact scenarios from continuing into unnecessary follow-up turns after the artifact path has already succeeded.

Other stop conditions are part of the scenario contract and assertion model, but only implemented logic should be treated as operational behavior.

### 7. Persistence

At the end of a run, the worker persists the Eval Run:

```text
POST /api/v1/eval/runs
```

The persisted record contains:

- suite status;
- scenario runs;
- step records;
- transcript lines;
- assertions;
- runtime/tool events;
- trace refs;
- screenshot refs when provided by a browser executor;
- rubric results when supplied.

You can read run history with:

```bash
curl -fsS http://localhost:4000/api/v1/eval/runs
```

## Run Kind Vs Learner Mode

Use two separate concepts:

`runKind`

- Describes why the eval exists.
- Examples: `regression`, `golden_journey`, `scenario_autonomous`, `full_autonomous`, `scheduled`.

`learnerMode`

- Describes how student turns are produced.
- Examples: `scripted`, `beat_llm`, `scenario_autonomous_llm`, `full_autonomous_llm`.

Keep these separate because the same product purpose can use different learner-turn generators. For example, a `golden_journey` can use either fixed scripted turns or beat-constrained LLM turns.

## Scripted, Beat LLM, And Autonomous Learners

The current contracts support scripted and live prompt rendering. The intended simulator model has four learner modes:

`scripted`

- Current worker CLI behavior.
- Learner messages come from scenario beat `scriptedMessage`.
- Best for regression tests because the learner side is stable.
- The tutor side is still live product behavior and may involve LLM/tool calls.

`beat_llm`

- Contract-supported through persona/scenario prompt rendering.
- `renderSyntheticLearnerLivePrompt()` builds a prompt from fixture, persona, scenario, response policy, allowed actions, stop conditions, and beat instructions.
- The LLM writes each learner message inside the current scenario beat.
- Intended for realistic wording while preserving the test path.
- Uses a separate Synthetic Learner model configuration, not necessarily the tutor model.
- Wired into the worker CLI with `--learner-mode=beat_llm`.

`scenario_autonomous_llm`

- The LLM chooses learner turns inside a named scenario's goal, persona, allowed actions, max turns, and stop conditions.
- Intended for realistic learner behavior while still testing a product path such as remediation, artifact generation, or session completion.
- First implementation target: tutor chat plus typed product/API actions for learner-owned artifacts. The learner LLM can ask tutor questions, inspect artifact payloads through simulator APIs, and submit learner actions such as quiz attempts without using browser automation.
- Wired into the worker CLI with `--learner-mode=scenario_autonomous_llm`.

`full_autonomous_llm`

- The LLM explores allowed eval-owned product surfaces with broad learner freedom.
- Judged against invariant assertions rather than a narrow scripted path.
- It should prefer typed simulator/product actions over browser automation. Browser-backed checks remain a separate golden-journey layer for visual/UI regressions.
- Discovery-only by design; it should find issues, not become the deterministic release gate.
- Wired into the worker CLI with `--learner-mode=full_autonomous_llm` and `--autonomy-start=naive_entry|oriented_entry`.

## Synthetic Learner Model Config

LLM-backed learner modes should use a separate simulator model config:

- `SYNTHETIC_LEARNER_MODEL`
- `SYNTHETIC_LEARNER_TEMPERATURE`
- `SYNTHETIC_LEARNER_BASE_URL`, if a separate OpenAI-compatible endpoint is needed
- `SYNTHETIC_LEARNER_MAX_ACTION_REPAIR_ATTEMPTS`
- `SYNTHETIC_LEARNER_API_KEY`; if unset, the worker uses `OPENROUTER_API_KEY`

If unset, the simulator may fall back to the tutor/default model config, but the conceptual model remains separate: the tutor model teaches, while the Synthetic Learner model behaves like a student.

## Initial Typed Simulator Actions

LLM-backed learner modes should interact with non-chat product state through typed simulator/product actions rather than browser automation.

Initial action vocabulary:

`artifact.list`

- List artifacts created in the eval notebook or current session.

`artifact.view`

- Inspect learner-visible artifact content and payload.

`quiz.answer`

- Submit answers to a quiz artifact as the Synthetic Learner.

`artifact.feedback`

- Record whether the artifact felt useful, confusing, too easy, too hard, or source-grounded from the Synthetic Learner's perspective.

`session.finish`

- End the learner session when the Synthetic Learner is done.

Do not put artifact editing or regeneration in the first simulator action set. Those are later behaviors; the first target is whether the generated artifact is usable by a simulated learner.

## LLM Learner Turn Loop

LLM-backed learner modes should use a two-phase loop.

Phase 1: action decision

- Prompt the Synthetic Learner model with persona, scenario state, recent tutor transcript, available observations, allowed actions, stop conditions, and current turn budget.
- The model returns a structured action decision.
- If the action is a typed simulator action, execute it and append the observation to the run transcript.

Phase 2: learner response

- Prompt the Synthetic Learner model with the updated observations.
- The model returns the learner-facing message to send to tutor chat, or a terminal decision such as `session.finish`.

This avoids brittle text conventions and makes artifact interaction auditable. For example, the model can choose `artifact.view`, see the quiz payload, choose `quiz.answer`, receive the quiz-attempt observation, and then send a student message that reflects the result.

If the Synthetic Learner model returns invalid JSON or an invalid action:

- retry with schema/action error feedback;
- default to `maxActionRepairAttempts=2`;
- record each invalid response as simulator evidence;
- fail the scenario if repair attempts are exhausted;
- do not silently fall back to scripted messages in LLM learner modes.

LLM learner modes are non-CI-gating by default. They should persist reports, surface failures, and produce issue candidates, but the stable release gate remains scripted deterministic regression until a specific LLM suite is explicitly promoted.

## Autonomous Start Context

Fully autonomous runs should support two start profiles:

`naive_entry`

- The Synthetic Learner starts with only persona state and the notebook goal.
- Use this to test whether the product can orient a learner who has not inspected the workspace yet.

`oriented_entry`

- The Synthetic Learner starts with persona state, notebook goal, and learner-visible source/curriculum summary.
- Use this to test whether a learner who has opened the notebook can pursue a useful study path.

Neither profile should expose fixture internals, assertion definitions, hidden expected outcomes, database IDs, or implementation traces to the Synthetic Learner model.

Autonomous stopping rules:

- stop when the Synthetic Learner chooses `session.finish`;
- stop at `maxTurns`;
- stop immediately on invariant failure;
- do not use a separate LLM done-judge for first implementation.

## Issue Candidates

Failed or suspicious LLM learner runs should produce issue candidates, not publish GitHub issues automatically.

An issue candidate should include:

- title;
- suspected severity;
- persona and learner mode;
- scenario or autonomous start profile;
- fixture ID/version;
- seeded notebook ID;
- concise failure summary;
- transcript excerpt;
- relevant assertions, runtime events, artifact refs, and trace refs;
- suggested reproduction command.

Issue candidates can be shown in the dashboard or exported with the run report. A human decides whether to publish a GitHub issue.

## Browser And UI Steps

Synthetic Learner Scenarios can include browser steps such as opening the workspace, checking artifact text, checking absence of `[object Object]`, and attaching screenshot refs.

Important current boundary:

- the schema and runner support browser steps;
- dashboard/read models can show screenshot refs;
- a caller can pass a `browserExecutor` into the runner;
- the current worker CLI does not pass a browser executor, so Docker CLI runs are API/tutor harness runs.

Use browser-backed runs when checking learner-visible workspace surfaces such as Source Wiki, Study Map, artifact panels, citation rendering, or screenshot regressions. Use the worker CLI when checking fast tutor/runtime/product behavior.

## How To Interpret Output

The CLI transcript is intentionally live and verbose. The important lines are:

`RUN STARTED: ...`

- Eval suite or scenario run ID.

`SCENARIO COUNT: ...`

- Number of selected persona/scenario combinations.

`SUITE SCENARIO START: persona / scenario`

- Start of one selected pair.

`NOTEBOOK SEEDED: ...`

- Fresh eval notebook created from the source fixture.

`STUDENT: ...`

- Synthetic Learner scripted message.

`TUTOR: ...` and `TUTOR COMPLETE: ...`

- Tutor stream deltas and completed assistant message.

`TOOL START: ...` / `TOOL COMPLETE: ...`

- Tool calls observed from the tutor stream or trace.

`RUNTIME: ...`

- Runtime state/event evidence from the tutor trace.

`FINAL: passed - ...`

- Scenario or suite final status.

`REPORT: passed ...`

- Persisted Eval Run ID.

## Common Operations

Debug one failing path:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --scenario=scenario_lesson_remediation --persona=persona_beginner_misconception
```

Check artifact lifecycle only:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --scenario=scenario_artifact_request
```

Check one persona's behavior across all product paths:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --persona=persona_overconfident_skimmer
```

View persisted eval runs:

```bash
curl -fsS http://localhost:4000/api/v1/eval/runs
```

Run local regression tests for the simulator contracts:

```bash
pnpm exec vitest run packages/schemas/src/synthetic-learner-evals.test.ts packages/schemas/src/synthetic-learner-evals.runner.test.ts apps/api/src/routes/eval-source-fixtures.test.ts apps/api/src/routes/eval-runs.test.ts
```

Run the repo checks after simulator changes:

```bash
pnpm test
pnpm check
```

## Where To Change Things

Fixture, personas, scenarios, and rubrics:

- `packages/schemas/src/synthetic-learner-evals.fixtures.ts`

Contracts, freshness, report records, live prompt rendering:

- `packages/schemas/src/synthetic-learner-evals.ts`

Assertion evaluation:

- `packages/schemas/src/synthetic-learner-evals.assertions.ts`

Runner lifecycle:

- `packages/schemas/src/synthetic-learner-evals.runner.ts`

Worker CLI and Docker/API integration:

- `apps/worker/src/synthetic-learner-evals.ts`

Fixture seeding API:

- `apps/api/src/routes/eval-source-fixtures.ts`

Eval Run persistence/read model:

- `apps/api/src/routes/eval-runs.ts`

Dashboard:

- `apps/web/src/EvalRunsDashboard.tsx`

## Current Limitations

- LLM learner modes require `SYNTHETIC_LEARNER_API_KEY` or `OPENROUTER_API_KEY`; scripted mode does not.
- LLM learner modes are non-CI-gating by default and should be treated as local/manual/nightly exploration unless a suite is explicitly promoted.
- Browser steps require a caller-provided browser executor; the Docker worker CLI currently does not execute them.
- Deterministic assertions are intentionally narrower than full tutoring quality. Use live transcripts and future qualitative rubrics to inspect explanation clarity, tone, and usefulness, but keep deterministic gates as the release signal.

## LLM Commands

Beat-driven LLM wording inside a fixed scenario:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --learner-mode=beat_llm --scenario=scenario_lesson_remediation --persona=persona_beginner_misconception
```

Scenario-autonomous learner inside a known product path:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --learner-mode=scenario_autonomous_llm --scenario=scenario_artifact_request --persona=persona_anxious_exam_prep
```

Full-autonomous learner from a naive entry:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --learner-mode=full_autonomous_llm --autonomy-start=naive_entry --persona=persona_beginner_misconception
```

Full-autonomous learner from an oriented entry:

```bash
docker compose exec -T -e PUBLIC_API_BASE_URL=http://api:4000 worker pnpm --filter @studyagent/worker synthetic-learner-evals -- --freshness=strict --learner-mode=full_autonomous_llm --autonomy-start=oriented_entry --persona=persona_overconfident_skimmer
```
