# ADR-0003: Curriculum-First Tutor Behavior

Status: Accepted

Date: 2026-05-15

## Context

The product goal is professor-like tutoring inside a learning path, not open-ended chat. The tutor obtains curriculum and Live Plan state through read tools (`study_plan.get_current`, `learning.get_state`, etc.) and selected Workspace context rather than turn-prep preload.

## Decision

When a notebook is tutoring-ready and planning state exists, the tutor defaults to the active curriculum, current module, objective list, session plan, Live Plan, learner state, weak concepts, and selected Workspace context.

Ad hoc questions are allowed, but the tutor should answer them inside the broader curriculum path unless the learner explicitly switches to exploration.

## Consequences

- Curriculum-first behavior is enforced through system prompt rules and on-demand read tools, not turn-prep retrieval.
- Corpus search via `wiki.search` should respect selected refs and active objective context gathered through tools.
- The UI should make the active plan visible so the learner understands why the tutor is teaching a topic.
- Missing or weak planning state should be surfaced as incomplete planning, not hidden behind generic chat behavior.

## Current Implementation

- `packages/agent-runtime/src/index.ts` includes curriculum-first prompt sections instructing the tutor to read plan state through tools and teach the current objective path.
- `apps/api/src/routes/tutor.ts` runs Turn Bootstrap (session, run, refs, thin prompt) then delegates to the Pi runtime; notebook facts and `wiki.search` run on demand.
- `apps/web/src/TutorPanel.tsx` renders tutor modes, Runtime Work View, and session/study-state controls.

Historical implementation record: `docs/archive/2026-h1/architecture/tutor-runtime-bootstrap-and-observability-implementation-plan.md`.

## References

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `greenfield-studyagent/docs/11-curriculum-session-planning-and-professor-tutoring.md`
- `greenfield-studyagent/docs/12-planning-state-tools-and-pedagogical-artifacts.md`
