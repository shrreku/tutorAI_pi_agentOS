# Web Workspace Context

The web workspace is the learner-facing notebook shell for StudyAgent. It combines notebook selection, source upload, tutor chat, session lifecycle controls, Live Plan visibility, graph-based navigation, reference surfaces, artifacts, Evidence inspection, and developer trace/timeline inspection.

The web shell is not the teaching engine. Teaching happens through the tutor runtime/API. The shell selects context, streams responses, renders state, and lets learners inspect or act on notebook artifacts.

## Owned Code

- `apps/web/`: clean-room Folio React application; routes, feature modules, presentation, responsive behavior, and accessibility.
- `packages/ui/`: Folio tokens, primitives, and shared low-domain composites.
- `packages/api-client/`: browser transport, runtime validation, error, query-key, and stream interface.
- `packages/schemas/`: shared contracts consumed by the browser and Fastify routes.
- `apps/api/`: Folio-facing bounded read models, validation, and commands consumed by the browser client.
- `frontend-examples/folio/`: visual and interaction references; never a production data path.

Frontend Contract Kit: the in-repo bundle of product language, shared schemas, browser client operations, route/state matrices, acceptance journeys, and visual references that govern the Folio build. Excludes the Provisional UI implementation.

## Key Concepts

Program Tracking: F01–F24 tickets stay in `docs/frontend/16-folio-ticket-drafts.md` until F01 lands on the integration branch; GitHub issues publish after the scaffold is runnable. Avoid filing issues before the branch and route map exist.

Folio Release Boundary: the complete F01–F24 Folio program — public shell, learner shell, Notebook Workspace, Dashboard, Admin, Eval, Dev Mode, and Legacy deletion — ships in one cutover to main with no partial mixed-generation runtime. Avoid learner-first cutover, operator-deferred cutover, and vertical MVP releases that leave hosted-beta routes on Provisional UI.

Folio Build Ownership: the StudyAgent team owns the full Folio stack in-repo — `packages/schemas`, `packages/api-client`, `packages/ui`, Folio-facing `apps/api` read models, and `apps/web` — delivered on the Folio Integration Branch. Vertical slices F01–F24 are implemented internally. Avoid outsourced handoff assumptions and external-only ownership of `apps/web`.

Tutor Transport: live tutor streaming uses **TanStack AI** (`@tanstack/ai-react` / `@tanstack/ai-client`) **behind** a StudyAgent-owned adapter — not imported directly by Folio presentation components. The adapter owns send, steer, cancel, session identity, stream event normalization (including custom `SESSION_STARTED` and Runtime Work View events), terminal status, and durable reload. TanStack Query remains the sole server-state cache for post-turn REST reads (trace, study state, artifacts). Avoid coupling Folio UI to `UIMessage` types or `useChat` outside the adapter module.

Folio UI Package Scope: `@studyagent/ui` holds shared non-visual helpers only until Folio tokens and primitives are promoted from `frontend-examples/folio/design-lab/`. Folio semantic tokens, typography, and primitives stay in the design lab example until an explicit promotion slice. Avoid importing design-lab CSS or mock data into `apps/web` or `@studyagent/ui`.

Folio Implementation Baseline: `codex/folio-clean-frontend` is the git and documentation starting point. Create `feat/folio-production-revamp` from that branch; do not start from `feat/ui-preview-themes` or evolve the Provisional UI tree in place. Promote Design Lab visuals through the Design Lab Port Policy; delete Provisional UI on the integration branch as F-slices replace it.

Folio Integration Branch: long-lived source-control isolation branch (`feat/folio-production-revamp`) branched from `codex/folio-clean-frontend`. All implementation PRs target this branch until F24 passes; main receives one final cutover PR. Avoid shipping incomplete Folio routes to main and runtime Legacy/Folio switches.

