# ADR-0014: Synthetic Learner Evals Use Black-Box Golden Journeys

Status: Accepted

Date: 2026-05-21

## Context

StudyAgent needs Synthetic Learners to test whether ingestion, Source Wiki, Study Map, tutor chat, retrieval, Mastery Evidence, artifacts, session lifecycle, and learner-facing surfaces work together. Focused module tests are useful for diagnosis, but they can pass while the real learner journey is broken.

## Decision

Synthetic Learner evals should be layered. Golden journeys should run black-box through public product/API/browser surfaces by default, while focused capability evals may call internal modules directly for fast diagnosis. LLMs may drive Synthetic Learner behavior, but pass/fail judgment should come from deterministic assertions, structured traces, persisted events, database state, artifacts, citations, UI state, and explicitly-scoped evaluator rubrics.

## Consequences

- Synthetic Learner scenarios should be reusable data assets built from source fixtures, learner persona fixtures, scenario scripts, assertion rubrics, and golden journeys.
- The most important evals should verify the actual learner path, not only internal functions.
- White-box evals remain valuable for retrieval, mastery evaluation, artifact lifecycle, Source Wiki compilation, session-plan adaptation, reducers, and failure diagnosis.
- LLM-driven learner realism must not replace structured StudyAgent behavior checks.

## References

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/adr/0005-typed-tools-and-reducers-govern-agent-writes.md`
- `docs/adr/0012-tutor-session-lifecycle-separates-runs-turns-sessions-and-crystallization.md`
- `docs/adr/0013-mastery-evaluator-produces-durable-evidence-reducers-apply-learning-state.md`
