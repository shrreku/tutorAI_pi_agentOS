# Artifacts And Study Aids

## Artifact Role

Artifacts are durable generated learner study outputs. They are not raw tutor messages, not Live Plan, and not Source Wiki pages.

Learner-visible artifact types:

- note;
- quiz;
- flashcards;
- worked example;
- formula sheet;
- comparison page;
- diagram;
- revision plan;
- session digest;
- concept card.

Internal or compatibility types:

- teaching arc;
- study plan;
- session plan internals.

Internal types should not appear as normal learner artifacts.

## Artifact Lifecycle

Statuses:

- draft;
- proposed;
- ready;
- rejected;
- failed;
- archived.

Learner-facing status:

- Suggested for proposed;
- Ready to study for ready;
- Needs review when quality requires it;
- hidden for draft, rejected, failed, archived unless inside recovery or Dev Mode.

Lifecycle actions:

- approve;
- reject;
- edit where supported;
- archive;
- study;
- practice;
- revise;
- ask tutor;
- open source;
- review.

## Artifact Consent

Settings:

- Auto-create learner study aids;
- Auto-promote generated notes.

When disabled, tutor-created learner aids stay proposed or draft until approved.

Design guidance:

- settings should be reachable from tutor reference options or notebook settings;
- copy should explain effect in one sentence;
- consent state should be visible when a proposed artifact appears.

## Artifact Overview

Every artifact surface should show:

- title;
- type;
- status;
- purpose;
- recommended student action;
- quality state;
- source-backed indicator;
- linked objectives, concepts, or sources when available;
- actions.

## Type-Specific Designs

### Note

Purpose:

- readable, editable study note.

Required UI:

- title field;
- generated or human-edited badge;
- linked source count;
- markdown editor;
- save action;
- Teach me action where available.

Target design:

- split edit and preview if space allows;
- source-linked callouts can appear in margin or Evidence;
- human edits should be clearly preserved.

### Quiz

Purpose:

- evaluable practice and mastery evidence.

Required UI:

- question list or single-question stepper;
- progress;
- choices or open answer;
- submit answer;
- feedback after submit;
- Evidence after submit when available;
- score or review summary;
- extend quiz when allowed;
- Review with tutor.

Important behavior:

- API recomputes correctness where possible;
- submitted answers can emit Mastery Evidence;
- partial/resumable quiz generation should be recoverable.

States:

- no questions yet;
- unanswered;
- selected answer;
- submitted correct;
- submitted needs review;
- saving;
- saved;
- failed to save;
- complete.

### Flashcards

Purpose:

- recall and review.

Required UI:

- card count;
- front and back;
- reveal answer;
- rating: again, hard, good, easy;
- Evidence where available;
- request tutor help.

Important behavior:

- flipping alone is not Mastery Evidence;
- rating updates review state;
- repeated review signals may inform weak concepts or future personalization.

Design direction:

- keep card interaction tactile but not gamified;
- ratings should be fast and keyboard-friendly.

### Worked Example

Purpose:

- guided practice and step-level reasoning.

Required UI:

- problem statement;
- step list;
- answer step;
- reveal hint;
- reveal step;
- common mistakes;
- final takeaway;
- tutor help.

Important behavior:

- evaluable step answers or explanations can emit Mastery Evidence;
- revealing a step is passive and should not count as mastery by itself.

### Formula Sheet

Purpose:

- compact source-grounded formula reference.

Required UI:

- formula symbol;
- expression;
- meaning;
- assumptions;
- units;
- example usage;
- source links.

Design direction:

- math rendering must be excellent;
- support horizontal overflow for long formulas;
- group formulas by concept or unit family when possible.

### Comparison Page

Purpose:

- compare two concepts, methods, definitions, or cases.

Required UI:

- left and right titles;
- dimension rows;
- left value;
- right value;
- takeaway;
- optional checkpoint question.

Design direction:

- use a comparison table on desktop;
- use stacked dimension cards on mobile;
- keep both sides visible enough for direct comparison.

### Diagram

Purpose:

- visual concept representation.

Required UI:

- diagram image or renderer;
- caption;
- source/Evidence links;
- related concepts;
- ask tutor.

Design direction:

- diagrams should be inspectable, not decorative;
- support zoom or full-screen for dense diagrams.

### Revision Plan

Purpose:

- concrete plan for review.

Required UI:

- time horizon;
- ordered tasks;
- weak concepts;
- practice items;
- artifacts to review;
- next tutor action.

Design direction:

- action-list layout;
- show what is source-backed and what is tutor recommendation.

### Session Digest

Purpose:

- durable summary of a tutoring session.

Required UI:

- summary;
- taught;
- checked;
- still weak;
- next actions;
- produced artifact links.

Design direction:

- useful for review and restart;
- should connect back to session history and Live Plan.

### Concept Card

Purpose:

- compact concept study aid.

Required UI:

- concept name;
- definition;
- intuition;
- key formula or example;
- common confusion;
- quick check;
- Evidence.

Design direction:

- more compact than full concept page;
- useful in side-by-side review.

## Artifact Errors

Loading:

- show skeleton or compact loading row;
- do not block tutor chat.

Save failure:

- keep local edits;
- show retry;
- preserve selected artifact.

Generation failure:

- if resumable, show resume action;
- if failed, explain what can be retried;
- avoid showing raw tool-call failure in learner mode.

## Workspace Placement

Target placement:

- artifacts should open in the Workspace Reference viewer;
- tutor panel may show a compact artifact proposal or review card;
- rich review should not stay trapped inside tutor modal.

The current tutor-panel artifact modal is behaviorally important but visually transitional.
