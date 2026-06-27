# Folio Production Frontend Ticket Drafts

Status: proposed; publish only after user approval

Date: 2026-06-27

Program plan: [15-folio-end-to-end-implementation-plan](./15-folio-end-to-end-implementation-plan.md)

These bodies follow the repository's tracer-bullet issue format. Draft IDs are replaced with real GitHub issue references during publication.

## F00 — Folio Production Frontend Revamp

Type: HITL program tracker

### What to build

Coordinate the complete replacement of the current frontend with the production Folio application defined by ADR-0027, ADR-0028, ADR-0029, and the frontend architecture/implementation plan. This issue tracks dependencies and release proof; implementation belongs in the linked vertical slices.

### Acceptance criteria

- [ ] F01-F24 are published, dependency-linked, and assigned the correct AFK/HITL status.
- [ ] Every public, learner, Notebook Workspace, Admin, Eval, state, and viewport in the route matrix has one owning ticket.
- [ ] Every learner-facing ticket cites the canonical Folio baseline and behavioral contract.
- [ ] Program status distinguishes implemented code, real runtime verification, visual approval, and release readiness.
- [ ] The final cutover removes the old frontend rather than retaining a runtime fallback.

### Blocked by

None - can start immediately.

## F01 — Folio: Public Shell And Production Client Foundation

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver the first production Folio tracer through `/`, public information routes, `/login`, and `/auth/callback`. Establish file-based TanStack Router, automatic route splitting, TanStack Query defaults, `@studyagent/api-client`, shared request/response/error contracts, Folio tokens/fonts/primitives, route pending/error/not-found boundaries, package-local tests, and bundle measurement. The route must use real auth/session APIs where applicable and must not retain the handwritten router or a second UI generation for migrated routes.

### Acceptance criteria

- [ ] `@tanstack/react-router` and the Vite router plugin own typed file routes, generated route tree, search validation, scroll restoration, not-found, pending, and route-error behavior.
- [ ] `@studyagent/api-client` is browser-compatible, React-free, uses native fetch, sends same-origin credentials/dev identity policy, propagates abort signals, captures correlation headers, validates responses, and produces one typed `ApiError`.
- [ ] Shared schemas define the canonical API error envelope and the migrated session/public route contracts; Fastify validates and returns them.
- [ ] Folio Newsreader/Inter/JetBrains typography, semantic tokens, focus treatment, and shared primitives load without Legacy/Mist/Atlas theme code.
- [ ] `/`, `/demo`, `/contact`, `/privacy`, `/terms`, `/login`, `/auth/callback`, and not-found states are fully designed in Folio at 390, 768, 1024/1280, and 1440 where applicable.
- [ ] Public routes do not download React Flow, Admin/Eval, Tutor, MCP App, or full Markdown/math feature chunks.
- [ ] Sentry/analytics initialization is deferred from the initial public render and follows route/policy requirements.
- [ ] Web package scripts include unit/component test and build/typecheck commands used by the root workspace.
- [ ] Tests cover route matching/search validation, auth callback success/failure, API validation/error mapping, cancellation, not-found, keyboard focus, and public-route accessibility.
- [ ] CI records route chunk sizes and enforces an agreed budget based on the first stable split build.

### Blocked by

None - can start immediately.

## F02 — Folio: Protected Learner Shell And Beta Consent

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver the protected learner layout through a real session and Beta Consent flow. The route boundary must handle authentication, disabled accounts, Study Access, Admin Access separation, consent version/state, redirects, pending/error/retry presentation, and consented monitoring without treating client checks as authorization.

### Acceptance criteria

- [ ] The learner layout loads the canonical session query once and uses typed route preconditions for unauthenticated, disabled, missing Study Access, and missing/stale Beta Consent states.
- [ ] Server routes continue to enforce authentication, ownership, entitlements, and consent independently of client navigation.
- [ ] `/app/consent` renders current, accepted, stale-version, submitting, failed, and disabled-account Folio states using the real API.
- [ ] Back/forward navigation and direct protected URLs resolve deterministically without loading protected child data before access is known.
- [ ] PostHog/session replay policy initializes only after authenticated consent and cannot block protected-route rendering.
- [ ] Logout clears/invalidates learner-scoped Query data and closes active streams.
- [ ] Session/API failures preserve a retry path and expose request ID without leaking raw response bodies.
- [ ] Browser tests cover anonymous redirect, dev/WorkOS-compatible session, consent acceptance, disabled user, missing study/admin entitlement, logout, and refresh.
- [ ] Automated accessibility and keyboard checks cover the protected shell, consent form, route redirects, and failure states.

### Blocked by

- F01 — Folio: Public Shell And Production Client Foundation.

## F03 — Folio: Published Study Template To Personal Learner Workspace

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver the complete hosted-beta creation path: browse real Published Study Templates, inspect one, create a Personal Learner Workspace from a template or approved empty-start path, and enter the resulting Notebook Workspace. Use API-owned template availability and creation behavior; never fabricate templates or Notebook IDs.

### Acceptance criteria

