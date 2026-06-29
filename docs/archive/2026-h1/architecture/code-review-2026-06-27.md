# Critical Code & System-Design Review — 2026-06-27

Full-project review of the StudyAgent / TutorBook monorepo (~93k LOC source, ~35k LOC
tests, 17 packages + 3 apps). Conducted as a multi-agent review across nine areas with
adversarial verification, plus independent manual reads of the security-critical paths.

## Verdict

This is a **mature, disciplined, security-conscious codebase**. The governance seam
(typed tools + reducers, Zod-validated tool I/O, notebook-scoped writes), the Postgres
job queue (`FOR UPDATE SKIP LOCKED` + stale-lock reclaim), per-notebook event sequencing
(`pg_advisory_xact_lock`), Stripe webhook verification, and credit double-spend protection
(`SELECT … FOR UPDATE`) are all correctly built. There are **no critical findings** and no
broken tests.

The high-severity findings are **not ~19 independent bugs**. They collapse into **two
root causes**:

1. **No transactional-outbox pattern.** Governed writes do `mutate row → appendEvent` as
   two separate transactions. A committed row whose event never lands silently diverges
   Postgres (system-of-record) from the event log that drives the Neo4j projection and SSE
   consumers. This single gap generates the tutor-write, mastery-pipeline, post-ingest
   bootstrap, and claim-reinforcement findings.
2. **No CI / schema-drift gate.** Nothing runs `check`/`lint`/`test` on PRs, and the
   integration suites silently `return` (report green) when their DB/Neo4j env is absent.
   This is why schema↔migration drift, the design-lab type errors, and 152 lint warnings
   could accumulate on a branch undetected.

Fix those two seams and most of the high-severity list closes.

## Baseline health (verified)

| Check                              | Result                                  |
| ---------------------------------- | --------------------------------------- |
| `pnpm check` (typecheck)           | ✅ pass                                 |
| `pnpm lint`                        | ✅ 0 errors, 152 unused-var warnings    |
| `pnpm format`                      | ✅ clean                                |
| `pnpm test`                        | ✅ 1098 passed / 170 files              |
| Integration tests (Postgres/Neo4j) | ⚠️ not run by default; silently skipped |
| CI                                 | ❌ none (added in this pass)            |

## What is genuinely strong (keep doing this)

- **Tool/reducer governance (ADR-0004/0005):** every write tool validates input _and_
  output with Zod, filters out-of-notebook refs, and returns reducer-result metadata.
- **Concurrency primitives:** advisory-lock event sequencing, `SKIP LOCKED` job claiming,
  row-locked credit reservations — textbook-correct.
- **Security posture:** consistent `requireOwnedNotebook` ownership checks, Stripe HMAC +
  timestamp + `timingSafeEqual` over a raw buffer, upload allowlist + size cap + server-
  generated object keys, `react-markdown` + KaTeX `trust:false` (no XSS), production CORS
  pinned to one origin, no hardcoded secrets, centralized Zod env schema with prod guards.

## Changes applied in this pass (all verified: check + lint + format + 1098 tests green)

| #   | Fix                                                                                                                                                                                      | File                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Stop sending `Authorization` / `Cookie` (session token) headers to Sentry on error; record presence flags only                                                                           | `apps/api/src/server.ts`                                        |
| 2   | Bound HTTP metric cardinality: unmatched routes log a constant `"unmatched"` label instead of the raw (attacker-controllable) URL path                                                   | `apps/api/src/server.ts`                                        |
| 3   | **IDOR fix:** PATCH student-profile no longer trusts a client-supplied `userId`; always writes for the authenticated owner                                                               | `apps/api/src/routes/student-profile.ts`                        |
| 4   | Remove broken `COPY greenfield-studyagent` (gitignored/absent → clean-checkout image build fails)                                                                                        | `infra/docker/Dockerfile`                                       |
| 5   | Gate the scratch `design-lab` Rollup entry behind `ENABLE_DESIGN_LAB`; it no longer ships to the production web image (still served in dev)                                              | `apps/web/vite.config.ts`                                       |
| 6   | Add a React `ErrorBoundary` around router content (keyed by route) so a render throw shows a recoverable fallback instead of white-screening the SPA; reports to Sentry                  | `apps/web/src/routing/ErrorBoundary.tsx`, `AppRouter.tsx`       |
| 7   | Fix Neo4j coverage-clear label casing (`CoverageItem`→`coverage_item`, `CoverageRecord`→`coverage_record`) so coverage nodes are actually cleared on source rebuild instead of orphaning | `packages/graph/src/graph-projection/clear-projection-scope.ts` |
| 8   | Add CI: format + typecheck + lint + test on PRs/main (Node 24, pnpm 10)                                                                                                                  | `.github/workflows/ci.yml`                                      |
| 9   | Pin `engines` (node ≥22, pnpm ≥10)                                                                                                                                                       | `package.json`                                                  |

> Note on #7: the Cypher change is correct against the verified projection labels, but
> Neo4j integration tests are env-gated and were not run locally. Validate under
> `RUN_NEO4J_INTEGRATION=1` before relying on it in production.

