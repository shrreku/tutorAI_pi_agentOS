# ADR-0011: Artifact Lifecycle, Consent, And Quality Gates

Status: Accepted

Date: 2026-05-15

## Context

Artifacts are durable generated learning objects, but not every generated object should become learner-visible content. Current schemas support typed artifact payloads, lifecycle statuses, learner artifact views, quality checks, consent settings, and artifact approval/rejection routes.

The current schema still includes compatibility/internal artifact types such as `teaching_arc`; learner-facing policy must distinguish storage compatibility from visible study aids.

## Decision

Learner-visible artifacts are generated study aids such as notes, quizzes, flashcards, worked examples, formula sheets, comparison pages, diagrams, revision plans, concept cards, and session digests.

Generated study aids should start as `draft` or `proposed` unless a per-type consent policy allows auto-creation. They become learner-ready only after typed quality gates pass. Internal planning outputs such as teaching arcs and session-plan structures may be stored for compatibility/debugging, but should not appear as normal learner artifacts.

Live Plan is adaptive study state, not an artifact.

## Consequences

- Artifact lists and graph views must filter internal, failed, rejected, archived, or draft-only objects in learner mode.
- Artifact renderers need type-specific quality checks instead of treating arbitrary JSON as polished content.
- Per-type consent and approval/rejection flows are part of tutor write policy.
- Legacy or internal artifact types require compatibility handling and learner-visibility guards.

## Current Implementation

- `packages/schemas/src/artifacts.ts` defines artifact types, statuses, payload schemas, learner artifact view shape, actions, and quality metadata.
- `apps/api/src/artifact-lifecycle.ts` is the Artifact Lifecycle Module: consent policy, transition validation, quality gates (`learnerSummary`, `developerDiagnostics`), learner visibility, and lifecycle metadata for routes and tool writes.
- `apps/api/src/artifact-view.ts` builds artifact views; quality is delegated to `decideArtifactQuality` from the lifecycle module.
- `apps/api/src/tutor-write-provider.ts` calls `resolveArtifactLifecycleOutcome` for every artifact write and emits matching `artifact.created` / `artifact.proposed` / `artifact.ready` events.
- `apps/api/src/routes/notebooks.ts` approve/reject/PATCH status routes use `applyArtifactLifecycleAction` and `validateArtifactTransition`.
- `apps/api/src/workspace-read-model.ts` uses `learnerVisibilityForArtifact` for Study Map artifact visibility.
- `apps/web/src/whiteboard-utils.ts` consumes server-side read-model visibility when present; legacy client filters remain only for responses without `readModel`.

## References

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
- `greenfield-studyagent/docs/15-reference-surfaces-artifacts-workspace-contract.md`
