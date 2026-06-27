# Node Design System

## Purpose

Nodes are compact gateways into Reference surfaces, tutor context, Evidence, and study progress. They should not expose the raw backend graph.

## Base Node Anatomy

Every learner-visible node should support:

- type label or icon;
- title;
- short summary when available;
- status or readiness badge when useful;
- metadata line;
- Evidence affordance when evidence exists;
- selected state;
- current path emphasis;
- connected neighbor emphasis;
- disabled or degraded state when content is unavailable.

Base dimensions should remain stable:

- width: about 168px to 196px;
- minimum height: about 98px;
- title: max two lines;
- summary: max two lines;
- no layout shift on hover or selection.

## Data And Presentation Ownership

The Workspace Read Model must provide the learner meaning required by each node:

- learner-safe type label;
- independent progress, readiness, and learning states;
- learner-safe status label derived from those states;
- relative importance;
- Evidence count;
- available primary actions;
- disabled or locked reason when applicable.

The frontend maps those semantics to node size, color, icon, badge, border, and layout. API responses must not contain CSS classes, theme tokens, pixel dimensions, or renderer-specific component names.

State dimensions may coexist. For example, an Objective can be `current` and `needs_practice`, while its Reference Surface is `ready_to_study`.

## Node Type Families

### Source Node

Learner label: `Source`

Purpose:

- opens original source document;
- shows readiness and source type;
- anchors Source Wiki topics.

Content priority:

1. source title;
2. readiness;
3. source type;
4. page or section count when available.

Visual direction:

- document-shaped icon;
- source green or teal accent;
- readiness badge can show processing, ready, failed, or improving.

Primary actions:

- Open source;
- Evidence;
- Ask tutor about source.

### Topic Node

Learner label: `Topic`

Purpose:

- groups concepts inside Source Wiki;
- opens a topic page or default concept.

Content priority:

1. topic title;
2. concept count;
3. readiness when topic page exists.

Visual direction:

- grouped folder or section icon;
- cooler blue accent;
- less prominent than source but more structural than concept.

### Concept Node

Learner label: `Concept`

Purpose:

- opens concept page;
- carries mastery and current path meaning;
- can become selected tutor context.

Content priority:

1. concept name;
2. mastery meta such as Needs practice or Proficient;
3. page readiness;
4. short description.

Visual direction:

- compact concept chip or node;
- blue accent by default;
- current path concepts should have stronger emphasis;
- weak concepts should not feel punitive.

Primary actions:

- Teach this;
- Practice;
- Evidence.

### Weak Concept Node

Learner label: `Needs practice`

Purpose:

- shows concept needing review without labeling the learner harshly.

Content priority:

1. concept name;
2. review reason if available;
3. action: Practice or Review with tutor.

Visual direction:

- warm warning or soft red accent;
- avoid alarm styling;
- use supportive copy: `Needs practice`, not `weak`.

### Curriculum Node

Learner label: `Curriculum` or `Course`

Purpose:

- opens the overall learning path.

Content priority:

1. course title;
2. module count;
3. status or readiness.

Visual direction:

- structural node, not a document card;
- warm accent works because it is the path anchor.

### Module Node

Learner label: `Module`

Purpose:

- opens module page with objectives embedded.

Content priority:

1. module title;
2. summary;
3. current/completed status;
4. objective count when available.

Visual direction:

- chapter marker or stacked-page icon;
- current module gets current-path treatment.

### Objective Node

Learner label: `Objective`

Purpose:

- points to current or related learning goal.

Important boundary:

Objective nodes can appear in Study Map or Curriculum lists, but objective structure should not become standalone learner pages by default. Use embedded objective rows inside modules and Live Plan.

Content priority:

1. objective title;
2. current, completed, not started, needs review;
3. order number;
4. related concepts.

Visual direction:

- small target or checklist icon;
- current objective gets primary accent.

### Live Plan Node

Learner label: `Live Plan`

Purpose:

- opens current study plan state and next actions.

Content priority:

1. current objective;
2. upcoming objective count;
3. weak concept count;
4. action prompt.

Visual direction:

- planning marker, but learner-safe;
- do not call it `study_plan` in UI.

### Lesson Plan Node

Learner label: `Lesson plan`

Purpose:

- internal planning object made learner-safe when visible.

Content priority:

1. lesson goal;
2. status;
3. related module or objective.

Visual direction:

- usually secondary to session and module;
- hide in learner mode unless it opens useful content.

### Session Node

Learner label: `Session`

Purpose:

- reopens or reviews tutor session;
- connects to sources, concepts, artifacts, and objectives used or produced.

Content priority:

1. compact session title from first prompt or date;
2. mode;
3. turn count;
4. status.

Visual direction:

- conversational node;
- blue accent;
- action should reopen session in tutor panel or show insights.

### Artifact Node

Learner label: `Artifact` or specific study aid type.

Purpose:

- opens generated study aid.

Content priority:

1. artifact title;
2. artifact type;
3. proposed/ready/needs review;
4. source-backed indicator.

Visual direction:

- amber or magenta accent can distinguish study aids;
- proposed artifacts should look reviewable, not broken;
- internal artifact types should be hidden.

### Source Wiki Page Node

Learner label: `Wiki page`

Purpose:

- opens polished topic or concept page.

Content priority:

1. page title;
2. page type;
3. readiness;
4. source-backed indicator.

Visual direction:

- readable page marker;
- cool cyan accent;
- readiness badge is important.

### Claim, Coverage, Source Section, Objective List

Learner mode:

- hidden or dev-only unless transformed into Evidence, supporting notes, or a useful Reference surface.

Dev Mode:

- can show raw type, status, confidence, and metadata.

## Node States

Required states:

- default;
- hover;
- selected;
- connected to selection;
- not connected while a selection exists;
- current objective;
- current module;
- current path;
- ready;
- still improving;
- needs review;
- failed or unavailable;
- dev-only.

## Current Path Treatment

Current objective:

- strongest accent outline;
- `Current` badge;
- optional target icon.

Current module:

- secondary accent outline;
- `Current module` badge.

Current path concept:

- accent dot or top-right badge;
- avoid overloading every connected concept with strong color.

## Evidence Affordance

For nodes with evidence:

- show small Evidence icon or label;
- open Evidence drawer;
- do not show confidence percentage in learner mode;
- page readiness can appear separately from Evidence availability.

## Graph Edge Design

Edge labels should appear only on selection or in Dev Mode.

Learner edge semantics:

- contains;
- covers;
- cites;
- tests mastery;
- completed by;
- plans;
- related.

Use short labels. Do not display uppercase relation constants in learner mode.

## Dev Mode Node Design

Dev Mode may expose:

- raw node type;
- raw status;
- confidence;
- labels;
- IDs;
- projection metadata;
- raw claim statuses;
- coverage and planning internals.

Dev Mode should look distinct from learner mode so designers and testers know they are in an internal surface.
