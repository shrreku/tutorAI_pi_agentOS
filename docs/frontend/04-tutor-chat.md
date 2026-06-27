# Tutor Chat And Runtime Work

## Role

Tutor chat is the teaching spine. It starts lessons, explains, asks checkpoints, reacts to learner answers, launches artifacts or interactive surfaces, and records learning state through governed runtime actions.

The Workspace is where durable reference, graph, source, artifact, Evidence, and rich interaction live.

## Tutor Panel Structure

Required zones:

1. Header
2. Mode and session controls
3. Optional history panel
4. Selected context indicator
5. Reference options and artifact consent
6. Chat thread
7. Runtime Work View
8. Composer

## Header

Header content:

- title: `Tutor`;
- current objective or plan status;
- New chat;
- History;
- session status dot;
- Pause, Resume, End when a session exists.

Session status:

- active: success dot;
- paused: warning dot;
- completed: neutral;
- failed run: danger state in the thread, not session dot alone.

## Tutor Modes

Mode selector values:

- Learn
- Practice
- Revise
- Explore
- Source Wiki

Design guidance:

- use a compact select or segmented control depending on available width;
- mode should feel like context for the next tutor turn, not a separate app route.

## Session Action

Primary session action label derives from study state:

- `Start session`
- `Continue session`
- `Resume session`
- `Start next lesson`
- `Plan course`

The action should fill the composer with an appropriate prompt or start the session flow. It must not silently mutate the plan without tutor/runtime handling.

## Empty Thread

Empty tutor thread should orient the learner to the material:

Title: `Start from the material, not a blank chat`

Support:

`Ask for a plan, inspect a selected graph node, or have the tutor turn sources into a first lesson route.`

Suggested prompts:

- current session prompt;
- `Explain the current objective with evidence from my sources.`
- `Show me what is missing from this notebook.`

## Chat Messages

User message:

- aligned or inset to distinguish from assistant;
- accent-soft background;
- preserve math and code where present.

Tutor message:

- readable prose;
- markdown, tables, code, and math support;
- no raw IDs;
- no duplicate assistant prefixes;
- long tables scroll horizontally.

## Runtime Work View

Runtime Work View shows what the tutor is doing before the final learner response.

Learner-facing labels:

- Tutor Activity
- Thinking
- Searching Source Wiki
- Reading study plan
- Checking learning state
- Creating study aid
- Updating progress

It should not read like a trace log in learner mode.

Structure:

- compact summary row while running;
- expandable chronological work items;
- tool activity line with human summary;
- final learner response appears as the main assistant message.

States:

- running;
- completed;
- failed with retry;
- tool-only turn with no learner response;
- replayed completed turn.

Dev Mode:

- may show raw events, run IDs, model, prompt version, tool names, reducer result, trace IDs, and usage.

## History

History supports:

- search previous chats;
- filter by all, questions, answers;
- list sessions by date, turn count, title, and latest answer snippet;
- view previous session;
- return to current session.

Design guidance:

- history is a drawer or inline panel inside Tutor, not a global route;
- the learner must understand when they are viewing a previous session.

Tutor History is required for the hosted beta MVP. It must cover the learner's retained session history through pagination rather than only the recent developer trace window.

Backend contract:

- paginated learner-safe session summaries;
- server-side search across learner questions and tutor answers;
- all, questions, and answers filters;
- session title, start and end time, mode, status, turn count, and latest answer snippet;
- explicit current-session marker;
- learner-safe transcript retrieval for one selected session;
- stable ordering and pagination cursor.

Runtime traces, tool arguments, model metadata, raw IDs, and developer events are not Tutor History. They remain Dev Mode diagnostics and must not be required to render or search learner history.

## Composer

Required behavior:

- multiline text;
- Ctrl+Enter sends;
- button label is `Send` when idle;
- button label is `Steer current response` while a response is running;
- disabled when empty;
- retry available after retryable failure.

Target enhancements:

- selected context chips above composer;
- optional "ask about selected node" affordance;
- source scope hint when sources are selected.

## Artifact Consent

Reference options must preserve:

- Auto-create learner study aids;
- Auto-promote generated notes;
- Dev Mode tutor activity details.

Design guidance:

- this can become a settings popover;
- copy must explain that disabled settings keep tutor-created aids proposed or draft until approval.

## Error States

Runtime failure:

- show error near relevant turn;
- provide Retry when possible;
- preserve learner prompt;
- keep session controls available.

Artifact save failure:

- show inside artifact surface;
- do not erase local edits.

Tutor Activity detail loading failure:

- hide diagnostics unless Dev Mode or history requires it;
- do not block chat.
