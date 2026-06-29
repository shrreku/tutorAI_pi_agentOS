# API Runtime Context

The API/runtime context owns the notebook-scoped tutor runtime surface: HTTP routes, auth-scoped access checks, durable tutor/session persistence, event emission, SSE streaming, runtime tool registration, prompt construction, Pi session adaptation, and reducer-governed tutor writes.

It bridges product-facing notebook APIs with lower-level source ingestion, search, graph projection, wiki, and persistence packages.

## Owned Code

- `apps/api/src/server.ts`: Fastify server, app context, CORS/multipart setup, route registration, storage bootstrap, graceful shutdown.
- `apps/api/src/auth.ts`: local/dev actor resolution and notebook ownership checks.
- `apps/api/src/tutor-turn.ts`: Tutor Turn Module (`executeTutorTurn`) — run/turn persistence, streaming projection, crystallization, validated reducer persistence.
- `apps/api/src/routes/tutor.ts`: tutor chat route adapter (auth, SSE) delegating to the Tutor Turn Module.
- `apps/api/src/langfuse-prompts.ts`: Managed Prompt adapter for the StudyAgent tutor system prompt, including local fallback resolution and explicit Langfuse prompt sync definitions.
- `apps/api/src/tutor-turn-preparation.ts`: Turn Bootstrap — session/run/refs and thin prompt before Pi runs.
- `apps/api/src/tutor-tool-provider.ts`: runtime read tools backed by DB/search/Neo4j/state selectors, including on-demand `wiki.search` Corpus Retrieval.
- `apps/api/src/tutor-write-provider.ts`: runtime write tools for claims, artifacts, planning updates, coverage changes, reducer metadata, and events.
- `apps/api/src/study-state.ts`: assembled study state and Live Plan data, including typed `sourceLevels` and `learnerReadiness` for tutor prompt construction.
- `packages/schemas/src/learning-levels.ts`: shared Source Level, Learner Readiness, and source-scope policy contracts.
- `packages/schemas/src/note-personalization.ts`: optional note personalization metadata and merge helpers.
- `packages/schemas/src/adaptive-plan-signals.ts`: adaptive plan signal vocabulary for durable session-plan changes.
- `packages/wiki-core/src/wiki-polish-queue.ts`: deterministic Source Wiki polish prioritization helper; durable background polish uses `generation_jobs` (`wiki_touch_background`).
- `apps/api/src/tutor-session-crystallization.ts`, `apps/api/src/curriculum-adaptation.ts`, `apps/api/src/learning-outcome.ts`, `apps/api/src/assessment-artifacts.ts`, `apps/api/src/objective-progression.ts`: session crystallization, Live Plan adaptation, mastery outcomes, and assessment artifacts.
- `apps/api/src/reference-surface.ts`: learner-facing Reference Surface and Evidence read-model construction for graph node open targets (`buildReferenceSurface`, `buildNodeEvidence`).
- `apps/api/src/interactive-learning-actions.ts`, `apps/api/src/interactive-learning-action-handlers/*`, `apps/api/src/routes/interactive-learning.ts`, `apps/api/src/interactive-learning-blocks.ts`: Interactive Learning Action dispatcher (envelope validation plus per-action handler registry), route adapter, block lookup/sanitization, and canonical state updates for Reference Surface interactive blocks.
- `apps/api/src/artifact-lifecycle.ts`: Artifact Lifecycle Module for consent policy, valid status transitions, quality gates, learner visibility, route approve/reject actions, and tool-write lifecycle outcomes (`resolveArtifactLifecycleOutcome`, `applyArtifactLifecycleAction`, `decideArtifactQuality`).
- `apps/api/src/artifact-view.ts`: artifact payload normalization adapter consumed by the Reference Surface module; quality comes from the Artifact Lifecycle Module.
- `apps/api/src/workspace-read-model.ts`: Workspace Read Model for Study Map and Source Wiki (`buildStudyMapReadModel`, `buildSourceWikiReadModel`, learner visibility, emphasis, topic groups, reference-surface open targets, projection warnings/health).
- `packages/graph/src/graph-projection/*`: Graph Projection Module used by the worker for Neo4j writes and by graph routes for projection health reads.
- `apps/api/src/routes/graph.ts`: graph query (returns `readModel` on `study_map` / `source_wiki_map`), layout persistence, and thin delegates for `GET .../reference-surface` and `GET .../provenance`.
- `packages/agent-runtime/src/*`: runtime prompt/run/tool/session abstractions, Pi session adapter, stream mapping, compaction, failure classification.
- `packages/tools/src/*`: Tool Contract Module (`TOOL_CONTRACT_CATALOG`, `registerRuntimeToolsV1`, catalog coverage assertions, reducer validation helpers), tool registry, execution lifecycle events, timeout handling, LLM argument normalization.
- `packages/schemas/src/*`: shared Zod wire/domain contracts.
- `packages/db/src/*`: Drizzle schema and append-only notebook event sequencing.
- `packages/observability/src/index.ts`: Observability Module for traces, usage formatting, in-process metrics, Prometheus exposition, and bounded StudyAgent telemetry helpers.

