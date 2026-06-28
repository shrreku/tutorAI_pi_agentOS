# Deploying `@studyagent/web`

The web app is a Vite + React 19 SPA. It is presentation only — every screen talks
to the backend over `/api/v1` (and `/auth`) on the **same origin**, with
`credentials: "include"` for the session cookie. Deploy it behind a reverse proxy
(or CDN + origin) that routes `/api` and `/auth` to the API service.

## Build

```bash
pnpm install
pnpm --filter @studyagent/web build      # outputs apps/web/dist
```

`dist/` is fully static. Serve it with any static host (Nginx, Caddy, S3+CloudFront,
Vercel/Netlify static, a container running `vite preview`, etc.). Ensure the host
does SPA fallback (rewrite unknown paths to `/index.html`) so client routes like
`/flow`, `/app`, `/notebooks/:id`, `/admin/...` resolve.

The bundle is code-split: the marketing/auth/dashboard entry is small, while the
notebook workspace (React Flow + KaTeX + markdown), the eval dashboard, and the
admin console load on demand.

## Required runtime wiring

| Need | How |
| --- | --- |
| API + auth | Proxy `/api/*` and `/auth/*` to the backend API service. |
| Session | Cookie-based; the SPA sends `credentials: "include"`. Serve web + API on the same origin (or a parent domain with appropriate cookie scope). |
| SPA fallback | Rewrite non-asset paths to `/index.html`. |

## Environment variables

All client vars are inlined at **build time** and must be prefixed `VITE_`.

| Variable | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_API_PROXY_TARGET` | dev only | `http://127.0.0.1:4000` | Where `vite dev` proxies `/api` + `/auth`. |
| `VITE_SENTRY_DSN` | build | _(unset → Sentry off)_ | Browser error reporting. |
| `VITE_SENTRY_ENVIRONMENT` | build | – | Sentry environment tag. |
| `VITE_SENTRY_RELEASE` | build | – | Sentry release tag. |
| `ENABLE_DESIGN_LAB` | build | `false` | When `true`, also builds the internal `design-lab` scratch entry. Leave unset for production. |

> Dev note: outside production the client may attach an `X-User-Id` header from
> `localStorage["tutorbook.devUserId"]` (set by `/auth/dev-login` on localhost).
> This path is dev-only and is not used by the deployed cookie-based flow.

## Local development

```bash
# API on :4000 (see the API package), then:
pnpm --filter @studyagent/web dev         # http://localhost:5173
```

## Pre-deploy checks

```bash
pnpm --filter @studyagent/web check       # tsc, 0 errors
pnpm vitest run apps/web                   # web unit tests (or `pnpm test` for the whole repo)
pnpm --filter @studyagent/web build       # production bundle
```

## Routes

- Public: `/` (landing), `/flow`, `/bold` (alternate landings), `/demo`, `/contact`,
  `/privacy`, `/terms`, `/login`, `/auth/callback`
- Learner: `/app` (dashboard), `/notebooks`, `/notebook/:id` (workspace),
  `/app/credits`, `/app/support`, `/app/account`, `/app/consent`,
  `/app/access-code`, `/app/templates/:id`, `/app/workspaces/new`
- Admin (requires `adminAccess`): `/admin` + Users / Workspaces / Templates /
  Access codes / Credits / Feedback / Account deletion / Ingestion / Analytics
- Eval (admin): `/eval-runs`
