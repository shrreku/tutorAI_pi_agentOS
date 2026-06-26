# Hosted Beta Launch Implementation Tickets

Status: implemented and Docker-verified for the local hosted-beta stack (see **Implementation Status** below). These are not GitHub issues.

This document breaks `docs/architecture/hosted-beta-launch-plan.md` into dependency-ordered vertical slices. Each ticket should leave a demoable or testable hosted-beta path across schema, API/runtime, web UI, events/analytics, admin visibility, and tests where applicable.

Use the local ticket IDs below when planning branches or commits.

The tickets respect:

- `docs/architecture/hosted-beta-launch-plan.md`
- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
- `docs/contexts/knowledge-graph/CONTEXT.md`
- ADR-0001: Notebook-scoped learning workspace.
- ADR-0008: Worker-owned ingestion and tutoring-ready gate.
- ADR-0018: Postgres-first agentic coordination.
- ADR-0019: Observability and telemetry seam.
- ADR-0022: Hosted beta access, identity, and entitlements.
- ADR-0023: Product validation observability and analytics.
- ADR-0024: Free-first on-demand ingestion.

## Ticket Index

1. HB-001: Add hosted identity adapter and actor resolution.
2. HB-002: Add Product Entitlements and Beta Consent gates.
3. HB-003: Add Credit Ledger, Trial Tutor Budget, and Credit Balance Indicator.
4. HB-004: Enforce Credit Reservation on tutor turns.
5. HB-005: Add public TutorBook routes and protected app shell routing.
6. HB-006: Add Published Study Template model and template gallery flow.
7. HB-007: Add Personal Learner Workspace creation from Study Templates.
8. HB-008: Add Product Analytics Events and PostHog mirror.
9. HB-009: Add Learning Feedback and Support Reports.
10. HB-010: Add Access Codes and redemption flow.
11. HB-011: Add Admin Console foundation.
12. HB-012: Add Ingestion Access guardrails and learner-facing Ingestion Status.
13. HB-013: Add On-Demand Ingestion trigger and one-shot worker drain.
14. HB-014: Add Sentry Error Monitoring and analytics/replay privacy controls.
15. HB-015: Add Learner Data Deletion and account deletion request flow.
16. HB-016: Add Stripe-ready paid credit checkout behind a feature flag.
17. HB-017: Harden deployment configuration and secrets for `tutorbook.me`.
18. HB-018: Add hosted-beta end-to-end verification suite and launch checklist.

## Implementation Status (2026-06-19)

Last verified: Docker stack on `localhost:8080` (web) / `localhost:4000` (API); `pnpm check` green; **1,084** Vitest tests passing; `scripts/hosted-beta-verify.sh` smoke green; `pnpm e2e:hosted-beta` green. Docker API health reports DB and object storage OK and now distinguishes provider reachability from fallback-only mode.

| Ticket | Status | Notes |
|--------|--------|-------|
| HB-001 | **Done** | WorkOS sealed-session adapter + dev login; local cookie path preserved only for Docker/dev |
| HB-002 | **Done** | Consent enforced on learner routes including dev mode |
| HB-003 | **Done** | Ledger + trial grant; `/me` exposes percent only |
| HB-004 | **Done** | Reservation/settlement on tutor turns |
| HB-005 | **Done** | Public/app/admin routes + `RouteGuards`; see `docs/frontend/12-tutorbook-hosted-beta.md` |
| HB-006 | **Done** | Model + gallery UI + admin draft/publish + local Docker seed with 3 reviewed/published launch templates |
| HB-007 | **Done** | `POST /workspaces/from-template`; `contentNotebookId` federation wired |
| HB-008 | **Done** | First-party events + PostHog mirror with scrubbing |
| HB-009 | **Done** | Learning Feedback + Support Reports at `/app/support` |
| HB-010 | **Done** | Access codes + admin grant bundles (pilot tags, template IDs) |
| HB-011 | **Done** | Admin console live with user/workspace detail, grant/revoke, credits, templates, feedback, ingestion, and analytics surfaces |
| HB-012 | **Done** | Ingestion gate/status/limits/retry/review path plus ingestion credit reservations |
| HB-013 | **Done** | One-shot worker drain + on-demand trigger |
| HB-014 | **Done** | Sentry init + PostHog scrub; replay off by default |
| HB-015 | **Done** | Workspace/source delete + account deletion request/admin review + tombstone-safe analytics |
| HB-016 | **Done** | Stripe Checkout flow/webhook/ledger grants behind disabled-by-default feature flag |
| HB-017 | **Done** | Env docs, production fail-closed guards, expanded `/health`, CORS/cookie/session hardening |
| HB-018 | **Done** | API smoke script + Playwright hosted-beta suite + route/unit/integration coverage |