Learner Home Label: the learner-facing name for the `/app` home surface (sidebar entry and page heading). **Deferred** — ship **Journal** as interim copy in learner chrome until finalized. **Learner Dashboard Summary** remains the API/domain term for the cross-workspace read model. Avoid using "Dashboard" as the primary nav label while the label is open unless docs explicitly mean the read model or Action Targets.

TutorBook App Shell: learner-facing navigation outside the Notebook Workspace — dashboard, notebooks list, consent, and account. Uses a **sidebar**; credits, access codes, support, and data deletion are **Account tabs**, not separate top-level nav items. Distinct from the study-time Workspace shell.

Learner Account: the account area of the TutorBook App Shell. Canonical routes are **path tabs** under `/app/account/$tab` where `$tab` is `overview`, `credits`, `access-code`, `support`, or `data`. Legacy flat routes (`/app/credits`, `/app/access-code`, `/app/support`) redirect to the matching tab and preserve query params (e.g. Stripe `?checkout=success`). Avoid top-level sidebar entries for those flows.

Public Landing: the anonymous `/` marketing page. Product copy and section structure follow product-domain CONTEXT; the visual layout variant (Journal, Tutor, or Library) is **deferred**. Production ships **Journal as interim scaffold** inside a swappable landing layout module until a variant is chosen. Avoid building three production landings or a runtime landing switcher.

Chrome Module: a swappable presentation boundary for deferred visual decisions — learner Nav Chrome Variant, Public Landing layout, and Learner Home Label. Routes, data wiring, and IA stay stable; only the chrome module is replaced when a direction is chosen. **No fixed F-slice deadline** — swaps are allowed any time before cutover as long as feature controllers stay chrome-agnostic. Avoid baking variant-specific markup into feature controllers or route loaders; avoid letting interim scaffolds diverge so far that late swaps become full rewrites.

Operator Surface: Admin, Eval, and other development-only routes use an operator-first layout — dense tables, compact controls, and existing information architecture. They adopt Folio tokens, shared primitives, accessibility, and state language only. Avoid learner editorial composition (journal masthead, spacious marketing cards, serif-led page chrome) on operator routes.

Dev Mode Access: Workspace Dev Mode UI and `devMode: true` API/graph requests are allowed only when `me.entitlements.adminAccess` is true or an explicit local/dev deployment policy is enabled. Learners never see a Dev Mode toggle or diagnostic surfaces. Avoid learner-accessible Dev Mode toggles and raw claim/trace/pipeline copy outside Dev Mode boundaries.

Learner Session Bootstrap: the `_learner` layout route loads and validates `me` once via TanStack Router `beforeLoad` and a shared TanStack Query cache. It owns redirects for unauthenticated, disabled-account, and missing Beta Consent states; child routes consume the cached session context. Avoid per-route session fetches without shared query keys or session providers without route guards.

Evidence Drawer State: open/closed Evidence drawer UI is local component state, not a URL search param. Shareable deep links use Workspace URL Codec fields (`surface`, `intent`, `refType`, `refId`) and the workspace renders Evidence as a consequence of the resolved target. Avoid `evidence=open` URL flags unless a future product requirement needs explicit shareable drawer links.

Learner Onboarding Gate: study-goal and level onboarding runs in **F02** on first entry to any protected learner route when `onboarding.completed` is false — after Beta Consent, independent of the Learner Home Gate (F16). Avoid deferring onboarding to dashboard read-model launch or conflating it with template pick in F03.

Notebook Event Bridge: one workspace-scoped notebook SSE subscriber per open `/notebooks/:notebookId` route. It maps `eventType` to TanStack Query invalidation hints; features own query keys but do not open their own notebook event streams. Events are invalidation hints only — canonical state always refetches from API reads. Avoid per-feature SSE subscriptions and treating the event stream as a client-side database.

Template Discovery Route: Published Study Template gallery and detail live at `/app/templates` and `/app/templates/:templateId`; workspace creation at `/app/workspaces/new`. These routes ship in F03 with real API data and are independent of the Learner Home Gate. The gated `/app` placeholder may link learners to template discovery. Avoid blocking template flows on F16 or hiding templates only on public landing pages.