- [ ] Template list/detail and Workspace creation request/response schemas are shared and validated.
- [ ] `/app/templates/:templateId`, `/app/workspaces/new`, and `/notebooks` have Folio loading, empty, unavailable, creating, success, and error states.
- [ ] Creating from a Published Study Template calls the canonical Workspace creation command and returns the learner-owned Notebook identity.
- [ ] Template content relationship and learner-private sessions/mastery/artifacts remain correctly separated.
- [ ] Duplicate submissions are prevented or idempotent; uncertain failures can be retried without creating accidental duplicate Workspaces.
- [ ] Successful creation navigates through the typed Notebook Workspace route and handles a not-yet-ready template honestly.
- [ ] Query invalidation updates the learner's Workspace list and dashboard-visible resources.
- [ ] API/Postgres tests cover ownership, unpublished/missing template, empty start policy, duplicate retry, and learner shell creation.
- [ ] Browser tests create a real Personal Learner Workspace and reload the resulting route.

### Blocked by

- F02 — Folio: Protected Learner Shell And Beta Consent.

## F04 — Folio: Tutor Credits And Access Code Flows

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver real Tutor Credit visibility, optional Stripe Checkout, disabled-checkout handling, and Access Code redemption in Folio. Credit displays remain percentages/status, not cents or token internals; redirect targets and redemption outcomes remain server-controlled.

### Acceptance criteria

- [ ] Credits, checkout-pack, checkout-command, and Access Code schemas/errors are shared and validated.
- [ ] `/app/credits` renders loading, available, low, exhausted, checkout-disabled, pack list, redirecting, success-return, cancelled-return, and failure states.
- [ ] `/app/access-code` renders validation, submitting, redeemed, invalid, expired, already-used, and server-error states.
- [ ] Checkout redirects only to a server-returned allowlisted target and disables duplicate submissions.
- [ ] Successful redemption/checkout return invalidates session, entitlement, balance, and dependent dashboard queries.
- [ ] Learner copy exposes percentages and product actions without raw prices where not appropriate, provider errors, or internal credit ledger details.
- [ ] API tests cover feature-disabled checkout, authorization, pack validation, Access Code state transitions, and normalized errors.
- [ ] Browser tests cover checkout-disabled and Access Code success/failure using real API state; provider-hosted payment completion may remain a provider sandbox test.

### Blocked by

- F02 — Folio: Protected Learner Shell And Beta Consent.

## F05 — Folio: Learning Feedback And Support Report Flows

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver real Learning Feedback and Support Report submission through the Folio learner shell. Preserve learner input across recoverable failures, attach only approved technical context, and return a clear durable receipt/state without exposing internal triage details.

### Acceptance criteria

- [ ] Feedback/support request and response schemas validate category, text, optional Notebook context, and allowed diagnostic metadata.
- [ ] `/app/support` provides Folio form, validation, pending, success, retry, and unavailable states.
- [ ] A failed submission preserves entered text and does not create duplicate reports when retried.
- [ ] Automatic context excludes transcript/source/answer contents, cookies, authorization, raw Evidence, and private mastery details.
- [ ] Success returns a stable learner-safe acknowledgement and clears the form only after durable acceptance.
- [ ] Product analytics records outcome/category without copying report content.
- [ ] API/Postgres tests cover ownership, content limits, duplicate/idempotent retry, stored metadata policy, and normalized errors.
- [ ] Browser tests cover keyboard completion, validation, successful persistence, retry after failure, and responsive layout.

### Blocked by

- F02 — Folio: Protected Learner Shell And Beta Consent.

## F06 — Folio: Account Resources And Deletion Requests

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver account management for learner Workspaces, Sources, deletion commands, and account-deletion requests in Folio. Replace the browser's current per-Workspace source loading with one learner-scoped Account Resource Summary projection.

### Acceptance criteria

- [ ] `GET /api/v1/account/resources` returns owned Personal Learner Workspaces and learner-safe Source summaries in one bounded, validated projection.
- [ ] The projection and commands enforce learner ownership and do not expose template/content Notebook internals.
- [ ] `/app/account` renders loading, empty, partial/unavailable, list, confirm, deleting, success, and failure Folio states.
- [ ] Workspace and Source deletion require explicit confirmation naming the affected learner-visible resource.
- [ ] Successful deletion invalidates account, dashboard, Workspace, source, and session-relevant queries and handles navigation away from a deleted active Workspace.
- [ ] Account-deletion request preserves notes on recoverable failure and exposes durable submitted state.
- [ ] The browser performs no per-Workspace source N+1 requests.
- [ ] API/Postgres tests cover ownership, shared-template safety, dependent state behavior, repeated requests, and normalized errors.
- [ ] Browser tests cover empty account, resource deletion success/failure, account request, keyboard dialog focus, and mobile presentation.

### Blocked by

- F02 — Folio: Protected Learner Shell And Beta Consent.

## F07 — Folio: Notebook Workspace Bootstrap And Source Lifecycle

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver the real Folio Notebook Workspace shell and source lifecycle. Add the bounded Workspace Bootstrap projection, typed URL/search target, 35/65 desktop split, persisted draggable divider, independent pane scrolling, surface switcher, source upload/readiness/retry, and notebook-event synchronization. Child graph/reference/tutor data remains independently cacheable and loads in parallel after bootstrap.

