# ADR-0017: LLM-Assisted Learner Trait Estimates Use Signals And Guarded Persistence

Status: Accepted

Date: 2026-05-25

## Context

StudyAgent needs richer learner modeling than concept mastery alone. The existing system already persists student profiles, Mastery Evidence, learning state, weak concepts, and progress summaries, and the Synthetic Learner work now has a typed Learner Trait Model for authored persona archetypes. Real learner personalization needs the same trait vocabulary, but it must not turn noisy behavior into permanent learner identity or let a model silently mutate mastery/curriculum state.

## Decision

Use notebook-scoped Learner Trait Signals and Learner Trait Estimates for real learners.

Learner Trait Signals are durable internal observations from explicit self-report, tutor-recorded preferences, behavior, Mastery Evidence patterns, session traces, onboarding/profile data, or reflective extraction. Learner Trait Estimates are current read-optimized projections over those signals and other evidence. Estimates are scoped to notebook, user, and trait by default; future target-specific estimates may add source, concept, objective, or exam-goal refs. Cross-notebook traits require a separate Portable Learner Profile.

Use an LLM-assisted trait estimator, but only as a proposal step. The estimator may run at session/crystallization boundaries or when the Pi agentic system explicitly decides trait estimation is warranted. It should not run by default after every session and should not block normal live tutor turns. Triggering evidence includes explicit preference changes, repeated Learner Trait Signals around a trait family, repeated contradiction between self-report and Mastery Evidence, repeated tutor-observed friction, learner goal/urgency changes, or strong contradiction against an existing estimate.

A deterministic guardrail layer must validate, cap, reconcile, or reject LLM proposals before persistence. Guardrails enforce the shared trait schema, required evidence refs, confidence caps, repeated-signal requirements for inferred traits, contradiction handling, decay rules, and the boundary that trait estimates produce Personalization Recommendations only.

Learner Trait Estimates may recommend explanation pace, depth, example choice, checkpoint cadence, hint depth, artifact suggestions, confidence verification, reassurance, and structure. They must not directly mutate Concept Mastery, Objective Progress, weak concepts, curriculum progress, artifact consent, source grounding, or explicit learner goals.

## Considered Options

- Deterministic reducer only: rejected because real learner behavior is messy, contextual, and often needs summarization across ambiguous signals.
- LLM writes estimates directly: rejected because personality-like learner labels need evidence, guardrails, confidence caps, and auditability.
- Recompute traits only from raw events: rejected because raw events are too broad and tutor prompt construction needs a current read model.

## Consequences

- The tutor can use richer personalization without treating traits as mastery.
- Estimate writes remain auditable because they cite Learner Trait Signals and related evidence.
- The Pi tutor may record explicit learner preference/self-report signals during tutoring, while inferred signals come from a reflective extractor over completed turns, session traces, and Mastery Evidence.
- Learners can edit explicit preferences in humane settings, but inferred trait labels, confidence, evidence refs, LLM proposal reasoning, and archetype buckets remain internal or Dev Mode only.
- Trait confidence decays over time without deleting evidence, with faster decay for context-sensitive traits such as urgency context, source familiarity, assessment preference, and pace preference.

## References

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/architecture/learner-trait-model-archetype-matrix.md`
- `docs/architecture/real-learner-trait-estimates-prd.md`
- `docs/architecture/real-learner-trait-estimates-implementation-plan.md`
- `docs/architecture/real-learner-trait-estimates-implementation-tickets.md`
- `docs/adr/0001-notebook-scoped-learning-workspace.md`
- `docs/adr/0013-mastery-evaluator-produces-durable-evidence-reducers-apply-learning-state.md`
