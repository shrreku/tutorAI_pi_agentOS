# Real Learner Trait Estimates Implementation Plan

Status: design accepted; first implementation slices are present locally, but cadence, signal ownership, evidence collection, and recommendation-only verification need hardening.

Current hardening note (2026-05-26): a follow-up audit found route-side durable Learner Trait Signals, session-end estimator cadence, session-local evidence windows, and shallow recommendation-only assertions. See `docs/architecture/architecture-remediation-implementation-tickets.md`.

This plan turns ADR-0017 and the Learner Trait Model grilling into implementation slices. It is intentionally separate from the Synthetic Learner LLM simulator work: both share the Learner Trait Model vocabulary, but real learner estimates are production notebook state and require stronger governance.

## Architecture Shape

`Learner Trait Signals -> LLM Trait Estimator Proposal -> Guardrail Decision -> Learner Trait Estimates -> Personalization Recommendations -> Tutor Context`

## Domain Objects

Learner Trait Signal:

- notebook-scoped internal evidence;
- can come from explicit learner self-report, tutor-recorded preference, behavior extraction, Mastery Evidence pattern, tutor observation, onboarding/profile data, or session trace;
- supports one or more trait families;
- cites session, turn, Mastery Evidence, profile, or event refs where available;
- is not learner-facing progress state.

Learner Trait Estimate:

- notebook + user + trait scoped current projection;
- stores trait value, confidence, lane, evidence refs, contradiction refs, proposal/guardrail metadata, decay metadata, and update reason;
- produces recommendations only;
- is auditable and recomputable from signals and evidence.

Learner Trait Proposal:

- LLM-produced candidate update from a bounded evidence packet;
- never persisted as canonical state until guardrails accept/cap/reject it;
- should include proposed values, confidence, supporting refs, contradiction refs, update reason, recommendation text, and safety notes.

Personalization Recommendation:

- tutor-facing summary of how to adapt teaching style;
- derived from estimates, explicit preferences, conflicts, current learner goal, and mastery/readiness context;
- excluded from mastery/curriculum reducers.

## Data Flow

1. Tutor or extractor records Learner Trait Signals.
2. Session/crystallization logic decides whether trait estimation is required.
3. If required, build a bounded evidence packet:
   - relevant new signals;
   - existing estimates;
   - relevant Mastery Evidence summaries;
   - explicit profile/preferences;
   - session/turn summaries;
   - contradictions and stale estimates.
4. LLM estimator proposes trait updates in a strict schema.
5. Guardrail layer validates proposals:
   - schema validity;
   - evidence refs;
   - trigger sufficiency;
   - confidence caps;
   - contradiction handling;
   - recommendation-only boundary.
6. Accepted/capped estimates are persisted with guardrail metadata.
7. Tutor context loads concise Personalization Recommendations on future turns.
8. Dev Mode can inspect signals, estimates, proposals, guardrails, and evidence refs.

## Trigger Policy

Trait estimation is opt-in by evidence, not a default session-end task.

Required triggers:

- explicit learner preference or self-report change;
- repeated signals touching one trait family;
- repeated Mastery Evidence/self-report contradiction;
- repeated tutor-observed friction;
- learner goal or urgency change;
- strong contradiction against an existing estimate;
- explicit Pi agentic decision that trait estimation is warranted.

Non-triggers:

- ordinary correctness alone;
- one-off frustration;
- short/noisy sessions with no trait-relevant signals;
- every session end by default;
- live-turn latency path.

## Guardrail Policy

Guardrails own persistence decisions. The estimator may reason; the guardrail decides.

Guardrails should:

- parse and validate strict schemas;
- reject proposals without evidence refs;
- cap confidence for inferred lanes;
- cap or reject estimates from one-off signals;
- preserve explicit preferences when inferred evidence conflicts;
- retain contradiction refs;
- apply confidence decay;
- reject any proposal that implies mastery/curriculum/artifact/source-grounding mutation;
- emit durable guardrail metadata for Dev Mode.

## Runtime Integration

Tutor runtime:

- gets a governed tool for explicit trait signals such as pace, depth, example preference, assessment preference, urgency, or self-report;
- receives concise Personalization Recommendations in prompt context;
- does not receive raw inferred labels unless Dev Mode or internal trace context needs them.

Session/crystallization:

- detects whether enough new trait evidence exists;
- builds the evidence packet when required;
- invokes estimator and guardrails outside the live response path;
- persists accepted estimates and trace events.

Student profile:

- remains the notebook/user learner profile surface;
- may expose explicit preference controls;
- should not expose inferred labels or archetype buckets to the learner.

Dev Mode/dashboard:

- shows trait signals, estimates, proposal status, guardrail decisions, confidence, evidence refs, contradictions, and decay state.

## Testing Strategy

Schema tests:

- trait signal contracts;
- trait estimate contracts;
- proposal and guardrail decision contracts;
- Personalization Recommendation contract.

Unit tests:

- explicit signal creation;
- trigger detection;
- evidence packet building;
- guardrail confidence caps;
- contradiction handling;
- decay calculation;
- recommendation derivation.

Integration tests:

- tutor records explicit preference signal;
- session-end estimation runs only when required;
- rejected LLM proposal does not persist an estimate;
- accepted estimate appears as tutor recommendation next turn;
- trait estimate does not mutate Mastery Evidence, weak concepts, objectives, curriculum, or artifact lifecycle.

Eval coverage:

- Synthetic Learner scenarios should cover explicit preference changes, overconfident self-report contradiction, help-avoidant behavior, exam urgency, and low-confidence high-mastery behavior.

## Implementation Order

1. Shared schemas for signals, estimates, proposals, guardrail decisions, recommendations, and trigger summaries.
2. Persistence for signals and current estimates.
3. Read/write stores and reducers for trait state.
4. Explicit signal write tool for the Pi tutor.
5. Trigger detector and evidence packet builder.
6. LLM estimator client/prompt/schema parser.
7. Guardrail layer and estimate persistence.
8. Recommendation derivation and tutor context integration.
9. Dev Mode/read APIs/dashboard trace.
10. Synthetic Learner regression coverage.

## Open Implementation Notes

- Keep model configuration separate from the tutor model where practical, but allow a default OpenAI-compatible route if the repo already uses one.
- Start with notebook-level estimates only; target refs can be added after the first implementation proves useful.
- Prefer append-only signal history plus current estimate projection.
- Keep learner-facing copy humane and preference-oriented.