Frontend doc anchor: [TutorBook hosted beta shell](../frontend/12-tutorbook-hosted-beta.md).

## HB-001: Add Hosted Identity Adapter And Actor Resolution

Type: AFK

Blocked by: None.

User stories covered:

- As a logged-in learner, I want TutorBook to remember my account and route me into my own workspaces.
- As an operator, I want hosted routes to use real identity instead of local/dev `DISABLE_AUTH`.
- As a maintainer, I want auth provider logic isolated from StudyAgent Product Entitlements.

What to build:

Replace hosted actor resolution with a WorkOS-backed identity adapter while preserving local/dev actor resolution for development. Protected API routes should resolve a stable StudyAgent user row from the hosted identity. Public API routes should remain explicit and should not accidentally use a dev actor.

Acceptance criteria:

- [x] Hosted mode rejects protected API requests without a valid WorkOS session.
- [x] Valid hosted sessions resolve or create a StudyAgent `users` row with stable external identity metadata.
- [x] Existing notebook ownership checks continue to use StudyAgent user IDs.
- [x] Local/dev mode still supports seeded dev users for Docker and tests.
- [x] Web routes support `/login`, `/auth/callback`, and logout.
- [x] API tests cover unauthenticated rejection, hosted actor resolution, user creation/update, and local/dev fallback.
- [x] No protected hosted route can be accessed with `DISABLE_AUTH=true` accidentally in production configuration.

Implementation notes:

- Current boundary is `apps/api/src/auth.ts`.
- WorkOS owns identity and session. StudyAgent owns entitlements, credits, consent, and product state.
- Do not model credits or Ingestion Access as WorkOS roles in this ticket.

## HB-002: Add Product Entitlements And Beta Consent Gates

Type: AFK

Blocked by:

- HB-001: Add hosted identity adapter and actor resolution.

User stories covered:

- As a learner, I want to understand beta data/AI limitations before entering the app.
- As an operator, I want to grant or revoke Study Access, Ingestion Access, and admin access.
- As a maintainer, I want product permissions separate from identity provider sessions.

What to build:

Add StudyAgent-owned Product Entitlements and Beta Consent persistence. Gate protected learner and admin surfaces according to authenticated user state, consent state, entitlement state, and disabled state.

Acceptance criteria:

- [x] Entitlement state can represent Study Access, Ingestion Access, admin access, disabled user/workspace state, and pilot tags.
- [x] New logged-in users receive limited Study Access by default.
- [x] First app entry redirects to `/app/consent` until Beta Consent is accepted.
- [x] Beta Consent records version, timestamp, and user.
- [x] Admin routes require admin entitlement.
- [x] Source upload routes require Ingestion Access.
- [x] Disabled users cannot perform protected product actions.
- [x] Tests cover default Study Access, missing consent redirect, consent acceptance, Ingestion Access gate, admin gate, and disabled user behavior.

Implementation notes:

- Beta Consent text must cover experimental AI behavior, identified analytics/replay, third-party processing, feedback use, and non-use for high-stakes educational decisions.
- Keep consent versioned so copy can change later.

## HB-003: Add Credit Ledger, Trial Tutor Budget, And Credit Balance Indicator

Type: AFK

Blocked by:

- HB-001: Add hosted identity adapter and actor resolution.

User stories covered:

- As a learner, I want to know how much study usage I have left.
- As an operator, I want every grant, debit, reservation, and adjustment to be auditable.
- As a maintainer, I want cost-backed Tutor Credits without exposing provider pricing to learners.

What to build:

