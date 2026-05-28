# Real Learner Trait Estimates PRD

Status: design accepted, implementation pending.

## Problem Statement

StudyAgent currently personalizes tutoring through student profile fields, Mastery Evidence, learning state, weak concepts, readiness, and progress summaries. Those signals decide what the learner is ready to learn and where remediation is needed, but they do not provide a durable, auditable model for how the learner prefers to study or how the tutor should shape interaction style.

Synthetic Learner Personas now use a shared Learner Trait Model and archetype matrix. Real learners need the same trait vocabulary for personalization recommendations, but real learner traits must be evidence-backed, confidence-scored, notebook-scoped, and guarded so the system does not label learners from one noisy interaction.

## Solution

Build real Learner Trait Signals and Learner Trait Estimates.

Learner Trait Signals are persisted internal observations such as explicit pace requests, help-seeking behavior, repeated confidence mismatch, persistence patterns, assessment preferences, or self-explanation patterns. Learner Trait Estimates are current notebook-scoped projections over those signals and related evidence. An LLM-assisted trait estimator proposes estimate updates from bounded evidence packets only when triggered. A deterministic guardrail layer validates and accepts, caps, reconciles, or rejects those proposals before persistence.

Trait estimates produce Personalization Recommendations only. They can shape tutor style, examples, checks, hints, artifact suggestions, confidence verification, reassurance, and structure, but they must not directly mutate Concept Mastery, Objective Progress, weak concepts, curriculum progress, source grounding, artifact consent, or explicit learner goals.

## User Stories

1. As a learner, I want the tutor to remember my explicit preferences such as pace, examples, depth, and quiz preference without needing to repeat them every session.
2. As a learner, I want the tutor to adapt gently to my study behavior without labeling me or exposing sensitive inferred traits.
3. As a learner, I want personalization to remain subordinate to source grounding and actual mastery evidence.
4. As a tutor, I want concise Personalization Recommendations that tell me how to teach, not a raw psychological profile.
5. As a tutor, I want to record explicit preference/self-report signals through governed tools when the learner states them.
6. As a maintainer, I want inferred traits to be auditable back to persisted Learner Trait Signals, Mastery Evidence, and session refs.
7. As a maintainer, I want LLM-assisted trait estimation only when there is enough evidence or explicit reason, not after every session by default.
8. As a maintainer, I want deterministic guardrails around LLM proposals so estimates stay schema-valid, evidence-backed, confidence-capped, and recommendation-only.
9. As a maintainer, I want Dev Mode visibility into trait signals, estimates, proposal decisions, confidence, contradictions, and evidence refs.
10. As a maintainer, I want Synthetic Learner archetypes and real learner trait estimates to share vocabulary without making test personas production identities.

## Product Decisions

- Use the shared Learner Trait Model from `packages/schemas/src/learner-traits.ts`.
- Persist Learner Trait Signals as internal notebook-scoped evidence.
- Persist Learner Trait Estimates as current read-optimized notebook-scoped state.
- Scope real estimates to notebook + user + trait first.
- Add target-specific estimates later for source, concept, objective, or exam-goal contexts.
- Keep cross-notebook traits out of scope until a Portable Learner Profile is explicitly designed.
- Use explicit and inferred update lanes:
  - explicit self-report/settings can update quickly with higher confidence;
  - inferred behavior/mastery/tutor-observation estimates require repeated signals and guardrails.
- Use an LLM-assisted estimator for trait interpretation, not a deterministic-only reducer.
- Let the LLM propose updates; deterministic guardrails accept, cap, reconcile, or reject.
- Do not run trait estimation by default after every session.
- Run at session/crystallization boundaries only when triggered, or when the Pi agentic system explicitly decides it is warranted.
- Keep inferred trait labels, archetype buckets, confidence, evidence refs, and proposal reasoning internal or Dev Mode only.
- Learner-facing UI may expose explicit preference controls and gentle suggestions, not labels such as overconfident or low metacognitive accuracy.

## Trigger Rules

Run LLM-assisted trait estimation when one or more of these are true:

- learner explicitly changes a preference, such as pace, depth, example style, quiz preference, or urgency;
- there are enough repeated Learner Trait Signals around a trait family;
- Mastery Evidence repeatedly contradicts learner self-report;
- tutor/session traces show repeated friction, disengagement, hint requests, skipped explanations, or persistent confusion;
- learner goal or urgency changes, such as exam prep or deadline pressure;
- new evidence strongly contradicts an existing Learner Trait Estimate.

Do not run it for:

- ordinary correct or incorrect answers alone;
- one-off mood or frustration;
- short sessions with no trait-relevant signals;
- every session end by default;
- live tutor turns where it would block response latency.

## Guardrail Requirements

Every LLM proposal must be checked before persistence:

- Trait keys and values must match the shared schema.
- Proposed estimates must include evidence refs.
- Inferred updates need enough repeated support.
- Confidence must be capped by evidence source and contradiction state.
- Explicit preferences must not be silently overwritten by inferred evidence.
- Contradictions should be retained and reflected in recommendations.
- Trait confidence decays over time without deleting evidence.
- Estimates must not directly trigger mastery, weak-concept, curriculum, objective, artifact, or source-grounding mutations.

## Out Of Scope

- Cross-notebook Portable Learner Profile implementation.
- Learner-facing inferred trait labels.
- Direct mastery/curriculum mutations from trait estimates.
- Replacing Mastery Evidence or Learner Level.
- Running a trait estimator on every turn/session by default.
- Using Synthetic Learner Personas as production learner profiles.

## Success Criteria

- Tutor prompt context can consume Personalization Recommendations without raw trait/debug leakage.
- Explicit preference changes are captured as Learner Trait Signals and reflected in estimates/recommendations.
- Inferred estimates cite persisted signals and evidence.
- LLM proposals that lack evidence, exceed confidence rules, or violate scope are rejected or capped.
- Dev Mode can explain why an estimate changed.
- Tests prove trait estimates do not mutate mastery or curriculum state directly.
