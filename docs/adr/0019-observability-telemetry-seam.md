# ADR-0019: Observability and Telemetry Seam

Status: Accepted (amended 2026-06-06)

Date: 2026-06-05

## Amendment (2026-06-06)

Tutor observability now centers on **Runtime Work View** (thinking stream, narration, tool steps, learner response) and batched durable-event tracing. Turn-prep `host_context.load` and `context.retrieval` spans are removed. Per-token `tutor.message.delta` rows are not traced or durably appended.

See the historical implementation record at `docs/archive/2026-h1/architecture/tutor-runtime-bootstrap-and-observability-implementation-plan.md`.

## Context

StudyAgent needs operational visibility across HTTP routes, tutor turns, agentic caches, durable notebook events, ingestion jobs, search, LLM calls, Synthetic Learner evals, and worker pipelines. The system also needs prompt observability and prompt version control for the tutor system prompt. The system must preserve the zero-idle-cost direction from ADR-0018: observability should not require Redis polling, hosted background calls, or always-on telemetry export.

The codebase already has a small `@studyagent/observability` package for Langfuse/OpenTelemetry-style observations and usage formatting, but it did not yet own metrics, Prometheus exposition, or standard StudyAgent telemetry helpers.

## Decision

Use `@studyagent/observability` as the single telemetry seam for first-party instrumentation.

Expose low-cardinality in-process metrics through Prometheus text exposition at `/metrics`. This endpoint is pull-based: metrics are rendered only when scraped and no background network call is required.

Represent request/run linkage as a Correlation Context. The API server should extract W3C `traceparent` and request IDs once at the Fastify request boundary, return correlation headers on ordinary responses, and let agentic routes reuse that context. Routes that create agentic runs should propagate the trace ID into `agent_runs.trace_id` and include correlation fields in traces/logs/durable event payloads. Ordinary read routes should expose request correlation headers without creating durable telemetry rows. Correlation IDs must not become metric labels.

Keep Langfuse/OpenTelemetry tracing optional. When tracing credentials are absent, observations must be no-op and the product must continue normally. When tracing is enabled, traces should follow OpenTelemetry semantic conventions where applicable, including HTTP and GenAI conventions.

Use bounded Agent Observation Spans for the agentic runtime. The canonical span names are:

- `tutor.turn`
- `tutor.turn.bootstrap`
- `model.run` (includes Runtime Thinking Stream when enabled)
- `tool.call` (including Corpus Retrieval via `wiki.search` and `openrouter.embeddings` children)
- `durable_event.summary` (one per turn; replaces per-row `durable_event.append` trace nodes)
- `cache.operation` (on-demand retrieval caches inside `wiki.search` only)
- `ingestion.job`
- `llamaparse.pdf`

Removed span names (do not reintroduce without ADR):

- `tutor.turn.prepare`
- `host_context.load`
- `context.retrieval`
- per-row `durable_event.append` (metrics may still count append outcomes; trace uses `durable_event.summary`)

These spans may include high-cardinality identifiers such as notebook, user, session, run, request, and trace IDs because they are trace metadata, not metric labels. They should summarize inputs and outputs without sending full learner-visible prompts, raw retrieved source chunks, or per-token SSE chunks.

**Runtime Work View observability:**

- Stream thinking (`thinking_start` / `thinking_delta` / `thinking_end`), narration, tool steps, and learner response live over SSE.
- Persist bounded step events: `agent.thinking.completed`, `agent.narration.completed`, `agent.tool.started`, `agent.tool.completed`, `tutor.message.completed`.
- Do **not** persist or trace `tutor.message.delta`.
- Surface `wiki.search` embedding/hybrid fallback as annotated tool output (`retrievalMode: lexical_fallback`, `fallbackReason`) and in `tool.call` observations.

Use Langfuse Prompt Management for tutor system prompts, but make it an explicit operator action. Prompt definitions live in code with a local fallback. Operators sync them to Langfuse Cloud or a self-hosted Langfuse instance through an explicit script. Runtime requests fetch the configured prompt name by label or version, compile it with the current notebook prompt variables, and fall back to the local prompt if Langfuse credentials are absent, fetch fails, or the prompt is unavailable. The runtime must not create new prompt versions during API startup or ordinary tutor turns.

Separate signal purposes:

- Metrics: bounded aggregate counters, gauges, and histograms for alerting and dashboards.
- Traces: request, model, agent, retrieval, and tool execution detail.
- Logs: structured runtime diagnostics and failures.
- Durable notebook events: product-domain audit facts and UI/event-stream source of truth.

Metric labels must stay low-cardinality. Do not use notebook IDs, user IDs, source IDs, run IDs, trace IDs, raw routes, model prompts, or arbitrary error messages as labels.

## Consequences

- API and worker processes gain immediate local observability without requiring hosted telemetry.
- Future instrumentation should use the Observability Module rather than direct ad hoc counters or console-only diagnostics.
- Prometheus-compatible scraping is possible in Docker, production, or local development without changing runtime behavior.
- High-cardinality investigation remains available through traces/logs/events instead of inflating metric series cardinality.
- API responses now get request correlation headers through a global Fastify hook, and tutor chat runs preserve inbound `traceparent` trace IDs across SSE response headers, `agent_runs.trace_id`, structured logs, and durable agent/tutor event payloads.
- The first implementation covers HTTP request metrics, tutor cache metrics, durable event append metrics, ingestion job metrics, runtime memory gauges, and process uptime gauges.
- Langfuse Cloud can be used for agent, generation, tool, and thinking trace drilldown when credentials are configured, while local/dev and unconfigured deployments remain no-op.
- Tutor system prompts become dashboard-visible and versioned in Langfuse after explicit sync, while the code-owned local fallback remains the availability path.
- Prompt label changes or synced prompt content changes affect the Pi session binding fingerprint, so a cached hosted session is replaced when the system prompt changes.
- Learners see Runtime Work View activity in tutor chat; Dev Mode adds raw payloads and cross-turn drilldown.

## References

- ADR-0018: Postgres-first agentic coordination
- OpenTelemetry semantic conventions for HTTP and GenAI
- Prometheus text exposition format
- W3C Trace Context
- Langfuse Observability SDK
- Langfuse Prompt Management
- `docs/archive/2026-h1/architecture/tutor-runtime-bootstrap-and-observability-implementation-plan.md`