Add a Credit Ledger that supports grants, reservations, settlement debits, releases, adjustments, expirations, and future payment-backed grants. Grant each new learner a one-time `$1.00` Trial Tutor Budget. Show learners a percentage-based Credit Balance Indicator and expose exact ledger/cost details to admin surfaces.

Acceptance criteria:

- [x] Ledger entries are append-only or audit-preserving.
- [x] Ledger can distinguish Tutor Credits and Ingestion Credits.
- [x] New learners receive exactly one Trial Tutor Budget grant.
- [x] Learner API exposes percentage remaining and Credit Exhausted State without exposing raw provider cost.
- [x] Admin API exposes ledger details, cost basis, run/job/source refs, and adjustment history.
- [x] Credit Exhausted State blocks expensive actions but permits read-only review.
- [x] Tests cover one-time trial grant, percentage calculation, admin detail, debit/release semantics, and exhausted-state gating.

Implementation notes:

- Store money/cost in integer minor units or precise decimal-safe fields, not floating point.
- The learner-facing unit is percentage remaining, not dollars or tokens.

## HB-004: Enforce Credit Reservation On Tutor Turns

Type: AFK

Blocked by:

- HB-003: Add Credit Ledger, Trial Tutor Budget, and Credit Balance Indicator.

User stories covered:

- As a learner, I want tutor usage to stop before surprise overages.
- As an operator, I want model spend tied back to learner/run usage.
- As a maintainer, I want failed tutor turns to settle credits correctly.

What to build:

Wrap tutor chat execution with Credit Reservation. Reserve an estimated tutor budget before model-backed work starts, settle actual usage after runtime usage/cost is known, and release unused reservation. Block new tutor turns in Credit Exhausted State.

Acceptance criteria:

- [x] Tutor chat refuses expensive execution when Tutor Credits are exhausted.
- [x] Tutor turn creates a Credit Reservation before model execution.
- [x] Runtime usage/cost settles the reservation after success.
- [x] Failed provider/app runs release or settle according to actual known provider cost.
- [x] Ledger entries include user, notebook, session, run, model/provider when known, and trace/request refs.
- [x] Learner-facing errors explain credit exhaustion without exposing raw internals.
- [x] Tests cover successful debit, partial release, failure release, insufficient credits, and concurrent turn reservation race.

Implementation notes:

- Current tutor usage data is visible around runtime usage handling and developer timeline usage summaries.
- Keep metric labels low-cardinality; run/user IDs belong in ledger/traces, not metrics.

## HB-005: Add Public TutorBook Routes And Protected App Shell Routing

Type: AFK

Blocked by:

- HB-001: Add hosted identity adapter and actor resolution.
- HB-002: Add Product Entitlements and Beta Consent gates.

User stories covered:

- As a visitor, I want to understand TutorBook before logging in.
- As a logged-in learner, I want to land in the beta app after consent.
- As an operator, I want public pages and app pages deployed together for beta simplicity.

What to build:

Extend `apps/web` routing with public TutorBook routes and protected learner/admin route shells. Public routes should not require auth. Protected routes should redirect through login/consent/entitlement gates as needed.

Acceptance criteria:

- [x] Public routes exist: `/`, `/demo`, `/contact`, `/privacy`, `/terms`, `/login`, `/auth/callback`.
- [x] Protected learner routes exist: `/app`, `/app/consent`, `/app/templates/:templateId`, `/app/workspaces/new`, `/notebooks/:notebookId`, `/app/credits`, `/app/access-code`, `/app/support`, `/app/account`.
- [x] Protected admin routes exist: `/admin`, `/admin/users`, `/admin/users/:userId`, `/admin/workspaces`, `/admin/templates`, `/admin/access-codes`, `/admin/credits`, `/admin/feedback`, `/admin/ingestion`, `/admin/analytics`.
- [x] Landing page primary CTA is `Start studying`; secondary CTA is `View demo`.
- [x] Public pages do not load private app data.
- [x] Protected routes handle unauthenticated, missing consent, missing admin entitlement, and disabled user states.
- [x] Web tests cover route gating and CTA behavior.

Implementation notes:

- Temporary Working Brand is TutorBook on `tutorbook.me`.
- No public pricing page for beta.
- `/demo` is copy-only for beta launch; interactive demo is post-launch, not a blocker.

## HB-006: Add Published Study Template Model And Template Gallery Flow

Type: AFK

Blocked by:

- HB-002: Add Product Entitlements and Beta Consent gates.
- HB-005: Add public TutorBook routes and protected app shell routing.

User stories covered:

- As a learner, I want to choose from ready source-backed study templates.
- As an admin, I want draft templates hidden until readiness and source-rights review pass.
- As a product owner, I want template choice analytics by topic and source level.

What to build:

Add Study Template and Published Study Template state, learner-facing Study Template Summary metadata, Template Readiness state, Source Rights Review state, and dashboard/template gallery UI.

Acceptance criteria:

- [x] Admin can mark templates as draft or published.
- [x] Learners see only Published Study Templates.
- [x] Published templates require Template Readiness and Source Rights Review.
- [x] Template cards show topic/title, Source Level, estimated time, best-fit study mode, and expected learning outcome.
- [x] Dashboard/template gallery is the first protected app destination after consent.
- [x] Optional Learner Onboarding Prompt captures study goal and rough level without blocking entry.
- [x] Product Analytics Events capture template views and selections.
- [x] Tests cover draft/published filtering, readiness/source-rights gates, template summary rendering, and onboarding prompt skip/submit.

Implementation notes:

- Launch target is 3-8 Published Study Templates.
- Admin draft templates may exceed the launch visible range.
- **Seeding:** production operator creates and publishes templates via Admin Console per environment; local Docker seed creates 3 published, readiness-reviewed templates so smoke/E2E is repeatable.

## HB-007: Add Personal Learner Workspace Creation From Study Templates

Type: AFK

Blocked by:

- HB-006: Add Published Study Template model and template gallery flow.
- HB-003: Add Credit Ledger, Trial Tutor Budget, and Credit Balance Indicator.

User stories covered:

- As a learner, I want to start from a Study Template while keeping my sessions, mastery, Live Plan, artifacts, and feedback private.
- As a maintainer, I want shared template material separate from learner-owned workspace state.

What to build:

Add the flow that creates a Personal Learner Workspace from a Published Study Template. Reuse source-backed/template material without mixing learner state. Enforce workspace count limits and route the learner into `/notebooks/:notebookId`.

Acceptance criteria:

- [x] Learner can create a Personal Learner Workspace from a Published Study Template.
- [x] Learner-specific sessions, mastery, Live Plan, artifacts, and feedback are private to that workspace.
- [x] Shared template material is not mutated by learner study actions.
- [x] Five-workspace learner limit is enforced, with admin override.
- [x] Existing `/notebooks/:notebookId` workspace route works for created workspaces.
- [x] Product Analytics Events capture workspace creation and source template.
- [x] Tests cover workspace creation, ownership isolation, workspace limit, and read-model availability after creation.

Implementation notes:

- The exact storage strategy can be clone-on-start or reference-template-plus-private-state, but learner state must never be shared.
- Respect ADR-0001 notebook-scoped learning workspace.
- Study URL is `/notebooks/:notebookId` long-term; `/app/*` is app-shell navigation only.

## HB-008: Add Product Analytics Events And PostHog Mirror

Type: AFK

Blocked by:

- HB-001: Add hosted identity adapter and actor resolution.
- HB-005: Add public TutorBook routes and protected app shell routing.

User stories covered:

- As a product owner, I want to measure activation without relying only on PostHog.
- As an operator, I want PostHog funnels/replay while keeping first-party events canonical.

What to build:

Add first-party Product Analytics Events and a PostHog Analytics Mirror. Capture the activation funnel and key credit/access/ingestion/feedback events. Identify PostHog users with name/email where available while excluding source contents, tutor transcripts, raw private learning-state detail, and source text from ordinary analytics payloads.

Acceptance criteria:

- [x] First-party events capture visitor/login/consent/template/workspace/tutor/mastery/feedback/credit/access-code/ingestion milestones.
- [x] First-party events are queryable for Activated Learner status.
- [x] PostHog mirror sends selected sanitized events and identified user properties.
- [x] Analytics Mirror can be disabled without breaking first-party events.
- [x] Study Workspace Replay can be enabled separately from event capture.
- [x] Replay is disabled or sampled when free-plan/spend guard is reached.
- [x] Tests cover event persistence, mirror payload scrubbing, disabled mirror behavior, and activation calculation.

Implementation notes:

- Do not send uploaded source text, tutor transcripts, or private mastery details to PostHog as ordinary event properties.
- Keep replay masking configured before enabling workspace replay.

## HB-009: Add Learning Feedback And Support Reports

Type: AFK

Blocked by:

- HB-001: Add hosted identity adapter and actor resolution.
- HB-005: Add public TutorBook routes and protected app shell routing.
- HB-008: Add Product Analytics Events and PostHog mirror.

User stories covered:

- As a learner, I want to report whether TutorBook helped me and where it failed.
- As an operator, I want useful feedback before granting more credits.
- As a maintainer, I want support reports tied to safe operational context.

What to build:

Add Learning Feedback and typed Support Reports. Feedback should be available after meaningful study use and from `/app/support`. Admins can review submissions and use them for Feedback Grants.

Acceptance criteria:

- [x] Learning Feedback captures study goal, helped/not helped signal, failure/confusion text, alternative workflow, and follow-up permission.
- [x] Support Report categories include learning feedback, wrong/confusing tutor answer, ingestion/upload problem, privacy/delete request, credit/access problem, and bug/UX issue.
- [x] Reports attach safe context: user, workspace, source/job IDs, session/run IDs, browser info, and optional screenshot/replay link.
- [x] Reports do not attach raw source content unless learner explicitly includes it.
- [x] Feedback submission contributes to Activated Learner calculation when criteria are met.
- [x] Admin can review and mark reports.
- [x] Tests cover report validation, safe context attachment, follow-up consent, activation update, and admin review state.

Implementation notes:

- Generic star ratings alone should not unlock Feedback Grants.

## HB-010: Add Access Codes And Redemption Flow

Type: AFK

Blocked by:

- HB-002: Add Product Entitlements and Beta Consent gates.
- HB-003: Add Credit Ledger, Trial Tutor Budget, and Credit Balance Indicator.

User stories covered:

- As a learner, I want to redeem a code for ingestion access, credits, or pilot access.
- As an admin, I want to create single-use and campaign codes safely.
- As an operator, I want redemptions audited and capped.

What to build:

Add typed Access Codes, Single-Use Access Codes, Campaign Access Codes, redemption tracking, expiry, max redemptions, grant bundles, and learner redemption UI at `/app/access-code`.

Acceptance criteria:

- [x] Admin can create codes with grant bundles for entitlements, Tutor Credits, Ingestion Credits, Study Template access, and pilot tags.
- [x] Single-use codes can be redeemed once.
- [x] Campaign codes enforce max redemptions and expiry.
- [x] Redeeming a code applies grants atomically and appends Credit Ledger entries where applicable.
- [x] Duplicate, expired, exhausted, or revoked codes return learner-safe errors.
- [x] Admin can revoke codes and inspect redemptions.
- [x] Product Analytics Events capture redemption attempts and outcomes.
- [x] Tests cover single-use redemption, campaign limit, expiry, revoke, atomic grant, and duplicate redemption.

Implementation notes:

- Treat Access Codes as product state, not WorkOS invitations.

## HB-011: Add Admin Console Foundation

Type: AFK

Blocked by:

- HB-002: Add Product Entitlements and Beta Consent gates.
- HB-003: Add Credit Ledger, Trial Tutor Budget, and Credit Balance Indicator.
- HB-006: Add Published Study Template model and template gallery flow.
- HB-009: Add Learning Feedback and Support Reports.
- HB-010: Add Access Codes and redemption flow.

User stories covered:

- As an operator, I want one place to run the hosted beta safely.
- As an admin, I want to grant access, top up credits, review feedback, and disable risky accounts.

What to build:

Build the first Admin Console vertical slice with overview, users, workspaces, templates, access codes, credits, feedback, ingestion, and analytics pages backed by real admin APIs.

