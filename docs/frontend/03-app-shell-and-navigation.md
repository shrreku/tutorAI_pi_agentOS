# App Shell And Navigation

## TutorBook App Shell (hosted beta)

Learner routes under `/app/*` use `AppShell` with a persistent sidebar.

Sidebar items:

- Dashboard (`/app`)
- Credits (`/app/credits`) — percent remaining; optional Stripe pack purchase when enabled
- Access code (`/app/access-code`)
- Support (`/app/support`)
- Account (`/app/account`)

Credit balance indicator appears in the sidebar when session includes credit percent.

### Credits page layout

```text
Heading + lead copy
[optional checkout success/cancel banner]
Balance card
  - percent remaining + exhausted badge
  - progress bar
  - usage explanation
[when checkout enabled]
Buy more credits
  - pack list (label, description, price, Buy)
[when checkout disabled]
Need more credits? → access code / support
```

Pack purchase redirects to Stripe; learner returns to `/app/credits` with query param cleared after banner display.

### Dashboard layout

```text
Heading
[optional onboarding modal overlay on first visit]
Template gallery grid OR empty state
```

Onboarding modal fields: study goal (text), level (select), Skip / Continue.

Consent gate: all `/app/*` except `/app/consent`, plus `/notebooks/*`, require Beta Consent. Unauthenticated users redirect to `/login`.

Admin routes use `AdminShell` at `/admin/*` with utilitarian dense tables.

See [12-tutorbook-hosted-beta.md](./12-tutorbook-hosted-beta.md) for full route and guard reference.

## Notebook Workspace Layout

Desktop workspace:

```text
Topbar
+-------------------------------------------------------------+
| Notebook title, source state, search, add source, context   |
+-----------------------+-------------------------------------+
| Tutor panel           | Workspace                           |
| Chat, session, plan   | Curriculum, Study Map, Source Wiki  |
| Composer              | Reference viewer, Evidence, apps    |
+-----------------------+-------------------------------------+
```

Default split:

- Tutor: about 35 percent width;
- Workspace: remaining width;
- draggable divider;
- persist split per notebook;
- keep the notebook shell constrained to the available viewport height below the topbar;
- scroll Tutor and Workspace independently so long chat history, Reference Surfaces, and graph content do not move the other pane or the notebook topbar;
- stack vertically under tablet width.

## Topbar

Required elements:

- notebook title;
- source readiness summary;
- selected context summary;
- search input;
- Dashboard navigation (back to `/app`);
- Eval runs navigation when developer-oriented routes are exposed;
- Add source;
- refresh.

Source readiness copy:

- `No sources yet`
- `2/3 sources ready`
- `1 processing`
- `1 improving`
- `1 failed`

Selected context copy:

- `Whole notebook context`
- `1 graph item selected`
- `2 graph items selected`

Design guidance:

- readiness and selection should be visible but quiet;
- Add source is the strongest topbar action;
- search should be available but not dominate the study loop.

## Notebook Index (legacy / pre-beta)

Pre-hosted-beta, the notebook index lived in `App.tsx`. Hosted beta replaces it with the dashboard at `/app`. The design below still applies if a standalone notebook list is reintroduced.

Notebook card content:

- title;
- short description;
- updated date;
- Continue button.

Empty state:

- title: `No notebooks yet`
- support: `Create one, then upload source material.`

Loading state:

- title: `Loading notebooks`
- support: `Connecting to the study workspace.`

Error state:

- title: `Could not load notebooks`
- support: `The workspace API may still be restarting.`
- action: Retry

## Source Upload

The source upload action should live in the topbar.

After upload:

- invalidate source and graph state;
- show processing state in the source readiness summary;
- avoid fake progress percentages unless real progress is available;
- if source fails, make the failure count visible and expose a repair route in the source detail or Source Wiki surface.

## Search

Current search is topbar-level and should become a real workspace search experience.

Target behavior:

- search across notebook, Study Map, Source Wiki, sources, concepts, and artifacts;
- results grouped by type;
- selecting a result opens a Reference surface or source span;
- selected result can be passed to tutor context.

Design states:

- empty query;
- loading;
- no results;
- grouped results;
- selected result;
- API degraded or retry state.

## Responsive Behavior

Desktop:

- split view by default;
- graph and source viewer get priority for width.

Tablet:

- vertical split;
- Tutor first, Workspace second;
- divider becomes row resize.

Mobile:

- one active major surface at a time;
- topbar wraps;
- Tutor, Workspace, and Evidence should become tabs or a surface switcher;
- composer remains reachable;
- Evidence drawer should become full-screen sheet.

## Persistent Navigation Rules

- The learner should always be able to return to the dashboard (`/app`).
- The learner should always be able to return from a Reference surface to the Workspace.
- A selected node should not trap the learner in detail mode.
- The tutor should retain selected context until the learner clears it, changes selection, or opens a different notebook.

## What Not To Add (notebook Workspace)

Do not add gamified progress rails inside the Workspace study loop. The TutorBook app shell already provides account-level navigation; the Workspace stays focused on study.
