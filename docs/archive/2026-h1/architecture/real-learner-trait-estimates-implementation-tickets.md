# Real Learner Trait Estimates Implementation Tickets

Status: first implementation slices are present locally; remediation tickets are needed before treating this as fully verified.

Current hardening note (2026-05-26): follow-up tickets for signal ownership, estimation cadence, evidence collection, and snapshot-based recommendation-only checks live in `docs/architecture/architecture-remediation-implementation-tickets.md`.

This document breaks ADR-0017 and `docs/architecture/real-learner-trait-estimates-implementation-plan.md` into dependency-ordered tickets.

## Publishing Plan

Create one parent GitHub issue named `Real learner trait estimates program`, then publish the tickets below in dependency order. Use `ready-for-agent` for AFK tickets and `ready-for-human` only if product copy or privacy wording needs review.

The current breakdown has 12 slices:

1. Extend learner trait schemas for real learner signals and estimates.
2. Persist Learner Trait Signals and current Learner Trait Estimates.
3. Add trait state stores and read models.
4. Add explicit trait signal write tool.
5. Build trait estimation trigger detector.
6. Build trait evidence packet builder.
7. Add LLM trait estimator proposal client.
8. Add deterministic proposal guardrails.
9. Derive Personalization Recommendations for tutor context.
10. Add learner preference controls and Dev Mode trait trace.
11. Add trait-estimation eval scenarios.
12. Add end-to-end session-boundary regression tests.

## 1. Extend Learner Trait Schemas For Real Learner Signals And Estimates

Type: AFK

Blocked by: None.

User stories covered:

- As a maintainer, I want typed trait signals and estimates so learner modeling remains schema-validated.
- As a tutor, I want recommendations derived from traits without raw personality labels.

What to build:

Extend `packages/schemas/src/learner-traits.ts` with production contracts for Learner Trait Signals, Learner Trait Estimates, LLM trait proposals, guardrail decisions, trigger summaries, decay metadata, contradiction refs, and Personalization Recommendations.

Acceptance criteria:

- Signal schema includes notebook/user refs, signal source, trait family, suggested value where known, strength/confidence, evidence refs, session/turn refs, and internal visibility.
- Estimate schema includes notebook/user/trait, value, confidence, lane (`explicit` or `inferred`), evidence refs, contradiction refs, decay metadata, update reason, and guardrail metadata.
- Proposal schema is separate from canonical estimate schema.
- Personalization Recommendation schema contains tutor-facing adaptation suggestions without raw inferred labels by default.
- Tests cover valid explicit signal, inferred signal, proposal, accepted guardrail decision, rejected guardrail decision, and recommendation.

Implementation notes:

- Reuse existing `LearnerTraitValues`, trait keys, and archetype vocabulary.
- Do not add database code in this ticket.

## 2. Persist Learner Trait Signals And Current Learner Trait Estimates

Type: AFK

Blocked by:

- 1. Extend learner trait schemas for real learner signals and estimates.

User stories covered:

- As a maintainer, I want trait estimates to be auditable back to persisted evidence.
- As a tutor, I want current trait estimates to be efficient to load.

What to build:

Add migrations and Drizzle schema for append-style Learner Trait Signals and current Learner Trait Estimates. Keep signals as internal notebook-scoped evidence and estimates as current read-optimized state.

Acceptance criteria:

- `learner_trait_signals` or equivalent table stores signal JSON, notebook ID, user ID, source type, evidence refs, session/turn refs, and timestamps.
- `learner_trait_estimates` or equivalent table stores one current estimate per notebook/user/trait/optional target ref.
- Estimates cite supporting signal/evidence refs and contradiction refs.
- Deleting a notebook cascades trait signals and estimates.
- Unique index prevents duplicate current estimates for the same notebook/user/trait/target.
- Migration tests or schema checks pass.

Implementation notes:

- Start with nullable/absent target refs but model the column shape so target-specific estimates are possible later.
- Do not store inferred trait labels in learner-facing tables.

## 3. Add Trait State Stores And Read Models

Type: AFK

Blocked by:

- 2. Persist Learner Trait Signals and current Learner Trait Estimates.

User stories covered:

- As a maintainer, I want one store boundary for writing and reading trait evidence.
- As a tutor, I want current recommendations loaded without scanning raw history.

What to build:

Add API/runtime store helpers for recording signals, reading recent signals, reading current estimates, updating estimates, and building Dev Mode/read-model summaries.

Acceptance criteria:

- Store validates all writes through shared schemas.
- Signal writes append new records and do not mutate prior signals.
- Estimate updates replace/upsert current projection while preserving evidence refs.
- Read helpers can fetch recent signals by notebook/user/session.
- Read helpers can fetch current estimates by notebook/user and optional trait list.
- Tests cover append, upsert, evidence refs, notebook isolation, and missing-state behavior.

Implementation notes:

- Keep the store independent from tutor prompt construction in this ticket.

## 4. Add Explicit Trait Signal Write Tool

Type: AFK

Blocked by:

- 3. Add trait state stores and read models.

User stories covered:

- As a learner, I want the tutor to remember explicit preferences I state.
- As a tutor, I need a governed way to record explicit preference/self-report signals.

What to build:

Add a governed runtime write tool for explicit learner trait signals, such as `learner_trait.record_signal` or a closely named tool. The Pi tutor can call it when the learner states preferences or self-report that map to the Learner Trait Model.

Acceptance criteria:

- Tool contract exists in `packages/tools` with input/output schemas.
- Tool writes a Learner Trait Signal through the store.
- Tool supports explicit preferences for pace, depth, example preference, assessment preference, urgency, source familiarity, help-seeking, and confidence/self-report signals where appropriate.
- Tool returns reducer metadata and emitted event IDs consistent with existing write-tool patterns.
- Tool is exposed to tutor runtime.
- Tests cover valid explicit preference, invalid trait value, notebook isolation, reducer output validation, and event emission.

Implementation notes:

- The tool records signals, not estimates.
- Do not let the tool directly mutate Mastery Evidence, learning state, or curriculum.

## 5. Build Trait Estimation Trigger Detector

Type: AFK

Blocked by:

- 3. Add trait state stores and read models.

User stories covered:

- As a maintainer, I want trait estimation to run only when evidence warrants it.
- As a learner, I do not want every ordinary answer analyzed into a trait.

What to build:

Add a trigger detector that decides whether an LLM trait estimation pass is required at session/crystallization boundaries or by explicit Pi agentic decision.

Acceptance criteria:

- Detector returns structured trigger summary with reasons and evidence refs.
- Triggers include explicit preference changes, repeated trait-family signals, repeated Mastery Evidence/self-report contradiction, repeated tutor-observed friction, goal/urgency change, and strong contradiction against existing estimates.
- Non-triggers include ordinary correctness alone, one-off mood, short sessions without trait signals, and default session end.
- Tests cover each trigger and non-trigger.

Implementation notes:

- This detector should be deterministic.
- It should not call an LLM.

## 6. Build Trait Evidence Packet Builder

Type: AFK

Blocked by:

- 5. Build trait estimation trigger detector.

User stories covered:

- As a maintainer, I want the LLM estimator to see bounded, relevant context rather than full raw transcripts.
- As a maintainer, I want every proposal to cite evidence.

What to build:

Build a bounded evidence packet for the LLM trait estimator from recent signals, current estimates, relevant Mastery Evidence summaries, explicit profile/preferences, session/turn summaries, and contradictions.

Acceptance criteria:

- Packet schema is typed and test-covered.
- Packet includes only notebook/user-scoped evidence.
- Packet includes evidence refs for every summarized signal.
- Packet includes existing estimates and contradiction context.
- Packet truncates or summarizes long transcripts.
- Tests cover no evidence, explicit preference evidence, repeated contradiction evidence, and notebook isolation.

Implementation notes:

- Keep raw learner text minimal and relevant.
- The packet is internal and not learner-facing.

## 7. Add LLM Trait Estimator Proposal Client

Type: AFK

Blocked by:

- 6. Build trait evidence packet builder.

User stories covered:

- As a maintainer, I want LLM reasoning over messy learner behavior while keeping writes governed.
- As a tutor, I want nuanced personalization recommendations.

What to build:

Add an LLM-assisted estimator that consumes the evidence packet and returns strict proposal JSON for trait estimate updates and recommendations.

Acceptance criteria:

- Estimator accepts a model config separate from normal tutor prompt construction where practical.
- Prompt states that proposals are internal, evidence-backed, and recommendation-only.
- Output schema requires proposed trait, value, confidence, lane, evidence refs, contradiction refs, update reason, and recommendation text.
- Invalid model output fails cleanly without persisting estimates.
- Tests cover stubbed valid proposal, invalid proposal, missing evidence refs, and model failure.

Implementation notes:

- Follow the OpenAI-compatible model-client patterns already used elsewhere in the repo.
- Do not call the estimator from live tutor turns.

## 8. Add Deterministic Proposal Guardrails

Type: AFK

Blocked by:

- 7. Add LLM trait estimator proposal client.

User stories covered:

