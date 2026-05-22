# ADR-0015: Synthetic Learner Evals Use Repo-Native Runner First

Status: Accepted

Date: 2026-05-21

## Context

Synthetic Learner evals need to run bounded scenarios, drive black-box learner journeys, collect events and persisted state, and report whether StudyAgent is working across ingestion, tutoring, artifacts, mastery, session lifecycle, and learner-facing surfaces. Trigger.dev offers TypeScript background jobs, retries, schedules, realtime run updates, and dashboard observability, but StudyAgent already has BullMQ for ingestion, Docker dev services, append-only notebook events, event streams, and a developer timeline.

## Decision

Build the first Synthetic Learner eval system as a repo-native TypeScript runner with a CLI and a lightweight dashboard backed by persisted eval results. The core runner should load eval sets, seed fresh eval notebooks from pre-ingested Eval Source Fixtures, run deterministic or live LLM Synthetic Learners, drive public API journeys by default, support first-class browser/UI steps for golden journeys, collect traces and artifacts, support live CLI/dashboard observation from one shared eval event stream, and emit structured pass/fail results. Trigger.dev may be added later as an optional orchestration adapter for scheduled, batched, long-running, or cloud-hosted eval runs.

## Consequences

- Eval semantics stay independent from any job orchestration vendor or hosting model.
- Ingestion and tutoring evals remain separate: ingestion prepares reusable source fixtures, while Synthetic Learner scenarios exercise the tutor/product harness against seeded notebooks.
- API-driven scenarios should be the fast default, while golden journeys can include browser steps for Source Wiki, Study Map, artifact, citation, screenshot, and learner-facing regression checks.
- The first implementation can reuse local Docker, Postgres, notebook events, and existing developer timeline concepts.
- Maintainers should be able to watch student messages, tutor messages, tool calls, runtime events, assertions, artifacts, and browser screenshots while a scenario is still running.
- Synthetic Learner scenarios should support constrained beat-driven mode for regression coverage and autonomous exploration mode for discovery, stress testing, and unexpected learner behavior.
- Autonomous runs may perform real durable writes only inside eval-owned seeded notebooks; they must not mutate shared Eval Source Fixtures or production learner state.
- Deterministic assertions should be the primary correctness gate; optional LLM judge rubrics may provide secondary qualitative signals for explanation quality, remediation quality, artifact usefulness, source faithfulness, and persona realism.
- Trigger.dev remains available for future nightly/PR eval suites, batch fan-out, retry-heavy jobs, realtime status, and hosted observability.
- The runner boundary should be clean enough that Trigger.dev can invoke the same scenario contracts instead of requiring a rewrite.

## References

- `docs/adr/0014-synthetic-learner-evals-use-black-box-golden-journeys.md`
- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
