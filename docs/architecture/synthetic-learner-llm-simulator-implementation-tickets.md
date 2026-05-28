# Synthetic Learner LLM Simulator Implementation Tickets

Status: implemented locally.

These tickets extend the implemented Synthetic Learner eval harness with beat-driven LLM, scenario-autonomous LLM, and full-autonomous LLM student simulation.

## Publishing Plan

Create one parent GitHub issue named `PRD: Synthetic Learner LLM simulator`, then publish the tickets below in dependency order with `ready-for-agent`.

## Slice Summary

1. Learner mode contracts and run metadata.
2. Synthetic Learner model client and configuration.
3. Structured action decision and repair loop.
4. Typed simulator action API for artifacts and session finish.
5. Beat-driven LLM learner mode.
6. Scenario-autonomous LLM learner mode.
7. Full-autonomous LLM learner mode with start profiles.
8. Issue candidates and dashboard/export surfacing.
9. Operator docs and non-CI-gating run profiles.
10. Docker verification suite for all learner modes.

## 1. Learner Mode Contracts And Run Metadata

Type: AFK

Blocked by: None.

User stories covered:

- As a maintainer, I want separate `runKind` and `learnerMode`, so that eval purpose is not confused with turn-generation mechanics.
- As a maintainer, I want LLM learner modes represented in persisted Eval Runs, so that reports and dashboards explain how student turns were produced.

What to build:

Add first-class learner mode contracts for `scripted`, `beat_llm`, `scenario_autonomous_llm`, and `full_autonomous_llm`. Keep `runKind` separate and extend it with `scenario_autonomous` and `full_autonomous` if needed. Persist learner mode, simulator model metadata, autonomy start profile, repair attempts, and non-CI-gating status in scenario runs and run records.

Acceptance criteria:

- [x] Shared schemas validate `learnerMode`.
- [x] `runKind` and `learnerMode` are separate fields in run records.
- [x] Scenario runs can record simulator model, temperature, start profile, and gating policy.
- [x] Existing scripted runs remain valid and default to `learnerMode: scripted`.
- [x] Tests cover schema migration/default behavior and report serialization.

## 2. Synthetic Learner Model Client And Configuration

Type: AFK

Blocked by: 1.

User stories covered:

- As a maintainer, I want a separate Synthetic Learner model config, so that simulator behavior is not coupled to the tutor model.

What to build:

Add env/config support for `SYNTHETIC_LEARNER_MODEL`, `SYNTHETIC_LEARNER_TEMPERATURE`, `SYNTHETIC_LEARNER_BASE_URL`, and `SYNTHETIC_LEARNER_MAX_ACTION_REPAIR_ATTEMPTS`. Implement a small OpenAI-compatible chat client for structured Synthetic Learner JSON outputs, reusing existing OpenRouter configuration patterns where appropriate.

Acceptance criteria:

- [x] Config schema accepts Synthetic Learner model env vars.
- [x] Worker CLI resolves simulator model config separately from tutor model config.
- [x] Missing simulator config falls back to existing OpenRouter/default model settings.
- [x] Model calls can be stubbed in tests without network access.
- [x] Tests cover config parsing, fallback, and failed model responses.

## 3. Structured Action Decision And Repair Loop

Type: AFK

Blocked by: 1, 2.

User stories covered:

- As a maintainer, I want a two-phase action/response loop, so that simulator observations can influence learner messages.
- As a maintainer, I want invalid LLM actions repaired with schema feedback, so that simulator failures are explicit and debuggable.

What to build:

Define schemas for Synthetic Learner action decisions, action observations, learner responses, repair prompts, and simulator evidence. Implement a two-phase loop: action decision, typed action execution, observation append, learner response. Invalid JSON/actions should retry with schema feedback and then fail after `maxActionRepairAttempts`.

Acceptance criteria:

- [x] Action decision schema supports `chat.respond`, `artifact.list`, `artifact.view`, `quiz.answer`, `artifact.feedback`, and `session.finish`.
- [x] Learner response schema separates internal action rationale from learner-facing text.
- [x] Invalid model output retries with precise schema/action feedback.
- [x] Exhausted repair attempts fail the scenario and persist simulator evidence.
- [x] LLM modes never silently fall back to scripted messages.
- [x] Tests cover valid action, repaired action, exhausted repair, and response validation.

## 4. Typed Simulator Action API For Artifacts And Session Finish

Type: AFK

Blocked by: 3.

User stories covered:

- As a maintainer, I want simulated students to inspect and use generated artifacts without browser automation.
- As a maintainer, I want simulated students to solve quizzes, so that artifact usefulness is tested as a learner workflow.

What to build:

Implement typed simulator actions for artifacts and session completion against eval-owned notebooks. The action layer should expose learner-visible artifact content/payloads, submit quiz attempts, record artifact feedback, and stop sessions without direct browser automation.

Acceptance criteria:

- [x] `artifact.list` returns learner-visible artifacts for the eval notebook/session.
- [x] `artifact.view` returns sanitized learner-visible content and typed payload.
- [x] `quiz.answer` submits answers and records attempt evidence using existing quiz-attempt/mastery paths where available.
- [x] `artifact.feedback` records structured simulator feedback in Eval Run evidence without mutating production learner state.
- [x] `session.finish` terminates the simulator loop cleanly.
- [x] Actions are restricted to eval-owned notebooks.
- [x] Tests cover permissions, artifact read shape, quiz attempt submission, and feedback persistence.

## 5. Beat-Driven LLM Learner Mode

Type: AFK

Blocked by: 1, 2, 3.

User stories covered:

- As a maintainer, I want LLM-generated student wording inside fixed beats, so that the tutor is tested against natural learner phrasing without losing scenario intent.