### Acceptance criteria

- [ ] `GET /api/v1/notebooks/:notebookId/workspace` returns validated Notebook identity, source readiness summary, current study/session summary, allowed surfaces, and normalized initial Dashboard Action Target without embedding full child resources.
- [ ] The route validates ownership, surface, intent, `NodeRef`, Artifact, Session, and fallback behavior on direct load and back/forward navigation.
- [ ] Desktop defaults to 35% Tutor / 65% Workspace; pointer and keyboard resizing are bounded, versioned, and persisted per Notebook.
- [ ] Tutor and Workspace panes scroll independently; the composer remains usable and each surface retains/restores appropriate scroll state.
- [ ] Tablet/mobile composition follows the responsive contract with explicit Tutor/Workspace/Evidence switching where simultaneous panes no longer fit.
- [ ] Real source upload, list, processing, ready, failed, retry, and access-denied states render in Folio and refresh from notebook events.
- [ ] Notebook event stream validates sequence/refresh hints, ignores duplicates, reconnects/refetches, and closes on route/logout change.
- [ ] Child queries start in parallel after bootstrap; no application-wide mega response or serial graph/history/reference waterfall is introduced.
- [ ] Tests cover URL codec round trip, unauthorized/invalid target fallback, divider persistence/keyboard behavior, independent scroll, event invalidation, upload/retry, and responsive shell.
- [ ] Docker browser proof uploads a real source and observes durable readiness/failure behavior.

### Blocked by

- F02 — Folio: Protected Learner Shell And Beta Consent.

## F08 — Folio: Tutor Conversation Stream And Runtime Work View

Type: HITL

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver one complete real Tutor conversation path in Folio and use it to resolve the transport adapter. A learner sends or steers a prompt, observes typed Runtime Work events, receives grounded prose/citations/Artifact suggestions, handles cancellation/retry/failure, and reloads the durable result. Compare an upgraded TanStack AI wrapper with a small native adapter behind the same StudyAgent-owned interface; record the decision from correctness, complexity, protocol, and bundle evidence.

### Acceptance criteria

- [ ] Shared schemas validate standard AG-UI events and StudyAgent session/run/turn/trace/custom events without `any` casts in Folio code.
- [ ] A StudyAgent-owned adapter exposes send, steer, cancel, retry, terminal status, message/run/session state, and durable reload independent of the selected transport library.
- [ ] Folio Tutor renders user rows, running/completed/failed steps, collapsible Runtime Work, grounded prose, citations, Artifact suggestions, retry, and learner-safe disconnection state.
- [ ] Real provider success is verified separately from local/fallback behavior; the UI does not claim grounded success when the provider or Evidence path failed.
- [ ] Aborting or changing Notebook cancels the active browser stream without corrupting the persisted Tutor Session.
- [ ] Completed/failed runs preserve request, trace, run, turn, and session identity for Dev Mode diagnostics without exposing raw IDs in learner copy.
- [ ] Reload reconstructs the durable transcript/result from the API instead of relying on in-memory stream state.
- [ ] TanStack AI wrapper and native-adapter proof results include protocol coverage, adapter LOC/complexity, failure behavior, and route-chunk cost; a follow-up ADR or decision note records the selected implementation.
- [ ] API/unit/component/Postgres/browser tests cover send, steer, cancel, retryable/non-retryable failure, disconnect, citation, Artifact event, and reload.
- [ ] A human approves the live Folio Tutor/Runtime Work behavior and transport decision before the ticket closes.

### Blocked by

- F07 — Folio: Notebook Workspace Bootstrap And Source Lifecycle.

## F09 — Folio: Tutor Session History, Settings, And Lifecycle

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Complete the Folio Tutor panel with cursor-paginated Tutor Session history/detail, clear previous-session viewing state, settings, Artifact consent, and explicit pause/resume/end lifecycle behavior. Correct the implicit paused-to-active transition so every resume is durable and observable.

### Acceptance criteria

- [ ] Tutor Session list/detail contracts are learner-safe, cursor-paginated, validated, and exclude raw internal trace/tool payloads.
- [ ] Tutor/History/Settings tabs, collapsed rail, history selection, current-vs-previous state, empty/loading/error states, and mobile presentation match Folio.
- [ ] Pause, resume, and end commands return updated lifecycle state and emit the canonical lifecycle event.
- [ ] `getOrCreateTutorSession` or its replacement cannot move paused to active without the normal resume event.
- [ ] Settings read/write uses shared schemas, optimistic behavior only where safe, and rollback/error presentation.
- [ ] Artifact consent/proposal controls preserve ADR-0011 visibility and approval rules.
- [ ] Opening history never changes the active session or learner state; resuming is an explicit command.
- [ ] Tests cover pagination, Notebook isolation, previous-session view, pause/resume/end/reload, settings failure, consent, and keyboard tab/focus behavior.

### Blocked by

- F08 — Folio: Tutor Conversation Stream And Runtime Work View.

