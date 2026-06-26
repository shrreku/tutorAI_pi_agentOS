# Information Architecture And Flows

## TutorBook Hosted Beta (product shell)

The hosted beta adds a **TutorBook app shell** around the existing notebook Workspace. Full route map and guards: [12-tutorbook-hosted-beta.md](./12-tutorbook-hosted-beta.md).

```text
Public          /  /demo  /contact  /privacy  /terms  /login  /auth/callback
Learner app     /app  /app/consent  /app/templates/:id  /app/workspaces/new
                /app/credits  /app/access-code  /app/support  /app/account
Notebook        /notebooks/:notebookId   ← core study Workspace (intentional long-term URL; ADR-0001)
Admin           /admin/*
Eval (dev)      /eval-runs
```

Entry flow: landing → login → consent → dashboard (template gallery) → workspace create → `/notebooks/:notebookId`.

`/app/*` is for account-level navigation; `/notebooks/:notebookId` is where study happens. No planned migration to `/app/workspaces/:id`.

The dashboard replaces the legacy notebook index as the primary "choose or start studying" surface. Learners can also create an empty workspace at `/app/workspaces/new`.

### Public Demo (`/demo`)

Purpose: explain the product to visitors who are not ready to sign in.

Required content for beta launch:

- what TutorBook does (source-backed study workspace, tutor, Study Map, Evidence);
- how it differs from generic chat;
- CTA back to `Start studying` / login.

Design direction:

- **copy-only for beta launch** — no embedded interactive workspace, no anonymous tutor session;
- not a launch blocker; live demo is post-launch polish;
- do not imply anonymous access to real workspaces or source material.

## Route-Level Structure

### Dashboard (replaces Notebook Index for hosted beta)

Purpose: choose a Published Study Template or continue an existing Personal Learner Workspace.

Required content:

- TutorBook product mark;
- Published Study Template cards (topic, source level, time estimate, study mode, outcome);
- optional onboarding prompt (skippable "Quick setup" modal on first visit);
- link to credits, support, account;
- loading, empty, and API error states.

Design direction:

- quiet gallery, not marketing hero;
- empty gallery until operator publishes templates via admin;
- no standalone `/notebooks` list page in the app shell — workspaces are reached from dashboard or direct URL.

### Credits (`/app/credits`)

Purpose: show tutor budget remaining and optional paid top-up.

Required content:

- percent-remaining progress bar and exhausted badge;
- short explanation of how credits are consumed;
- when paid checkout is enabled: purchasable credit packs with label, description, price, and **Buy** action;
- when paid checkout is disabled: pointer to access codes and support;
- post-checkout banners for success (`?checkout=success`) and cancel (`?checkout=cancelled`).

Design direction:

- show **percent remaining**, not internal ledger cents or provider cost;
- pack purchase prices are the only dollar amounts learners see;
- exhausted state should explain read-only review is still available;
- Stripe redirect is external; return URL is `/app/credits`.

### Access Code (`/app/access-code`)

Purpose: redeem operator-issued codes for study access, ingestion access, credits, or pilot tags.

Required content: code input, redeem action, success summary of grants, learner-safe errors.

### Support (`/app/support`)

Purpose: Learning Feedback and typed Support Reports after meaningful use.

### Account (`/app/account`)

Purpose: delete workspaces/sources; request full account deletion (manual ops follow-up during beta).

### Notebook Workspace

Purpose: the core study environment.

Primary layout:

- topbar: notebook title, source readiness, selected context, search, source upload, secondary navigation;
- resizable split body: Tutor on the left, Workspace on the right;
- persistent selection bridge: graph/reference selection is passed into tutor context.

### Eval Runs

Purpose: developer and QA dashboard for synthetic learner evals.

Design direction:

- keep separate from learner study mode;
- use Dev Mode vocabulary;
- do not let eval UI vocabulary leak into learner workspace.

## Global App Shell

The product now has **two navigation layers**:

1. **TutorBook app shell** (`AppShell`) — sidebar for dashboard, credits, access code, support, account. Used on `/app/*` routes.
2. **Notebook Workspace shell** — topbar + two-pane tutor/Workspace split. Used on `/notebooks/:notebookId`.

The notebook Workspace shell must preserve these concepts:

- active notebook;
- source readiness summary;
- selected Workspace context;
- global search entry point;
- Add source;
- route back to dashboard (`/app`);
- optional developer route to eval runs.

The TutorBook app shell should not compete with the Workspace for study-time attention. Learners enter the app shell to start or manage study; they enter the Workspace to study.

