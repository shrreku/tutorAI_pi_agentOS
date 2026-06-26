# TutorBook Hosted Beta — Frontend

This document describes the **TutorBook product shell** added for the hosted beta (ADR-0022–0024). It complements the notebook **Workspace** docs in `05-workspace-study-map-source-wiki.md` and `03-app-shell-and-navigation.md`.

The Working Brand is **TutorBook** on `tutorbook.me`. The study environment inside a notebook remains the StudyAgent Workspace (tutor + graph/reference surfaces).

## Two Shells

| Shell | URL prefix | Purpose |
|-------|------------|---------|
| **Public shell** | `/`, `/demo`, `/contact`, `/privacy`, `/terms`, `/login`, `/auth/callback` | Marketing, legal, auth entry. No private data. `/demo` is copy-only for beta launch. |
| **Learner app shell** | `/app/*` | Dashboard, consent, templates, credits, support, account. Sidebar nav via `AppShell`. |
| **Notebook Workspace** | `/notebooks/:notebookId` | Core two-pane study UI (`NotebookWorkspacePage`). Intentional long-term URL — aligned with ADR-0001 and `/api/v1/notebooks/*`. |
| **Admin console** | `/admin/*` | Operator surfaces via `AdminShell`. |
| **Eval runs** (dev) | `/eval-runs` | Synthetic learner dashboard; admin-gated. |

Entry flow:

```text
/  →  /login  →  /app/consent (first time)  →  /app (dashboard)
                                              →  /app/templates/:id  →  workspace create  →  /notebooks/:id
```

## URL Model

| Layer | Prefix | Role |
|-------|--------|------|
| App shell | `/app/*` | Start study, manage account, credits, support |
| Study shell | `/notebooks/:notebookId` | Core study loop for one Personal Learner Workspace |

`/notebooks/:notebookId` is the **intentional long-term** study URL, not a beta placeholder. It matches ADR-0001 notebook-scoped APIs (`/api/v1/notebooks/*`). `/app/workspaces/new` creates a workspace; the learner is then routed into `/notebooks/:notebookId` to study.

## Public Demo Page

`/demo` is **copy-only** for hosted beta launch — product explanation and screenshots-style prose, not a live workspace. This is intentional: real study requires login, Beta Consent, and Study Access. Interactive or embedded demos are post-launch polish, not a launch blocker.

Landing secondary CTA `View demo` routes here. Primary CTA `Start studying` routes to `/login`.

## Route Guards

Implemented in `apps/web/src/routing/RouteGuards.tsx` and `routes.ts`.

| Gate | Behavior |
|------|----------|
| Unauthenticated | Redirect to `/login` |
| Disabled account | Block with message |
| Missing Study Access | Redirect to `/login` |
| Missing Beta Consent | Redirect to `/app/consent` (all `/app/*` except consent, and `/notebooks/*`) |
| Missing admin access | Redirect to `/app` from `/admin/*` and `/eval-runs` |

Session state comes from `GET /api/v1/me` via `SessionProvider`. Credit percent appears in the app sidebar when available.

## Auth And API Proxying

| Surface | Dev (Vite) | Production (nginx) |
|---------|------------|-------------------|
| API | `/api` → API server | `/api/` → API server |
| Auth | `/auth` → API server | `/auth/` → API server |

Auth routes (`/auth/dev-login`, `/auth/callback`, `/auth/logout`, `/auth/session`) live **outside** `/api/v1`. The web dev server and nginx must proxy `/auth` — not only `/api`.

**Local Docker:** web on port **8080**, API on **4000**.

**Dev login:** On `localhost`, `/login` shows email + "Continue (dev)". Calls `POST /auth/dev-login`, stores session cookie, sets `tutorbook.devUserId` in `localStorage` for `X-User-Id` on API calls. In `DISABLE_AUTH` mode the API still enforces Beta Consent on learner routes; dev-login sessions resolve to the logged-in user (not always the seeded dev user).

**Hosted login:** WorkOS via `/api/v1/auth/workos/login` and `/auth/callback`.

## Learner App Pages

| Route | Component | Notes |
|-------|-----------|-------|
| `/app` | `DashboardPage` | Template gallery + optional onboarding prompt |
| `/app/consent` | `ConsentPage` | Versioned Beta Consent; required before other app routes |
| `/app/templates/:templateId` | `TemplateDetailPage` | Start from Published Study Template |
| `/app/workspaces/new` | `WorkspaceCreatePage` | Create empty Personal Learner Workspace (no template) |
| `/app/credits` | `CreditsPage` | Percent remaining; optional Stripe pack purchase when `PAID_CREDIT_CHECKOUT_ENABLED` |
| `/app/access-code` | `AccessCodePage` | Redeem Access Code |
| `/app/support` | `SupportPage` | Learning Feedback + Support Report forms |
| `/app/account` | `AccountPage` | Workspace/source deletion + account deletion request |

## Admin Console Pages