What to build:

Add `--learner-mode=beat_llm` to the worker CLI. For each scenario beat, prompt the Synthetic Learner model with persona, fixture summary, beat instruction, allowed actions, stop conditions, recent transcript, and remaining turn budget. The LLM should produce the learner message for that beat while preserving the beat's semantic intent.

Acceptance criteria:

- [x] CLI accepts `--learner-mode=beat_llm`.
- [x] Beat LLM mode runs existing scenarios with LLM-generated student messages.
- [x] Beat prompts do not expose assertion internals or hidden expected outcomes.
- [x] Transcript records generated student message, learner mode, and simulator model.
- [x] Existing scripted mode remains unchanged.
- [x] Tests cover prompt construction, generated turn execution, and no hidden context leakage.

## 6. Scenario-Autonomous LLM Learner Mode

Type: AFK

Blocked by: 3, 4, 5.

User stories covered:

- As a maintainer, I want scenario-autonomous student simulation, so that I can test realistic learner choices inside a known product path.

What to build:

Add `--learner-mode=scenario_autonomous_llm`. The scenario still supplies goal, persona, allowed actions, stop conditions, and max turns, but the Synthetic Learner chooses each learner action/message through the two-phase loop. First implementation is tutor chat plus typed artifact actions, not browser control.

Acceptance criteria:

- [x] CLI accepts `--learner-mode=scenario_autonomous_llm`.
- [x] Scenario-autonomous runs respect scenario allowed actions, max turns, and stop conditions.
- [x] The learner can ask tutor questions, inspect artifacts, submit quiz answers, provide artifact feedback, and finish.
- [x] Invariant failures stop the scenario.
- [x] Runs persist observations and simulator action evidence.
- [x] Tests cover turn budget, disallowed action rejection, artifact interaction, and clean session finish.

## 7. Full-Autonomous LLM Learner Mode With Start Profiles

Type: AFK

Blocked by: 3, 4, 6.

User stories covered:

- As a maintainer, I want full-autonomous student simulation, so that exploratory runs can discover unexpected product or tutor failures.

What to build:

Add `--learner-mode=full_autonomous_llm` with `--autonomy-start=naive_entry|oriented_entry`. Full autonomy receives broad learner freedom inside eval-owned notebooks, typed simulator actions, invariant assertions, and max turns. `naive_entry` starts with persona and notebook goal only. `oriented_entry` adds learner-visible source/curriculum summary.

Acceptance criteria:

- [x] CLI accepts `--learner-mode=full_autonomous_llm`.
- [x] CLI accepts `--autonomy-start=naive_entry|oriented_entry`.
- [x] `naive_entry` prompt excludes source/curriculum summary.
- [x] `oriented_entry` prompt includes learner-visible source/curriculum summary only.
- [x] Prompts exclude fixture internals, assertions, hidden expected outcomes, database IDs, and traces.
- [x] Runs stop on `session.finish`, `maxTurns`, or invariant failure.
- [x] Tests cover both start profiles and stop rules.

## 8. Issue Candidates And Dashboard/Export Surfacing

Type: AFK

Blocked by: 1, 3, 6, 7.

User stories covered:

- As a maintainer, I want issue candidates from failed LLM runs, so that useful discoveries can become reviewed GitHub issues.

What to build:

Generate issue candidates for failed or suspicious LLM learner runs. Persist them in Eval Run report metadata or a dedicated issue-candidate structure, and show them in the dashboard/export. Do not publish GitHub issues automatically.

Acceptance criteria:

- [x] Failed LLM runs can produce issue candidates with title, severity, learner mode, persona, scenario/start profile, fixture, seeded notebook, transcript excerpt, evidence refs, and reproduction command.
- [x] Dashboard distinguishes issue candidates from published GitHub issues.
- [x] Report export includes issue candidates.
- [x] No GitHub write occurs automatically.
- [x] Tests cover issue-candidate generation and rendering.

## 9. Operator Docs And Non-CI-Gating Run Profiles

Type: AFK

Blocked by: 5, 6, 7, 8.

User stories covered:

- As a maintainer, I want LLM learner modes to be non-CI-gating by default, so that stochastic exploration does not block every PR.

What to build:

Update usage docs with commands for all learner modes, model config, artifact actions, autonomy start profiles, issue candidates, and dashboard interpretation. Add run-profile guidance for local, nightly, manual, and promoted CI suites.

Acceptance criteria:

- [x] Usage docs show commands for `scripted`, `beat_llm`, `scenario_autonomous_llm`, and `full_autonomous_llm`.
- [x] Docs explain non-CI-gating default and how a suite could later be promoted.
- [x] Docs explain artifact action boundaries and browser separation.
- [x] Docs include troubleshooting for invalid LLM JSON/action repair failures.
- [x] Docs include expected Docker env vars.

## 10. Docker Verification Suite For All Learner Modes

Type: AFK

Blocked by: 5, 6, 7, 8, 9.

User stories covered:

- As a maintainer, I want the LLM simulator verified in Docker, so that the harness works against real StudyAgent services.

What to build:

Add a documented Docker verification checklist and focused smoke commands for each learner mode. Scripted mode should remain fully deterministic. LLM modes should be run manually/nightly with persisted reports and issue candidates.

Acceptance criteria:

- [x] Docker scripted full suite still passes.
- [x] Docker `beat_llm` smoke run completes and persists an Eval Run.
- [x] Docker `scenario_autonomous_llm` artifact scenario can inspect a quiz and submit answers.
- [x] Docker `full_autonomous_llm` runs both `naive_entry` and `oriented_entry` smoke paths.
- [x] LLM-mode failures produce issue candidates rather than GitHub issues.
- [x] `pnpm test` and `pnpm check` pass.