Learner Home Gate: the `/app` home surface does not render notebook progress, resume actions, due practice, recommendations, recent activity, or study-time sections until the **Learner Dashboard Summary** bounded API read model ships (F16). F02 may ship the learner shell, guards, and account tabs with an honest loading or empty placeholder on `/app` — not assembled dashboard content from multiple client-side joins and not Design Lab sample data. Avoid client-side dashboard joins as a temporary production path.

Notebooks List Route: the learner notebooks index lives at `/app/notebooks`. Opening a Personal Learner Workspace for study routes to `/notebooks/:notebookId`. Avoid a top-level `/notebooks` list index that shares a prefix with the workspace URL unless route ordering is explicit.

Learner Route Tree: production learner URLs follow the hosted-beta tree — learner shell under `/app/*` (home at `/app`, consent at `/app/consent`, account tabs at `/app/account/$tab`), workspace at `/notebooks/:notebookId` with Workspace URL Codec search params, workspace creation at `/app/workspaces/new`. Legacy flat account routes redirect to tabs. Public routes stay at `/`, `/login`, `/demo`, etc. Avoid Design Lab hash paths or dropping the `/app` prefix without updating Stripe returns, docs, and `packages/schemas` href builders.

Deferred Visual Decisions: Nav Chrome Variant, Public Landing variant, and Learner Home Label remain open. Interim scaffolds are Editorial nav, Journal landing, and Journal home label. Final picks are product decisions, not architecture blockers, because Chrome Modules isolate them.

Design Lab Port Policy: the Folio Design Lab stays in `frontend-examples/` as visual reference only. Production promotes through strict layers — Folio tokens and primitives to `@studyagent/ui`, swappable Chrome Modules for deferred nav and landing visuals, feature controllers and product composites in `apps/web/features/`, and all HTTP through `@studyagent/api-client`. Avoid wholesale Design Lab copy into `apps/web`, `folio-mock-data` imports in production routes, and API or Query hooks inside `@studyagent/ui`.

Notebook Workspace: the two-pane study UI shell (tutor + graph/reference surfaces) at `/notebooks/:notebookId`. Hosts study for one Notebook; not the Notebook entity itself. This URL is intentional long-term — aligned with ADR-0001 and notebook-scoped APIs, not a beta-only path.

Personal Learner Workspace: learner-facing name for a learner-owned study space — created from a Published Study Template or an empty start. Sessions, mastery, Live Plan, artifacts, and feedback are private to that workspace. Maps to exactly one Notebook in the API and data model.

Notebook: canonical API and data-model term (ADR-0001). Personal Learner Workspace is the learner-facing synonym for the same entity in hosted-beta flows; prefer "workspace" in UI copy and "notebook" in API routes and schemas.

Published Study Template: admin-approved, source-backed study material learners can start from. Shared template content is read-only to learners; learner state does not mutate the template.

Beta Consent: versioned acknowledgement required before protected learner routes.

Credit Balance Indicator: learner-visible percent of Tutor Credits remaining; not dollar amounts.

Learner Dashboard Summary: learner-owned, cross-workspace projection of notebook progress, resumable work, due practice, recommended next steps, recent study activity, and study-time totals. Every value comes from persisted StudyAgent state; missing data is shown as unavailable or empty, never replaced with demonstration values.

Dashboard Recommendation: persisted next-step suggestion whose eligibility and ordering are derived deterministically from Study Plans, Mastery Evidence, learning state, and review dates. Tutor or planning workflows may add LLM-generated wording or plan content before persistence; reading the dashboard never generates a recommendation.

Dashboard Action Target: typed, non-mutating instruction that opens a Personal Learner Workspace at a specific surface, NodeRef, Artifact, or Session with an explicit intent such as continue, review, practice, or resume. Dashboard-local controls and explicit commands are not Action Targets.

