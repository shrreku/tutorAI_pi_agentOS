# Workspace, Study Map, And Source Wiki

## Workspace Role

The Workspace is the durable right-side product area. It contains Curriculum, Study Map, Source Wiki, Reference surfaces, source documents, artifacts, Evidence, and interactive learning surfaces.

It is not the teaching engine. It renders and coordinates context while the runtime owns tutoring, planning, search, graph projection, persistence, and reducer-governed writes.

## Workspace Toolbar

Required controls:

- mode segmented control: Curriculum, Study Map, Source Wiki;
- source picker in Source Wiki mode;
- topic chips in Source Wiki mode;
- filters;
- refresh graph;
- auto-layout;
- Evidence toggle when a node is selected;
- Dev Mode toggle.

Design guidance:

- toolbar should stay compact and scan-friendly;
- filters should use a popover;
- Dev Mode should be visibly separate from learner controls.

## Status Bar

Required information:

- active mode;
- node count;
- edge count;
- filtered count;
- selected node title;
- current objective when no node is selected;
- projection warning when present.

Design guidance:

- status bar is low emphasis;
- warnings use semantic warning color and text, not only color.

## Curriculum Mode

Purpose: readable course path.

Required elements:

- curriculum title;
- module count;
- objective count;
- completed count;
- coverage summary: planned, introduced, checked, review;
- module list;
- embedded objective list;
- current objective marker;
- inline links to related sessions, artifacts, and concepts.

Target design:

- use a syllabus or lesson path layout;
- keep objective rows dense but readable;
- module summaries can be prose;
- objective statuses should use short labels.

Do not expose Objective List as a standalone learner page.

## Study Map Mode

Purpose: progress and relationship map.

Visible learner nodes:

- source;
- curriculum;
- module;
- session;
- artifact;
- concept;
- Source Wiki page;
- weak concept when surfaced as Needs practice through learner-safe copy.

Dev-only or hidden in learner mode:

- claims;
- source sections;
- coverage items;
- coverage records;
- objective lists;
- session-plan internals;
- internal artifact types such as teaching arc and study plan.

Study Map emphasis:

- current objective;
- current module;
- current path concepts.

Graph behavior:

- learner mode collapses completed/future objective history;
- learner mode limits graph density;
- current path concepts are promoted;
- selected node highlights connected edges and neighbors;
- layout can be saved by dragging and reset with Auto-layout.

## Source Wiki Mode

Purpose: source-grounded knowledge map and reference layer.

Required elements:

- source picker;
- topic groups;
- topic chips with concept counts;
- source node;
- topic pages;
- concept pages;
- readiness labels;
- Evidence access.

Target design:

- make topic groups the first scanning layer;
- source document opens as the primary surface for a source;
- concept and topic pages read like polished notes;
- page readiness is shown as learner language, not pipeline status.

## Graph Canvas

Current graph node shape:

- type label;
- optional readiness or status badge;
- title;
- optional summary;
- optional meta;
- selected border;
- connected opacity;
- node type color;
- smooth edges;
- minimap;
- controls.

Target graph direction:

- keep nodes compact and stable;
- avoid making every node look identical;
- use type shape, icon, and content hierarchy, not color alone;
- surface current path with stronger outline or badge;
- use Evidence availability as a compact affordance;
- show page readiness only where it helps.

## Node Selection

Node click should:

- select the node;
- update tutor selected context;
- open compact node detail when useful;
- hide compact detail when Evidence drawer is open;
- for tutor session nodes, set tutor session context rather than opening generic detail.

Target actions:

- Teach this;
- Open;
- Evidence;
- Review;
- Practice when supported.

## Empty States

No graph:

Title: `Build the first study map`

Support:

`Add a source from the top bar. Sources, wiki pages, objectives, and artifacts will appear here as connected nodes.`

No Source Wiki sources:

Title: `No sources in this notebook.`

Support:

`Upload a source to see the wiki map.`

No curriculum:

Support:

`No curriculum path is available yet. The tutor chat can build the first plan after sources are ready.`

## Filtering

Filters:

- node type;
- status.

Design guidance:

- use learner-facing labels by default;
- Dev Mode may show raw types;
- active filter count should be visible;
- clearing filters should be one action.

## Workspace Boundaries

- Do not show low-signal backend nodes in learner mode.
- Do not make graph layout the only way to navigate.
- Do not turn Study Map into a raw graph database browser.
- Do not rely only on color for node type or status.
