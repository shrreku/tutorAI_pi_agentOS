# Hosted Beta Deploy Checklist

Status: draft launch checklist for TutorBook hosted beta.

Use this with:

- `docs/deployment/hosted-beta-env.md`
- ADR-0022: Hosted beta access, identity, and entitlements
- ADR-0023: Product validation observability and analytics
- ADR-0018: Postgres-first agentic coordination
- ADR-0024: Free-first on-demand ingestion

The implemented launch plan and local ticket packet are retained under `docs/archive/2026-h1/architecture/` as historical context.

## Recommended Launch Shape

Start with this shape unless a provider limit forces a change:

- **Repository**: private GitHub repository with protected `main`.
- **Web**: static `apps/web` build, served from a CDN/static component or the Docker `web` target.
- **Routing**: same public origin for web, API, and auth paths:
  - `https://tutorbook.me/*` serves the static SPA.
  - `https://tutorbook.me/api/*` proxies to Fastify API `/api/*`.
  - `https://tutorbook.me/auth/*` proxies to Fastify API `/auth/*`.
- **API**: long-lived Fastify service from the Docker `runtime` target.
- **Database**: Supabase Postgres with `pgvector` enabled.
- **Queue**: Postgres-backed ingestion jobs first; no Redis/Valkey by default.
- **Worker**: one-shot worker drain, not an always-on worker:
  - `node apps/worker/dist/index.js --one-shot --max-jobs=$INGESTION_TRIGGER_MAX_JOBS`
- **Object storage**: S3-compatible private bucket, such as DigitalOcean Spaces, Cloudflare R2, or compatible Supabase Storage if S3 protocol is enabled for the project.
- **Redis/Valkey**: add only after queue volume or latency proves Postgres coordination is insufficient.

## Why Static Web Is The Right First Deployment

The current `apps/web` app is a Vite SPA. It does not need a Node web runtime for server rendering, per-request loaders, or backend-only secrets. The backend-owned state is already behind Fastify API routes, and the browser bundle calls relative API paths with `credentials: "include"`.

Static web buys us:

- fewer always-on processes;
- cheaper CDN/static hosting;
- cacheable immutable assets;
- simpler rollback by promoting a previous asset build;
- a hard boundary where secrets stay in API/worker env, not in the web runtime.

Static does **not** mean the app is public or unauthenticated. The protected app routes are client-rendered, but real data access still goes through server-side API authorization.

Launch caveat: current web code calls relative `/api/v1/*`, and login points at `/api/v1/auth/workos/login`; the WorkOS callback is expected at `/auth/callback`. For production, configure same-origin routing so `/api/*` and `/auth/*` are proxied from `tutorbook.me` to the API. If you instead host API only at `api.tutorbook.me`, add a frontend API base URL and re-check WorkOS cookie/CORS/callback behavior before launch.

## Queue And Calls Strategy For Monthly Limits

Do not solve monthly limits by adding Redis first. The repo already has durable Postgres ingestion jobs, credit reservations, upload caps, and a one-shot worker. Use those controls first.

Production defaults for a tight hosted beta:

```bash
INGESTION_TRIGGER_MODE=external
INGESTION_TRIGGER_MAX_JOBS=1
INGESTION_TRIGGER_MIN_INTERVAL_SECONDS=300
MAX_WORKSPACES_PER_LEARNER=5
MAX_QUEUED_SOURCES_PER_LEARNER=10
MAX_UPLOAD_BYTES=26214400
TRIAL_TUTOR_BUDGET_CENTS=100
POSTHOG_REPLAY_ENABLED=false
```

Operating model:

- Keep the default learner path on pre-ingested Published Study Templates. That avoids per-learner ingestion calls.
- Gate Private Learner Source uploads behind Ingestion Access.
- Queue every upload in Postgres and return quickly with learner-visible status.
- Coalesce upload/retry bursts with `INGESTION_TRIGGER_MIN_INTERVAL_SECONDS`.
- Drain only `INGESTION_TRIGGER_MAX_JOBS` per one-shot run while limits are tight.
- Keep one active ingestion job per learner and ten queued private sources per learner.
- Add a scheduled fallback drain every 15, 30, or 60 minutes, depending on provider limits.
- Keep admin manual trigger available for stuck jobs.
- Use credit reservation before expensive tutor or ingestion work.
- Turn replay and optional traces down before reducing first-party product events.

