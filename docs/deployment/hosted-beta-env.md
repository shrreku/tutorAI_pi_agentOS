# Hosted Beta Environment Configuration

Deployment target: **TutorBook** on `tutorbook.me` (ADR-0022, ADR-0023, ADR-0024).

## Required (production)

| Variable | Surface | Description |
|----------|---------|-------------|
| `DATABASE_URL` | API, worker | Postgres connection string, e.g. Supabase or Neon |
| `SESSION_SECRET` | API | Min 16 chars; **must not** use `studyagent-local-session-secret` in production |
| `DISABLE_AUTH` | API | **Must be `false`** in production |
| `WORKOS_API_KEY` | API | WorkOS AuthKit API key |
| `WORKOS_CLIENT_ID` | API | WorkOS client ID |
| `WORKOS_REDIRECT_URI` | API | e.g. `https://tutorbook.me/auth/callback` |
| `WORKOS_COOKIE_PASSWORD` | API | WorkOS sealed-session cookie password, min 32 chars |
| `PUBLIC_WEB_BASE_URL` | API | e.g. `https://tutorbook.me` |
| `PUBLIC_API_BASE_URL` | API | e.g. `https://api.tutorbook.me` |
| `OBJECT_STORAGE_ENDPOINT` | API, worker | S3/R2 endpoint URL |
| `OBJECT_STORAGE_BUCKET` | API, worker | Bucket name |
| `OBJECT_STORAGE_ACCESS_KEY` | API, worker | Storage access key |
| `OBJECT_STORAGE_SECRET_KEY` | API, worker | Storage secret key |
| `OBJECT_STORAGE_REGION` | API, worker | e.g. `auto` for R2 |

## LLM (tutor)

| Variable | Surface | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | API | Required for live tutor turns |

## Analytics & monitoring

| Variable | Surface | Description |
|----------|---------|-------------|
| `POSTHOG_API_KEY` | API | PostHog project API key (mirror only; first-party events are canonical) |
| `POSTHOG_HOST` | API | Default `https://us.i.posthog.com` |
| `POSTHOG_REPLAY_ENABLED` | API | `false` until masking verified |
| `POSTHOG_REPLAY_SAMPLE_RATE` | API | Fraction of consented sessions eligible for replay (`0`-`1`) |
| `POSTHOG_REPLAY_DISABLED_UNTIL` | API | ISO timestamp spend guard; disable replay until the next billing month |
| `SENTRY_DSN` | API, worker | Error monitoring |
| `SENTRY_ENVIRONMENT` | API, worker | e.g. `production` |
| `SENTRY_RELEASE` | API, worker | Deploy/build identifier shown in Sentry |
| `VITE_SENTRY_DSN` | Web | Browser Sentry |
| `VITE_SENTRY_ENVIRONMENT` | Web | e.g. `production` |
| `VITE_SENTRY_RELEASE` | Web | Browser bundle deploy/build identifier |
| `VITE_POSTHOG_API_KEY` | Web | Client-side PostHog (optional) |
| `VITE_POSTHOG_HOST` | Web | Default `https://us.i.posthog.com` |

All `VITE_*` variables are browser build-time values. Pass them to the Vite
build (or as Docker build arguments supported by `infra/docker/Dockerfile`);
setting them only on a previously built nginx container has no effect.

## Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `BETA_CONSENT_VERSION` | `2026-06-25` | Bump whenever consent copy or analytics/replay processing changes |
| `TRIAL_TUTOR_BUDGET_CENTS` | `100` | One-time $1.00 trial grant |
| `INGESTION_TRIGGER_MODE` | `inline` | `inline`, `external`, or `disabled` |
| `INGESTION_TRIGGER_URL` | — | Required in `external` mode; protected job-provider endpoint |
| `INGESTION_TRIGGER_TOKEN` | — | Bearer token for the external trigger endpoint |
| `INGESTION_TRIGGER_MAX_JOBS` | `5` | Max jobs per one-shot worker run; use `1`-`2` for tighter hosted-beta spend control |
| `INGESTION_TRIGGER_MIN_INTERVAL_SECONDS` | `0` | Debounce non-admin trigger calls; use `60`-`300` in production to coalesce upload/retry bursts |
| `MAX_WORKSPACES_PER_LEARNER` | `5` | Personal workspace cap |
| `MAX_QUEUED_SOURCES_PER_LEARNER` | `10` | Upload queue cap |
| `MAX_UPLOAD_BYTES` | `26214400` | Max upload size (25 MB) |
| `CREDIT_RESERVATION_TTL_SECONDS` | `900` | Maximum lifetime of an unsettled credit hold |
| `PAID_CREDIT_CHECKOUT_ENABLED` | `false` | Stripe checkout (HB-016) |
| `STRIPE_SECRET_KEY` | — | Required when paid checkout enabled |
| `STRIPE_WEBHOOK_SECRET` | — | Stripe webhook signature |
| `REDIS_URL` | — | Optional caching/queues |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | — | Graph projection (if used) |
| `LANGFUSE_*` | — | LLM tracing (optional, no-op when unset) |

## Production fail-closed checks

- Reject startup if `DISABLE_AUTH=true` and `NODE_ENV=production`
- Reject `SESSION_SECRET=studyagent-local-session-secret` in production
- Reject startup if WorkOS sealed-session, HTTPS base URLs, object storage, OpenRouter, Sentry, or PostHog env vars are missing in production
- Reject startup if paid checkout is enabled without both Stripe secret and webhook secret
- Health: `GET /health` returns database, object storage, auth, ingestion trigger, and provider readiness checks. In production, missing or unreachable OpenRouter provider health fails closed; in local Docker, unreachable provider health is reported with `providerFallback: local_fallback_available` so fallback-only tutor behavior is visible.

## Process boundaries

- **Web**: Cloudflare Pages or static nginx (`infra/docker/nginx-web.conf`)
- **API**: Long-lived Fastify server
- **Worker**: One-shot drain via `node dist/index.js --one-shot --max-jobs=$INGESTION_TRIGGER_MAX_JOBS` (not always-on for free-first beta)

See `docs/deployment/hosted-beta-deploy-checklist.md` for the full provider, CI/CD, queue, and launch checklist.

## Local verification

```bash
pnpm db:migrate
pnpm db:seed
DISABLE_AUTH=true pnpm dev   # separate terminals for api + web
./scripts/hosted-beta-verify.sh
```

## Local dev only

| Variable | Value |
|----------|-------|
| `DISABLE_AUTH` | `true` |
| `SESSION_SECRET` | any 16+ char string |
| `DATABASE_URL` | local Postgres from docker-compose |
