# Reference Surfaces And Evidence

## Reference Surface Role

A Reference surface is the full-panel learner view for a source, curriculum, module, session, concept, wiki page, or artifact. It is the primary way to read, review, act, and inspect Evidence from a selected Workspace object.

The lesson itself still happens in tutor chat.

## Supported Surface Types

- curriculum;
- module;
- objective;
- objective list, internal or embedded only;
- session;
- concept;
- wiki page;
- artifact;
- source;
- fallback.

## Reference Surface Anatomy

Header:

- Back to Workspace;
- surface type badge;
- title;
- readiness or status;
- generation badge in Dev Mode;
- actions.

Body:

- summary if useful;
- interactive learning blocks first when present;
- static reference blocks;
- empty state when no durable content exists.

Actions:

- Ask tutor;
- Review;
- Quiz;
- Regenerate where allowed;
- Evidence;
- Open source.

## Surface Status Language

Artifact:

- Ready to study;
- Suggested;
- Needs review.

Source Wiki and concept pages:

- Still improving;
- Ready to study;
- Needs more source support;
- Needs refresh.

Do not show internal statuses like draft, candidate, rejected, failed, archived in learner mode unless transformed into helpful recovery copy.

## Surface-Type Direction

### Source Surface

Primary content:

- original source document in viewer;
- extracted text as secondary action;
- source reader interactive block when available;
- Evidence access.

Design guidance:

- source document should feel like the main reading object;
- do not bury the PDF/document behind a metadata card.

### Concept Surface

Primary content:

- definition;
- intuition;
- formal details;
- examples;
- common confusions;
- quick self-check;
- citations.

Interactive blocks:

- quiz;
- worked example;
- simulation;
- Evidence explorer;
- concept timeline.

### Topic Or Wiki Page Surface

Primary content:

- readable source-grounded note;
- sections that mirror the source where useful;
- citations and supporting notes;
- related concepts.

Design guidance:

- should read like polished study notes;
- avoid raw claim lists and extraction metrics.

### Curriculum Surface

Primary content:

- path overview;
- modules;
- current location;
- progress summary;
- next action.

Design guidance:

- course-like, but not an LMS admin page.

### Module Surface

Primary content:

- module summary;
- embedded objective list;
- related artifacts;
- related sessions;
- related concepts;
- Evidence when source-backed.

### Session Surface

Primary content:

- reopen or resume chat action;
- session overview;
- produced artifacts;
- referenced sources and concepts.

### Artifact Surface

Primary content:

- type-specific renderer;
- quality and status;
- source refs;
- actions such as approve, reject, study, practice, review, ask tutor.

See [Artifacts and study aids](./08-artifacts.md).

## Static Block Types

Reference surfaces can include:

- markdown;
- summary;
- definition;
- formula table;
- step list;
- question list;
- flashcard list;
- comparison table;
- citation list;
- example;
- callout;
- quiz feedback;
- metadata.

Design guidance:

- render long prose with comfortable line length;
- render tables with horizontal scroll;
- formulas need overflow handling;
- metadata should be hidden or minimized in learner mode.

## Interactive Blocks

Interactive blocks can appear inside Reference surfaces and render through native fallback or MCP app bundle.

See [Interactive learning and MCP apps](./09-interactive-learning-and-mcp-apps.md).

## Regeneration

Regenerate is allowed only when the surface supports it and is not a source or fallback surface.

Design states:

- default regenerate;
- add instruction;
- regenerating;
- regeneration error;
- refreshed surface.

Copy examples:

- `Regenerate`
- `Add instruction`
- `Regenerating...`

Instruction textarea placeholder can mention:

`Optional: make it more visual, add harder examples, focus on exam prep, include formulas...`

## Evidence Drawer

Evidence is the learner-facing trust layer.

Drawer header:

- node type badge;
- title: `Evidence`;
- selected node title;
- close.

Content:

- source excerpts;
- supporting notes;
- empty evidence state;
- hidden debug claim notice when applicable.

Source excerpt row:

- source title;
- page or locator;
- excerpt text;
- chunk type only when useful.

Supporting note row:

- learner-safe label;
- note text;
- no raw claim status.

Dev Mode additions:

- draft/debug claims;
- confidence;
- developer metadata;
- raw IDs;
- entity details.

## Evidence Rules

- Source-grounded claims should cite Evidence.
- Interactive blocks should carry Evidence refs.
- Quiz feedback and worked steps reveal Evidence after submit or reveal.
- Simulations must say whether they are source-grounded or broader practice.
- Outside-source content must be labeled as broader explanation or practice, not source claim.

## Evidence Empty State

Use:

`No source excerpts or supporting notes found for this node.`

If the node only exists in graph projection, Dev Mode may add:

`Node may exist only in the graph projection.`

## Fallback Surface

If no durable content exists:

Title remains the node title.

Message:

`No durable reference content has been generated for this node yet.`

Action:

- Teach this, if tutor launch is available.