## Explicitly NOT changed (flagged for your decision)

- **Claim evidence mis-citation** (`packages/wiki-core/src/source-compilation.ts:466-471`).
  When the extraction LLM omits/garbles `evidenceChunkId`, the claim is cited to the
  document's _first_ chunk (confidence is lowered, but the citation is wrong). A reviewer
  flagged this as a data-integrity bug on the Evidence trust surface.
  **This contradicts the documented invariant in `docs/contexts/knowledge-graph/CONTEXT.md:107`**
  ("invalid or missing `evidenceChunkId` falls back to the first input chunk"). Worth
  reopening — a _wrong_ citation on a learner-trust surface is arguably worse than _no_
  citation — but it is a deliberate, documented decision, so it should be a team call, not
  a silent override. Suggested fix: store empty `evidenceChunkIds` + emit a
  `claim.missing_evidence` warning, and update the invariant.

## Prioritized roadmap (recommended, not applied)

### P0 — reliability & money correctness

1. **Transactional outbox for governed writes.** Wrap `row mutation + appendEvent(s)` in a
   single `db.transaction` (thread the tx client into `appendEvent`). Collapses the
   divergence findings in `tutor-write-artifacts.ts`, `tutor-write-curriculum.ts`,
   `tutor-write-coverage.ts`, `mastery-pipeline.ts`, and `post-ingest-enrichment.ts`.
2. **Make the post-ingest planning bootstrap atomic/idempotent**
   (`apps/worker/src/post-ingest-enrichment.ts:839+`). Today a mid-sequence crash leaves
   partial planning state that the `!existingPlan && !existingActiveCurriculum` guard then
   skips on retry. Wrap in a transaction or detect-and-complete partial chains.
3. **Dead-lettered ingestion leaves source status stuck at "processing" forever.** Wire the
   existing `terminalFailureStatus` helper into the non-retry branch so the learner sees
   `failed`/`ingestion_review`. (`apps/worker/src/index.ts`)
4. **Release credit reservations on tutor-turn failure/timeout**, and note that tool
   timeouts never cancel the underlying execution (`packages/tools/src/tool-execution.ts`)
   — a write completing after a reported timeout on a credit path is a money bug.

### P1 — operational readiness

5. **Extend CI** with a Postgres (with `pgvector`) + Neo4j integration job, and flip the
   `if (!shouldRun) return;` guards to `describe.skipIf`/hard-fail so silent green can't
   hide persistence bugs. Add a `drizzle-kit generate` drift check (schema↔migration parity).
6. **Add an ANN index on `chunks.embedding`** (`hnsw (embedding vector_cosine_ops)`).
   Vector search is currently a per-query full scan + sort — the most likely production
   performance cliff as corpora grow.
7. **Rate limiting.** No `@fastify/rate-limit` anywhere; every LLM-backed route is an
   unmetered cost-amplification vector. Add per-actor limits before public beta.
8. **Neo4j operational fixes:** wrap each projection plan in a Neo4j transaction (atomic),
   add uniqueness constraints on `curriculum_module`/`objective_list`/`session_plan`/
   `coverage_*` nodes, and stop creating/destroying a full driver per graph HTTP request
   (`apps/api/src/routes/graph.ts`) — reuse a pooled driver.

### P2 — correctness & hygiene

9. **Scope the snake_case→camelCase tool-input normalizer** so it stops rewriting keys
   inside opaque free-form JSON payloads (`packages/tools/src/tool-execution.ts:125`).
10. **Resolve schema/migration drift** (credit-ledger Stripe idempotency index, the
    "permanent vs active" generation-job idempotency index) and add a `UNIQUE`/partial
    index to back the Stripe idempotency key (defense against concurrent double-grant).
11. **RRF fusion** drops per-channel lexical signal for hybrid matches
    (`packages/search/src/rrf.ts`); preserve per-channel score details.
12. **Add `retry/backoff + non-JSON/429 handling`** to the OpenRouter JSON client.
13. **Repo hygiene:** ~18 MB of tracked binary scratch assets and overlapping unfinished UI
    dirs (`ui-example/`, `ui-preview/`, `design-variations/`, `apps/web/src/design-lab`).
    Decide what is handoff-canonical vs scratch and prune/relocate the rest (consider Git
    LFS for the PNGs). `vite ^6` is declared in `apps/web` but the tree resolves vite 8.

### P3 — maintainability

14. **Decompose the god-components.** `AgentTrace.tsx` (2782 lines) and `TutorPanel.tsx`
    (2611 lines) mix data derivation, view-model building, and rendering with dozens of
    hooks and brittle text-matching. Extract trace-parsing/view-model logic into pure,
    unit-testable modules. (The new ErrorBoundary now contains the blast radius.)

## Appendix — finding counts

55 findings: **0 critical, 19 high, 23 medium, 13 low** (52 confirmed under adversarial
verification; 3 refuted/downgraded). Full per-area detail available in the review run.