Source: uploaded material. Source status drives readiness labels such as `uploaded`, processing phases, `tutoring_ready`, and `failed`.

Study Map: learner-focused graph of current curriculum, objectives, concepts, sources, sessions, artifacts, and weak concepts.

Curriculum: course-style outline with modules and objectives.

Source Wiki: source-scoped concept/wiki projection grouped by top-level topic. Learners should see readable topic and concept pages; detailed confidence scores, claim statuses, extraction stats, and pipeline metadata belong in Dev Mode unless a simple learner-facing quality status is needed.

Live Plan: current study plan, current objective, upcoming objectives, completed objectives, and weak concepts.

Session: tutor-session lifecycle with `active`, `paused`, and `completed` states.

Runtime Work View: learner-facing live surface inside tutor chat that shows the tutor runtime working — Runtime Thinking Stream, Runtime Narration, Runtime Activity Steps, then the Learner Response. It mirrors the chronological agent-work pattern (thinking → working text → tool timeline → answer), not a fixed phase checklist. Dev Mode adds identifiers, raw payloads, and cross-turn trace drilldown.

Artifact: durable learning aid such as `note`, `quiz`, `flashcards`, `worked_example`, `formula_sheet`, `comparison_page`, `revision_plan`, `session_digest`, or `concept_card`.

Reference Surface: full-panel, review-oriented node view. The lesson itself stays in tutor chat.

Interactive Learning Surface: a Reference Surface with interactive controls for practice, exploration, review, or Evidence inspection. It is not a separate durable object by default; durable learner outputs remain Artifacts, Mastery Evidence, or learning state. Tutor chat can launch and steer these surfaces while the Workspace hosts the rich interaction.

MCP App Renderer: the default rich rendering option for Interactive Learning Blocks such as simulations, quizzes, flashcards, worked examples, Evidence explorers, and Dev Mode dashboards. The learner-facing contract remains the Interactive Learning Block, not the iframe implementation, and native rendering should remain available as a fallback where practical.

MCP App State Boundary: StudyAgent owns canonical interaction state such as attempts, review ratings, completion, Mastery Evidence, artifact lifecycle, Evidence refs, and tutor/session identity. MCP App Renderers may own temporary presentation state such as selected controls, animation playback, card flip state, or local layout.

MCP App Bundle: a globally versioned app resource for a major Interactive Learning Block type or Simulation Template, such as a quiz, flashcard deck, worked example, Evidence explorer, Live Plan view, or function plotter. Notebook-specific learning content is passed as block data; app bundles are not generated per notebook. Bundles should be separate per major learning block type while sharing bridge and design-system code at build time.

Internal MCP App Bridge: Workspace-owned bridge that renders MCP App Bundles in sandboxed iframes and passes block data, host context, and Interactive Learning Actions through an MCP-App-compatible message shape. It provides MCP App behavior inside StudyAgent without exposing an external MCP server.

MCP App Sandbox Policy: restrictive-by-default policy for MCP App Bundles. App bundles should receive StudyAgent data through the Internal MCP App Bridge, emit Interactive Learning Actions back through the bridge, avoid direct notebook API calls, avoid external network access unless explicitly allowlisted, and not rely on iframe-owned durable storage.

Evidence: source excerpts and supporting notes shown in the drawer. Avoid learner-facing "provenance" copy unless the context is developer/debug.

Dev Mode: expands hidden graph detail and shows the harness/developer timeline. Subject to Dev Mode Access — unavailable to standard hosted learners.

Folio Design Lab: the sole visual frontend reference at `frontend-examples/folio/design-lab/`. Portable Dashboard, Notebook Workspace, and Node Pack examples without defining production data or module architecture.

Folio Workspace Shell: the production Notebook Workspace layout — `FolioWorkspaceFull` chrome (notebook header, source strip, surface tabs, Evidence drawer) plus a classic **35% Tutor / 65% Workspace** desktop default split. Avoid the Design Lab's fixed 1.45 chat-primary ratio as a production default.

