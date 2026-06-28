# Design System Direction

## Theme

Default to the light, warm-neutral **Folio** product theme. Folio is the sole implementation baseline; see [13-folio-design-kit](./13-folio-design-kit.md), [`frontend-examples/folio/screenshots/`](../../frontend-examples/folio/screenshots/README.md), and the frozen live-baseline manifest in the [Folio port audit](./audits/folio-port-2026-06-27/AUDIT.md). Mist Glass remains an anatomy-completeness reference only.

Reason: students use the workspace for long study sessions with source documents, formulas, and dense notes. A light surface keeps source reading, graph scanning, and writing comfortable while allowing focused accents for active state and Evidence.

## Color Strategy

Use a restrained strategy:

- tinted neutrals carry most of the UI;
- one primary accent marks selection, primary action, current path, and links;
- semantic colors are reserved for success, warning, danger, source readiness, mastery, and review states;
- graph node type colors may use a broader palette, but only inside the graph vocabulary.

All new tokens should use OKLCH. Avoid pure black and pure white. Keep neutral chroma low and slightly cool.

Suggested token families:

```css
--app-bg: oklch(98.5% 0.006 255);
--panel: oklch(99.2% 0.004 255);
--panel-muted: oklch(96.7% 0.008 255);
--panel-strong: oklch(99.8% 0.005 255);
--line: oklch(89.5% 0.017 255);
--text-strong: oklch(20% 0.026 255);
--text: oklch(34% 0.032 255);
--text-muted: oklch(52% 0.03 255);
--accent: oklch(58% 0.18 264);
--accent-soft: oklch(94.8% 0.03 264);
--success: oklch(62% 0.14 158);
--warning: oklch(72% 0.15 76);
--danger: oklch(58% 0.19 28);
```

## Typography

Use system UI or Inter-style sans. One type family is enough.

Recommended scale:

- 11px: metadata, compact labels, graph badges;
- 12px: toolbar controls, secondary labels, compact lists;
- 13px: chat and dense panel body;
- 14px: default body in reference surfaces;
- 16px: surface subheadings and objective titles;
- 18px: notebook card titles, MCP app titles;
- 22px: reference surface titles;
- 26px: large wiki page headings only.

Rules:

- body prose should stay near 65 to 75 characters per line;
- graph text must clamp cleanly;
- button labels should not wrap unless the button is full width;
- no display fonts in controls, labels, tables, graph nodes, or MCP apps.

## Radius And Elevation

Use 8px as the default radius. Use 10px only for larger framed panels like graph nodes, artifact readers, and interactive activities.

Use elevation sparingly:

- shell frame: soft shadow;
- notebook cards: subtle shadow;
- selected graph node: focus ring and small shadow;
- drawers and overlays: stronger but still restrained.

Avoid nested cards. If a panel contains repeated items, only the repeated items may be cards.

## Component Vocabulary

### Buttons

Button hierarchy:

- primary: start, send, submit answer, continue lesson, approve when it is the main task;
- secondary: review, open source, auto-layout, previous, next;
- chip: mode toggles, filters, compact controls;
- icon button: refresh, close, back, evidence toggle where icon support exists.

All buttons need default, hover, active, focus, disabled, loading, and error-adjacent states.

### Segmented Controls

Use for workspace mode:

- Curriculum
- Study Map
- Source Wiki

Use active state with accent-soft background and clear border.

### Inputs

Inputs should have labels where the action is not obvious. Search can use placeholder plus accessible label.

Composer textarea:

- min height around 42px;
- max height around 120px;
- Send button fixed to the right on desktop;
- stacked on narrow mobile.

### Badges

Badges should be semantic and short:

- Ready to study
- Still improving
- Needs review
- Suggested
- Current
- Completed
- Needs practice

Do not show raw values like `tutoring_ready`, `session_plan`, `objective_list`, `candidate`, or UUIDs in learner mode.

### Drawers

Use drawers for Evidence because they preserve workspace context while inspecting citations. Do not use drawer patterns for everything. Artifacts and Reference surfaces should usually live in the Workspace viewer.

### Modals And Overlays

Avoid modals as default. The current tutor artifact and Live Plan modals are transitional. Target design should move durable review and interactive work into the Workspace viewer or a responsive detail surface.

## Motion

Motion should convey state:

- panel enter: 150 to 220 ms ease-out;
- hover lift: subtle, under 2px;
- Runtime Activity pulse: only for active running state;
- drawer slide: 160 to 220 ms.

Do not animate layout-heavy properties. Do not choreograph page load.

## Copy Style

Use short, concrete product copy:

- "Evidence"
- "Source excerpts"
- "Supporting notes"
- "Tutor Activity"
- "Ready to study"
- "Still improving"
- "Needs practice"
- "Review with tutor"

Avoid:

- "Provenance"
- "Trace"
- "Raw event"
- "Debug"
- "LLM"
- "Pipeline"
- "Candidate claim"

Dev Mode can use technical labels when needed.

## Design Bans

Do not use:

- gradient text;
- colored side-stripe accents on cards;
- identical endless icon-card grids;
- large marketing hero patterns inside the app;
- one-color-only palettes;
- unsupported color-only status cues;
- decorative animations that do not explain state.