DigitalOcean App Platform jobs are scheduled, non-routable processes. They cannot directly be the `INGESTION_TRIGGER_URL` target. Use one of these patterns:

- **Lowest cost / lowest frequency**: set `INGESTION_TRIGGER_MODE=disabled` and run a scheduled App Platform job every 30-60 minutes.
- **Balanced beta**: set `INGESTION_TRIGGER_MODE=external`, point `INGESTION_TRIGGER_URL` at a tiny authenticated trigger service/function, and have that trigger start or dispatch the one-shot worker command. Keep debounce at 60-300 seconds.
- **Higher throughput**: run a long-lived worker with Postgres or Redis/Valkey only after beta usage proves the need.

Redis/Valkey is justified when:

- one-shot drains are too slow for actual beta usage;
- Postgres queue contention shows up in metrics;
- delayed retries, rate limits, or queue dashboards are worth another managed service;
- you can afford the command volume and idle cost.

Until then, Redis/Valkey adds operational surface without reducing LLM/parser call spend.

## Repository And Security

- [ ] Make `shrreku/tutorAI_pi_agentOS` private before adding production secrets.
- [ ] Audit collaborators and remove stale access.
- [ ] Enable secret scanning and push protection.
- [ ] Protect `main` with required PR checks.
- [ ] Require at least one review before merge.
- [ ] Require branches to be up to date before merge if CI is stable enough.
- [ ] Disable direct pushes to `main` except emergency owner override.
- [ ] Store provider credentials in GitHub Actions environment secrets, not repository files.
- [ ] Use separate `staging` and `production` GitHub environments.
- [ ] Put production deployment behind an environment approval gate.

## CI Checks

Required PR checks:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
RUN_POSTGRES_INTEGRATION=1 pnpm test
pnpm build
git diff --check
```

Required hosted-beta smoke checks:

```bash
./scripts/hosted-beta-verify.sh
pnpm e2e:hosted-beta
```

If `pnpm e2e:hosted-beta` runs in CI, install Playwright browsers in the runner image or use a Playwright base image. The API container alone is not enough for browser E2E.

## CI/CD Release Flow

- [ ] CI builds the production Docker image using `infra/docker/Dockerfile`.
- [ ] Build API/worker image from target `runtime`.
- [ ] Build web image from target `web` only if not using provider-native static assets.
- [ ] Pass `VITE_*` values at web build time.
- [ ] Push images to GHCR or DigitalOcean Container Registry.
- [ ] Run migrations as an explicit pre-deploy job.
- [ ] Deploy API after migrations pass.
- [ ] Deploy web assets after API health is green.
- [ ] Run one-shot worker smoke after API deploy.
- [ ] Run hosted-beta verification against deployed URLs.
- [ ] Keep rollback documented: previous API image, previous web build, and database rollback/forward plan.

Runtime commands:

```bash
# API service
node apps/api/dist/index.js

# One-shot worker
node apps/worker/dist/index.js --one-shot --max-jobs=$INGESTION_TRIGGER_MAX_JOBS

