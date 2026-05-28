# ADR-0016: Layered LLM Synthetic Learner Modes

Status: Accepted

Date: 2026-05-24

## Context

The first Synthetic Learner implementation proves the repo-native eval loop with scripted learner turns, real tutor/runtime behavior, deterministic assertions, persisted Eval Runs, and dashboard visibility. That gives stable regression coverage, but it does not fully simulate student behavior because the learner messages are fixed strings.

StudyAgent also needs LLM-backed Synthetic Learners that can phrase learner messages naturally, behave inside scenario constraints, interact with generated artifacts such as quizzes, and explore unexpected learner paths. Browser automation is useful for visual golden journeys, but simulated student interaction with artifacts should not require browser control.

## Decision

Use a layered Synthetic Learner model with separate `runKind` and `learnerMode`.

`runKind` describes why the eval exists, such as regression, golden journey, scenario-autonomous discovery, full-autonomous discovery, or scheduled execution.

`learnerMode` describes how student turns are produced:

- `scripted`: fixed scenario beat messages for stable deterministic regression.
- `beat_llm`: an LLM writes each learner message inside explicit beat constraints.
- `scenario_autonomous_llm`: an LLM chooses learner turns inside a named scenario's goal, persona policy, allowed actions, stop conditions, and max turns.
- `full_autonomous_llm`: an LLM explores allowed eval-owned product surfaces with broad learner freedom and invariant checks.

LLM learner modes use a separate Synthetic Learner model configuration rather than implicitly sharing the tutor model. They use a two-phase loop: first a structured action decision, then a learner-facing response after any typed simulator action observation. Initial typed actions are `artifact.list`, `artifact.view`, `quiz.answer`, `artifact.feedback`, and `session.finish`.

LLM learner modes are non-CI-gating by default. They persist Eval Runs and issue candidates, but scripted deterministic regression remains the default release gate unless a specific LLM suite is explicitly promoted.

## Consequences

- The current scripted suite remains valuable and stable instead of being replaced by stochastic LLM behavior.
- LLM-backed learner realism can be evaluated without letting model variance hide deterministic product failures.
- Artifact interaction becomes a typed simulator/product API concern, not a browser automation concern.
- Browser-backed golden journeys remain available for visual/UI regressions, but they are separate from student cognition and artifact-use simulation.
- Scenario autonomy and full autonomy can share the same action/observation loop while differing in how much scenario structure they receive.
- Failed or suspicious LLM learner runs should produce issue candidates for human review rather than publishing GitHub issues automatically.

## References

- `docs/adr/0014-synthetic-learner-evals-use-black-box-golden-journeys.md`
- `docs/adr/0015-synthetic-learner-evals-use-repo-native-runner-first.md`
- `docs/architecture/synthetic-learner-llm-simulator-prd.md`
- `docs/architecture/synthetic-learner-llm-simulator-implementation-tickets.md`
- `docs/architecture/synthetic-learner-simulator-usage.md`
- `docs/contexts/product-domain/CONTEXT.md`
