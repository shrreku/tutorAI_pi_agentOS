# Web Workspace Context

The web workspace is the learner-facing notebook shell for StudyAgent. It combines notebook selection, source upload, tutor chat, session lifecycle controls, Live Plan visibility, graph-based navigation, reference surfaces, artifacts, Evidence inspection, and developer trace/timeline inspection.

The web shell is not the teaching engine. Teaching happens through the tutor runtime/API. The shell selects context, streams responses, renders state, and lets learners inspect or act on notebook artifacts.

## Owned Code

- `apps/web/`: clean-room Folio React application; the outsourced team owns its routes, feature modules, presentation, responsive behavior, and accessibility.
- `packages/api-client/`: StudyAgent-owned browser transport, runtime validation, error, query-key, and stream interface.
- `packages/schemas/`: shared contracts consumed by the browser and Fastify routes.
- `frontend-contract/`: routing index for product, architecture, behavior, and delivery requirements.
- `frontend-examples/folio/`: visual and interaction references; never a production data path.

Frontend Contract Kit: the StudyAgent-owned set of product language, shared schemas, browser client operations, route/state matrices, acceptance journeys, and visual references supplied to an external frontend implementer. It excludes the legacy frontend implementation.

## Key Concepts

TutorBook App Shell: learner-facing navigation outside the notebook Workspace — dashboard, consent, credits, access codes, support, and account. Distinct from the study-time Workspace shell.

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

Dev Mode: expands hidden graph detail and shows the harness/developer timeline.

UI Example Set: exported PNG screenshots of designed components, screens, and packs under `ui-example/`. Organized by visual theme and component category (node-pack, workspace-screens, chat-components, reference-surfaces, evidence-components, etc.). Handoff visuals for designers and implementers; not runtime assets.

Layout Paradigm: the structural arrangement of tutor chat, workspace canvas, reference surfaces, and evidence within the Notebook Workspace shell — independent of visual theme. **Classic split** (`topbar / [chat rail | canvas]`) is the beta implementation default. Alternative paradigms remain under active evaluation in `design-variations/` in parallel with Folio theme work.

Layout Paradigm Contenders: the shortlist for serious evaluation — **v1 Focus Map · dock** (canvas-primary, floating tutor dock), **v3 Chat-primary** (tutor-dominant, map peek, inline evidence), **v4 Bento Home** (overview tiles expand to full stage). **v2 Narrative Doc** is archived as exploration only unless revived. **Improved Original** (classic split) remains the shipped beta default until a contender wins.

Layout Prototype Priority: **v1 Focus Map · dock** is first to receive a Folio-language design pass — canvas-primary layout with floating tutor dock, node peek, and minimap (`design-variations/` v1). v3 and v4 remain contenders but are not first in the Folio prototype queue.

Visual Theme: a coherent palette, typography, elevation, and chrome treatment applied across the Notebook Workspace and TutorBook shell. Explored themes include Mist Glass (frosted panels, indigo accents), Folio (editorial ivory, serif display), Focus (minimalist slate, floating dock), and Atlas (cool slate, denser chrome, distinct sans display — dev switcher only, not a Design Kit export). Layout paradigms are explored separately in `design-variations/`.

Implementation Baseline Theme: the visual theme targeted by the production frontend. **Folio** is the sole implementation baseline: editorial ivory, Newsreader-led reading surfaces, Inter UI chrome, and restrained sage accents. Mist Glass remains a historical anatomy reference, not a production theme.

Design North Star Theme: the preferred long-term product aesthetic. **Folio** originated as the design north star and is now also the production implementation baseline. It is documented in [`docs/frontend/13-folio-design-kit.md`](../frontend/13-folio-design-kit.md); completeness and behavioral parity take precedence over aesthetic polish.

Design Kit: one theme's complete export from a Pencil file — reusable components plus full screens — cataloged in `ui-example/<theme>/README.md`. Mist Glass maps to `nodes.pen`; Folio and Focus map to `untitled.pen` / `gemini.pen`. Navigable HTML/CSS in `ui-preview/` is part of the kit reference. Design Kits are the visual authority for theming work.

Provisional UI: the pre-Folio frontend implementation, including its page composition, components, state wiring, handwritten routing, fetch wrappers, chrome, and CSS. It is disposable as code. Its verified product behavior and contract coverage are migration evidence for Folio, not a requirement to reuse its implementation.

UI Generation: which frontend implementation serves a route. **Folio is the sole UI Generation.** Legacy and Next are historical migration labels, not selectable product modes. API behavior remains shared and authoritative during the replacement.

Visual Reference Policy: frontend spec docs describe behavior and anatomy only. Screenshots are indexed in `docs/frontend/README.md` and `ui-example/` READMEs — not embedded inline in numbered spec files.

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