Workspace Split: the resizable boundary between Tutor and Workspace panes inside Notebook Workspace. Desktop defaults to 35% Tutor / 65% Workspace; pointer and keyboard adjustment is bounded, versioned, and persisted per Notebook; each pane scrolls independently.

Workspace URL Codec: validated search state on `/notebooks/:notebookId` encoding active surface, action intent, optional `refType` + `refId` (NodeRef), Artifact, Tutor Session, or shareable Evidence/source-open target. NodeRef uses two search params, not a serialized composite. One codec serves Dashboard Action Targets, tutor navigation, Study Map links, and Workspace bootstrap. Invalid or unauthorized targets fall back to the nearest valid surface with a learner-safe message.

URL-Owned Workspace State: shareable Notebook Workspace selection persisted in the router search params via the Workspace URL Codec. Avoid client-only surface selection for production routes. Workspace Split ratio is versioned local storage per Notebook and is not URL-encoded.

Layout Paradigm: the structural arrangement of tutor chat, workspace canvas, reference surfaces, and Evidence within the Notebook Workspace shell. Production uses the Folio Workspace Shell. Avoid margin-only prototypes (`folio-margin`) and canvas-primary dock layouts as the v1 default.

Visual Theme: **Folio** is the sole implementation baseline: editorial ivory, Newsreader-led reading surfaces, Inter UI chrome, JetBrains Mono metadata, and restrained forest/sage accents. No runtime theme switcher or alternative visual direction is part of the frontend contract.

Design North Star Theme: the preferred long-term product aesthetic. **Folio** originated as the design north star and is now also the production implementation baseline. It is documented in [`docs/frontend/13-folio-design-kit.md`](../../frontend/13-folio-design-kit.md); completeness and behavioral parity take precedence over aesthetic polish.

Design Kit: the runnable Folio Design Lab plus `docs/frontend/13-folio-design-kit.md`. Visual authority for theming work; does not replace behavioral specifications or StudyAgent contracts.

Provisional UI: the pre-Folio frontend implementation, including its page composition, components, state wiring, handwritten routing, fetch wrappers, chrome, and CSS. It is disposable as code. Its verified product behavior and contract coverage are migration evidence for Folio, not a requirement to reuse its implementation.

UI Generation: which frontend implementation serves a route. **Folio is the sole UI Generation.** Legacy and Next are historical migration labels, not selectable product modes. API behavior remains shared and authoritative during the replacement.

Visual Reference Policy: the Folio Design Lab is the only visual reference. Frontend specification docs describe required behavior, anatomy, states, and contract integration.

## User Workflows

Hosted beta entry: user visits `/`, signs in at `/login`, accepts Beta Consent at `/app/consent`, lands on dashboard at `/app`, selects a Published Study Template or creates an empty workspace, then routes to `/notebooks/:notebookId`.

Notebook entry (direct): user opens `/notebooks/:notebookId` when they already have a workspace URL or continue from dashboard.

Source ingestion: user uploads a source from the top bar or source controls. The shell posts to `/api/v1/notebooks/:notebookId/sources`. SSE events update source status and graph freshness. Once sources become `tutoring_ready`, tutor/curriculum actions become meaningful.

Tutor study loop: user selects `learn`, `practice`, `revise`, `explore`, or `wiki_maintenance`; starts, continues, resumes, pauses, or ends a session based on `/study-state`; then posts chat to `/api/v1/notebooks/:notebookId/tutor/chat` with `activeMode`, `selectedNodeRefs`, optional `sessionId`, and action `prompt`, `steer`, or `followUp`. During a live turn, tutor chat streams Runtime Work View events (thinking, narration, tool steps) before the Learner Response. Resume rehydrates up to 5 prior turns for the same session; new sessions start without prior-session transcript.