The core product study loop remains a two-pane Workspace — not a full marketing sidebar during study.

## Core Workspace Modes

### Curriculum

Readable path through the notebook.

Designer intent:

- show curriculum as a syllabus and study path;
- modules are readable chapter-sized groups;
- objectives appear embedded within modules;
- current objective is highlighted;
- completed and review states are legible.

Do not design objective lists as standalone learner pages.

### Study Map

Progress-oriented graph of curriculum, modules, sessions, artifacts, concepts, Source Wiki pages, sources, and weak concepts.

Designer intent:

- show relationships and current path;
- avoid raw backend graph density;
- emphasize current module, current objective, and current path concepts;
- make node selection feel useful, not inspect-only.

### Source Wiki

Source-grounded map and reference layer for uploaded material.

Designer intent:

- source picker first;
- topic groups as primary structure;
- concept and topic pages should read like polished notes;
- page readiness should be simple: Still improving, Ready to study, Needs more source support, Needs refresh.

## Main Learning Flows

### Hosted Beta Activation

1. Visitor lands on `/` → `Start studying` → `/login`.
2. First login → `/app/consent` → accept Beta Consent.
3. Optional onboarding modal on dashboard (study goal + level, or skip).
4. Select template or create workspace → `/notebooks/:notebookId`.
5. First tutor session + feedback contributes to activation analytics.

### Buy Tutor Credits (when enabled)

1. Learner opens `/app/credits`.
2. Sees percent remaining; if exhausted, tutor turns are blocked but review remains.
3. Learner selects a pack → `POST /checkout/credits` → Stripe Checkout.
4. Returns to `/app/credits?checkout=success`; credits update after webhook (banner explains delay).
5. Alternative paths: redeem access code, contact support.

### First Notebook

1. Empty dashboard gallery or no workspace yet.
2. Create workspace from template or `/app/workspaces/new`.
3. Empty workspace prompts Add source.
4. Source upload starts.
5. Readiness state shows processing.
6. Once ready, tutor can build curriculum or start first lesson.

Design need:

- clear empty state;
- progress without false precision;
- no forced onboarding tour.

### Start Or Continue Lesson

1. Tutor panel shows current objective or next action.
2. Learner chooses Start session, Continue session, Resume session, or Plan course.
3. Tutor streams Runtime Work View while preparing answer.
4. Learner response appears as the final tutor message.
5. Study state and Workspace refresh.

Design need:

- session controls visible but not dominant;
- current objective visible near composer and topbar;
- live work should show useful activity without feeling like debug logs.

### Select Workspace Context

1. Learner clicks a node or opens a Reference surface.
2. Selected context appears in topbar and tutor panel.
3. Tutor prompt includes selected refs.
4. Learner can ask "Teach this," "Review," "Practice," or open Evidence.

Design need:

- selected context should be obvious;
- selected context should be easy to clear or replace;
- no raw IDs in selection chips.

### Open Reference Surface

1. Learner selects a graph node.
2. Compact node detail can appear.
3. Full viewer opens for durable review.
4. Actions include ask tutor, review, quiz, regenerate where allowed, open source, Evidence.
5. Static and interactive blocks render inside the surface.

Design need:

- clear back path to Workspace;
- header action bar with stable hierarchy;
- content sections readable at long study length.

### Review Evidence

1. Learner opens Evidence from a node, surface, or interactive block.
2. Drawer shows source excerpts and supporting notes.
3. Dev Mode may reveal draft/debug claims and metadata.

Design need:

- Evidence is a trust layer, not a forensic tool in learner mode;
- excerpts should be scannable;
- supporting notes should use learner-safe labels.

### Use Artifact

1. Tutor proposes or creates a study aid.
2. Artifact appears when learner-visible and quality-gated.
3. Learner opens it from tutor panel or Workspace.
4. Learner approves, rejects, studies, edits notes, answers quiz, reviews flashcards, or asks tutor.
5. Results update learning state where applicable.

Design need:

- artifacts need type-specific layouts;
- proposed vs ready must be clear;
- artifact consent settings must remain available.

### Use Interactive MCP App

1. Reference surface includes an Interactive Learning Block.
2. Workspace renders native fallback or MCP App iframe.
3. Learner performs an action.
4. Bridge sends validated action envelope.
5. API returns updated canonical block state.
6. Surface refreshes.

Design need:

- the iframe should feel visually native;
- "Saving" and error feedback must be visible;
- interaction must not auto-call tutor unless learner asks for help or tutor-led flow requires it.
