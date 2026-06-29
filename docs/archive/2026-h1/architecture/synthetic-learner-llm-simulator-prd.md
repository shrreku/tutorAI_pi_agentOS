# Synthetic Learner LLM Simulator PRD

Status: implemented locally for the LLM-mode contracts; runtime evidence and observation hardening remain open.

Current hardening note (2026-05-26): `runKind` and `learnerMode` are represented, but run planning, required evidence snapshots, live observation, and warning issue candidates need follow-up work. See `docs/architecture/architecture-remediation-implementation-tickets.md`.

This PRD extends the implemented scripted Synthetic Learner eval harness with LLM-backed student simulation.

## Problem Statement

The current Synthetic Learner runner validates StudyAgent with fixed learner messages. That is useful for deterministic regression, but it does not test whether the tutor handles realistic student wording, shifting confusion, natural follow-up behavior, or learner interaction with generated study artifacts.

Maintainers need LLM Synthetic Learners that can behave like students while still preserving eval control, safety, observability, and deterministic product gates.

## Goals

- Add LLM-generated learner turns without removing scripted regression mode.
- Support beat-constrained LLM turns for realistic wording inside known scenario paths.
- Support scenario-autonomous runs where the LLM chooses learner turns inside a named scenario's goal, persona, allowed actions, stop conditions, and turn budget.
- Support full-autonomous runs where the LLM explores eval-owned notebooks under invariant gates.
- Let simulated students inspect and use generated artifacts through typed product/API actions, including solving quizzes, without browser automation.
- Keep LLM learner modes non-CI-gating by default.
- Persist enough evidence for debugging and issue-candidate review.

## Non-Goals

- Do not replace scripted deterministic regression as the default release gate.
- Do not use browser automation as the primary way for a simulated student to inspect artifacts.
- Do not let Synthetic Learner runs mutate production learner state or shared Eval Source Fixtures.
- Do not publish GitHub issues automatically from LLM failures in the first implementation.
- Do not add artifact editing or artifact regeneration as initial simulator actions.
- Do not expose assertion internals, hidden expected outcomes, database IDs, or implementation traces to the Synthetic Learner model.

## Concepts

`runKind`

- Why the eval exists.
- Examples: `regression`, `golden_journey`, `scenario_autonomous`, `full_autonomous`, `scheduled`.

`learnerMode`

- How student turns are produced.
- Values: `scripted`, `beat_llm`, `scenario_autonomous_llm`, `full_autonomous_llm`.

`beat_llm`

- Scenario beats remain explicit.
- The LLM writes each learner message inside the current beat's instruction, allowed actions, persona policy, and stop conditions.
- This mode is for realistic wording while preserving the intended product path.

`scenario_autonomous_llm`

- The scenario defines the product path, goal, persona, allowed actions, max turns, and stop conditions.
- The LLM chooses what learner action/message to take next inside that envelope.
- First implementation uses tutor chat plus typed artifact actions, not browser control.

`full_autonomous_llm`

- The LLM receives a start profile and broad allowed product surfaces inside an eval-owned notebook.
- It chooses a study path and stops via `session.finish`, `maxTurns`, or invariant failure.
- This mode is discovery-oriented and non-CI-gating by default.

## User Stories

1. As a maintainer, I want LLM-generated student wording inside fixed beats, so that the tutor is tested against natural learner phrasing without losing scenario intent.
2. As a maintainer, I want scenario-autonomous student simulation, so that I can test whether StudyAgent handles realistic learner choices inside a known product path.
3. As a maintainer, I want full-autonomous student simulation, so that exploratory runs can discover unexpected product or tutor failures.
4. As a maintainer, I want a separate Synthetic Learner model config, so that simulator behavior is not accidentally coupled to tutor behavior.
5. As a maintainer, I want typed simulator actions for artifacts, so that Synthetic Learners can inspect and use quizzes/artifacts without browser automation.
6. As a maintainer, I want a two-phase action/response loop, so that simulator actions produce observations before the learner sends the next chat message.
7. As a maintainer, I want invalid LLM actions to be repaired with schema feedback and then fail cleanly, so that simulator failures are visible instead of hidden.
8. As a maintainer, I want LLM learner modes to be non-CI-gating by default, so that stochastic exploration does not block every PR.
9. As a maintainer, I want issue candidates from failed LLM runs, so that useful discoveries can become reviewed GitHub issues.

## Simulator Model Config

Add separate Synthetic Learner model configuration:

- `SYNTHETIC_LEARNER_MODEL`
- `SYNTHETIC_LEARNER_TEMPERATURE`
- `SYNTHETIC_LEARNER_BASE_URL`
- `SYNTHETIC_LEARNER_MAX_ACTION_REPAIR_ATTEMPTS`

If unset, the runner may fall back to existing OpenRouter/default model settings, but the conceptual boundary remains separate: the tutor model teaches; the Synthetic Learner model behaves like a student.

## Initial Typed Actions

`artifact.list`

- Lists artifacts available to the eval notebook or current session.

`artifact.view`

- Returns learner-visible artifact content and typed payload.

`quiz.answer`

- Submits Synthetic Learner answers to a quiz artifact and records attempt evidence.

`artifact.feedback`

- Records simulated learner feedback about usefulness, difficulty, confusion, and source grounding.

`session.finish`

- Ends the simulation when the Synthetic Learner decides it is done.

## LLM Turn Lifecycle

LLM learner modes use a two-phase loop.

Phase 1: action decision.

- Prompt the Synthetic Learner model with persona, learner mode, scenario/autonomy envelope, recent transcript, observations, available actions, stop conditions, and remaining turn budget.
- Require structured JSON.
- Validate against the learner action schema.
- If invalid, retry with schema/action error feedback up to the configured repair limit.
- If still invalid, fail the scenario and persist simulator evidence.

Phase 2: learner response.

- Execute the typed action when applicable.
- Append the observation to the eval transcript/run record.
- Prompt the Synthetic Learner model again with the updated observation.
- Validate the response object.
- Send learner-facing text to the real tutor chat API, or stop on `session.finish`.

## Autonomy Start Profiles

`naive_entry`

- Persona state and notebook goal only.
- Tests whether the product can orient a learner from a cold entry.

`oriented_entry`

- Persona state, notebook goal, and learner-visible source/curriculum summary.
- Tests whether a learner who has opened the notebook can pursue a useful path.

Neither profile exposes hidden fixture internals, assertion definitions, expected outcomes, database IDs, or implementation traces.

## Evaluation Policy

- Scripted deterministic runs remain CI-gating by default.
- LLM learner modes persist reports and issue candidates but are non-CI-gating by default.
- Deterministic assertions remain the primary correctness checks.
- Optional LLM rubrics may summarize quality but cannot hide deterministic assertion failures.
- Full-autonomous runs are discovery-oriented unless explicitly promoted.

## Issue Candidates

Failed or suspicious LLM runs produce issue candidates, not automatic GitHub issues.

Issue candidates should include title, severity, learner mode, run kind, persona, scenario or start profile, fixture ID/version, seeded notebook ID, failure summary, transcript excerpt, assertion/runtime/artifact evidence, trace refs, and a reproduction command.

## References

- `docs/adr/0016-layered-llm-synthetic-learner-modes.md`
- `docs/architecture/synthetic-learner-simulator-usage.md`
- `docs/architecture/synthetic-learner-evals-prd.md`
- `docs/contexts/product-domain/CONTEXT.md`