Graph-to-tutor context: user selects a graph node. `Whiteboard` maps it to a `NodeRef` and passes selected refs upward. `TutorPanel` includes the refs in the tutor prompt; if an artifact is open, its artifact ref is included too.

Study map/reference workflow: `Whiteboard` loads graph data from `POST /graph/query` with optional `devMode`. Study Map and Source Wiki responses include `readModel` (emphasis, visibility catalog, topic groups, reference-surface targets, projection warnings). User toggles Curriculum, Study Map, or Source Wiki. Clicking a node opens `FullPanelViewer`, which fetches `/nodes/:nodeId/reference-surface` or source-extracted text. User can return to workspace, ask tutor to teach the node, or open Evidence.

Artifact workflow: tutor may propose artifacts. Artifact lists should exclude internal teaching/planning artifacts. Learner can open, approve, reject, save editable notes, attempt quiz questions, or review flashcards. Quiz/flashcard interactions update learning state and reload study state.

## Event Contracts

Notebook SSE endpoint: `GET /api/v1/notebooks/:notebookId/events/stream?after=0`.

Each event payload includes at least `id`, `notebookId`, `eventType`, `sequenceNo`, `createdAt`, and `payload`. The client deduplicates by monotonically increasing `sequenceNo`.

Workspace refresh events include:

- curriculum/objective/session/study plan updates
- learning/mastery updates
- session lifecycle and crystallization events
- artifact lifecycle events
- source/ingestion readiness
- graph projection updates

Artifact query invalidation is intentionally limited to event names beginning with `artifact.`.

Eval Run update stream: `GET /api/v1/eval/runs/stream?after=<updatedAt>`.

The Synthetic Learner Eval Runs dashboard uses this stream to invalidate `eval-runs` and selected `eval-run` queries when persisted eval-run rows change. It does not run a fixed background polling interval for running evals.

Tutor chat stream: `POST /api/v1/notebooks/:notebookId/tutor/chat`.

The first stream event is custom `SESSION_STARTED`. AG-UI stream events include `RUN_STARTED`, `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`, `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `RUN_FINISHED`, and `RUN_ERROR`.

Node refs use the shared shape `{ refType, refId }`. Graph node types map to entity refs through `whiteboard-node-ref.ts`; `tutor_session` maps to `session`; unknown graph node types map to `whiteboard_node`.

## UX Vocabulary

Use:

- Notebook
- Sources
- Study Map
- Curriculum
- Module
- Objective
- Live Plan
- Session
- Tutor Activity
- Lesson plan
- Source Wiki
- Reference surface
- Evidence
- Supporting notes
- Draft/debug claims
- Study aids
- Harness dashboard

Avoid learner-facing debug language:

- raw claim statuses unless the user is in Dev Mode
- "trace" as learner-facing progress copy; use "Tutor Activity" unless the surface is Dev Mode/debug
- `coverage_record`, `objective_list`, `session_plan` internals as visible node labels
- "provenance" as the main Evidence label
- "whiteboard" as the primary section name when "Workspace" or "Study Map" fits

## Boundaries

- The shell renders and coordinates; it does not own tutoring, planning, search, graph projection, or persistence rules.
- Contract changes should be made in shared schemas/API first, then reflected in web consumers and tests.
- The graph should remain useful in learner mode by hiding low-signal debug nodes and progressively disclosing detail.
- Full-panel reference surfaces should be review/read/action views. The actual lesson should stay in tutor chat unless explicitly rendered as an artifact.

## Tests That Reveal Behavior

- `apps/web/src/app-event-contract.test.ts`
- `apps/web/src/whiteboard-utils.test.ts`
- `apps/web/src/whiteboard-node-ref.test.ts`
- `apps/web/src/whiteboard-verification.test.ts`
- `apps/web/src/AgentTrace.test.ts`
- `apps/web/src/FullPanelViewer.test.tsx`
- `apps/web/src/TutorPanel.test.ts`