## F10 — Folio: Study Map Over The Workspace Read Model

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver the Folio Study Map over the real Workspace Read Model and React Flow graph. Map semantic node families, sizes, and independent readiness/progress/learning/current states; support selection, pan/zoom, persisted layout, filters, typed deep links, refresh, and an accessible non-canvas list.

### Acceptance criteria

- [ ] Shared graph/Workspace Read Model schemas cover every learner-visible node family and independent readiness, progress, learning, selection, current, completed, and locked dimensions.
- [ ] The API returns semantic data and never Folio CSS classes, sizes, or component names.
- [ ] Real graph nodes/edges render using Folio node components at the approved scales without importing Design Lab static positions/data.
- [ ] Selection and open actions update typed route/search state and survive reload/back/forward navigation.
- [ ] Layout save/clear is validated, ownership-checked, throttled/coalesced, and visually reports recoverable failure.
- [ ] Notebook events refresh affected graph/read-model data without resetting selection or causing avoidable layout jumps.
- [ ] Filters/source scope/current path work from real data and expose active/filtered counts.
- [ ] Keyboard operation, visible focus, zoom controls, and a list/tree fallback provide access to key destinations without canvas-only interaction.
- [ ] Performance tests cover a representative large graph; high-frequency pointer state does not rerender the full Workspace.
- [ ] Browser/visual tests cover default, selected, current, completed, locked, refreshing, empty, error, 1024/1280 clipping, and 1440 reference comparison.

### Blocked by

- F07 — Folio: Notebook Workspace Bootstrap And Source Lifecycle.

## F11 — Folio: Reference Surfaces And Artifact Lifecycle

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver every canonical Reference Surface and Artifact state through Folio Reading/Reference composition. Use real `ReferenceSurface` contracts for concepts, Wiki topics, Curriculum, Module, quiz, Session, Source, flashcards, worked examples, formula sheets, comparison, Live Plan, and other supported blocks. Preserve Artifact proposal/approval/rejection/edit/regeneration behavior.

### Acceptance criteria

- [ ] Shared Reference Surface schemas are exhaustive/discriminated and runtime-validated; unknown future blocks render an honest safe fallback.
- [ ] Every supported static block kind renders Markdown, math, code, table, formula, media metadata, and overflow accessibly.
- [ ] Every designed surface type has Folio loading, empty, not-ready, proposed, ready, failed, stale/regenerating, and action states where applicable.
- [ ] Artifact approve/reject/edit/regenerate commands enforce ownership/lifecycle and return or invalidate the correct surface state.
- [ ] Reference primary actions emit typed Workspace targets/commands instead of mutating state on card open.
- [ ] Source-grounding and quality labels remain learner-safe; raw claim/chunk/coverage internals remain Dev Mode only.
- [ ] Route/back/forward navigation preserves selected surface and returns predictably to Study Map or prior surface.
- [ ] Markdown/math heavy code is loaded only on routes/surfaces that need it.
- [ ] API/Postgres/component/browser tests cover every block family, lifecycle command, malformed/unknown block, reload, math/code overflow, and responsive header actions.

### Blocked by

- F07 — Folio: Notebook Workspace Bootstrap And Source Lifecycle.

## F12 — Folio: Evidence And Source Opening

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver learner-safe Folio Evidence and real source opening from Tutor, Study Map, Reference Surfaces, Artifacts, Practice, and Interactive Learning. The API groups and labels Evidence and supplies typed page/slide/timestamp/open targets; the browser does not construct storage URLs or expose raw provenance internals.

### Acceptance criteria

- [ ] Evidence response schema groups learner-safe citations/supporting notes and includes source title, locator, excerpt, availability, and typed open target.
- [ ] API derives PDF page, slide, document anchor, timestamp, or unavailable target from owned source metadata and never returns raw object keys as UI URLs.
- [ ] Folio citation chips, active states, Evidence drawer/sheet, grouped list, source viewer, empty, loading, failed, and unavailable states are complete.
- [ ] Evidence opens from every owning surface and returns without losing Tutor/Workspace scroll or selected context.
- [ ] Learner mode hides raw claims, confidence, chunks, internal provenance, and debug statuses; Dev Mode may expose separate diagnostics.
- [ ] Drawer/sheet focus is trapped/restored correctly, Escape works, and mobile uses a full-screen accessible treatment.
- [ ] Opening Evidence or a source span emits semantic Study Activity eligibility but never Mastery Evidence by itself.
- [ ] API/component/browser tests cover each locator kind, missing source, ownership, learner-safe filtering, keyboard operation, and responsive composition.

### Blocked by

- F11 — Folio: Reference Surfaces And Artifact Lifecycle.

## F13 — Folio: Persisted Practice And Mastery Evidence

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver real Folio Practice for canonical quiz, flashcard, and worked-example interactions. Selection remains local until explicit submission/rating; submitted evaluable work persists, produces semantic Mastery Evidence through the governed path, refreshes relevant state, and reconstructs correctly after reload.

### Acceptance criteria

