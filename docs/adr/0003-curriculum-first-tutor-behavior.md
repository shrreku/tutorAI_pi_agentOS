# ADR-0003: Curriculum-First Tutor Behavior

Status: Accepted

Date: 2026-05-15

## Context

The product goal is professor-like tutoring inside a learning path, not open-ended chat. The current runtime prompt and API route assemble study state, selected refs, objective context, learner state, and context-selection reasoning before each tutor run.

## Decision

When a notebook is tutoring-ready and planning state exists, the tutor defaults to the active curriculum, current module, objective list, session plan, Live Plan, learner state, weak concepts, and selected Workspace context.

Ad hoc questions are allowed, but the tutor should answer them inside the broader curriculum path unless the learner explicitly switches to exploration.

## Consequences

- Study state loading and prompt construction are part of tutor correctness.
- Context selection must prefer active objective and session-plan evidence before generic retrieval.
- The UI should make the active plan visible so the learner understands why the tutor is teaching a topic.
- Missing or weak planning state should be surfaced as incomplete planning, not hidden behind generic chat behavior.

## Current Implementation

- `packages/agent-runtime/src/index.ts` includes curriculum-first prompt sections and prompt context fields for curriculum, module, objective list, session plan, current objective, upcoming objectives, study plan, and learner state.
- `apps/api/src/routes/tutor.ts` loads `loadNotebookStudyState`, selected artifact context, intent routing, and `selectContextForTutor` before a run.
- `apps/web/src/TutorPanel.tsx` renders tutor modes and session/study-state controls.

## References

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `greenfield-studyagent/docs/11-curriculum-session-planning-and-professor-tutoring.md`
- `greenfield-studyagent/docs/12-planning-state-tools-and-pedagogical-artifacts.md`