- As a maintainer, I want model-generated trait updates to be validated, capped, and auditable.
- As a learner, I do not want a single noisy moment to become a permanent trait label.

What to build:

Add a guardrail layer that accepts, caps, reconciles, or rejects LLM proposals before persistence.

Acceptance criteria:

- Guardrails enforce schema-valid trait keys and values.
- Proposals without evidence refs are rejected.
- Inferred estimates from one-off evidence are rejected or capped.
- Confidence is capped by lane/source and contradiction state.
- Explicit preferences are preserved when inferred evidence conflicts.
- Contradiction refs are retained.
- Guardrail decisions are persisted or returned for Dev Mode trace.
- Tests cover accept, cap, reject, explicit/inferred conflict, missing evidence, and confidence decay.

Implementation notes:

- Guardrails own canonical write decisions.
- Estimator proposals are never canonical until guardrails accept/cap them.

## 9. Derive Personalization Recommendations For Tutor Context

Type: AFK

Blocked by:

- 8. Add deterministic proposal guardrails.

User stories covered:

- As a tutor, I want clear recommendations for how to teach.
- As a learner, I want personalization without raw inferred labels.

What to build:

Derive concise Personalization Recommendations from current estimates, explicit preferences, contradictions, current learner goal, and relevant mastery/readiness context. Add them to tutor context.

Acceptance criteria:

- Recommendations are concise, tutor-facing, and action-oriented.
- Recommendations do not include raw confidence, evidence IDs, or sensitive labels in learner-facing text.
- Recommendations cannot mutate mastery/curriculum/artifact state.
- Tutor prompt construction includes recommendations when available.
- Tests cover no traits, explicit pace preference, inferred confidence mismatch, conflicting preference/evidence, and source grounding boundary.

Implementation notes:

- Keep raw estimate details available in Dev Mode, not normal prompt copy.

## 10. Add Learner Preference Controls And Dev Mode Trait Trace

Type: Human review for learner-facing copy, then AFK.

Blocked by:

- 9. Derive Personalization Recommendations for tutor context.

User stories covered:

- As a learner, I want to edit explicit preferences without seeing sensitive inferred labels.
- As a maintainer, I want to inspect trait estimates and proposal decisions in Dev Mode.

What to build:

Add learner-safe preference controls for explicit preferences and Dev Mode/read APIs for internal trait trace.

Acceptance criteria:

- Learner-facing controls expose humane preferences such as pace, depth, examples, and quiz preference.
- Learner-facing UI does not expose inferred labels like overconfident or low metacognitive accuracy.
- Dev Mode can show signals, estimates, proposal decisions, guardrail decisions, confidence, contradictions, and evidence refs.
- Tests cover learner-safe visibility and Dev Mode visibility.

Implementation notes:

- This can be split into API read models first and UI second if useful.

## 11. Add Trait-Estimation Eval Scenarios

Type: AFK

Blocked by:

- 9. Derive Personalization Recommendations for tutor context.

User stories covered:

- As a maintainer, I want Synthetic Learners to prove trait estimation behavior safely.

What to build:

Add Synthetic Learner scenarios that exercise explicit preference changes, overconfident self-report contradiction, help-avoidant behavior, exam urgency, and low-confidence high-mastery behavior.

Acceptance criteria:

- Scenarios use the shared Learner Trait Archetype fixtures.
- At least one scenario records explicit trait signals.
- At least one scenario triggers LLM-assisted estimation.
- Assertions verify estimates cite evidence refs and recommendations stay recommendation-only.
- Assertions verify no direct mastery/curriculum mutation from trait estimates.

Implementation notes:

- Keep LLM estimation scenarios non-CI-gating until stable.
- Scripted scenarios can test guardrails deterministically.

## 12. Add End-To-End Session-Boundary Regression Tests

Type: AFK

Blocked by:

- 11. Add trait-estimation eval scenarios.

User stories covered:

- As a maintainer, I want end-to-end proof that real learner traits improve tutoring safely.

What to build:

Add integration/regression tests that run tutor sessions through trait signal capture, trigger detection, estimator proposal, guardrail decision, estimate persistence, recommendation loading, and tutor context use.

Acceptance criteria:

- Session without trait triggers does not run estimator.
- Session with explicit preference records signal and updates recommendation.
- Rejected proposal does not persist an estimate.
- Accepted/capped estimate appears in later tutor context.
- Trait recommendation does not mutate Mastery Evidence, weak concepts, objective progress, curriculum, or artifact lifecycle.
- Dev trace can explain the estimate update.

Implementation notes:

- Use stubs for LLM estimator in deterministic tests.
- Add Docker/live smoke commands only after the core path is stable.
