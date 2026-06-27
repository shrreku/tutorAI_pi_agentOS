# Implementation Handoff Contracts

## Purpose

This file gives designers enough technical contract detail to design complete frontend surfaces without coupling the design to raw backend internals.

Production architecture and delivery are defined in:

- [ADR-0029](../adr/0029-react-vite-tanstack-fastify-folio-foundation.md);
- [Folio production architecture](./14-folio-production-architecture.md);
- [Folio end-to-end implementation plan](./15-folio-end-to-end-implementation-plan.md);
- [Folio ticket drafts](./16-folio-ticket-drafts.md).

The current frontend component tree is disposable. This handoff preserves product behavior, schemas, authorization, persistence, and runtime outcomes; it does not require reuse of the existing router, fetch helpers, contexts, hooks, components, or dependencies.

## Key Route Contracts

API base:

- `/api/v1`

Auth base (outside `/api/v1`):

- `POST /auth/dev-login` (local dev only)
- `GET /auth/callback` (WorkOS)
- `POST /auth/logout`
- `GET /auth/session`

Web dev server and nginx must proxy both `/api` and `/auth` to the API process.

Folio route coverage is complete-product scope. Design and implement every public, learner, Workspace, and required state directly from the canonical Folio system, including routes that lack Design Lab frames. Admin and development-only routes retain operator-first composition but use the same tokens and primitives. A route is not complete while it falls back to Legacy, Mist, generic shadcn defaults, or unstyled provisional presentation.

Session and entitlements:

- `GET /api/v1/me` — user, entitlements, Beta Consent state, credits (`percentRemaining`, `exhausted` only; no cents)
- `POST /api/v1/me/consent` — accept Beta Consent

## Learner Dashboard Read Model

The Folio dashboard is a real product surface, not seeded demonstration content. Add one learner-scoped API projection:

- `GET /api/v1/dashboard` returns the complete Learner Dashboard Summary for the authenticated learner.

The response must include:

- owned notebook summaries with current curriculum/module, persisted progress, last activity, and a typed resume action;
- a due-practice queue backed by persisted Artifacts, quiz attempts, learning state, and `nextReviewAt`;
- recommended plan items backed by the learner's persisted Study Plan and learner state;
- learner-safe recent activity backed by durable notebook events, sessions, attempts, and Artifact lifecycle changes;
- weekly and monthly active tutor-session activity derived from persisted lifecycle intervals;
- explicit `empty`, `not_ready`, or unavailable values when source state does not exist.

The API owns joins, ordering, learner-safe labels, duration derivation, recommendation reasons, and action targets. The frontend owns presentation, loading/error/empty states, week/month selection, and navigation. It must not join per-notebook endpoints, inspect raw event payloads, fabricate percentages or durations, or substitute sample rows.

Existing durable sources are `notebooks`, Study State/Study Plans, `tutor_sessions`/`tutor_turns`, `artifacts`, `quiz_attempts`, `learning_state`, `mastery_evidence`, Study Activity Intervals, and notebook `events`. Product analytics is not the canonical source for learning progress or Study time.

### Study Activity Interval prerequisite

The Folio dashboard's Study time chart requires ADR-0028 before release.

- Persist intervals with learner, notebook, optional Tutor Session, surface, optional target `NodeRef`, start, last activity, end, and end reason.
- Accept coalesced, idempotent pulses through a learner-owned notebook route such as `POST /api/v1/notebooks/:notebookId/study-activity/pulse`.
- Emit semantic pulses for Tutor sends/completions, surface changes, node/reference/Evidence opens, practice actions, and Interactive Learning Actions.
- A visible surface may send a sparse heartbeat only after recent meaningful activity; hidden tabs, browser-open time, and raw mouse movement do not extend an interval.
- The API starts, merges, and caps intervals at the inactivity boundary. Expiry is enforced on the next pulse/read/lifecycle request so no continuous sweeper is required.
- `GET /api/v1/dashboard` aggregates these persisted intervals for weekly/monthly Study time.
- Pulse payloads contain no source text, transcript text, learner answer, pointer coordinates, or private mastery detail.