| Route | Component | Status |
|-------|-----------|--------|
| `/admin` | `AdminOverviewPage` | Live |
| `/admin/users`, `/admin/users/:userId` | `AdminUsersPage`, `AdminUserDetailPage` | Live; can grant/revoke Study Access, Ingestion Access, admin |
| `/admin/workspaces` | `AdminWorkspacesPage` | Live |
| `/admin/templates` | `AdminTemplatesPage` | Live |
| `/admin/access-codes` | `AdminAccessCodesPage` | Live; grant bundle includes pilot tags + template IDs |
| `/admin/credits` | `AdminCreditsPage` | Live |
| `/admin/feedback` | `AdminFeedbackPage` | Live |
| `/admin/ingestion` | `AdminIngestionPage` | Live |
| `/admin/analytics` | `AdminAnalyticsPage` | Live |
| `/admin/account-deletion` | `AdminAccountDeletionPage` | Live |

Admin UX is utilitarian: dense tables, minimal chrome.

## Notebook Workspace (unchanged shape)

`/notebooks/:notebookId` renders `NotebookWorkspacePage` — Tutor panel + Workspace split, source upload, graph, reference surfaces. Template-backed workspaces **read shared template content** via API federation (`contentNotebookId`); learner sessions, mastery, and artifacts stay on the learner shell notebook.

Workspace creation from a template uses `POST /api/v1/workspaces/from-template` — **not** `POST /api/v1/notebooks` with `studyTemplateId`.

## Credit Balance And Checkout

### Balance display

- Sidebar + `/app/credits`: show `percentRemaining` and exhausted state.
- `/api/v1/me` and `GET /api/v1/credits` return `percentRemaining` and `exhausted` only — no ledger cents.
- Do not show internal balance cents elsewhere in learner UI.

### Paid checkout (feature-flagged)

Controlled by `PAID_CREDIT_CHECKOUT_ENABLED` (default `false`). Requires `STRIPE_SECRET_KEY` and webhook secret when on.

| Step | API / UI |
|------|----------|
| List packs | `GET /api/v1/checkout/credits/packs` → `{ packs }` or `404 feature_disabled` |
| Start checkout | `POST /api/v1/checkout/credits` `{ packId }` → `{ checkoutUrl }` |
| Pay | Browser redirects to Stripe Checkout |
| Return success | `/app/credits?checkout=success` — banner + invalidate credits |
| Return cancel | `/app/credits?checkout=cancelled` — banner, no charge |
| Grant credits | Stripe webhook → ledger (async; UI warns of brief delay) |

Current packs (API-defined):

| Pack ID | Type | Price |
|---------|------|-------|
| `tutor_500` | Tutor credits | $5.00 |
| `ingestion_500` | Ingestion credits | $5.00 |

When checkout is off, `/app/credits` shows access-code / support fallback instead of pack list.

Implementation: `CreditsPage.tsx`, `routing/api.ts` (`fetchCreditCheckoutPacks`, `startCreditCheckout`), styles in `tutorbook.css` (`.tb-credit-pack-*`, `.tb-checkout-banner`).

## Analytics (client)

PostHog initializes after authenticated consent on protected routes (`apps/web/src/analytics/posthog.ts`). The API supplies the replay enablement, sample rate, and monthly spend-guard timestamp; first-party analytics continue when replay is disabled.

## Styling

- Global TutorBook styles: `apps/web/src/tutorbook.css`
- Study Workspace styles: `apps/web/src/study-shell.css`

## Verification

```bash
# Docker stack running
API_BASE=http://localhost:4000 WEB_BASE=http://localhost:8080 ./scripts/hosted-beta-verify.sh
```

Browser checklist:

1. Landing → Sign in → Consent → Dashboard
2. Credits shows percent remaining (not ledger cents)
3. With checkout enabled: pack list + Buy redirects to Stripe; success banner on return
4. Support forms load
5. Admin (if entitled) loads overview
6. Open `/notebooks/:id` for an existing workspace — tutor + Workspace render

## Known Gaps (frontend)

- **Template gallery empty** until the operator publishes 3–8 Study Templates via Admin Console (manual per-environment seeding; not repo-checked).
- **Full browser E2E** not in CI; smoke script covers API + public routes.
- **Notebook index** at `/notebooks` list is only via API/dashboard — no standalone `/notebooks` list page in the app shell.

## Implementation Anchors

```
apps/web/src/
  routing/
    AppRouter.tsx      # route → page mapping
    RouteGuards.tsx    # session, consent, entitlements
    routes.ts          # matchRoute, requiresConsent
    api.ts             # /api/v1 + rootApi for /auth
  pages/
    public/            # landing, login, legal, demo
    app/               # learner shell (CreditsPage, DashboardPage, …)
    admin/             # admin console
  NotebookWorkspacePage.tsx  # /notebooks/:id workspace
  tutorbook.css        # app shell + credits/checkout styles
  vite.config.ts       # proxy /api and /auth
```
