# API Runtime Context

The API/runtime context owns the notebook-scoped tutor runtime surface: HTTP routes, auth-scoped access checks, durable tutor/session persistence, event emission, SSE streaming, runtime tool registration, prompt construction, Pi session adaptation, and reducer-governed tutor writes.

It bridges product-facing notebook APIs with lower-level source ingestion, search, graph projection, wiki, and persistence packages.

## Owned Code

- `apps/api/src/server.ts`: Fastify server, app context, CORS/multipart setup, route registration, storage bootstrap, graceful shutdown.
- `apps/api/src/auth.ts`: local/dev actor resolution and notebook ownership checks.
- `apps/api/src/tutor-turn.ts`: Tutor Turn Module (`executeTutorTurn`) — run/turn persistence, streaming projection, crystallization, validated reducer persistence.
- `apps/api/src/routes/tutor.ts`: tutor chat route adapter (auth, SSE) delegating to the Tutor Turn Module.
- `apps/api/src/tutor-tool-provider.ts`: runtime read tools backed by DB/search/Neo4j/state selectors.
- `apps/api/src/tutor-write-provider.ts`: runtime write tools for claims, artifacts, planning updates, coverage changes, reducer metadata, and events.
- `apps/api/src/study-state.ts`: assembled study state and Live Plan data, including typed `sourceLevels` and `learnerReadiness` for tutor prompt construction.
- `packages/schemas/src/learning-levels.ts`: shared Source Level, Learner Readiness, and source-scope policy contracts.
- `packages/schemas/src/note-personalization.ts`: optional note personalization metadata and merge helpers.
- `packages/schemas/src/adaptive-plan-signals.ts`: adaptive plan signal vocabulary for durable session-plan changes.
- `packages/wiki-core/src/wiki-polish-queue.ts`: deterministic Source Wiki polish prioritization.
- `apps/api/src/wiki-polish.ts`: tutor-triggered wiki page repair enqueue.
- `apps/api/src/phase7.ts`: session digest, adaptive session plan patches, objective completion decisions.
- `apps/api/src/reference-surface.ts`: learner-facing Reference Surface and Evidence read-model construction for graph node open targets (`buildReferenceSurface`, `buildNodeEvidence`).
- `apps/api/src/artifact-lifecycle.ts`: Artifact Lifecycle Module for consent policy, valid status transitions, quality gates, learner visibility, route approve/reject actions, and tool-write lifecycle outcomes (`resolveArtifactLifecycleOutcome`, `applyArtifactLifecycleAction`, `decideArtifactQuality`).
- `apps/api/src/artifact-view.ts`: artifact payload normalization adapter consumed by the Reference Surface module; quality comes from the Artifact Lifecycle Module.
- `apps/api/src/workspace-read-model.ts`: Workspace Read Model for Study Map and Source Wiki (`buildStudyMapReadModel`, `buildSourceWikiReadModel`, learner visibility, emphasis, topic groups, reference-surface open targets, projection warnings/health).
- `packages/graph/src/graph-projection/*`: Graph Projection Module used by the worker for Neo4j writes and by graph routes for projection health reads.
- `apps/api/src/routes/graph.ts`: graph query (returns `readModel` on `study_map` / `source_wiki_map`), layout persistence, and thin delegates for `GET .../reference-surface` and `GET .../provenance`.
- `packages/agent-runtime/src/*`: runtime prompt/run/tool/session abstractions, Pi session adapter, stream mapping, compaction, failure classification.
- `packages/tools/src/*`: Tool Contract Module (`TOOL_CONTRACT_CATALOG`, `registerRuntimeToolsV1`, catalog coverage assertions, reducer validation helpers), tool registry, execution lifecycle events, timeout handling, LLM argument normalization.
- `packages/schemas/src/*`: shared Zod wire/domain contracts.
- `packages/db/src/*`: Drizzle schema and append-only notebook event sequencing.

## Public Contracts

API root: `/health` and `/api/v1/*`.

Core notebook routes cover notebooks, settings, study state, artifacts, wiki lint, sources, search, graph, student profile, tutor chat/session lifecycle, event streams, and developer timeline.

Tutor chat: `POST /api/v1/notebooks/:notebookId/tutor/chat`.

The tutor chat request follows an AG-UI-like shape:

- `messages`: chat messages
- `data.activeMode`: `learn`, `practice`, `revise`, `explore`, or `wiki_maintenance`
- `data.selectedNodeRefs`: selected graph/reference context
- `data.sourceScopePolicy`: `soft_source_scope` (default) or `strict_source_scope` when one or more sources are selected
- `data.sessionId`: optional existing tutor session
- `data.action`: `prompt`, `steer`, or `followUp`

The response is SSE with a custom `SESSION_STARTED` event, AG-UI run/text/tool events, and headers `X-StudyAgent-Session-Id` and `X-StudyAgent-Run-Id`.

Tutor lifecycle routes:

- `POST /api/v1/notebooks/:notebookId/tutor/session/pause`
- `POST /api/v1/notebooks/:notebookId/tutor/session/resume`
- `POST /api/v1/notebooks/:notebookId/tutor/session/end`
- `GET /api/v1/notebooks/:notebookId/tutor/sessions`

Event streams:

- `/api/v1/notebooks/:notebookId/events/stream` streams raw event envelopes by notebook sequence.
- `/api/v1/notebooks/:notebookId/sessions/:sessionId/events/stream` maps tutor runtime events into runtime stream chunks when possible.

Search: `POST /api/v1/notebooks/:notebookId/search` accepts `query`, `limit`, `mode` (`lexical`, `vector`, `hybrid`), optional `selectedNodeRefs`, `conceptIds`, and `expandParents`.

