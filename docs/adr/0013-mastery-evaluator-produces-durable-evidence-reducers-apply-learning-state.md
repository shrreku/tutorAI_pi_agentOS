# ADR-0013: Mastery Evaluator Produces Durable Evidence, Reducers Apply Learning State

Status: Accepted

Date: 2026-05-15

## Context

StudyAgent needs to update learner mastery from in-session checks, quiz-like tutor prompts, worked-problem attempts, explanations, self-reported confusion, prior-knowledge claims, repeated mistakes, and quiz artifacts. Older project versions used an evaluator agent that scored learner responses, produced concept deltas, detected misconceptions, tracked uncertainty, and recommended interventions.

In the current architecture, durable learning state must not be silently mutated by free-floating agents or prompt-only judgments. ADR-0005 requires governed tools and reducers for durable writes, and ADR-0012 separates tutor sessions, turns, runs, and crystallization.

## Decision

Introduce a governed Mastery Evaluator service/tool rather than an autonomous state-mutating evaluator agent.

The evaluator judges only evaluable learner responses. It may be runtime-triggered after an eligible learner answer when the previous tutor turn asked a Mastery Check or quiz-like prompt, and it may also be called explicitly through `learning.evaluate_response` when the tutor asks for an open-ended explanation, worked-problem attempt, self-reported confusion, or prior-knowledge signal.

This evaluator is not responsible for scoring tutor teaching quality. Tutor-quality evaluation belongs in offline evals, regression tests, or monitoring, not in learner Mastery Evidence.

The evaluator produces durable Mastery Evidence: correctness, per-concept scores and deltas, concept roles, misconception evidence, readiness to advance, tutoring intervention recommendation, uncertainty, source/context refs, and evaluator provenance. Mastery Evidence is persisted before reducers apply learning state changes.

Reducers, not the evaluator, apply mastery updates, coverage changes, weak-concept changes, objective/session progress, and adaptive session-plan changes. Low-confidence or high-uncertainty evidence should trigger clarification, quick checks, or neutral/minimal updates rather than strong mastery changes.

The evaluator may recommend tutoring interventions using the initial vocabulary `clarify`, `reteach`, `worked_example`, `guided_practice`, `quick_check`, and `advance`. It should not directly recommend or create learner-visible artifacts; artifact proposals remain governed by the artifact consent and quality lifecycle.

The evaluator should be hybrid: deterministic rules for exact quiz-style scoring and obvious signals, LLM judgment for open-ended reasoning and misconceptions, schema validation for all outputs, and deterministic fallback when LLM judgment fails or is uncertain.

Initial mastery application should use simple weighted deltas rather than a Bayesian Knowledge Tracing model. The durable Mastery Evidence shape should retain enough signal detail for a future reducer to adopt BKT or another mastery model without changing evaluator semantics.

## Consequences

- The Pi tutor remains the single learner-facing teaching persona; the evaluator is internal.
- Learners should see derived progress summaries, not raw evaluator scores, deltas, confidence, uncertainty, or model reasoning.
- Mastery changes become auditable because each update can point back to persisted Mastery Evidence.
- Runtime orchestration must detect eligible answer turns and avoid evaluating general navigation or vague acknowledgements.
- Tool contracts and reducers need a `learning.evaluate_response` path plus a durable Mastery Evidence shape.
- Evaluation quality can improve independently from the learner-state write policy.
- The first implementation can avoid premature mastery-model complexity while preserving enough audit data for later BKT-style reducers.
- Tests need to cover evaluator trigger rules, schema validation, low-confidence gating, reducer application, and auditability.

## Current Implementation

- `packages/schemas/src/mastery-evidence.ts` defines the durable Mastery Evidence contract and evaluator input shape.
- `mastery_evidence` rows and `learning.mastery_evidence.recorded` events persist evaluator output before reducer-applied learning updates.
- `apps/api/src/mastery-evaluator.ts` implements hybrid deterministic/LLM/fallback evaluation.
- `learning.evaluate_response` is a governed write tool that evaluates, persists evidence, and applies reducer-governed mastery updates.
- `apps/api/src/mastery-runtime.ts` and `apps/api/src/mastery-session.ts` runtime-trigger evaluation on eligible learner answers to mastery-check prompts.
- `apps/api/src/mastery-reducer.ts` and `apps/api/src/mastery-learning.ts` apply weighted mastery deltas with uncertainty gating; `apps/api/src/phase7.ts` routes legacy quiz/flashcard outcomes through the same evidence pipeline.
- `docs/contexts/product-domain/CONTEXT.md` defines Mastery Evaluator and Mastery Evidence.
- `docs/contexts/api-runtime/CONTEXT.md` records the runtime/tool boundary for mastery evaluation.

## References

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/adr/0005-typed-tools-and-reducers-govern-agent-writes.md`
- `docs/adr/0012-tutor-session-lifecycle-separates-runs-turns-sessions-and-crystallization.md`
