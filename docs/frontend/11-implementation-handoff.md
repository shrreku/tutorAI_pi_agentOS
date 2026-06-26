# Implementation Handoff Contracts

## Purpose

This file gives designers enough technical contract detail to design complete frontend surfaces without coupling the design to raw backend internals.

## Key Route Contracts

API base:

- `/api/v1`

Auth base (outside `/api/v1`):

- `POST /auth/dev-login` (local dev only)
- `GET /auth/callback` (WorkOS)
- `POST /auth/logout`
- `GET /auth/session`

Web dev server and nginx must proxy both `/api` and `/auth` to the API process.

Session and entitlements:

- `GET /api/v1/me` — user, entitlements, Beta Consent state, credits (`percentRemaining`, `exhausted` only; no cents)
- `POST /api/v1/me/consent` — accept Beta Consent

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
  percentRemaining: number; // 0–100
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
  id: string; // e.g. "tutor_500"
  label: string; // e.g. "Tutor credits ($5)"
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
  checkoutUrl: string; // redirect learner here (Stripe hosted page)
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
- Evidence availability.

Designer implication:

- node visibility and emphasis should be first-class visual states;
- hidden and dev-only nodes must not leak into learner mode;
- current path treatment should not require custom backend rules in the UI.

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