Session Liveness is separate:

- persist a Tutor Turn Disposition such as `informational`, `awaiting_learner`, or `interactive_task`;
- the existing `pendingMasteryEvaluation` maps to `awaiting_learner`; Interactive Learning launches map to `interactive_task`; otherwise default to `informational`;
- prompt `Continue studying?` after 15 inactive minutes for informational turns and 30 inactive minutes for `awaiting_learner` or `interactive_task`;
- `Continue` renews activity and liveness; `Pause` or no response pauses the session and emits the normal lifecycle event;
- fix the existing implicit paused-to-active path in `getOrCreateTutorSession` so every transition emits a resume event.

Recommendation policy:

- `GET /api/v1/dashboard` is a pure read and never invokes an LLM;
- eligibility, due state, and ordering are deterministic from persisted Study Plans, Mastery Evidence, learning state, and review dates;
- tutor/planning flows may generate explanation copy or richer plan content with an LLM, but must persist the result, generation metadata, and source state before the dashboard can display it;
- deterministic fallback labels and reasons are always available when no generated enrichment exists;
- an explicit `POST /api/v1/dashboard/recommendations/refresh` may enqueue asynchronous LLM enrichment, return `202`, and leave the current persisted recommendations usable while generation runs;
- refresh success or failure is persisted and exposed by the Dashboard Summary so the UI can invalidate and render honest pending/error/freshness states.

Dashboard action policy:

- Continue, review, practice, and resume rows return a typed Dashboard Action Target and deep-link into `/notebooks/:notebookId`;
- each target carries a Workspace surface, optional `NodeRef`/Artifact/Session reference, and explicit intent;
- the router serializes targets through one shared URL helper, and the Workspace bootstraps selection/view state from that URL so reload, back/forward navigation, and links remain deterministic;
- opening a card or recommendation never mutates learner state;
- week/month selection, row expansion, and filtering remain dashboard-local state;
- only explicit commands such as recommendation refresh call mutating APIs and expose pending/success/failure state.

The current Workspace keeps selected node, Artifact, Session, and view state in component/context state and has no URL bootstrap path. Adding the shared Dashboard Action Target schema, URL codec, and Workspace initialization is required before dashboard CTAs are functional.

- `GET /api/v1/credits` — `{ percentRemaining, exhausted }`

Hosted-beta learner routes:

- `GET /api/v1/checkout/credits/packs` — purchasable credit packs when paid checkout enabled
- `POST /api/v1/checkout/credits` — start Stripe Checkout session (`{ packId }` → `{ checkoutUrl }`)
- `GET /api/v1/study-templates` — published templates for dashboard
- `POST /api/v1/workspaces/from-template` — create Personal Learner Workspace from template (not `POST /notebooks` with `studyTemplateId`)
- `POST /api/v1/access-codes/redeem`
- `POST /api/v1/feedback` — Learning Feedback and Support Reports
- `DELETE /api/v1/workspaces/:notebookId`, `DELETE /api/v1/sources/:sourceId`
- `POST /api/v1/account/deletion-request`

Notebook Workspace routes (unchanged):

- `GET /api/v1/notebooks`
- `POST /api/v1/notebooks`
- `POST /api/v1/notebooks/:notebookId/sources`
- `GET /api/v1/notebooks/:notebookId/sources`
- `GET /api/v1/notebooks/:notebookId/study-state`
- `POST /api/v1/notebooks/:notebookId/tutor/chat`
- `POST /api/v1/notebooks/:notebookId/tutor/session/pause`
- `POST /api/v1/notebooks/:notebookId/tutor/session/resume`
- `POST /api/v1/notebooks/:notebookId/tutor/session/end`
- `GET /api/v1/notebooks/:notebookId/tutor/sessions`
- `POST /api/v1/notebooks/:notebookId/graph/query`
- `GET /api/v1/notebooks/:notebookId/graph/layout`
- `GET /api/v1/notebooks/:notebookId/nodes/:nodeId/reference-surface`
- `GET /api/v1/notebooks/:notebookId/nodes/:nodeId/provenance`
- `POST /api/v1/notebooks/:notebookId/interactive-learning/actions`
- `GET /api/v1/notebooks/:notebookId/events/stream?after=0`

