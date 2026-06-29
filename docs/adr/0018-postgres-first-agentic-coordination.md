# ADR-0018: Postgres-First Agentic Coordination

Status: Accepted (amended 2026-06-06)

Date: 2026-06-05

## Amendment (2026-06-06)

The original decision made `prepareTutorTurn()` the first tutor caching boundary with **Tutor Host Context Snapshots** and **turn-prep Corpus Retrieval**. That path produced frequent cache misses, redundant OpenRouter embedding calls, and Pi session churn from fat prompt signatures.

**Amended direction:**

- Replace turn-prep preload with **Turn Bootstrap** (session/run/refs + thin system prompt).
- Remove **Tutor Host Context Snapshot** cache entirely.
- Move notebook facts and **Corpus Retrieval** to on-demand Pi read tools (`study_plan.get_current`, `learning.get_state`, `wiki.search`).
- Use **Pi Session Memory** (`livePiSessions`) plus **Pi Session Rehydration** (same `sessionId`, ≤5 turns, dialogue + tool summaries) for conversation continuity.
- Keep optional **on-demand retrieval caches** (`tutor_turn.retrieval_plan`, `tutor_turn.retrieval_rows`) inside `wiki.search` only.
- Dispose Pi sessions on **binding changes only** (refs, mode, prompt fingerprint, session/notebook/user), not on ordinary notebook material updates.

See `docs/archive/2026-h1/architecture/tutor-runtime-bootstrap-and-observability-implementation-plan.md` for the historical end-to-end implementation plan.

## Context

StudyAgent coordinates ingestion, tutor runtime preparation, notebook events, workspace refreshes, Synthetic Learner observation, and reusable agentic context. Redis/BullMQ can provide a queue adapter, but hosted Redis providers such as Upstash may charge by command volume and can be depleted by continuous polling or idle background calls.

The product already treats Postgres as the canonical system of record for notebooks, sources, chunks, wiki pages, curriculum, tutor sessions, turns, runs, tool calls, mastery evidence, events, eval runs, and cache entries. Append-only notebook events are the durable integration log, and event streams are projections of that log.

## Decision

Use Postgres as the default coordination layer for agentic system state, persisted jobs, event observation, and reusable agentic caches.

Use event-driven Deferred Work as the product architecture: work should be triggered by durable notebook events, persisted jobs, tutor actions, or explicit schedules. Continuous Redis or Upstash polling is not part of the default architecture.

Use **Turn Bootstrap** as the API boundary before Pi runs. Turn Bootstrap resolves/creates tutor sessions, filters selected refs, creates runtime runs and tool registries, and compiles a thin system prompt. It does **not** preload study state, personalization, or Corpus Retrieval.

Use **Pi Session Memory** for in-process conversation continuity. Rehydrate Pi Session Memory from durable `tutor_turns` when memory is missing (resume, restart, binding disposal). Rehydration is session-scoped, capped (default 5 turns), and includes dialogue plus compact tool summaries — never cross-session transcript replay.

Use **on-demand Corpus Retrieval** through `wiki.search` (Pi runtime) and `POST /search` (workspace UI). Optional retrieval-plan and retrieval-row caches may live in `agentic_cache_entries` under `tutor_turn.retrieval_plan` and `tutor_turn.retrieval_rows` for repeated identical searches inside `wiki.search`. Retrieval caches must fail open to live planning/search and must not store canonical learner state.

Invalidate on-demand retrieval caches explicitly at durable API write/event boundaries for source/corpus/wiki/search-material changes. Failed invalidation must not roll back the durable write because cache keys carry material versions and TTL expiry remains a fallback.

**Do not** use Tutor Host Context Snapshot cache. Host-context preload is removed.

Redis/BullMQ remains an optional infrastructure adapter for deployments that need higher-throughput queueing or managed worker features. The system must remain functional without Redis configured.

## Consequences

- Local and low-cost deployments can run ingestion and agentic workflows without consuming hosted Redis command quotas.
- Durable state, invalidation, and observability stay aligned with the existing Postgres event log and runtime persistence model.
- Postgres-backed queues and caches need careful indexing, bounded cleanup, and explicit ownership so they do not become an unbounded dumping ground.
- Tutor turns no longer pay turn-prep embedding latency; embeddings occur only inside `wiki.search` when the agent searches.
- Pi sessions survive ordinary mastery/plan/source updates when binding inputs are unchanged, improving conversation continuity.
- New tutor sessions start with empty Pi memory and an explicit bootstrap instruction to re-read plan/objective through tools.
- Live UI observation should use event streams backed by append-only events and database notifications over fixed-interval polling loops.
- Synthetic Learner Eval Run observation should stream persisted eval-run row changes for cache invalidation instead of polling active runs on a timer.
- Redis-specific behavior must not become the only path for ingestion, tutor cache observation, eval observation, or workspace refresh.
- Local Docker defaults should exercise the Postgres-backed path. Redis/BullMQ should be enabled through an explicit override or deployment setting.
- Future Redis/BullMQ or hosted orchestrator integrations should call the same queue/cache/event contracts rather than creating parallel product state.

## References

- `docs/adr/0006-postgres-system-of-record-neo4j-derived-projection.md`
- `docs/adr/0007-append-only-notebook-events-and-stream-projections.md`
- `docs/adr/0015-synthetic-learner-evals-use-repo-native-runner-first.md`
- `docs/adr/0019-observability-telemetry-seam.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/archive/2026-h1/architecture/tutor-runtime-bootstrap-and-observability-implementation-plan.md`