- [ ] Practice read/action/result schemas normalize web and MCP/native paths around the canonical Interactive Learning/Artifact pipeline.
- [ ] Quiz choices use radiogroup-equivalent semantics; free response, submitting, correct/incorrect, explanation, Evidence, retry/next, and completion states are accessible.
- [ ] Flashcard flip remains local; explicit rating persists review state and does not become mastery by itself.
- [ ] Worked-example hints/reveals are tracked appropriately but only evaluable learner responses become Mastery Evidence.
- [ ] Conceptually correct paraphrases use the semantic evaluator when configured; string matching is not the production mastery rule.
- [ ] Submission is idempotent/replay-safe and cannot create duplicate attempts after an uncertain response.
- [ ] Notebook events invalidate attempts, Reference Surface, Study State, graph/read models, dashboard queues, and recommendations as required.
- [ ] Reload reconstructs submitted/complete state from StudyAgent, not local or iframe storage.
- [ ] API/Postgres/component/browser tests cover correct paraphrase, incorrect, evaluator unavailable/degraded, repeat/reload, Evidence, next item, and mastery update.

### Blocked by

- F11 — Folio: Reference Surfaces And Artifact Lifecycle.

## F14 — Folio: Interactive Learning Blocks And Actions

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Port the already implemented Interactive Learning Block and Action architecture into the Folio Workspace. Render real server-authored blocks, dispatch validated canonical actions, persist durable outcomes through existing reducers/lifecycle modules, and provide native Folio loading/saving/completed/error/fallback behavior. Do not rebuild this path from Design Lab simulator markup.

### Acceptance criteria

- [ ] Existing shared Interactive Learning Block, Action, context-envelope, Simulation Template, and renderer contracts remain canonical and are consumed through the new API client.
- [ ] Folio renders supported quiz, flashcard, worked example, Evidence explorer, simulation, Live Plan, source reader, comparison, timeline, personalization, and approved Dev Mode blocks.
- [ ] Meaningful actions dispatch through the canonical route with ownership, block/action, payload, reference, and optional Tutor Session validation.
- [ ] Durable outcomes use Artifact, Mastery Evidence, learning state, Live Plan, and event paths already defined by the domain; renderer state cannot overwrite canonical state.
- [ ] Local/high-frequency interactions do not create unbounded events, Study time, or Mastery Evidence.
- [ ] Pending, disabled, saving, retry, completed, invalid action, stale block, unsupported block, and native fallback states use Folio.
- [ ] Notebook event refresh does not discard an in-progress unsent local action.
- [ ] Existing Interactive Learning contract/action tests are preserved or improved; browser tests prove a real action persists and survives reload.

### Blocked by

- F11 — Folio: Reference Surfaces And Artifact Lifecycle.

## F15 — Folio: Sandboxed MCP App Renderer

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Port the implemented Internal MCP App Bridge, registry, and bundles into the Folio App surface. Render the real sandboxed iframe bundle with Folio host chrome, host context, canonical state updates, validated Interactive Learning Actions, version compatibility, diagnostics, and native fallback. Remove the Design Lab's fake local “MCP app” markup.

### Acceptance criteria

- [ ] App surface uses the canonical MCP App Bundle manifest/registry and loads actual bundle assets in a sandboxed iframe.
- [ ] Sandbox disallows parent DOM and auth-cookie/API dependence; network capability follows the restrictive allowlist policy.
- [ ] Bridge initialization, host context, block input/result, action, state update, error, and teardown messages are validated and versioned.
- [ ] Iframe has an accessible title/focus path and does not trap the learner without host navigation/fallback.
- [ ] Actions dispatch through the same canonical Interactive Learning Action path as native renderers and survive reload from server state.
- [ ] Folio host renders loading, ready, saving, completed, version mismatch, sandbox/load/protocol failure, and native fallback states.
- [ ] Dev Mode can inspect bridge lifecycle/errors without exposing them in learner copy or product analytics content.
- [ ] Browser tests exercise a real bundle/action/reload path, blocked forbidden behavior, fallback, keyboard access, and mobile sheet/full-surface composition.

### Blocked by

- F14 — Folio: Interactive Learning Blocks And Actions.

## F16 — Folio: Learner Dashboard Summary Core

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Deliver the real Folio dashboard core from `GET /api/v1/dashboard`: learner greeting/freshness, owned Personal Learner Workspace summaries, current Curriculum/Module/progress, readiness, typed resume actions, and learner-safe recent activity. The API owns joins/order/labels/actions; the browser owns presentation and local display state.

### Acceptance criteria

- [ ] Shared Learner Dashboard Summary schema is versioned and has independently renderable section status/freshness.
- [ ] Notebook summaries derive progress/current work/readiness/last activity from persisted state and return typed non-mutating resume targets.
- [ ] Recent activity derives learner-safe entries from durable events/sessions/attempts/Artifact lifecycle and uses cursor/limit policy where needed.
- [ ] The API enforces learner scope and performs joins in one projection; the browser does not call each Notebook to reconstruct dashboard data.
- [ ] `/app` matches the canonical Folio dashboard hierarchy and renders loading, empty, not-ready, partial, stale, and full states without sample values.
- [ ] Continue/review/resume opens the completed typed Notebook Workspace target and works after reload/back/forward.
- [ ] Week/month controls remain local display state and do not mutate learner state.
- [ ] API/Postgres tests cover no Notebook, processing Notebook, incomplete state, multiple Workspaces, activity ordering, ownership, and typed action validity.
- [ ] Browser/visual tests use real persisted state at 390, 768, 1280/1440, and the approved wide reference composition.

