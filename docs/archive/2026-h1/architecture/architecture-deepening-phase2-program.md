# Architecture Deepening Phase 2 Program

Status: **complete for runtime slices** (2026-06-03). Optional follow-ups: physical DB table file split, further TutorPanel/FullPanelViewer fetch consolidation.

Phase 1 (`architecture-deepening-implementation-tickets.md`) introduced the seven deepening Modules. Phase 2 completes **interface depth**, removes legacy buckets, and fixes cross-cutting seams identified in the 2026-06 architecture review.

## Tracking

| ID    | Candidate                                               | Status       | Primary files                                                                                                                         |
| ----- | ------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Tutor Session Access                                    | **Done**     | `apps/api/src/tutor-session-store.ts`                                                                                                 |
| 2     | Retire `phase7` naming / split modules                  | **Done**     | `curriculum-adaptation.ts`, `tutor-session-crystallization.ts`, `assessment-artifacts.ts`, `learning-outcome.ts`; `phase7.ts` removed |
| 3     | Unified Objective Progression                           | **Done**     | `apps/api/src/objective-progression.ts`, `tutor-turn.ts`                                                                              |
| 4     | Split Tutor Write Tool Provider                         | **Done**     | `tutor-write-*.ts`, thin `tutor-write-provider.ts`                                                                                    |
| 5     | Node Open Target (Reference Surface + Evidence)         | **Done**     | `node-open-target.ts` resolves concept/wiki/artifact/source; `buildReferenceSurface` + `buildNodeEvidence` use shared resolver        |
| 6     | Turn Bootstrap                                          | **Done**     | `tutor-turn-preparation.ts`                                                                                                           |
| 7     | Pi session + Tool Contract package split                | **Done**     | `packages/agent-runtime/src/pi-*.ts`, `packages/tools/src/tool-contracts.ts`, `tool-execution.ts`                                     |
| 8     | Learner Trait consolidation                             | **Done**     | `learner-trait-signals.ts`; `learner-trait/index.ts` barrel wired in lifecycle/turn paths                                             |
| 9     | Live Workspace SSE refresh                              | **Done**     | `notebook-workspace-sync.ts`, `App.tsx` (dead `SourcesBar` removed)                                                                   |
| 10–11 | Web shell slim + authoritative surface actions          | **Done**     | `Whiteboard` uses `useWorkspaceShell`; `notebook-queries.ts`; Vite `eval-runner` alias                                                |
| 12–15 | Worker pipeline, readiness, graph semantics, projection | **Partial**  | readiness engine + `coverage-seed`; projection SQL scoping not split                                                                  |
| 16    | Typed Event Contract + refresh                          | **Done**     | `wiki.*` / `tutor.*` payload schemas; prefix refresh policy                                                                           |
| 17    | Eval runner package                                     | **Done**     | `packages/eval-runner/`; persistence types in `synthetic-learner-evals-persistence-types.ts`                                          |
| 18    | DB schema split                                         | **Deferred** | `packages/db/src/schema/tables.ts`; shallow domain re-exports removed                                                                 |

## Legacy removed

- `apps/api/src/phase7.ts`
- `apps/api/src/learner-trait-explicit-signals.ts`
- `packages/graph/src/graph-semantics.ts` (package re-export; use `@studyagent/schemas` / wiki-core)
- Eval runner implementation files moved out of `packages/schemas` (tests stay in schemas with `@studyagent/eval-runner` devDep)

## Verification

Per slice: targeted unit tests + `apps/api/src/architecture-deepening.integration.test.ts` where cross-module.

```bash
pnpm --filter @studyagent/schemas run build
pnpm --filter @studyagent/eval-runner run build
pnpm exec vitest run apps/api/src/deepening-modules.test.ts apps/api/src/architecture-deepening.integration.test.ts \
  packages/schemas/src/synthetic-learner-evals.runner.test.ts packages/agent-runtime/src/pi-session.test.ts \
  packages/tools/src/index.test.ts apps/web/src/EvalRunsDashboard.test.tsx --reporter=dot
```
