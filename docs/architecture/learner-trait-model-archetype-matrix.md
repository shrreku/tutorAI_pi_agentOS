# Learner Trait Model Archetype Matrix

Status: implemented as shared schema and fixtures.

This document defines the first Learner Trait Model matrix for generating Synthetic Learner Personas and for later bucketing real learner profiles into personalization recommendations.

The typed source of truth lives in `packages/schemas/src/learner-traits.ts`. Synthetic Learner persona fixtures are generated from those archetypes in `packages/schemas/src/synthetic-learner-evals.fixtures.ts`.

For production real learner estimates, see ADR-0017 and `docs/architecture/real-learner-trait-estimates-prd.md`.

It does not replace Mastery Evidence, Concept Mastery, weak concepts, recent mistakes, quiz attempts, or readiness state. Traits recommend how tutoring should adapt; mastery and source grounding still decide what the tutor should teach and what claims are allowed.

## Trait Vocabulary

| Trait | Values |
| --- | --- |
| `pace_preference` | `slow`, `balanced`, `fast` |
| `depth_preference` | `intuitive`, `balanced`, `formal` |
| `help_seeking_style` | `asks_early`, `tries_first`, `avoids_help` |
| `confidence_style` | `underconfident`, `calibrated`, `overconfident` |
| `metacognitive_accuracy` | `low`, `medium`, `high` |
| `persistence_style` | `gives_up_fast`, `steady`, `stubborn` |
| `source_familiarity` | `unfamiliar`, `somewhat_familiar`, `familiar` |
| `assessment_preference` | `checkpoint`, `quiz`, `worked_problem`, `self_explain` |
| `example_preference` | `concrete`, `visual`, `symbolic`, `applied` |
| `urgency_context` | `exploratory`, `exam_prep`, `deadline_pressure` |

## Archetype Matrix

| Archetype | pace | depth | help seeking | confidence | metacognition | persistence | source familiarity | assessment | examples | urgency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Beginner with misconception | slow | intuitive | asks_early | underconfident | medium | steady | unfamiliar | checkpoint | concrete | exploratory |
| Overconfident skimmer | fast | intuitive | avoids_help | overconfident | low | stubborn | somewhat_familiar | checkpoint | applied | exploratory |
| Anxious exam-prep learner | balanced | balanced | asks_early | underconfident | medium | steady | familiar | quiz | concrete | exam_prep |
| Careful self-explainer | balanced | formal | tries_first | calibrated | high | steady | somewhat_familiar | self_explain | symbolic | exploratory |
| Help-avoidant stuck learner | slow | intuitive | avoids_help | underconfident | low | gives_up_fast | unfamiliar | worked_problem | concrete | exploratory |
| Fast advanced learner | fast | formal | tries_first | calibrated | high | stubborn | familiar | worked_problem | symbolic | exploratory |
| Low-confidence high-mastery learner | balanced | balanced | asks_early | underconfident | high | steady | familiar | self_explain | applied | exam_prep |

## Archetype Intent

`beginner_misconception`: surfaces partial answers and misconception repair. The tutor should slow down, use concrete examples, ask checkpoints, and avoid over-advancing from fragile answers.

`overconfident_skimmer`: tests whether StudyAgent resists vague confidence and skipped basics. The tutor should keep explanations concise but verify mastery before advancing.

`anxious_exam_prep`: tests quiz/artifact requests, reassurance, source-grounded revision, and clear next actions. The tutor should recommend focused practice without inflating mastery from anxiety alone.

`careful_self_explainer`: tests deeper explanations, formal reasoning, and self-explanation loops. The tutor should invite reasoning, check gaps precisely, and preserve source grounding.

`help_avoidant_stuck`: tests detection of quiet struggle and low help-seeking. The tutor should offer small worked steps and low-friction checks without assuming the learner will ask for clarification.

`fast_advanced`: tests acceleration without generic shortcuts. The tutor should use formal or symbolic examples, skip only when evidence supports it, and offer harder worked problems.

`low_confidence_high_mastery`: tests learners whose self-report understates ability. The tutor should use evidence-backed encouragement, ask self-explanations, and avoid unnecessary remediation when mastery evidence is strong.

## Synthetic Learner Usage

Synthetic Learner Personas use these archetypes as authored trait bundles. The persona may still add scenario-specific goals, misconceptions, source scope, response policy, and scripted or LLM behavior rules.

For matrix coverage, start with named archetypes rather than free combinatorial sampling. After the named archetypes are stable, add targeted matrix sweeps for high-risk interactions:

- `confidence_style x metacognitive_accuracy`
- `help_seeking_style x persistence_style`
- `source_familiarity x depth_preference`
- `assessment_preference x urgency_context`

## Real Learner Usage

Real learner profiles should store Learner Trait Estimates, not fixed archetype labels as identity. A real learner may temporarily match an archetype inside one notebook, but the system should preserve trait-level evidence and confidence.

Archetype buckets can be derived for recommendation and analysis when several trait estimates align with enough confidence. They should remain explainable summaries such as "currently resembles an overconfident skimmer in this notebook", not permanent labels shown to the learner.

## Recommendation Boundaries

Traits and archetype buckets may recommend:

- explanation pace;
- example style;
- checkpoint cadence;
- artifact type;
- hint depth;
- whether to ask for self-explanation;
- whether to verify self-reported confidence.

Traits and archetype buckets must not override:

- source grounding;
- explicit learner goals;
- Mastery Evidence;
- weak-concept state;
- current objective readiness;
- artifact consent and quality policy.