### Blocked by

- F07 — Folio: Notebook Workspace Bootstrap And Source Lifecycle.

## F17 — Folio: Due Practice And Dashboard Recommendations

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Complete the Folio dashboard with real due Practice and Dashboard Recommendations. Eligibility and ordering are deterministic from persisted plans, Mastery Evidence, learning state, attempts, and review dates. Optional LLM enrichment is explicit/asynchronous, persisted with generation state, and never invoked by dashboard GET. Every action opens a working completed Workspace surface.

### Acceptance criteria

- [ ] Dashboard schema includes due Practice, deterministic Dashboard Recommendations, reasons, typed actions, freshness, and optional enrichment pending/failed/fresh state.
- [ ] Eligibility/order is deterministic and covered by fixed-time Postgres tests; missing generated copy uses deterministic learner-safe fallback.
- [ ] `GET /dashboard` performs no LLM/provider call under any state.
- [ ] Explicit recommendation refresh returns accepted/current state, runs asynchronously, persists source/generation metadata, and leaves existing recommendations usable.
- [ ] Due Practice derives from canonical attempts/Artifacts/review state and opens the real Folio Practice path.
- [ ] Recommendation targets open completed Tutor, Study Map, Reference, Artifact, Practice, or Session surfaces and never mutate merely by opening.
- [ ] Folio renders ready/suggested/completed, empty, unavailable, enrichment pending/failure/stale, and action-target fallback states.
- [ ] Notebook events/commands invalidate only the relevant dashboard/query sections.
- [ ] API/Postgres/browser tests cover deterministic ties, missing enrichment, refresh success/failure, due/overdue, completed item, and target round trip.

### Blocked by

- F09 — Folio: Tutor Session History, Settings, And Lifecycle.
- F10 — Folio: Study Map Over The Workspace Read Model.
- F11 — Folio: Reference Surfaces And Artifact Lifecycle.
- F13 — Folio: Persisted Practice And Mastery Evidence.
- F16 — Folio: Learner Dashboard Summary Core.

## F18 — Folio: Study Activity Intervals And Session Liveness

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Implement ADR-0028 end to end. Persist Study Activity Intervals from content-free semantic pulses across Tutor, Study Map, Reference, Evidence, Practice, Interactive Learning, and MCP Apps; aggregate them into weekly/monthly dashboard Study time. Separately persist Tutor Turn Disposition and implement 15/30-minute Continue/Pause Session Liveness without treating waiting or browser-open time as study.

### Acceptance criteria

- [ ] Database/schema/API represent learner, Notebook, optional Tutor Session, surface, optional target `NodeRef`, start, last activity, end, and end reason.
- [ ] Pulse route is authenticated, Notebook-owned, content-free, idempotent, coalescing, and caps intervals at the inactivity boundary with lazy expiry.
- [ ] One Workspace Activity Controller receives semantic events from all completed surfaces and sends sparse heartbeats only while visible and recently meaningful.
- [ ] Pointer movement, scroll noise, hidden tabs, unread output, and browser-open time do not extend Study Activity.
- [ ] Weekly/monthly dashboard aggregation respects learner timezone boundaries, partial intervals, and unavailable state.
- [ ] Tutor Turn Disposition persists `informational`, `awaiting_learner`, or `interactive_task` from structured runtime state.
- [ ] Informational inactivity prompts at 15 minutes; awaiting learner/interactive prompts at 30; Continue resumes, Pause/no response pauses and emits canonical lifecycle events.
- [ ] Study Activity remains capped independently of the longer Session Liveness wait.
- [ ] Timer/timestamp state does not rerender the full Workspace on each tick.
- [ ] Fixed-clock API/Postgres/component/browser tests cover coalescing, duplicate pulse, hidden tab, abandonment, cross-midnight/timezone, 15/30 prompt, continue, pause/no response, and implicit resume regression.

### Blocked by

- F08 — Folio: Tutor Conversation Stream And Runtime Work View.
- F10 — Folio: Study Map Over The Workspace Read Model.
- F11 — Folio: Reference Surfaces And Artifact Lifecycle.
- F12 — Folio: Evidence And Source Opening.
- F13 — Folio: Persisted Practice And Mastery Evidence.
- F14 — Folio: Interactive Learning Blocks And Actions.
- F15 — Folio: Sandboxed MCP App Renderer.
- F16 — Folio: Learner Dashboard Summary Core.

## F19 — Folio: Admin Users And Workspaces

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Port Admin user and Workspace management to a dense, operator-first layout that uses Folio tokens, typed routes, validated API operations, server-owned pagination/filter/search, and real data. Provide complete list/detail/status/action paths without forcing editorial learner composition onto operational tables.

### Acceptance criteria