# Migration job
pnpm --filter @studyagent/db migrate
```

## DigitalOcean

- [ ] Create a DigitalOcean team/project for TutorBook.
- [ ] Add billing alerts and project-level spend monitoring.
- [ ] Use App Platform for API if managed PaaS simplicity is worth the cost.
- [ ] Configure the API as a web service from the `runtime` image.
- [ ] Configure health check at `GET /health`.
- [ ] Configure static web as an App Platform static site or use the Docker `web` target.
- [ ] Configure routes so `/api/*` and `/auth/*` reach the API.
- [ ] If using App Platform jobs, remember they are scheduled and not HTTP-routable.
- [ ] If using DigitalOcean Container Registry, restrict write tokens to CI.
- [ ] If using DigitalOcean Spaces, keep the bucket private and use S3-compatible env vars.
- [ ] If adding Redis-compatible infrastructure on DigitalOcean, use managed Valkey.

## Supabase

- [ ] Create a Supabase project in the closest practical region to the API.
- [ ] Enable the `vector` extension for embeddings.
- [ ] Run all Drizzle migrations against the production database.
- [ ] Use a connection string compatible with the runtime path.
- [ ] Prefer direct or session-pooler connections for API/worker paths that use Postgres `LISTEN/NOTIFY`.
- [ ] Use transaction pooler only after event streaming and worker notification paths are tested.
- [ ] Confirm backups and retention before external beta.
- [ ] Export a migration/restore drill before launch.
- [ ] Add database alerts for connection count, storage, CPU, and failed connections.
- [ ] Do not rely on Supabase client-side RLS for app authorization in this beta; Fastify remains the authorization boundary.

## Backend Environment

Set these on API and worker unless noted:

- [ ] `DATABASE_URL`
- [ ] `NODE_ENV=production`
- [ ] `SESSION_SECRET`
- [ ] `DISABLE_AUTH=false`
- [ ] `PUBLIC_WEB_BASE_URL=https://tutorbook.me`
- [ ] `PUBLIC_API_BASE_URL=https://api.tutorbook.me` or the chosen API origin
- [ ] `WORKOS_API_KEY`
- [ ] `WORKOS_CLIENT_ID`
- [ ] `WORKOS_REDIRECT_URI=https://tutorbook.me/auth/callback`
- [ ] `WORKOS_COOKIE_PASSWORD`
- [ ] `OBJECT_STORAGE_ENDPOINT`
- [ ] `OBJECT_STORAGE_BUCKET`
- [ ] `OBJECT_STORAGE_ACCESS_KEY`
- [ ] `OBJECT_STORAGE_SECRET_KEY`
- [ ] `OBJECT_STORAGE_REGION`
- [ ] `OPENROUTER_API_KEY`
- [ ] `DEFAULT_TUTOR_MODEL`
- [ ] `DEFAULT_EXTRACTION_MODEL`
- [ ] `EMBEDDING_API_BASE_URL` if not using OpenRouter-compatible default
- [ ] `EMBEDDING_MODEL`
- [ ] `LLAMAPARSE_API_KEY` if PDF parsing requires LlamaParse
- [ ] `INGESTION_TRIGGER_MODE`
- [ ] `INGESTION_TRIGGER_URL` and `INGESTION_TRIGGER_TOKEN` when mode is `external`
- [ ] `INGESTION_TRIGGER_MAX_JOBS`
- [ ] `INGESTION_TRIGGER_MIN_INTERVAL_SECONDS`
- [ ] `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`
- [ ] `POSTHOG_API_KEY`, `POSTHOG_HOST`
- [ ] `POSTHOG_REPLAY_ENABLED=false` until masking and limits are verified
- [ ] `LANGFUSE_*` only if traces are intentionally enabled
- [ ] `STRIPE_*` only if paid checkout is enabled

## Frontend Environment

These are build-time values for the static bundle:

- [ ] `VITE_SENTRY_DSN`
- [ ] `VITE_SENTRY_ENVIRONMENT=production`
- [ ] `VITE_SENTRY_RELEASE`
- [ ] `VITE_POSTHOG_API_KEY` if browser PostHog/replay is enabled
- [ ] `VITE_POSTHOG_HOST`

Static routing:

- [ ] All SPA routes fall back to `index.html`.
- [ ] `/api/*` proxies to Fastify API.
- [ ] `/auth/*` proxies to Fastify API.
- [ ] Long-running API streams have buffering disabled and long read timeouts.
- [ ] TLS is active before WorkOS callback testing.

## Auth And Cookies

- [ ] WorkOS application callback is exactly `https://tutorbook.me/auth/callback`.
- [ ] API env uses the same `WORKOS_REDIRECT_URI`.
- [ ] `DISABLE_AUTH=true` is impossible in production.
- [ ] Dev login is not exposed in production.
- [ ] Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`.
- [ ] Login, callback, `/api/v1/me`, and logout are tested in a clean browser profile.
- [ ] If using split origins, re-test CORS credentials, cookie domain behavior, and callback exchange before launch.

## Study Templates

- [ ] Publish 3-8 Study Templates before external traffic.
- [ ] Every published template has real ready source content, not metadata-only seed rows.
- [ ] Every published template passes Template Readiness.
- [ ] Every published template has Source Rights Review recorded.
- [ ] Learner template list hides incomplete templates.
- [ ] Admin publish rejects incomplete templates.
- [ ] First lesson/session works for every published template.
- [ ] Evidence links open correctly.
- [ ] At least one mastery check or quiz path works per template.

## Object Storage

- [ ] Bucket is private.
- [ ] API and worker can `HeadBucket` in production.
- [ ] Upload lifecycle/retention policy is defined.
- [ ] Large object and failed upload cleanup is defined.
- [ ] CORS allows only required origins if direct browser storage access is introduced later.
- [ ] No uploaded source content is mirrored into analytics events.

## Observability And Spend Controls

- [ ] `GET /health` is green for database, object storage, auth, ingestion trigger, and provider health.
- [ ] Sentry receives API, worker, and web test errors.
- [ ] PostHog receives only approved product events.
- [ ] Replay remains disabled or sampled until masking is verified.
- [ ] Langfuse is optional and failing Langfuse does not break tutor turns.
- [ ] OpenRouter/provider spend limit is set outside the app.
- [ ] Trial credit exhaustion blocks expensive actions.
- [ ] Admin can inspect credit ledger entries.
- [ ] Metrics avoid high-cardinality labels.
- [ ] Logs do not contain source contents, tutor transcripts, sealed sessions, or provider keys.

## Launch Verification

Run locally or against staging before production:

```bash
pnpm check
pnpm test
RUN_POSTGRES_INTEGRATION=1 pnpm test
pnpm build
./scripts/hosted-beta-verify.sh
```

Hosted smoke:

- [ ] Public landing loads.
- [ ] Login redirects to WorkOS.
- [ ] WorkOS callback creates a session and lands on `/app`.
- [ ] Beta Consent gates first protected entry.
- [ ] Onboarding prompt can be completed or skipped.
- [ ] Template gallery has 3-8 ready templates.
- [ ] Personal Learner Workspace creation works.
- [ ] Tutor turn succeeds with a real provider, not local fallback.
- [ ] Credit reservation and settlement are visible.
- [ ] Learning Feedback submits and appears in Admin.
- [ ] Private source upload is blocked without Ingestion Access.
- [ ] Admin grants Ingestion Access.
- [ ] Private source upload queues a Postgres job.
- [ ] One-shot worker processes a queued job or scheduled drain picks it up.
- [ ] Failed ingestion shows retry/review state.
- [ ] Admin manual ingestion trigger works.
- [ ] Account/workspace/source deletion request path works.
- [ ] Sentry and first-party analytics show the smoke run.

## Known Launch Blockers To Re-check

- Frontend protected/public shell still has pending work; do browser QA before opening traffic.
- Study Template content must be real and readiness-reviewed per environment.
- Same-origin `/api` and `/auth` routing is required unless frontend API-base-url work is added.
- DigitalOcean App Platform jobs are not HTTP-routable; do not point `INGESTION_TRIGGER_URL` directly at an App Platform job.
- Provider success must be real provider success. Local fallback success is not launch proof.

## External Docs Checked

- DigitalOcean App Platform supports web services, static sites, workers, and jobs: https://docs.digitalocean.com/products/app-platform/how-to/create-apps/
- DigitalOcean static sites are static assets without an application runtime: https://docs.digitalocean.com/glossary/static-site/
- DigitalOcean App Platform jobs are scheduled, non-routable processes: https://docs.digitalocean.com/glossary/job/
- DigitalOcean GitHub Actions deploy flow: https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-github-actions/
- DigitalOcean Valkey is Redis-compatible: https://docs.digitalocean.com/products/databases/valkey/
- Supabase Postgres connection modes: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase `pgvector` extension: https://supabase.com/docs/guides/database/extensions/pgvector
- GitHub branch protection: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule
- GitHub Actions secrets: https://docs.github.com/actions/security-guides/using-secrets-in-github-actions
