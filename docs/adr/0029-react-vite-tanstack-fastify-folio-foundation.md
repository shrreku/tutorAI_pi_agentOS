# ADR-0029: React, Vite, TanStack, And Fastify Form The Folio Foundation

Status: Accepted

Date: 2026-06-27

## Context

The Folio revamp replaces the complete current frontend under ADR-0027. The existing web app proves valuable behavior, but its implementation is not a suitable production foundation:

- routing is a handwritten pathname matcher that does not model typed search parameters, nested layouts, route-owned loading/error states, or automatic code splitting;
- API calls are distributed across components and helper files, use unchecked response casts, and expose inconsistent error handling and query keys;
- the largest learner components combine transport, server state, local state, domain orchestration, and rendering;
- the current production build emits one approximately 1.70 MB minified JavaScript entry chunk (499 kB gzip) and 203 kB of CSS (46 kB gzip), before the complete Folio route set exists;
- the Fastify API and shared Zod schemas are already the production contract boundary, while the web client remains only partially typed at runtime;
- the product requires same-origin cookie auth, REST commands and read models, POST-based tutor streaming, notebook event streams, persisted learner state, and a static web deployment behind nginx. It does not currently require React server rendering.

Replacing the visual system while retaining the existing router and ad hoc client layer would preserve the wrong coupling. Replacing Fastify with a second full-stack framework, GraphQL, or tRPC would create a parallel API migration without solving a Folio product requirement.

## Decision

### Application runtime

Keep React 19 and Vite as a client-rendered application deployed as static assets behind the existing same-origin nginx proxy. Public pages remain part of the same application. If public-route SEO later becomes a measured requirement, add build-time prerendering for those routes rather than moving the authenticated product to a server-rendered framework.

Adopt file-based TanStack Router with the Vite router plugin and automatic route code splitting. Route files own:

- path and search-parameter schemas;
- public, authenticated learner, Notebook Workspace, Admin, and development-only layout boundaries;
- authorization and Beta Consent preconditions;
- route-level pending, error, and not-found presentation;
- typed Dashboard Action Target encoding and Workspace bootstrap state;
- query prefetching where it removes a real request waterfall.