## Public Contracts

API root: `/health` and `/api/v1/*`.

Metrics endpoint: `/metrics` returns Prometheus text exposition for in-process counters, gauges, and histograms. It is pull-based and does not create background network calls.

API responses mounted through the server carry request correlation headers `X-StudyAgent-Trace-Id`, `X-StudyAgent-Request-Id`, and `traceparent`.

Langfuse prompt sync is explicit: `pnpm --filter @studyagent/api langfuse:sync-prompts` creates a new dashboard prompt version for the configured StudyAgent tutor prompt when Langfuse credentials are present. API startup and ordinary tutor turns do not create prompt versions.

Core notebook routes cover notebooks, settings, study state, artifacts, wiki lint, sources, search, graph, student profile, tutor chat/session lifecycle, event streams, and developer timeline.

Interactive Learning actions: `POST /api/v1/notebooks/:notebookId/interactive-learning/actions`. The route validates `InteractiveLearningActionEnvelope`, notebook ownership, current Reference Surface/block identity, allowed actions, and payload schemas before routing durable outcomes through artifact, mastery, learning, planning, or event paths.

Tutor chat: `POST /api/v1/notebooks/:notebookId/tutor/chat`.

The tutor chat request follows an AG-UI-like shape:

- `messages`: chat messages
- `data.activeMode`: `learn`, `practice`, `revise`, `explore`, or `wiki_maintenance`
- `data.selectedNodeRefs`: selected graph/reference context
- `data.sourceScopePolicy`: `soft_source_scope` (default; optional hint when sources are selected)
- `data.sessionId`: optional existing tutor session
- `data.action`: `prompt`, `steer`, or `followUp`

The response is SSE with a custom `SESSION_STARTED` event, Runtime Work View events (thinking, narration, tools), AG-UI learner-response events, and headers `X-StudyAgent-Session-Id`, `X-StudyAgent-Run-Id`, `X-StudyAgent-Trace-Id`, `X-StudyAgent-Request-Id`, and `traceparent`.

Tutor lifecycle routes:

- `POST /api/v1/notebooks/:notebookId/tutor/session/pause`
- `POST /api/v1/notebooks/:notebookId/tutor/session/resume`
- `POST /api/v1/notebooks/:notebookId/tutor/session/end`
- `GET /api/v1/notebooks/:notebookId/tutor/sessions`

Event streams:

- `/api/v1/notebooks/:notebookId/events/stream` streams raw event envelopes by notebook sequence, catching up from the durable event log and then waking from database event notifications.
- `/api/v1/notebooks/:notebookId/sessions/:sessionId/events/stream` maps tutor runtime events into runtime stream chunks when possible, using the same durable catch-up and notification-driven fanout.
- `/api/v1/eval/runs/stream` streams Synthetic Learner Eval Run row changes for dashboard invalidation. Eval Run state remains durable in `synthetic_learner_eval_runs`; the stream is notification fanout plus `updatedAt` catch-up, not a fixed-interval polling loop.

