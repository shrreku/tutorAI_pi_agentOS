# Hosted Beta Launch Plan

Status: implemented for the local Docker hosted-beta stack; external launch still requires live provider/domain credential verification.

This plan turns StudyAgent into a hosted product-validation beta under the temporary Working Brand **TutorBook** on `tutorbook.me`. The beta tests whether learners want a source-grounded study workspace: uploaded or pre-ingested material becomes a Notebook-backed Workspace with Source Wiki, Study Map, Live Plan, tutor sessions, Evidence, mastery checks, artifacts, feedback, and credits.

The goal is not to launch a generic AI tutor. The hosted beta should validate whether learners will log in, choose a source-backed Study Template, complete a meaningful tutor session, submit Learning Feedback, and ask for more access or credits.

Implementation tickets live in `docs/architecture/hosted-beta-launch-implementation-tickets.md`.

## Source Documents

Core domain and architecture references:

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

Current implementation anchors:

- `apps/api/src/auth.ts` contains the WorkOS sealed-session adapter plus a local/dev login path for Docker and tests.
- `apps/api/src/routes/notebooks.ts` already enforces notebook ownership once an actor is resolved.
- `apps/api/src/routes/sources.ts` uploads sources, stores originals, creates source/source-version rows, appends events, and queues ingestion jobs.
- `apps/worker/src/index.ts` already drains Postgres ingestion jobs through worker-owned processing.
- `packages/db/src/schema/tables.ts` already has users, notebooks, sources, source versions, events, sessions, artifacts, learning state, and worker job tables.
- `packages/observability/src/index.ts` already provides correlation, usage formatting, metrics, and optional Langfuse tracing helpers.

## Product Validation Model

Activation is the primary product signal.

An **Activated Learner** is a logged-in learner who starts from a Study Template, completes at least one tutor session with a Mastery Check or quiz interaction, and submits Learning Feedback.

The beta should measure:

- visitor to login conversion;
- login to Beta Consent completion;
- consent to template selection;
- template selection to Personal Learner Workspace creation;
- workspace creation to first tutor session;
- first tutor session to Mastery Check or quiz interaction;
- Mastery Check or quiz interaction to Learning Feedback submission;
- Trial Tutor Budget exhaustion;
- requests for Feedback Grants or Ingestion Access;
- successful and failed source ingestion for learners with Ingestion Access.

## Access Model

Anonymous users get **Public Preview Access** only. They can view landing, demo, contact, privacy, and terms pages. They cannot access real workspaces, tutor sessions, saved progress, source-backed study material, or credits.

Logged-in users get limited **Study Access**. They can use Published Study Templates and create Personal Learner Workspaces, subject to Usage Guardrails and Tutor Credits.

**Ingestion Access** is elevated and must be granted through the Admin Console or typed Access Codes. It lets trusted learners upload Private Learner Sources and enqueue On-Demand Ingestion. Ingestion Access does not allow publishing Study Templates.

**Access Codes** are typed grant bundles. They can grant Product Entitlements, Tutor Credits, Ingestion Credits, Study Template access, or pilot tags. Single-Use Access Codes are the default for risky grants. Campaign Access Codes require max redemptions and expiry.

## Identity Provider

Use WorkOS AuthKit for hosted identity, login, sessions, email verification, and user identity. Do not put StudyAgent product permissions, credits, or usage state into WorkOS roles for the MVP.

StudyAgent owns:

- Product Entitlements;
- Study Access and Ingestion Access;
- Credit Ledger;
- Access Codes and redemptions;
- Beta Consent;
- learner/workspace status;
- admin disablement;
- Learning Feedback and Support Reports.

Production auth uses WorkOS AuthKit sealed sessions. `DISABLE_AUTH=true` remains local/dev-only and production configuration fails closed if it is enabled.

## Credits And Payment

Build the **Credit Ledger** now. Disable self-serve paid checkout at first launch.

Launch defaults:

- Logged-in learners receive a one-time **Trial Tutor Budget** of `$1.00` cost-backed Tutor Credits.
- Learners see a **Credit Balance Indicator** as a percentage remaining, not dollars or tokens.
- Admins see exact internal cost details: model, provider, tokens, dollars, run ID, source/job ID, and ledger entries.
- Expensive work uses **Credit Reservation**: reserve before tutor/ingestion work starts, settle after actual usage, release unused reservation, and release or adjust failed work according to actual provider cost.
- **Credit Exhausted State** keeps read-only review available but blocks expensive actions such as new tutor turns, artifact generation, source upload, ingestion retry, and future Paid Credit Checkout.
- **Feedback Grants** can top up credits after useful Learning Feedback or observed real usage.

