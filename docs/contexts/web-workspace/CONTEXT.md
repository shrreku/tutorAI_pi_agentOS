# Web Workspace Context

The web workspace is the learner-facing notebook shell for StudyAgent. It combines notebook selection, source upload, tutor chat, session lifecycle controls, Live Plan visibility, graph-based navigation, reference surfaces, artifacts, Evidence inspection, and developer trace/timeline inspection.

The web shell is not the teaching engine. Teaching happens through the tutor runtime/API. The shell selects context, streams responses, renders state, and lets learners inspect or act on notebook artifacts.

## Owned Code

- `apps/web/src/App.tsx`: route state, notebook list, active notebook, source summary, split layout, selected node refs, event stream subscription, workspace refresh coordination.
- `apps/web/src/TutorPanel.tsx`: chat UX, tutor mode, session controls, chat history, live trace display, study-plan modal, artifact modal, artifact consent settings, quiz/flashcard review interactions.
- `apps/web/src/Whiteboard.tsx`: graph mode, filters, selected node, viewer/workspace state, Evidence drawer state, Dev Mode, graph refresh, source picker, curriculum browser.
- `apps/web/src/GraphCanvas.tsx`: React Flow renderer, graph response mapping, selection, pane clearing, dragging, saved layout persistence.
- `apps/web/src/FullPanelViewer.tsx`: full-panel reference/review surface for selected graph nodes.
- `apps/web/src/NodeDetailPanel.tsx`: compact workspace-mode node metadata.
- `apps/web/src/ProvenanceDrawer.tsx`: Evidence drawer for source excerpts, supporting notes, confidence, and developer metadata.
- `apps/web/src/DeveloperTimelinePanel.tsx`: Dev Mode harness dashboard for agent runs, tools, state changes, raw events, usage, and node refs.
- `apps/web/src/whiteboard-utils.ts`: layout/density helpers, `resolveWorkspaceGraph`, `topicsFromReadModel` (API `readModel` only for visibility and Source Wiki topics).
- `apps/web/src/whiteboard-legacy.ts`: pre-read-model visibility/topic helpers retained for unit tests only.
- `apps/web/src/whiteboard-node-ref.ts`: graph-node-to-NodeRef mapping.

## Key Concepts

Notebook: top-level study workspace.

Source: uploaded material. Source status drives readiness labels such as `uploaded`, processing phases, `tutoring_ready`, and `failed`.

Study Map: learner-focused graph of current curriculum, objectives, concepts, sources, sessions, artifacts, and weak concepts.

Curriculum: course-style outline with modules and objectives.

Source Wiki: source-scoped concept/wiki projection grouped by top-level topic. Learners should see readable topic and concept pages; detailed confidence scores, claim statuses, extraction stats, and pipeline metadata belong in Dev Mode unless a simple learner-facing quality status is needed.

Live Plan: current study plan, current objective, upcoming objectives, completed objectives, and weak concepts.

Session: tutor-session lifecycle with `active`, `paused`, and `completed` states.

Artifact: durable learning aid such as `note`, `quiz`, `flashcards`, `worked_example`, `formula_sheet`, `comparison_page`, `revision_plan`, `session_digest`, or `concept_card`.

Reference Surface: full-panel, review-oriented node view. The lesson itself stays in tutor chat.

Evidence: source excerpts and supporting notes shown in the drawer. Avoid learner-facing "provenance" copy unless the context is developer/debug.

Dev Mode: expands hidden graph detail and shows the harness/developer timeline.

## User Workflows

Notebook entry: user opens `/notebooks`, creates or selects a notebook, and the app routes to `/notebooks/:notebookId`.

Source ingestion: user uploads a source from the top bar or source controls. The shell posts to `/api/v1/notebooks/:notebookId/sources`. SSE events update source status and graph freshness. Once sources become `tutoring_ready`, tutor/curriculum actions become meaningful.

Tutor study loop: user selects `learn`, `practice`, `revise`, `explore`, or `wiki_maintenance`; starts, continues, resumes, pauses, or ends a session based on `/study-state`; then posts chat to `/api/v1/notebooks/:notebookId/tutor/chat` with `activeMode`, `selectedNodeRefs`, optional `sessionId`, and action `prompt`, `steer`, or `followUp`.

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