Search: `POST /api/v1/notebooks/:notebookId/search` accepts `query`, `limit`, `mode` (`lexical`, `vector`, `hybrid`), optional `selectedNodeRefs`, `conceptIds`, and `expandParents`.

## Tool Contracts

Runtime tools are the most important internal API. Every tutor tool is declared once in `TOOL_CONTRACT_CATALOG` (`packages/tools/src/index.ts`, `packages/tools/src/writes.ts`) with input/output schemas, `operationKind` (`read` | `write`), `sideEffectClass`, `reducerExpectation`, and `providerMethod`.

Register tools through `createRuntimeToolRegistry` (which calls `registerRuntimeToolsV1`). `assertToolCatalogMatchesRegistry` fails tests when registry entries drift from the catalog. Write tools must return `reducerResult` payloads that pass `validateToolReducerOutput` (schema + expected `mutationType`).

Tool inputs and outputs that carry `NodeRef` may include an LLM-facing Handle (`handle`, `title`, or `label`) next to the canonical `{ refType, refId }`. The model should reason over text/handles and preserve the attached ID only when a write tool needs the canonical reference.

Pi adapter metadata (`getPiToolMetadata` in `packages/agent-runtime/src/pi-session.ts`) is derived from the same catalog; the hosted Pi session only binds tools listed in the catalog.

Read tools include:

- `notebook.get_context`
- `wiki.search`
- `wiki.get_page`
- `source.get_span`
- `graph.get_subgraph`
- `graph.get_study_map`
- `graph.get_source_wiki_map`
- `curriculum.get`
- `student_profile.get`
- `study_plan.get_current`
- `learning.get_state`

Write tools also include:

- `learning.evaluate_response` (evaluates a learner answer, persists Mastery Evidence, and applies reducer-governed mastery updates)

Write tools include:

- `wiki.propose_claim`
- artifact creators for notes, quizzes, flashcards, worked examples, formula sheets, comparison pages, and concept cards
- `artifact.insert_into_tutor_context`
- coverage updates and gap reads
- session-plan/curriculum/module/objective edits
- objective split/merge/reorder
- `student_profile.update_preferences`

All durable writes should return a `reducerResult` with mutation metadata and emitted event IDs.

Planned learner-trait writes should follow ADR-0017: the tutor may record explicit Learner Trait Signals through governed tools, but LLM-assisted Learner Trait Estimate updates must be proposed, guardrailed, evidence-backed, and recommendation-only before persistence.

## Domain Terms

NodeRef: canonical reference `{ refType, refId }` used across graph selection, provenance, tutor context, artifacts, and tools.

LLM-facing Handle: human-readable semantic label attached to a canonical reference so the tutor runtime can reason over objective titles, concept names, source titles, and stable roles while still carrying the underlying ID for reducer-governed writes. Handles are not canonical identity and must not replace notebook-scoped ID validation.

ProvenanceRef: NodeRef plus a role such as `supports`, `derived_from`, `contradicts`, `supersedes`, or `generated_by`.

Claim: source-backed atomic knowledge unit with status, confidence, support, provenance, concept links, and reinforcement.

WikiPage: durable compiled reference page over claims/chunks.

Artifact: generated learning object. Some are learner-visible study aids; some are internal planning/teaching objects.

Curriculum, Module, ObjectiveList, Objective, SessionPlan: curriculum-first planning chain used to route tutor behavior.

StudyPlan: user-specific Live Plan state containing current, upcoming, completed, and weak concepts.

CoverageItem and CoverageRecord: pedagogical coverage ledger. Coverage statuses include `planned`, `introduced`, `checked`, `mastered`, and `needs_review`.

MasteryEvaluator: governed read/judgment service that evaluates learner responses using the tutor question, learner answer, current objective, concept roles, mastery snapshot, selected context, and source evidence when relevant, then returns structured mastery evidence for reducers to apply. It uses deterministic rules for obvious signals and exact quiz-style scoring, LLM judgment for open-ended explanations and misconceptions, schema validation for all outputs, and deterministic fallback when LLM judgment fails or is uncertain. Mastery Evidence should be persisted as a durable audit record before reducer-applied mastery, coverage, weak-concept, or session-plan changes. Low-confidence or high-uncertainty evidence should trigger clarification, quick checks, or neutral/minimal updates rather than strong mastery changes. The evaluator does not directly mutate mastery, coverage, weak concepts, or session plans.

