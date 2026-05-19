# ADR-0012: Tutor Session Lifecycle Separates Runs, Turns, Sessions, And Crystallization

Status: Accepted

Date: 2026-05-15

## Context

Tutor conversations are multi-turn learning sessions. Current code persists tutor sessions, turns, agent runs, tool calls, runtime context, session lifecycle events, compaction decisions, and session crystallization separately.

Creating a session digest after every assistant message would create artifact noise and blur the difference between a turn and a completed learning episode.

## Decision

Keep these lifecycle concepts separate:

- Run: one model/tool execution.
- Turn: one learner exchange inside a session.
- Session: a multi-turn tutoring episode with active, paused, resumed, ended, or completed state.
- Crystallization: explicit end or milestone process that turns session outcomes into durable digests, learning updates, artifacts, and next recommendations.

Session digests are not per-turn artifacts.

## Consequences

- Pause/resume/end routes are part of product state, not just UI convenience.
- Runtime replacement and compaction must preserve enough durable context to continue a session.
- Artifact creation should distinguish rolling internal digest drafts from learner-visible session digests.
- Tests need to cover lifecycle endpoints, event emission, run/turn persistence, and crystallization boundaries.

## Current Implementation

- `apps/api/src/routes/tutor.ts` persists tutor turns and agent runs, handles chat streaming, pause/resume/end routes, runtime context, compaction, and crystallization.
- `apps/api/src/phase7.ts` builds session digest payloads and adaptive session-plan patches.
- `packages/agent-runtime/src/compaction.ts` models compacted runtime context separately from durable session truth.
- `apps/web/src/TutorPanel.tsx` exposes active session controls and artifact/session UI.

## References

- `docs/contexts/api-runtime/CONTEXT.md`
- `greenfield-studyagent/docs/04-pi-agentic-harness.md`
- `greenfield-studyagent/docs/07-api-events-tools.md`