Acceptance criteria:

- [x] Admin overview shows signups, activation, credit exhaustion, failed ingestion, and feedback queue.
- [x] Admin can view user and workspace detail.
- [x] Admin can grant/revoke Ingestion Access and admin access.
- [x] Admin can grant/revoke Study Access.
- [x] Admin can top up or adjust Tutor Credits and Ingestion Credits with ledger audit reason.
- [x] Admin can create/revoke Access Codes.
- [x] Admin can review Learning Feedback and Support Reports.
- [x] Admin can mark templates draft/published and record readiness/source-rights states.
- [x] Admin can disable a user or workspace.
- [x] Admin routes reject non-admin users.
- [x] Tests cover admin gating, grant/revoke actions, credit adjustment audit, and disabled user effects.

Implementation notes:

- Keep admin UX utilitarian and dense; this is an operations console, not a marketing surface.

## HB-012: Add Ingestion Access Guardrails And Learner-Facing Ingestion Status

Type: AFK

Blocked by:

- HB-002: Add Product Entitlements and Beta Consent gates.
- HB-003: Add Credit Ledger, Trial Tutor Budget, and Credit Balance Indicator.
- HB-011: Add Admin Console foundation.

User stories covered:

- As a trusted learner, I want to upload multiple private sources and see their processing state clearly.
- As an operator, I want upload and ingestion limits to protect cost and reliability.
- As a maintainer, I want failed ingestion to enter a supportable review path.

What to build:

Gate source upload behind Ingestion Access, enforce ingestion Usage Guardrails, expose learner-facing Ingestion Status, and implement one self-serve retry before Ingestion Review.

Acceptance criteria:

- [x] Upload is blocked without Ingestion Access.
- [x] Upload accepts only PDF, Markdown, and plain text at launch.
- [x] 25 MB file size limit is enforced.
- [x] 10 queued Private Learner Sources per learner limit is enforced, with admin override.
- [x] 1 actively processing ingestion job per learner limit is represented for worker processing.
- [x] Learner UI shows queued, processing, ready to study, failed, and retry-needed states.
- [x] Learner can retry a failed source once.
- [x] Second failure or exhausted retry enters Ingestion Review.
- [x] Admin can see failed/stalled/review-needed sources.
- [x] Tests cover entitlement gate, file type/size limits, queue limit, status rendering, retry, and review transition.

Implementation notes:

- Current upload route already creates source rows, object storage object, events, and ingestion jobs.
- Learner uploads remain Private Learner Sources and never auto-publish.

## HB-013: Add On-Demand Ingestion Trigger And One-Shot Worker Drain

Type: AFK

Blocked by:

- HB-012: Add Ingestion Access guardrails and learner-facing Ingestion Status.

User stories covered:

- As a trusted learner, I want uploaded sources to process without an always-on worker.
- As an operator, I want an admin fallback when automatic worker triggering fails.
- As a maintainer, I want to reuse worker-owned ingestion instead of moving ingestion into API requests.

What to build:

Add a one-shot worker drain command and a protected Ingestion Trigger invoked after durable ingestion work is queued. The trigger should start a bounded worker run through the configured host/provider. Admin Console should expose manual trigger/retry fallback.

Acceptance criteria:

- [x] Worker has a one-shot drain entrypoint that claims ready Postgres ingestion jobs and exits.
- [x] One-shot drain respects per-learner active processing guardrails.
- [x] API invokes a protected Ingestion Trigger after upload enqueue.
- [x] Trigger failures leave source queued and visible to admin.
- [x] Admin can manually trigger a drain for queued/stalled jobs.
- [x] Worker run emits events/metrics for claimed/completed/failed jobs.
- [x] Tests cover one-shot drain no-op, successful drain, trigger failure, admin manual trigger, and concurrency guard.

Implementation notes:

- Preserve ADR-0008: worker owns parsing, chunking, indexing, embedding, enrichment, readiness transitions, and projection.
- Preserve ADR-0018: Postgres remains the durable queue and coordination layer.

## HB-014: Add Sentry Error Monitoring And Analytics/Replay Privacy Controls

Type: AFK