TutorSession, TutorTurn, AgentRun, ToolCall: runtime persistence model for conversational sessions, turns, model runs, and tool execution.

Study Activity Pulse: bounded, content-free signal that a visible learner surface had meaningful activity. The API coalesces pulses into Study Activity Intervals; raw pointer movement and browser-open time are not activity truth.

Activity Lease: server-owned inactivity boundary for an open Study Activity Interval or live Tutor Session. Expiry caps counted time and may pause the session lazily; it does not require continuous polling or an always-on sweeper.

EventEnvelope: append-only notebook event with monotonically increasing `sequenceNo`.

RuntimeStreamChunk and AG-UI event: two SSE-facing projections of runtime activity.

Surface Cue: idempotent, monotonic StudyAgent AG-UI event that associates Tutor Choreography with a Tutor Session, run, turn, and optional narration/tool sequence; requests semantic stage, focus, replace, dock, minimize, or dismiss behavior for a resolved Interactive Learning Surface; and carries references and placement intent rather than executable UI or pixel geometry. Clients acknowledge applied, deferred, or rejected with a bounded reason.

Choreography Snapshot: session-scoped recovery projection containing the latest cue sequence, Primary/Companion assignments, queued cues, and learner overrides. AG-UI snapshot/delta delivery can rebuild the Workspace Stage after reconnect without replaying transcript messages. It is not Canonical Learning State.

Deferred Work: non-immediate system work that is triggered by durable notebook events, persisted jobs, tutor actions, or explicit schedules. Deferred Work is not defined by continuous polling; polling is only one possible infrastructure adapter and should not be part of the product language.

Agentic Cache Entry: persisted, version-scoped cached context used by the agentic runtime for optional on-demand search acceleration (`tutor_turn.retrieval_plan`, `tutor_turn.retrieval_rows`). It is not canonical learner state and must be invalidated by source/corpus/search-material changes.

Agentic Cache Invalidation: event-driven removal of non-canonical tutor read caches after durable notebook-material changes. TTL expiry remains a storage and staleness backstop, not the primary correctness mechanism.

Boundary Signal: advisory tutor-facing runtime metadata that a source, session plan, or module boundary may have been reached; it carries a compact type, strength, summary, and evidence refs but does not hard-block source-backed tutoring.

Interactive Learning Action: validated learner interaction emitted by an Interactive Learning Block or MCP App Renderer. The API/runtime should treat it as a canonical action envelope with notebook, surface, block, reference, source/Evidence, and optional tutor session or turn identity. It should validate ownership, route durable outcomes through existing tool and reducer-governed writes, emit notebook events, and return updated surface state.

Observability Signal: structured information emitted for operational understanding. Metrics are bounded aggregate counters/gauges/histograms, traces are request/run/tool spans, logs are structured records, and durable events are product-domain audit facts. User, notebook, source, run, and trace identifiers should be used in traces/logs/events, not metric labels.

Metric Registry: in-process aggregate registry owned by the Observability Module. It records low-cardinality StudyAgent metrics and renders Prometheus text on demand. It is not a durable store and should not perform background flushes.

Correlation Context: request/run linkage propagated across HTTP response headers, runtime runs, structured logs, and durable agent/tutor event payloads. It carries trace and request identifiers such as W3C `traceparent`, `traceId`, `requestId`, `sessionId`, and `runId`; these identifiers are for drilldown, not metric labels. Ordinary read routes expose request correlation without creating durable telemetry rows.

Agent Observation Span: bounded trace observation for an agentic runtime phase such as tutor turn bootstrap, model generation, runtime thinking, tool call execution, durable event summary, on-demand cache operation, ingestion job, or LlamaParse PDF parse. It carries high-cardinality drilldown metadata in traces only and must not become a metric label source.