## Tool Contracts

Runtime tools are the most important internal API. Every tutor tool is declared once in `TOOL_CONTRACT_CATALOG` (`packages/tools/src/index.ts`, `packages/tools/src/writes.ts`) with input/output schemas, `operationKind` (`read` | `write`), `sideEffectClass`, `reducerExpectation`, and `providerMethod`.

Register tools through `createRuntimeToolRegistry` (which calls `registerRuntimeToolsV1`). `assertToolCatalogMatchesRegistry` fails tests when registry entries drift from the catalog. Write tools must return `reducerResult` payloads that pass `validateToolReducerOutput` (schema + expected `mutationType`).

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

ProvenanceRef: NodeRef plus a role such as `supports`, `derived_from`, `contradicts`, `supersedes`, or `generated_by`.

Claim: source-backed atomic knowledge unit with status, confidence, support, provenance, concept links, and reinforcement.

WikiPage: durable compiled reference page over claims/chunks.

Artifact: generated learning object. Some are learner-visible study aids; some are internal planning/teaching objects.

Curriculum, Module, ObjectiveList, Objective, SessionPlan: curriculum-first planning chain used to route tutor behavior.

StudyPlan: user-specific Live Plan state containing current, upcoming, completed, and weak concepts.

CoverageItem and CoverageRecord: pedagogical coverage ledger. Coverage statuses include `planned`, `introduced`, `checked`, `mastered`, and `needs_review`.

MasteryEvaluator: governed read/judgment service that evaluates learner responses using the tutor question, learner answer, current objective, concept roles, mastery snapshot, selected context, and source evidence when relevant, then returns structured mastery evidence for reducers to apply. It uses deterministic rules for obvious signals and exact quiz-style scoring, LLM judgment for open-ended explanations and misconceptions, schema validation for all outputs, and deterministic fallback when LLM judgment fails or is uncertain. Mastery Evidence should be persisted as a durable audit record before reducer-applied mastery, coverage, weak-concept, or session-plan changes. Low-confidence or high-uncertainty evidence should trigger clarification, quick checks, or neutral/minimal updates rather than strong mastery changes. The evaluator does not directly mutate mastery, coverage, weak concepts, or session plans.

TutorSession, TutorTurn, AgentRun, ToolCall: runtime persistence model for conversational sessions, turns, model runs, and tool execution.

EventEnvelope: append-only notebook event with monotonically increasing `sequenceNo`.

RuntimeStreamChunk and AG-UI event: two SSE-facing projections of runtime activity.

## Key Workflows

Source upload: API receives multipart upload, writes original object to S3-compatible storage, inserts `sources` and `source_versions`, appends `source.uploaded`, queues BullMQ ingestion when Redis is configured, otherwise emits `ingestion.job.failed`.

Tutor chat: resolve actor and notebook ownership, parse AG-UI request, get/create tutor session, load study state and selected artifact context, detect learner intent, select retrieval context, create runtime run, replace cached Pi session if material context changed, create tool registry, persist turn/run rows, stream AG-UI events, append durable events, persist tool calls, update turn/runtime context, compact or draft session digest as needed.

Mastery evaluation: the runtime should automatically evaluate eligible learner turns when the previous tutor turn asked a Mastery Check or quiz-like prompt. The tutor may also call `learning.evaluate_response` when it intentionally asks for an open-ended explanation, worked-problem attempt, self-reported confusion, or prior-knowledge signal.

Learner trait estimation: the runtime may record explicit preference/self-report Learner Trait Signals during tutoring, but inferred Learner Trait Estimates should be updated only when required at session/crystallization boundaries or by explicit Pi agentic decision. Trait estimation must not block ordinary live tutor turns and must not directly mutate mastery, curriculum, weak concepts, artifacts, or source grounding.

Context selection: combine learner message, selected refs, active objective, weak concepts, open artifact, previous runtime context, objective-path concept IDs, and retrieval results. Use hybrid retrieval when OpenRouter embeddings are available, lexical otherwise. Emit reasoning via `session.context.selected` or `session.context.selection_failed`.

Runtime execution: build a sectioned StudyAgent system prompt, bind registered tools to the Pi SDK, enforce max tool calls, normalize snake_case tool args, validate input/output with Zod, emit lifecycle events, map Pi events to durable event append inputs and AG-UI events.

Governed writes: write tools perform DB-scoped mutations, filter out-of-notebook refs/concepts, append domain events, and return accepted mutation metadata. Mastery Evidence should remain traceable separately from the reducer-applied learning, coverage, weak-concept, and session-plan updates it causes.

Session end: if no completed turn exists, complete session without crystallization. Otherwise create a final session digest artifact from last turn/runtime context and dispose cached runtime.

## Boundaries

- API/runtime depends on `@studyagent/search` for lexical/vector/hybrid retrieval and parent chunk expansion; it does not own ranking internals.
- API/runtime depends on `@studyagent/graph` for Neo4j projections/query helpers; it maps returned graph data into runtime tool payloads but does not own graph projection mechanics.
- API/runtime depends on `@studyagent/wiki-core` for confidence/reinforcement and claim helpers; it does not own wiki extraction/compilation logic.
- Source ingestion workers are outside this context. API/runtime queues ingestion and records events, but parsing/chunking/enrichment/indexing lives elsewhere.
- Object storage and Redis are infrastructure dependencies created in app context, not domain logic.
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
- `apps/api/src/tutor-context-selection.test.ts`
- `apps/api/src/study-state.test.ts`
- `apps/api/src/tutor-write-provider.test.ts`