- [ ] `/admin/users`, `/admin/users/:userId`, `/admin/workspaces`, and `/admin/workspaces/:notebookId` use typed routes and validated list/detail/action contracts.
- [ ] Admin Access and resource authorization are enforced in route UX and every API operation; learner/admin layouts and chunks remain separated.
- [ ] User and Workspace lists use cursor/server pagination, filter/search, stable ordering, and typed shareable search state where growth is unbounded.
- [ ] Detail routes show learner-safe identity, entitlement/status, Workspace/source/ingestion summaries, and approved operator actions without leaking secrets.
- [ ] Status/entitlement/Workspace actions name the affected resource and provide pending, success, failure, refresh, and audit/correlation behavior.
- [ ] Dense tables remain keyboard accessible, horizontally usable at narrow widths, and preserve filter/count state.
- [ ] Operator errors show safe request/trace IDs and recovery without raw stacks, cookies, or private source/transcript bodies.
- [ ] Routes are lazy and absent from public/learner initial bundles.
- [ ] API/component/browser tests cover authorization, list/detail, pagination/search, direct URL, representative mutation, empty/error, and responsive table behavior.

### Blocked by

- F01 — Folio: Public Shell And Production Client Foundation.
- F02 — Folio: Protected Learner Shell And Beta Consent.

## F20 — Folio: Admin Templates, Access Codes, And Credits

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Port Published Study Template, Access Code, and credit administration to dense Folio-token-aligned operator routes. Each list/form/action uses typed real-data contracts, server validation, explicit affected resources, and complete error/pending states.

### Acceptance criteria

- [ ] `/admin/templates`, `/admin/access-codes`, and `/admin/credits` use typed lazy routes and validated read/command schemas.
- [ ] Published Study Template create/edit/publish/unpublish behavior preserves template/content ownership and prevents invalid learner-visible publication.
- [ ] Access Code list/create/revoke/delete behavior validates entitlement/limit/expiry state and clearly names irreversible effects.
- [ ] Credit lookup/grant/adjust behavior validates target user, credit type, limits, reason/audit metadata, and resulting balance.
- [ ] Lists use server pagination/filter/search when unbounded and typed URL search state when shareable.
- [ ] Forms and confirmation dialogs cover validation, pending, success, conflict, partial/unavailable, and server failure states without duplicate commands.
- [ ] Admin Access is enforced server-side and at route boundaries; no operator route/module appears in learner bundles.
- [ ] API/Postgres/component/browser tests cover authorization, validation, state transitions, direct URL, keyboard forms/dialogs, and responsive dense layout.

### Blocked by

- F01 — Folio: Public Shell And Production Client Foundation.
- F02 — Folio: Protected Learner Shell And Beta Consent.

## F21 — Folio: Admin Feedback, Ingestion, Analytics, And Deletion Operations

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Port the remaining operational Admin surfaces: overview, Learning Feedback/Support queues, ingestion sources/triggers, analytics summaries, and account-deletion requests. Use dense Folio-token-aligned tables/queues with typed filtering, actions, health/error states, and safe operational diagnostics.

### Acceptance criteria

- [ ] `/admin`, `/admin/feedback`, `/admin/ingestion`, `/admin/analytics`, and `/admin/account-deletion` use typed lazy routes and validated contracts.
- [ ] Overview reports real service/product summaries with explicit unavailable/partial states rather than fabricated counts.
- [ ] Feedback/support queues provide server pagination/filter/status actions and never expose content to product analytics.
- [ ] Ingestion views distinguish source state, queued/deferred work, failure/retry/review, and trigger-run status with guarded explicit commands.
- [ ] Analytics views use approved aggregate/product metrics and remain separate from canonical learning state.
- [ ] Account-deletion queues clearly identify request state and require explicit confirmed operator action with audit/correlation behavior.
- [ ] Long tables/queues retain counts, filter state, keyboard access, horizontal usability, and operator-safe error detail.
- [ ] Admin Access is enforced server-side and in route boundaries; operations are idempotent or conflict-safe where retries are possible.
- [ ] API/Postgres/component/browser tests cover authorization, pagination/filtering, representative queue transition/trigger, unavailable dependencies, direct URL, and responsive layout.

### Blocked by

- F01 — Folio: Public Shell And Production Client Foundation.
- F02 — Folio: Protected Learner Shell And Beta Consent.

## F22 — Folio: Eval Runs Console

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Port the Eval Runs list, detail, creation/update actions, and live event stream to a typed, route-split, Folio-token-aligned operator console. Preserve reconnect/refetch and diagnostic behavior without coupling the browser to `@studyagent/eval-runner` runtime code.

### Acceptance criteria

- [ ] `/eval-runs` and `/eval-runs/:runId` use typed lazy routes and validated list/detail/action/event contracts.
- [ ] The web package does not import or depend on `@studyagent/eval-runner`; the API owns Eval orchestration/contracts.
- [ ] List/detail state covers loading, empty, selected, running, completed, failed, cancelled, stale, and unknown/deleted run.
- [ ] Event stream validates frames, tracks sequence/cursor, reconnects and refetches authoritative state, ignores duplicates, and closes on route/logout change.
- [ ] Direct run URLs, back/forward selection, filters, and pagination remain deterministic.
- [ ] Admin/Eval authorization is enforced server-side and at route boundaries.
- [ ] Operator errors expose safe request/trace/run identity and recovery without raw secrets.
- [ ] Existing Eval dashboard tests are preserved or replaced; browser tests cover unauthorized access, list/detail stream, reconnect, terminal state, and responsive layout.