Runtime Work View: learner-visible live projection of Pi runtime activity during a tutor turn. It is chronological, not a fixed phase checklist. A turn may interleave Runtime Thinking Stream blocks, Runtime Narration text, Runtime Activity Steps (tool calls such as `wiki.search`), and a final Learner Response.

Runtime Thinking Stream: provider/Pi thinking tokens (`thinking_start` / `thinking_delta` / `thinking_end`) surfaced live to the Runtime Work View and traces. It is separate from assistant answer text. Pi `thinkingLevel` is enabled only when the active tutor model supports thinking; otherwise thinking stays off without error.

Runtime Narration: non-final assistant prose emitted while the runtime is still working (for example planning text before or between tool calls). It is natural language, not canned phase labels. Classification uses last-assistant-message-wins: every completed assistant message before the final assistant message in the agent loop becomes Runtime Narration (`agent.narration.completed`); only the final assistant message becomes the Learner Response.

Tool-only turn: a tutor turn whose agent loop ends after tool activity without a final assistant text message. Tool-only turns are valid; tutor chat may show Runtime Work View activity with no Learner Response bubble.

Runtime Activity Step: one operational action in the runtime timeline, typically a tool call lifecycle (`agent.tool.started` / `agent.tool.completed`) with summarized inputs/outputs.

Learner Response: the final assistant message shown in tutor chat history for the turn. Only `tutor.message.completed` is durably appended for assistant text; `tutor.message.delta` must not be traced or durably appended.

Runtime Work Replay: reconstruction of the Runtime Work View after a turn ends (or after refresh once completed steps exist). Replay uses bounded per-step durable events such as `agent.thinking.completed`, `agent.narration.completed`, and `agent.tool.started` / `agent.tool.completed`. It does not replay per-token assistant deltas.

Durable Event Trace Summary: one Langfuse observation per tutor turn that summarizes durable appends `{ eventTypes, counts, outcomes }` for that turn instead of creating a separate `durable_event.append` span for every row.

Managed Prompt: code-owned prompt definition that can be synced to Langfuse Prompt Management and fetched at runtime by name plus label or version. The tutor system prompt uses a local fallback when Langfuse is unconfigured or unavailable, and its compiled prompt fingerprint participates in Pi session invalidation.

Turn Bootstrap: minimal per-turn API setup before Pi runs — resolve/create tutor session, filter selected refs, create runtime run and tool registry, and compile a thin system prompt (role, mode, notebook identity, selected refs). Turn Bootstrap does not preload study state, personalization, or Corpus Retrieval. Notebook facts are fetched by the Pi runtime through read tools.

Pi Session Memory: in-process `livePiSessions` conversation state (`session.messages`) for an active tutor session. It preserves dialogue and in-thread tool results across turns until a binding change disposes the session. Binding changes are limited to selected refs, active mode, managed prompt fingerprint, tutor session id, notebook, or user — not ordinary notebook material updates such as mastery, plan, or source ingestion. Pi Session Memory is operational, not canonical notebook state.

Pi Session Rehydration: rebuilding Pi Session Memory from durable tutor transcripts when in-process memory is missing — API restart, pause/resume, binding disposal, or cache miss. Rehydration applies only to the same tutor `sessionId` being resumed. It replays a bounded window of recent `tutor_turns` into `session.messages` as dialogue plus compact tool summaries from `toolSummaryJson`. Default cap: 5 turns.

New Tutor Session: a freshly created `tutor_sessions` row with empty runtime context and empty Pi Session Memory. New sessions do not rehydrate prior sessions. Turn Bootstrap adds an explicit new-session instruction on the first turn: re-read current plan/objective through read tools before continuing; prior session chat is not in context.

Corpus Retrieval: notebook-scoped lexical, vector, or hybrid search over ingested source chunks and related knowledge rows. Corpus Retrieval is on-demand only — invoked by explicit search surfaces (`wiki.search` for the Pi runtime, `POST /search` for workspace UI), not during ordinary tutor turn preparation. When hybrid/embedding retrieval fails or times out, search falls back to lexical and returns annotated success (`retrievalMode: lexical_fallback`, `fallbackReason`) rather than failing the tool or hiding the degradation.