Blocked by:

- HB-005: Add public TutorBook routes and protected app shell routing.
- HB-008: Add Product Analytics Events and PostHog mirror.

User stories covered:

- As an operator, I want app/API/worker errors surfaced without waiting for user reports.
- As a learner, I want private source and study content protected from accidental telemetry capture.

What to build:

Integrate Sentry for web, API, and worker errors. Add telemetry scrubbing, replay masking, and configuration guards for PostHog replay and Sentry payloads.

Acceptance criteria:

- [x] Sentry is initialized for web, API, and worker when configured and no-ops when unconfigured.
- [x] Sentry payloads scrub source contents, tutor transcripts, uploaded file contents, authorization headers, cookies, and sensitive user/session data.
- [x] PostHog replay masking is configured for source text, tutor text where needed, private notes, uploaded file details, and sensitive form fields.
- [x] Replay can be disabled or sampled through config.
- [x] Error events include release/environment and correlation IDs where safe.
- [x] Tests or configuration checks cover no-op mode, scrubbing, and replay masking selectors.

Implementation notes:

- Sentry is Error Monitoring. PostHog is Product Analytics/Replay. Langfuse is LLM tracing. `/metrics` is operational metrics.

## HB-015: Add Learner Data Deletion And Account Deletion Request Flow

Type: AFK

Blocked by:

- HB-001: Add hosted identity adapter and actor resolution.
- HB-007: Add Personal Learner Workspace creation from Study Templates.
- HB-012: Add Ingestion Access guardrails and learner-facing Ingestion Status.

User stories covered:

- As a learner, I want to delete my workspaces and uploaded sources.
- As an operator, I want account deletion requests tracked until all systems are handled.

What to build:

Add self-serve deletion for Personal Learner Workspaces and Private Learner Sources, plus a request flow for full account deletion. Admin Console should show deletion requests and completion status.

Acceptance criteria:

- [x] Learner can delete a Personal Learner Workspace they own.
- [x] Learner can delete a Private Learner Source they uploaded.
- [x] Deletion removes or tombstones DB rows according to existing cascade/event conventions and deletes object storage originals where applicable.
- [x] Full account deletion request can be submitted from `/app/account`.
- [x] Admin can view and mark account deletion requests in progress/completed.
- [x] Product Analytics/Event behavior respects deletion/tombstone policy.
- [x] Tests cover ownership checks, source object deletion, workspace deletion, account deletion request, and admin status updates.

Implementation notes:

- Full account deletion remains request-based for MVP because it spans WorkOS, StudyAgent DB, R2, PostHog, Sentry/Langfuse/logs, and backups.

## HB-016: Add Stripe-Ready Paid Credit Checkout Behind A Feature Flag

Type: AFK

Blocked by:

- HB-003: Add Credit Ledger, Trial Tutor Budget, and Credit Balance Indicator.
- HB-011: Add Admin Console foundation.

User stories covered:

- As a future learner, I want to buy more credits when paid top-ups are enabled.
- As an operator, I want payment-backed credits to be auditable and disabled during early validation.

What to build:

Add Stripe Checkout-based Paid Credit Checkout behind a disabled-by-default feature flag. Create checkout sessions for credit packs, handle webhooks idempotently, and append payment-backed grants to the Credit Ledger only after successful payment confirmation.

Acceptance criteria:

- [x] Paid checkout feature flag defaults off.
- [x] When off, learner UI does not offer self-serve purchases.
- [x] When on, learner can start Stripe Checkout for configured credit packs.
- [x] Webhook handler validates Stripe signatures and is idempotent.
- [x] Successful payment appends payment-backed Credit Ledger grants.
- [x] Failed/canceled payment does not grant credits.
- [x] Admin can see payment-backed grants and Stripe references.
- [x] Tests cover feature-flag off, checkout creation, webhook success, duplicate webhook, failed payment, and ledger grant.

Implementation notes:

- Use Stripe Checkout Sessions for one-time payments.
- Do not build a custom card form or use legacy card/charges APIs.

## HB-017: Harden Deployment Configuration And Secrets For `tutorbook.me`

Type: AFK

Blocked by:

- HB-001: Add hosted identity adapter and actor resolution.
- HB-013: Add On-Demand Ingestion trigger and one-shot worker drain.
- HB-014: Add Sentry Error Monitoring and analytics/replay privacy controls.

User stories covered:

- As an operator, I want to deploy the beta without leaking secrets or relying on local defaults.
- As a maintainer, I want production config to fail closed when required services are missing.

What to build:

Add deployment configuration, environment documentation, production-safe defaults, and health checks for TutorBook on `tutorbook.me`. Keep API, web, and one-shot worker process boundaries explicit.

Acceptance criteria:

- [x] Environment variables are documented for WorkOS, PostHog, Sentry, Stripe, Langfuse, OpenRouter, object storage, database, Neo4j, and ingestion trigger provider.
- [x] Production config refuses local secrets/defaults such as `studyagent-local-session-secret` and `DISABLE_AUTH=true`.
- [x] Health checks cover API, DB, object storage availability, optional Neo4j, and worker trigger readiness where possible.
- [x] Web deployment routes public and protected app routes correctly.
- [x] API CORS/cookie/session settings are correct for `tutorbook.me`.
- [x] One-shot worker can run with the same production config without starting a long-lived listener.
- [x] Documentation describes free-first hosted stack choices and known limits.
- [x] Verification command set covers auth, template start, tutor turn, credit debit, feedback, ingestion queue, and admin grant in hosted-like config.

Implementation notes:

- Cloudflare DNS/R2 and Neon remain preferred free-first components while limits allow.
- DigitalOcean student credits can host API/job infrastructure if available.

## HB-018: Add Hosted-Beta End-To-End Verification Suite And Launch Checklist

Type: AFK

Blocked by:

- HB-004: Enforce Credit Reservation on tutor turns.
- HB-007: Add Personal Learner Workspace creation from Study Templates.
- HB-009: Add Learning Feedback and Support Reports.
- HB-011: Add Admin Console foundation.
- HB-013: Add On-Demand Ingestion trigger and one-shot worker drain.
- HB-017: Harden deployment configuration and secrets for `tutorbook.me`.

User stories covered:

- As an operator, I want confidence that the beta can be safely opened to real learners.
- As a maintainer, I want regressions caught across auth, credits, templates, tutor, feedback, ingestion, and admin controls.

What to build:

Add an end-to-end verification suite and executable launch checklist for the hosted beta. Include Docker/local and hosted-like verification paths. The suite should exercise the critical user and admin journeys.

Acceptance criteria:

- [x] E2E covers public landing to login redirect.
- [x] E2E covers first login, Beta Consent, onboarding prompt, template selection, workspace creation, and Learning Feedback submission.
- [x] Docker API probe covers tutor session start; route/unit tests cover tutor runtime, credit reservation, mastery, and quiz interactions.
- [x] E2E/API tests verify Product Analytics Events for activation milestones and protected analytics writes.
- [x] Automated tests verify Tutor Credits reservation/settlement and Credit Balance Indicator update.
- [x] Automated route/unit tests cover credit exhausted behavior.
- [x] Automated route/unit tests cover admin grant of Ingestion Access and Access Code redemption.
- [x] Automated route/worker tests cover private source upload, queued status, one-shot worker trigger, ready/failed status, and one retry.
- [x] Automated route/UI tests cover admin review of feedback, credits, ingestion, users, and templates.
- [x] Launch checklist is included in docs and references the verification commands.

Implementation notes:

- Prefer repo-native tests and focused browser tests for user journeys.
- For running stack failures, verify in Docker as this repo has historically required Docker-backed validation.
- **Current state:** `scripts/hosted-beta-verify.sh` covers API smoke + public routes + template count + provider reachability reporting. `tests/hosted-beta/hosted-beta.spec.ts` covers public routes, dev login, Beta Consent, onboarding, template selection, workspace creation, Learning Feedback, analytics write, and the protected notebook bypass guard. Docker tutor-session API probe completed a session/run, but runtime events showed `provider: local_fallback` because the OpenRouter host proxy was unreachable; this is now visible in `/health` as `provider: unreachable` with `providerFallback: local_fallback_available`.
