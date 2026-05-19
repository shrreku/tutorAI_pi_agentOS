# ADR-0007: Append-Only Notebook Events And Stream Projections

Status: Accepted

Date: 2026-05-15

## Context

The web app, developer timeline, tutor stream, ingestion flow, graph refreshes, artifact lifecycle, and session lifecycle all need a shared integration log. Current code appends sequenced notebook events in Postgres and projects those events through notebook and session SSE endpoints.

## Decision

Use append-only, notebook-scoped events as the durable integration log. Event streams are projections of that log or runtime event mappings; they are not a separate source of truth.

Event envelopes must carry notebook scope, sequence number, timestamp, type, and payload. Runtime events can be mapped into AG-UI chunks or runtime stream chunks for clients.

## Consequences

- UI refresh and cache invalidation can be driven by event types.
- Debugging and developer timelines can inspect a single product log.
- Event type names become contracts and should be extended deliberately.
- Reordering or missing sequence numbers should be treated as stream/projection bugs.

## Current Implementation

- `packages/db/src/events.ts` appends notebook events with sequence numbers.
- `packages/schemas/src/events.ts` defines event and runtime stream schemas.
- `apps/api/src/routes/events-stream.ts` exposes notebook and session event streams.
- `packages/agent-runtime/src/pi-session.ts` maps runtime events to append inputs.
- `apps/web/src/App.tsx` and related web code subscribe to notebook events for refresh behavior.

## References

- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
- `greenfield-studyagent/docs/07-api-events-tools.md`