Tutor Retrieval Plan Cache: exact-input cache for optional retrieval-plan refinement inside on-demand search paths. It is keyed by normalized query, selected refs, objective/weak-concept cues, recent mistake cues, open artifact summary, and planner model identity. It is not part of turn preparation.

Tutor Retrieval Rows Cache: material-versioned cache for expanded retrieval rows returned by on-demand search. It is keyed by notebook, retrieval mode, normalized query, row limit, selected refs, objective-path concepts, embedding model settings, and source/search material version.

## Key Workflows

Source upload: API receives multipart upload, writes original object to S3-compatible storage, inserts `sources` and `source_versions`, appends `source.uploaded`, then queues Deferred Work for ingestion. Redis/BullMQ may be used as an optional queue adapter when configured; otherwise the ingestion job is persisted in Postgres and woken through the database-backed queue.

Tutor chat: resolve actor and notebook ownership, parse AG-UI request, run Turn Bootstrap, create runtime run, retain or replace Pi Session Memory when thin binding inputs change, persist turn/run rows, stream Runtime Work View and Learner Response events, append bounded durable step events, persist tool calls, update turn/runtime context, compact or draft session digest as needed. The Pi runtime loads notebook facts and Corpus Retrieval through read tools such as `study_plan.get_current`, `learning.get_state`, and `wiki.search`.

Tutor retrieval caches: optional on-demand caches inside `wiki.search` may use `agentic_cache_entries` under namespaces `tutor_turn.retrieval_plan` and `tutor_turn.retrieval_rows` for repeated identical searches. They are not part of Turn Bootstrap.

Tutor boundary signals: `study_plan.get_current` should expose cheap standing Boundary Signals for the active learning path, while `wiki.search` may add query-specific Boundary Signals or warnings when a requested source topic is not supported by returned source evidence. Matching should be topic/evidence-first, with source section numbers treated only as optional hints. These signals are advisory and should be reconciled with actual retrieved evidence.

Tutor cache invalidation: API write paths append durable notebook events and then best-effort invalidate on-demand retrieval row caches. Source/corpus/wiki/search-material events invalidate `tutor_turn.retrieval_rows`. Failed invalidation must not fail the durable write because material-versioned keys and TTL expiry remain correctness backstops.

Observability: HTTP request hooks record route/status/duration metrics. Tutor cache read/write/invalidation paths record namespace/operation/outcome metrics. Durable event append wrappers record event-family/type/outcome metrics. Worker ingestion paths record backend/outcome/duration metrics. Metrics must keep labels bounded; high-cardinality identifiers belong in traces, structured logs, or durable notebook events. Langfuse tracing is optional and no-op when credentials are absent.

Request correlation: the API server extracts incoming `traceparent` and request ID headers once in a Fastify request hook, stores the Correlation Context for the active request, returns correlation headers on ordinary responses, and exposes those headers through CORS.

Tutor correlation: tutor chat reuses the request Correlation Context, passes it into the runtime run, returns correlation headers on the SSE response, persists `agent_runs.trace_id`, and includes correlation fields in structured tutor logs and durable agent/tutor event payloads.

Tutor prompt management: tutor chat resolves the Managed Prompt after Turn Bootstrap, compiles it with thin notebook context and optional bootstrap instructions, passes the compiled system prompt into the runtime session, and records Managed Prompt metadata on the runtime run. The compiled prompt fingerprint participates in Pi session binding so sessions are replaced when the prompt content changes.

Agent trace instrumentation: tutor chat wraps the turn in `tutor.turn`, bootstrap in `tutor.turn.bootstrap`, model execution in `model.run`, runtime thinking inside `model.run`, each tool lifecycle in `tool.call` (including Corpus Retrieval via `wiki.search`), optional on-demand cache reads/writes in `cache.operation`, and one Durable Event Trace Summary per turn. These observations should summarize counts, status, usage, and IDs; they should not emit raw source chunks or token-by-token streams.