## Credit Balance And Checkout

Learner credit summary (`GET /api/v1/credits` and `GET /api/v1/me`):

```ts
{
  percentRemaining: number;  // 0–100
  exhausted: boolean;
}
```

Do not show ledger cents, provider cost, or token counts in learner UI. Pack purchase prices are the exception when checkout is enabled.

Paid checkout is gated by `PAID_CREDIT_CHECKOUT_ENABLED` (defaults off).

List packs (`GET /api/v1/checkout/credits/packs`):

- Returns `404` with `{ code: "feature_disabled" }` when checkout is off — hide purchase UI.
- When on, returns `{ packs: CreditPack[] }`:

```ts
{
  id: string;           // e.g. "tutor_500"
  label: string;      // e.g. "Tutor credits ($5)"
  creditType: "tutor" | "ingestion";
  priceCents: number;
  currency: "usd";
  description: string;
}
```

Start checkout (`POST /api/v1/checkout/credits`):

Request: `{ packId: string }`

Response `201`:

```ts
{
  sessionId: string;
  checkoutUrl: string;  // redirect learner here (Stripe hosted page)
  packId: string;
}
```

Stripe return URLs:

- success → `/app/credits?checkout=success`
- cancel → `/app/credits?checkout=cancelled`

Credits are granted asynchronously via webhook after payment. UI should show a success banner and note credits may take a moment to appear.

Designer implication:

- design pack cards, exhausted state, checkout banners, and redirect loading;
- do not design inline card entry — Stripe Checkout only.

## Tutor Chat Request

Tutor chat uses an AG-UI-like SSE stream.

Request includes:

- messages;
- active mode: learn, practice, revise, explore, Source Wiki maintenance;
- selected node refs;
- optional session ID;
- action: prompt, steer, or follow up.

Stream can include:

- session started;
- run started;
- thinking;
- narration;
- tool call start, args, end;
- text message start, content, end;
- run finished;
- run error.

Designer implication:

- design both live work and final response;
- design retry and partial failure;
- design tool-only turns with no final tutor message.

## Tutor History Read Model — Hosted Beta MVP

Complete Tutor History is a hosted-beta MVP requirement. The existing recent-session response and developer trace endpoint are not sufficient contracts for the learner surface.

Required API surfaces:

- `GET /api/v1/notebooks/:notebookId/tutor/sessions?cursor=&limit=&query=&filter=` returns paginated learner-safe summaries;
- `GET /api/v1/notebooks/:notebookId/tutor/sessions/:sessionId` returns the learner-safe transcript for a selected session.

Session summary:

```ts
{
  sessionId: string;
  title: string;
  mode: "learn" | "practice" | "revise" | "explore" | "wiki_maintenance";
  status: "active" | "paused" | "completed";
  startedAt: string;
  endedAt?: string;
  turnCount: number;
  firstQuestionSnippet?: string;
  latestAnswerSnippet?: string;
  current: boolean;
}
```

List response:

```ts
{
  sessions: TutorHistorySessionSummary[];
  nextCursor?: string;
}
```

The API owns pagination, search, filtering, title/snippet derivation, and learner-safe transcript projection. The frontend owns the history panel, selection state, loading and empty states, and the clear `Viewing previous session` treatment. `/tutor/trace` remains a Dev Mode replay and diagnostics surface, not a dependency of Tutor History.