Future paid top-ups should use Stripe Checkout. Paid Credit Checkout remains disabled behind a feature flag until activation and demand justify charging. After payment confirmation, StudyAgent appends a payment-backed credit grant to the Credit Ledger.

## Hosted Surfaces

Public routes:

- `/`
- `/demo`
- `/contact`
- `/privacy`
- `/terms`
- `/login`
- `/auth/callback`

Protected learner routes:

- `/app`
- `/app/consent`
- `/app/templates/:templateId`
- `/app/workspaces/new?template=...`
- `/notebooks/:notebookId`
- `/app/credits`
- `/app/access-code`
- `/app/support`
- `/app/account`

Protected admin routes:

- `/admin`
- `/admin/users`
- `/admin/users/:userId`
- `/admin/workspaces`
- `/admin/templates`
- `/admin/access-codes`
- `/admin/credits`
- `/admin/feedback`
- `/admin/ingestion`
- `/admin/analytics`

Public and protected pages should live in the same `apps/web` application for the beta. Split marketing later only if the product needs it.

## Public Positioning

Use the temporary brand TutorBook. The landing page should position the product as:

> TutorBook turns your sources into a guided study workspace.

The primary CTA is `Start studying`, which sends the user to login. The secondary CTA is `View demo`, which opens a copy-only product explanation at `/demo`. Do not imply anonymous app access. An interactive embedded demo is not required for beta launch.

Avoid positioning as generic chat, generic AI tutor, or "upload anything and chat."

## Study Templates

Launch with at least 3 and at most 8 Published Study Templates. The operator publishes these via Admin Console per environment before opening the beta. Local Docker seeding creates three readiness-reviewed Published Study Templates so smoke and E2E verification are repeatable.

Template mix:

- one technical/math template;
- one conceptual science template;
- one humanities/social-science reading template;
- one exam-prep-style template if rights-safe material is available;
- one "how to use TutorBook/StudyAgent" meta template.

Every Published Study Template must pass:

- **Template Readiness**: ingestion completed, learner-readable Source Wiki and Study Map, first lesson/session works, at least one Mastery Check or quiz path exists, Evidence opens correctly, no obvious unsupported claims in the first path, admin smoke test completed.
- **Source Rights Review**: source material is allowed to be exposed to other learners.

Study Template cards should use **Study Template Summary** metadata:

- title/topic;
- Source Level;
- estimated time;
- best-fit study mode;
- expected learning outcome.

After login, learners land on a dashboard/template gallery first. A featured template is allowed, but users should choose. Use a skippable **Learner Onboarding Prompt** to ask what the learner is trying to study and rough level.

## On-Demand Ingestion

The free-first beta should not require an always-on ingestion worker.

Flow:

1. A learner with Ingestion Access uploads a Private Learner Source.
2. API stores original bytes in object storage and writes durable source/source-version rows.
3. API appends source and ingestion queued events.
4. API enqueues Postgres ingestion work.
5. API invokes a protected **Ingestion Trigger**.
6. The trigger starts a one-shot worker.
7. The one-shot worker claims ready jobs, processes bounded work, and exits.
8. Frontend shows **Ingestion Status** throughout.
9. Admin Console provides manual trigger/retry fallback.

Learner-facing Ingestion Status must include queued, processing, ready to study, failed, and retry-needed states.

Failure policy:

- learner gets one self-serve retry;
- repeated failure enters **Ingestion Review**;
- Admin Console shows failed/stalled jobs and trigger failures.

Launch Usage Guardrails:

- 5 Personal Learner Workspaces per learner;
- 10 queued Private Learner Sources per learner;
- 1 actively processing ingestion job per learner;
- 25 MB max file size;
- PDF, Markdown, and plain text first;
- admin override for trusted learners.

## Analytics, Feedback, And Monitoring

Use first-party **Product Analytics Events** as the source of truth. Mirror selected events to PostHog.

PostHog can receive identified learner properties such as name and email. Do not send uploaded source contents, tutor transcripts, source text, raw private learning-state detail, or private mastery details as ordinary analytics properties.

Enable **Study Workspace Replay** where free plan limits allow it, with masking configured. If replay reaches the free monthly cap or billing guard, stop replay while first-party Product Analytics Events continue.

Use Sentry for **Error Monitoring** across web, API, and worker. Scrub PII and source/tutor content.

Use Langfuse for LLM traces and prompt observability. Keep Langfuse optional/no-op when unconfigured.

