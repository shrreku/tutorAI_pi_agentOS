# ADR-0004: Embedded Pi Runtime Is Operational, Not Canonical

Status: Accepted

Date: 2026-05-15

## Context

StudyAgent uses Pi for live tutor reasoning and tool orchestration. Current code embeds Pi through SDK packages and maps Pi events into StudyAgent events and AG-UI stream chunks. The API persists tutor sessions, turns, runs, tool calls, artifacts, and runtime context separately from Pi session memory.

## Decision

Use one embedded Pi-based tutor/wiki-steward runtime. Pi sessions are operational runtime adapters, not canonical product state.

StudyAgent storage is authoritative for durable session state, transcripts, tool logs, artifacts, planning state, learner state, and events. Before important runs or resumes, rehydrate context from StudyAgent storage instead of trusting Pi memory alone.

Do not introduce a parallel Python tutor harness or use the Pi CLI subprocess as the hosted runtime path.

## Consequences

- Runtime compaction and runtime replacement can be safe because product truth lives outside Pi memory.
- Hosted tutor sessions need explicit context assembly before runs.
- Pi session files, if ever used, are debug/replay artifacts only.
- The runtime adapter must translate Pi lifecycle/tool events into product events without making Pi internals the product API.

## Current Implementation

- `packages/agent-runtime/src/pi-session.ts` imports Pi SDK packages and runs embedded sessions.
- `packages/agent-runtime/src/index.ts` builds explicit StudyAgent prompt context and runtime run metadata.
- `apps/api/src/routes/tutor.ts` creates runtime runs, calls `replaceStudyAgentTutorRuntime`, persists turns/runs/tool calls, streams AG-UI events, and updates durable session state.

## References

- `docs/contexts/api-runtime/CONTEXT.md`
- `greenfield-studyagent/docs/04-pi-agentic-harness.md`
- `greenfield-studyagent/docs/13-pi-sdk-integration-and-runtime-amendments.md`
