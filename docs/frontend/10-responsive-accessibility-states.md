# Responsive, Accessibility, And States

## Responsive Strategy

### TutorBook app shell

Desktop:

- fixed left sidebar (~240px) + main content;
- credit percent in sidebar footer area when available.

Tablet / mobile:

- sidebar stacks above content (single column);
- pack list on credits page wraps price + Buy below description;
- onboarding modal remains centered overlay.

### Notebook Workspace

Desktop:

Default:

- topbar;
- horizontal split;
- Tutor left;
- Workspace right;
- Evidence drawer from right;
- graph and source viewer use available width.

### Tablet

Default:

- topbar wraps as needed;
- vertical split;
- Tutor above Workspace or collapsible;
- divider becomes row resize;
- drawers can become side sheets.

### Mobile

Default:

- one major surface visible at a time;
- surface switcher for Tutor, Workspace, Evidence;
- composer remains reachable;
- graph should offer list fallback or simplified map;
- Reference surface header actions collapse into menu;
- Evidence drawer becomes full-screen sheet.

## Minimum Viewports To Design

- 390px mobile;
- 768px tablet;
- 1024px small laptop;
- 1440px desktop.

## Accessibility Baseline

Set a practical target of WCAG 2.2 AA for learner-facing UI.

Required:

- all controls keyboard reachable;
- focus visible on buttons, inputs, graph controls, and MCP app controls;
- color contrast passes AA for text and meaningful UI;
- status does not rely on color alone;
- all icon-only buttons have accessible labels;
- drawers and overlays manage focus;
- Esc closes drawers and popovers where appropriate;
- graph has non-graph navigation fallback for key surfaces;
- iframe apps expose focusable controls and readable labels.

## Keyboard Behavior

Global:

- Tab moves through controls in logical order;
- Escape closes popover, drawer, or overlay;
- Enter or Space activates focused node/list item/button.

Tutor:

- Ctrl+Enter sends message;
- input focus stays predictable after send;
- retry button reachable after error.

Graph:

- selected node can be opened via keyboard;
- nodes need visible focus state;
- canvas controls should not trap focus.

MCP apps:

- iframe controls must support keyboard;
- host fallback must be reachable if app fails.

## Loading States

Use skeletons or compact status rows instead of centered spinners where content shape is known.

Required loading states:

- session / dashboard loading;
- credit balance loading;
- credit packs loading (checkout section);
- notebooks loading;
- source list loading;
- graph loading;
- graph refreshing;
- reference surface loading;
- artifact loading;
- tutor response running;
- MCP app loading;
- interactive action saving.

## Empty States

Empty states should teach the next action.

Examples:

- empty template gallery: explain templates coming soon or contact support;
- credits exhausted: buy pack, redeem code, or contact support;
- checkout redirecting: disable Buy buttons, show "Redirecting…";
- no notebooks: create one from dashboard;
- no source: add a source;
- no graph: build first study map by adding source;
- no Source Wiki: upload source;
- no curriculum: ask tutor to build first plan after sources are ready;
- no artifact content: ask tutor or regenerate when allowed;
- no Evidence: explain no excerpts or supporting notes found.

## Error States

Required error surfaces:

- API unavailable for notebooks;
- source upload failed;
- graph query failed;
- reference surface unavailable;
- Evidence fetch failed;
- tutor run failed;
- interactive action failed;
- MCP app failed to load;
- artifact save failed.

Error copy should:

- name the failed action;
- preserve work;
- offer retry where valid;
- avoid raw stack traces in learner mode.

## Offline And Degraded States

If runtime or retrieval degrades:

- show user-safe status;
- do not imply source-backed success if fallback was used;
- allow continued reading of existing Reference surfaces and artifacts where possible;
- Dev Mode can expose provider or fallback metadata.

## Status Vocabulary

Use:

- Loading;
- Refreshing;
- Saving;
- Saved;
- Ready to study;
- Still improving;
- Needs review;
- Suggested;
- Processing;
- Failed;
- Current;
- Completed;
- Needs practice.

Avoid:

- candidate;
- draft claim;
- reducer;
- event envelope;
- run ID;
- raw trace;
- projection unless Dev Mode.

## Data-Dense Screens

For graph, history, Evidence, artifact lists, and eval dashboards:

- preserve row height and line clamps;
- support horizontal scroll for tables;
- keep filter state visible;
- show count and filtered count;
- avoid tiny contrast-light labels below 11px.

## Math And Code

Tutor and Reference surfaces must support:

- inline math;
- display math;
- code;
- tables;
- overflow handling;
- copied formulas should remain legible.

## Internationalization Readiness

No full i18n system exists yet, but designs should allow:

- longer button labels;
- wrapping in empty states;
- dynamic height in cards and nodes where safe;
- no text baked into images.

## Visual QA Checklist

Design and implementation should be checked for:

- no overlapping text at mobile and desktop;
- no button label clipping;
- graph nodes keep stable size on hover and selection;
- drawers do not cover composer irreversibly on mobile;
- Evidence drawer and Reference viewer can both be exited;
- selected context is visible but not noisy;
- Dev Mode cannot be mistaken for learner mode.