### Blocked by

- F01 — Folio: Public Shell And Production Client Foundation.
- F02 — Folio: Protected Learner Shell And Beta Consent.

## F23 — Folio: Dev Mode Diagnostics

Type: AFK

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Port the developer timeline, Tutor trace/Runtime diagnostics, graph/source details, MCP bridge diagnostics, and other Notebook development surfaces into explicit Folio-token-aligned Dev Mode boundaries. Maintain strict separation so raw IDs, traces, claims, provider metadata, and pipeline state cannot appear in learner mode.

### Acceptance criteria

- [ ] Every currently reachable Dev Mode panel has an owning typed route, tab, or feature entry point and a documented authorization/visibility rule.
- [ ] Developer timeline/trace APIs use validated cursor/limit/filter contracts and learner-owned Notebook authorization plus required Dev/Admin access.
- [ ] Raw Node IDs, claims, traces, provider metadata, tool summaries, projection health, and MCP protocol detail render only inside explicit Dev Mode.
- [ ] Tutor live/durable diagnostic state uses the same typed stream/session identities established in F08 without changing learner transcript presentation.
- [ ] Graph/source/MCP diagnostics load lazily and do not inflate ordinary learner Workspace chunks.
- [ ] Switching Dev Mode off removes diagnostic UI/state from the accessible tree and prevents diagnostic queries/streams from continuing.
- [ ] Learner analytics and errors do not copy diagnostic payload contents.
- [ ] Existing diagnostic tests are preserved or replaced; browser tests cover authorization, toggle/off non-leakage, timeline/trace loading, stream cleanup, direct URL policy, and responsive data-dense presentation.

### Blocked by

- F07 — Folio: Notebook Workspace Bootstrap And Source Lifecycle.
- F08 — Folio: Tutor Conversation Stream And Runtime Work View.

## F24 — Folio: Production Cutover And Legacy Deletion

Type: HITL

### Parent

F00 — Folio Production Frontend Revamp.

### What to build

Complete the production cutover after all Folio vertical slices pass. Run the complete real-data, provider, Docker, accessibility, visual, responsive, security, observability, and performance matrix; fix integration regressions; delete the old frontend implementation, UI generations, mock data, styles, fonts, routes, wrappers, and dependencies; and produce one deployable Folio artifact with deployment rollback through release history, not a runtime fallback.

### Acceptance criteria

- [ ] Every route and surface in the implementation plan is checked against real API/persisted state and its loading, empty, error, degraded, unauthorized, and responsive states.
- [ ] Critical browser journeys pass against Docker-backed API, Postgres, object storage, worker/queue, event streams, and real provider path where required.
- [ ] Real provider Tutor success is explicitly proven; fallback-only/mock success is not accepted as release proof.
- [ ] Automated axe plus manual keyboard, focus, 200% zoom, reduced motion, screen-reader-oriented semantics, and iframe checks pass.
- [ ] Same-state/same-viewport visual comparisons pass for canonical Folio dashboard, Workspace, node, Reading, Practice, Evidence, and remaining designed routes at required viewports.
- [ ] Public, dashboard, Workspace, lazy chunk, CSS, font, and Core Web Vitals budgets pass or have explicit human-approved exceptions.
- [ ] CSRF posture, route/API ownership, redirect/source-open allowlists, private-data logging, and MCP sandbox policy pass review.
- [ ] Route/API/Tutor/event/MCP errors and correlation are observable in production tooling without learner content leakage.
- [ ] Legacy/Mist/Next theme/generation code, handwritten router, duplicate fetch wrappers, obsolete CSS/fonts/assets, `@studyagent/eval-runner` browser dependency, production mock data, and dead components are deleted.
- [ ] Static nginx build and same-origin `/api/*` + `/auth/*` routing pass the hosted-beta verification script and full browser suite.
- [ ] Main receives one cutover PR/release with database/API ordering and a tested deployment rollback procedure.
- [ ] A human approves final visual parity, complete behavior matrix, measured performance, and production release readiness.

### Blocked by

- F03 — Folio: Published Study Template To Personal Learner Workspace.
- F04 — Folio: Tutor Credits And Access Code Flows.
- F05 — Folio: Learning Feedback And Support Report Flows.
- F06 — Folio: Account Resources And Deletion Requests.
- F09 — Folio: Tutor Session History, Settings, And Lifecycle.
- F10 — Folio: Study Map Over The Workspace Read Model.
- F12 — Folio: Evidence And Source Opening.
- F13 — Folio: Persisted Practice And Mastery Evidence.
- F15 — Folio: Sandboxed MCP App Renderer.
- F17 — Folio: Due Practice And Dashboard Recommendations.
- F18 — Folio: Study Activity Intervals And Session Liveness.
- F19 — Folio: Admin Users And Workspaces.
- F20 — Folio: Admin Templates, Access Codes, And Credits.
- F21 — Folio: Admin Feedback, Ingestion, Analytics, And Deletion Operations.
- F22 — Folio: Eval Runs Console.
- F23 — Folio: Dev Mode Diagnostics.