Mastery evaluation: the runtime should automatically evaluate eligible learner turns when the previous tutor turn asked a Mastery Check or quiz-like prompt. The tutor may also call `learning.evaluate_response` when it intentionally asks for an open-ended explanation, worked-problem attempt, self-reported confusion, or prior-knowledge signal.

Learner trait estimation: the runtime may record explicit preference/self-report Learner Trait Signals during tutoring, but inferred Learner Trait Estimates should be updated only when required at session/crystallization boundaries or by explicit Pi agentic decision. Trait estimation must not block ordinary live tutor turns and must not directly mutate mastery, curriculum, weak concepts, artifacts, or source grounding.

Source Scope Policy: optional UI hint for selected sources. Only `soft_source_scope` is supported; `strict_source_scope` is removed. Source focus is conveyed through selected refs and tutor behavior, not a hard pre-retrieval coverage gate.

Runtime execution: build a sectioned StudyAgent system prompt, bind registered tools to the Pi SDK with thinking enabled when the model supports it, enforce max tool calls, normalize snake_case tool args, validate input/output with Zod, stream Runtime Work View events live over SSE, map Pi lifecycle events to durable append inputs (excluding per-token assistant deltas), and map AG-UI events for the Learner Response stream.

Governed writes: write tools perform DB-scoped mutations, filter out-of-notebook refs/concepts, append domain events, and return accepted mutation metadata. Mastery Evidence should remain traceable separately from the reducer-applied learning, coverage, weak-concept, and session-plan updates it causes.

Session end: if no completed turn exists, complete session without crystallization. Otherwise create a final session digest artifact from last turn/runtime context and dispose cached runtime.

## Boundaries

- API/runtime depends on `@studyagent/search` for lexical/vector/hybrid retrieval and parent chunk expansion; it does not own ranking internals.
- API/runtime depends on `@studyagent/graph` for Neo4j projections/query helpers; it maps returned graph data into runtime tool payloads but does not own graph projection mechanics.
- API/runtime depends on `@studyagent/wiki-core` for confidence/reinforcement and claim helpers; it does not own wiki extraction/compilation logic.
- Source ingestion workers are outside this context. API/runtime queues ingestion and records events, but parsing/chunking/enrichment/indexing lives elsewhere.
- Object storage, Redis, and Postgres queue/listener mechanisms are infrastructure adapters created in app context, not domain logic. Postgres remains the default durable coordination layer for agentic runtime state, events, jobs, and cache entries; Redis/BullMQ is optional infrastructure for deployments that need it.
- Auth is currently local/dev-only via `DISABLE_AUTH`; production auth is not implemented here.
- `packages/schemas` is the shared contract boundary. Route/tool/runtime changes should update schemas/tests when wire shapes or event vocabularies change.
- `packages/db` is persistence ownership, but higher-level invariants are mostly enforced in API/tool providers and tests.

## Tests That Reveal Behavior

- `packages/agent-runtime/src/index.test.ts`
- `packages/agent-runtime/src/pi-session.test.ts`
- `packages/agent-runtime/src/stream.test.ts`
- `packages/tools/src/tool-contracts.test.ts`
- `packages/tools/src/index.test.ts`
- `packages/tools/src/writes.test.ts`
- `packages/schemas/src/schemas.test.ts`
- `apps/api/src/architecture-deepening.integration.test.ts`
- `apps/api/src/tutor-turn.test.ts`
- `apps/api/src/routes/tutor-chat.routes.test.ts`
- `apps/api/src/routes/tutor-lifecycle.routes.test.ts`
- `apps/api/src/routes/tutor.test.ts`
- `apps/api/src/regression-scenarios.test.ts`
- `apps/api/src/mastery-tutoring-regression.test.ts`
- `apps/api/src/mastery-curriculum-adaptation.test.ts`
- `apps/api/src/learner-progress.test.ts`
- `apps/api/src/tutor-context-selection.test.ts` (scoped retrieval helpers; turn-prep selection removed)
- `docs/archive/2026-h1/architecture/tutor-runtime-bootstrap-and-observability-implementation-plan.md` (historical implementation record)
- `apps/api/src/study-state.test.ts`
- `apps/api/src/tutor-write-provider.test.ts`