Keep `/metrics` for operational metrics. Metrics must remain low-cardinality; user IDs, notebook IDs, run IDs, trace IDs, source IDs, and raw errors belong in traces/logs/events/admin views, not metric labels.

## Feedback And Support

Credit top-ups require useful **Learning Feedback**, not generic ratings alone.

Learning Feedback should capture:

- what the learner was trying to learn;
- whether TutorBook helped;
- where it failed or confused them;
- what they would have done instead;
- optional permission to contact them.

**Support Reports** should be typed:

- learning feedback;
- wrong/confusing tutor answer;
- ingestion/upload problem;
- privacy/delete request;
- credit/access problem;
- bug/UX issue.

Support Reports should attach safe operational context automatically: user ID, workspace ID, source/job IDs, session/run IDs, browser info, and optional screenshot/replay link. Do not attach raw source contents unless the learner explicitly includes them.

## Data, Privacy, And Consent

Gate first protected app entry with **Beta Consent**. It must disclose:

- TutorBook is experimental;
- AI outputs may be wrong;
- usage, identified analytics, and replay may be collected;
- uploaded sources are private but processed by third-party AI/storage services;
- feedback may be used to improve the product;
- product is not for high-stakes educational decisions.

Users must be able to delete Personal Learner Workspaces and Private Learner Sources. Full account deletion can be request-based for MVP because it touches WorkOS, StudyAgent DB, object storage, PostHog, traces/logs, and backups.

## Admin Console

The Admin Console is launch-critical. Minimum capabilities:

- overview of signups, activation, credit exhaustion, failed ingestion, and feedback queue;
- user list/detail;
- workspace list/detail;
- grant/revoke Ingestion Access;
- create/revoke Single-Use and Campaign Access Codes;
- grant/revoke/top up Tutor Credits and Ingestion Credits;
- review Learning Feedback and Support Reports;
- review ingestion queue/job state and trigger one-shot worker fallback;
- manage Study Template draft/published state;
- record Template Readiness and Source Rights Review;
- disable user/workspace if needed;
- view first-party analytics summaries.

## Deployment Shape

Free-first deployment target:

- Cloudflare DNS and Pages for static web where possible;
- Cloudflare R2 for object storage;
- Neon Free Postgres while limits allow;
- Neo4j AuraDB Free only if hosted graph projection is required for beta;
- DigitalOcean credits may host API/one-shot worker infrastructure;
- Render/Railway/Fly can be evaluated, but avoid surprise always-on cost.

The API, web, and worker process boundaries should remain explicit. One-shot worker execution can share the worker image/entrypoint but should run a bounded drain command rather than a permanent listener.

## Launch Checklist

Before external learners are admitted:

- WorkOS auth is live and local/dev auth is not exposed.
- Protected routes require authenticated actor.
- Product Entitlements gate Study Access, Ingestion Access, admin access, credits, and disabled states.
- Trial Tutor Budget is granted once per learner.
- Credit Reservation and settlement protect tutor turns and ingestion.
- Credit Exhausted State blocks expensive actions.
- Public routes exist and do not expose app data.
- Beta Consent gates first app entry.
- Template gallery contains 3-8 Published Study Templates.
- Every Published Study Template has Template Readiness and Source Rights Review recorded.
- Source uploads are private by default.
- Ingestion Status is visible and accurate.
- On-Demand Ingestion trigger and admin fallback work.
- PostHog events and replay are configured with masking and spend guard.
- Sentry is configured for web/API/worker.
- Langfuse remains optional and does not break app behavior.
- Support Reports and Learning Feedback can be submitted and reviewed.
- Learner Data Deletion supports workspace/source deletion and account deletion requests.
- Admin Console can disable user/workspace and revoke access.
- Deployment secrets are documented and rotated out of local defaults.
- Docker/host verification covers auth, template start, tutor session, credit debit, feedback, ingestion queue, and admin grant.

Current Docker verification on 2026-06-19:

- `GET /health` reports database and object storage OK, and reports provider reachability separately from fallback availability.
- With the current Docker stack, `/health` reports `provider: unreachable` and `providerFallback: local_fallback_available` because the OpenRouter host proxy is not running/reachable.
- A Docker API tutor-session probe completed with session/run headers and persisted events, but those events show `provider: local_fallback`; this verifies the route/session/fallback path, not real provider success.
- Before external launch, `/health` must report `provider: reachable`, and a hosted-like tutor turn must persist OpenRouter/provider-backed runtime events rather than `local_fallback`.