## NodeRef

Canonical reference shape:

```ts
{
  refType: string;
  refId: string;
  handle?: string;
  title?: string;
  label?: string;
}
```

Learner UI should show handle, title, or label, never raw IDs.

## Reference Surface Shape

Reference surface includes:

- id;
- notebook ID;
- node ref;
- title;
- surface type;
- summary;
- status;
- static blocks;
- interactive blocks;
- source refs;
- scope refs;
- primary actions;
- quality;
- generation metadata.

`surfaceType` includes `live_plan`. A study-plan node must return `surfaceType: "live_plan"`; it must not masquerade as `objective`. The embedded interactive block remains kind `live_plan`.

Primary actions:

- ask tutor;
- review;
- quiz;
- regenerate;
- open Evidence;
- open source.

Designer implication:

- header action bar must support variable action sets;
- body must support static and interactive blocks;
- quality and status must be learner-safe.

## Evidence Read Model — Hosted Beta MVP

Rich Evidence is a hosted-beta MVP requirement because it is the learner-facing trust layer, not optional presentation polish.

The API contract must provide enough learner-safe data to render the Mist Glass Evidence examples without exposing raw claim, chunk, or entity internals:

- total Evidence count;
- Evidence grouped by contributing source;
- source title and source type;
- source-appropriate locator such as page, slide, section, or timestamp;
- excerpt or supporting note;
- stable target for opening the original source at the locator when supported;
- optional preview asset;
- empty, unavailable, and hidden-debug-item states.

The beta baseline remains useful without generated previews: source title, locator, excerpt, and open-source target are required. The frontend owns drawer layout, tabs, loading states, responsive presentation, and optional client-rendered previews; the API owns source grouping, learner-safe labels, locators, and open-source targets.

Server-generated page or slide thumbnails are out of scope for hosted beta. `previewAsset` may be absent. Adding a thumbnail-generation worker, derived-image storage, or ingestion gate is not required for the frontend to ship.

Source Open Target:

```ts
type SourceOpenTarget = {
  sourceId: string;
  sourceTitle: string;
  sourceType: "pdf" | "slides" | "document" | "audio" | "video" | "web" | "other";
  href: string; // authenticated app-relative destination; treat as opaque
  locator:
    | { kind: "page"; start: number; end?: number; label: string }
    | { kind: "slide"; start: number; end?: number; label: string }
    | { kind: "section"; section: string; label: string }
    | { kind: "timestamp"; startSeconds: number; endSeconds?: number; label: string }
    | { kind: "none"; label: null };
};
```

The API derives this target from source and Evidence metadata. The frontend may pass the typed locator to its source viewer, but it must not construct source URLs from object keys, signed storage URLs, or raw chunk metadata.

## Static Block Kinds

Supported static block kinds:

- markdown;
- summary;
- definition;
- formula table;
- step list;
- question list;
- flashcard list;
- comparison table;
- citation list;
- example;
- callout;
- quiz feedback;
- metadata.

## Interactive Block Kinds

Supported interactive block kinds:

- quiz;
- flashcard deck;
- worked example;
- Evidence explorer;
- simulation;
- Live Plan;
- source reader;
- personalization controls;
- Dev trace dashboard;
- comparison;
- concept timeline.

## Interactive Action Envelope

Interactive actions carry:

- notebook ID;
- surface ID;
- block ID;
- node ref;
- artifact ID when relevant;
- source refs;
- Evidence refs;
- objective refs;
- concept refs;
- optional session ID;
- optional turn ID;
- optional run ID;
- renderer kind;
- renderer version;
- action name;
- action payload;
- created at.

Designer implication:

- submitted actions must be explicit;
- passive interactions should not look like mastery checks;
- app saving state should be visible.

## Workspace Read Model

The Workspace Read Model tells the frontend:

- view mode;
- Dev Mode state;
- current module;
- current objective;
- current path concepts;
- node catalog;
- source topics;
- projection warning;
- projection health.