TanStack Router is selected because it supplies typed navigation, validated search state, nested layouts, error boundaries, preloading, and Vite code splitting without adding a server framework. See the official [Vite installation](https://tanstack.com/router/latest/docs/framework/react/installation/with-vite) and [automatic code-splitting](https://tanstack.com/router/latest/docs/framework/react/guide/automatic-code-splitting) guidance.

### Server state and local state

Keep TanStack Query as the sole server-state cache. Query option factories live beside typed API operations and own canonical query keys, stale policy, retry policy, and invalidation helpers. Notebook event streams remain invalidation hints; events do not become a second client-side database.

Route/search state belongs in TanStack Router. Form drafts, open/closed controls, selections that must not survive navigation, and transient interaction state remain local to the smallest component or feature controller. Cross-component UI state uses narrowly scoped contexts with split value/action subscriptions. Do not add a general-purpose global state library until a measured use case cannot be expressed through Router, Query, or feature-local state.

### API contract and client

Create `@studyagent/api-client` as the only browser HTTP boundary. It uses native `fetch` and shared Zod schemas rather than adding a second request library. It provides:

- same-origin credentials and dev identity headers;
- typed path/query/body/response helpers;
- runtime response validation at trust boundaries;
- one `ApiError` model with status, stable error code, learner-safe message, request ID, trace ID, and optional field details;
- `AbortSignal` propagation for route cancellation and superseded queries;
- correlation-header capture;
- idempotency-key support for replay-sensitive commands;
- query option/key factories and mutation invalidation metadata;
- separate streaming adapters for tutor POST streams and notebook GET event streams.

Expand `@studyagent/schemas` with route request, response, stream-event, and error schemas. Shared schemas are the source of truth for internal TypeScript consumers. The API may emit an OpenAPI artifact from the same route schemas for inspection and external integration, but generated OpenAPI client code is not the monorepo source of truth.

### API style

Keep Fastify REST and SSE. Add runtime validation and serialization schemas to Folio-facing routes, using Fastify type providers where they reduce duplicated route types. Fastify documents Zod as a supported third-party type-provider path; see [Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/).

The API surface uses three deliberate shapes:

1. **Bounded read models** for a screen or stable product region, such as Learner Dashboard Summary and Notebook Workspace Bootstrap. They eliminate browser-side joins and N+1 requests without becoming one application-wide bootstrap response.
2. **Resource reads** for independently cacheable or potentially large data, such as graph queries, Reference Surfaces, Evidence, source files, Tutor Session history, and artifacts.
3. **Explicit commands** for consent, creation, tutor/session actions, artifact decisions, practice submissions, Interactive Learning Actions, checkout, support, and account operations.

Commands return the changed resource or an explicit invalidation hint when useful. Cursor pagination is required for unbounded histories and activity. Learner-facing GET requests never invoke an LLM. LLM-generated recommendations or copy must be produced asynchronously or during an explicit tutor/planning command, persisted with generation state, and read deterministically.

Do not add GraphQL, tRPC, TanStack Start, Next.js, or a generic backend-for-frontend gateway for the Folio program.

### Visual and interaction dependencies

Keep Tailwind CSS 3.4, the shared `@studyagent/ui` package, Radix primitives, class-variance-authority, and `tailwind-merge`. Folio tokens and primitives are centralized in `@studyagent/ui`; product composites stay feature-owned in `apps/web`.

Keep:

- `@xyflow/react` for the real Study Map;
- `lucide-react` for interface icons;
- `react-markdown`, GFM, math, and KaTeX for source-grounded tutor and Reference Surface content;
- Sentry and PostHog, initialized only after the relevant application/consent boundary;
- self-hosted Newsreader, Inter, and JetBrains Mono font subsets.

Remove obsolete theme/font packages, `@studyagent/eval-runner` from the browser dependency graph, the handwritten router, duplicate fetch wrappers, Legacy/Mist theme machinery, and unused UI dependencies as slices replace their consumers.

Heavy feature code is route- or interaction-split. React Flow, Admin/Eval tooling, MCP App hosts, and optional rich renderers must not inflate the public/auth entry chunk. Markdown/math support may be split from routes that never render it. Third-party monitoring and analytics load after the application becomes interactive and policy permits them.

### Tutor transport boundary

This ADR does not lock the UI directly to TanStack AI or require its removal. Tutor transport is isolated behind a StudyAgent-owned adapter and validated event contract. A dedicated vertical slice will compare upgrading/wrapping the current TanStack AI connection against a small native adapter using the real tutor stream, cancellation, session identity, trace events, reconnect/reload behavior, and bundle cost. The recommended default is to retain TanStack AI only behind the adapter if the proof shows it handles StudyAgent's AG-UI stream without `any` casts or protocol leakage into Folio components.

### Delivery boundary

Implement the revamp on a non-production Folio integration branch. Vertical slices target that branch and remain independently testable against real APIs and persisted data. This is a source-control isolation boundary, not a runtime Legacy/Folio switch. Main receives one cutover after the complete route, behavior, accessibility, responsive, and production verification gates pass; the cutover deletes the old frontend rather than preserving a fallback.

## Consequences

- The new frontend can be organized around routes, product features, and contracts instead of the old component tree.
- URL-backed Workspace state becomes reloadable and shareable, allowing Dashboard Action Targets to work correctly.
- API response validation and one error model make contract drift visible near the network boundary.
- Bounded read models reduce request waterfalls while resource endpoints retain useful caching and independent loading.
- Automatic route splitting addresses the current single-chunk baseline, but budgets still require measurement and CI enforcement.
- A long-lived integration branch increases merge coordination cost. That cost is accepted because ADR-0027 forbids an incomplete mixed-generation production runtime.
- Fastify REST remains usable by workers, tests, MCP bridges, and future non-web clients.
- The Tutor transport adapter creates a deliberate seam while the TanStack AI beta matures; Folio components do not depend on its message types directly.

## Alternatives Considered

### Keep the handwritten router and fetch helpers

Rejected. Their missing typed search state, nested route boundaries, cancellation, validation, and splitting are already product blockers for Dashboard-to-Workspace deep links and production bundle control.

### Move to Next.js or TanStack Start

Rejected for this program. The authenticated Workspace is already a static SPA behind a same-origin API proxy, and the revamp has no server-component or SSR requirement that justifies replacing deployment and runtime boundaries.

### Adopt GraphQL

Rejected. Folio needs a small number of bounded read models plus explicit commands and streams. A graph query language would add schema, resolver, caching, and authorization work without replacing the domain graph or simplifying tutor streaming.

### Adopt tRPC

Rejected. The existing Fastify routes, shared contracts, tests, workers, and external integration surfaces are REST-oriented. Shared Zod route schemas and a typed client provide the required monorepo type safety without coupling all consumers to an RPC runtime.

### Generate the browser client from OpenAPI

Not selected as the primary path. Generation would add a build-order and generated-code review surface while the API and web already share TypeScript/Zod packages. OpenAPI remains a useful derived artifact and external contract check.