Node catalog includes:

- sanitized node;
- visibility: learner, dev-only, hidden;
- Reference surface target;
- emphasis: current objective, current module, current path, none;
- learner-safe type label;
- independent progress, readiness, and learning states;
- learner-safe status label;
- relative importance: primary, secondary, supporting;
- Evidence count;
- available primary actions;
- disabled or locked reason when applicable.

Designer implication:

- node visibility and emphasis should be first-class visual states;
- hidden and dev-only nodes must not leak into learner mode;
- current path treatment should not require custom backend rules in the UI;
- frontend themes map semantic fields to size, color, icon, badge, and layout;
- the API must not return CSS classes, theme tokens, pixel dimensions, or component names.

Semantic state contract:

```ts
{
  progressState: "current" | "upcoming" | "completed" | "locked" | "none";
  readinessState:
    | "processing"
    | "still_improving"
    | "ready_to_study"
    | "needs_more_source_support"
    | "needs_refresh"
    | "needs_review"
    | "unavailable"
    | "none";
  learningState: "not_started" | "in_progress" | "needs_practice" | "proficient" | "none";
  statusLabel: string | null;
}
```

These dimensions are independent. A node may simultaneously be the current Objective, need practice, and have a Reference Surface that is ready to study. The frontend must not collapse raw graph, ingestion, mastery, or artifact statuses into this contract itself.

## Artifact View Shape

Artifact view includes:

- id;
- notebook ID;
- title;
- type;
- purpose;
- student action;
- status;
- source refs;
- claim refs;
- coverage refs;
- objective refs;
- confidence;
- last updated reason;
- sections;
- actions;
- quality.

Quality includes:

- source-backed;
- needs review;
- issues.

Designer implication:

- artifact layouts should use purpose and student action prominently;
- quality should be human-readable;
- confidence should not be primary learner UI.

## Events And Refresh

Notebook event stream updates:

- curriculum;
- objectives;
- sessions;
- study plan;
- mastery;
- artifacts;
- source readiness;
- graph projection.

Designer implication:

- design refreshed states that do not jump disorientingly;
- graph can show subtle `Refreshing graph...`;
- artifact and study state can update after actions.

## Dev Mode Contract

Dev Mode may show:

- raw node types;
- raw statuses;
- IDs;
- labels;
- tool calls;
- runtime trace;
- draft/debug claims;
- metadata;
- projection health.

Learner mode must hide or transform:

- raw IDs;
- raw claims;
- coverage records;
- source chunks as graph nodes;
- objective list internals;
- session plan internals;
- debug, trace, LLM, provenance language.

## Designer Deliverables

For a complete frontend design pass, deliver:

- TutorBook public pages (landing, demo, legal, login);
- TutorBook app shell (dashboard, consent, credits with checkout variants, access code, support, account);
- admin console (utilitarian tables);
- desktop and mobile notebook Workspace shell;
- tutor panel with empty, running, completed, failed, history, and session states;
- Runtime Work View;
- Workspace toolbar and status bar;
- Curriculum mode;
- Study Map mode with all learner node families;
- Source Wiki mode;
- compact node detail;
- full Reference surface;
- Evidence drawer;
- artifact type surfaces;
- MCP app bundle designs;
- native fallback designs;
- settings and artifact consent;
- responsive behavior;
- accessibility states;
- Dev Mode variants.

## Open Product Questions For Designers

These are intentionally left as design exploration items:

- Should mobile default to Tutor first or Workspace first after a session starts?
- Should selected context appear as topbar chips, composer chips, or both?
- Should graph nodes use shape, icon, or both to distinguish type?
- Should Live Plan become a persistent side module in Tutor, Workspace, or both?
- Should artifact proposals appear first in chat, Workspace, or a shared queue?
- How should source readiness failures expose repair without becoming developer-heavy?
