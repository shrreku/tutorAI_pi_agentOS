# Interactive Learning Pipeline Implementation Plan

Status: active implementation plan.

This plan turns [`interactive-learning-pipeline.md`](./interactive-learning-pipeline.md) and ADR-0020 into buildable work. It assumes the full target scope: official MCP Apps rendering, typed Interactive Learning Templates, local generative draft execution, promotion evidence, required Admin UI approval, draft PR automation, hosted runtime resolution, Tutor Choreography, Template Builder Agent, and later Interaction Director Agent.

The companion ticket packet is [`interactive-learning-pipeline-implementation-tickets.md`](./interactive-learning-pipeline-implementation-tickets.md). Those tickets are GitHub-ready drafts; publish them to GitHub Issues before assigning implementation work.

## Build Objective

Build StudyAgent's Interactive Learning pipeline as a trusted library and promotion system for rich learning blocks, simulations, and generative UI.

The system must support two different execution lanes:

1. **Hosted Workspace runtime** — real learner Workspaces select and render already promoted templates. Runtime model output can configure a template with schema-valid instance data, but cannot introduce executable View code, new durable state semantics, new sandbox capabilities, arbitrary network access, or unreviewed npm behavior.
2. **Template promotion lane** — maintainers can generate, build, test, preview, review, and promote completely new interactive UI, including simulations. Generated code runs only in a local or isolated draft executor until it becomes reviewed Git source and an immutable published MCP App resource.

Version 1 should be production-shaped even if some templates remain basic. The goal is not a demo gallery; the goal is a repeatable pipeline that can safely grow a large template library.

## Current Baseline

The repository already has:

- shared schemas for Interactive Learning Blocks, actions, simulation templates, and drafts;
- API action validation and durable outcome handlers;
- web-side native fallback rendering and a custom iframe bridge scaffold;
- a handwritten MCP app registry with intended `ui://` identities;
- tutor-stream and Notebook event seams that can launch a surface-like viewer;
- Folio Workspace shell work in progress.

The repository does not yet have:

- official MCP Apps host lifecycle support;
- actual built `/mcp-apps/*` assets for the current registry;
- a typed template SDK;
- immutable template manifests and generated catalog;
- a promotion database model or artifact store integration;
- an Admin UI for promotion review;
- production-equivalent promotion preview through the official host path;
- a Template Builder Agent;
- a deterministic hosted Template Resolver;
- ordered AG-UI Surface Cues and recoverable Workspace Stage state.

## Non-Negotiable Boundaries

These are implementation constraints, not preferences.

### Official MCP Apps

Released Views must use official MCP Apps semantics:

- `ui://` resources;
- `text/html;profile=mcp-app`;
- JSON-RPC 2.0 over the sandbox proxy;
- lifecycle/capability negotiation;
- host-provided tool input/results;
- app-visible tool calls adapted to StudyAgent actions.

The current `apps/web/src/interactive-learning` custom bridge is migration source only.

### Runtime Data, Not Runtime Code

Hosted learner Workspaces never generate or evaluate new template code. They receive a `LearningInteractionRequest`, resolve an exact promoted template version, validate the Template Instance, and render the immutable MCP App View.

Template Instance data may vary per notebook. View code and action contracts may not.

### Local Draft Execution Boundary

Generated UI and simulation code may run in local or isolated draft execution for:

- authoring iteration;
- unit/property/interaction tests;
- screenshots and visual regression;
- accessibility scans;
- performance traces;
- protocol conformance;
- promotion evidence.

That boundary has no production learner data, production credentials, direct production database access, catalog signing key, Admin approval command, or publication authority.

### Production-Equivalent Promotion Evidence

Direct React/Vite-style previews are allowed for authoring speed but are not approval evidence. Promotion evidence and Admin review previews must load the compiled draft through:

- Internal MCP App Host;
- official MCP Apps lifecycle;
- sandbox proxy;
- CSP and permission policy;
- capability negotiation;
- app-visible tools;
- StudyAgent action adapter;
- responsive Workspace Stage shell when relevant.

### Git Source And Immutable Artifacts

Promoted executable source lives in Git under `interactive-templates/<template-id>/`. Draft snapshots and evidence can live in artifact storage while pending, but publication builds only from an accepted Git commit.

The Template Promotion Lab must not publish directly from:

- an ephemeral draft workspace;
- a draft-source snapshot;
- an artifact-storage blob;
- PostgreSQL;
- a local uncommitted directory.

### Admin Approval Boundary

The authenticated Template Promotion Lab is required. CLI tools and workers may build, inspect, test, and reject drafts, but only authorized Admin UI review commands may approve, publish, revoke, or request rebuild.

### Dependency And Network Policy

Promoted templates may introduce third-party npm dependencies, but each template version must declare and pin the exact resolved dependency graph with integrity/provenance/license/security/bundle evidence.

Runtime network access is disabled by default. External runtime calls require Platform-Extension review with exact origin allowlists, transmitted data classes, privacy review, failure fallback, timeout/caching behavior, telemetry, and CSP/sandbox changes.

### Durable State Policy

Templates cannot invent durable learner state, tables, events, reducers, migrations, or persistence APIs. Template-local events map to canonical Interactive Learning Actions and Canonical Learning State projections.

New durable semantics are Platform-Extension work.

### Agent Authority

The Template Builder Agent may author, build, test, preview, create branches, and open draft PRs. It may not:

- access learner data;
- use production credentials;
- access the production database directly;
- merge PRs;
- approve PR review;
- mark PRs ready for review;
- approve/publish/revoke templates;
- hold catalog signing keys.

## Target Repository Topology

Add packages and template workspaces incrementally:

```text
packages/
  interactive-core/
  interactive-dom/
  mcp-app-view/
  mcp-app-host/
  interactive-build/
  interactive-scenery/        # optional, after benchmark approval

interactive-templates/
  animated-process/
  quiz/
  flashcard-review/
  worked-example-stepper/
  evidence-comparator/
  function-explorer/
  electron-flow-lab/
  live-plan/
  template-diagnostics/
```

Ownership:

| Area                         | Owner                             | Responsibility                                                                                          |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Wire schemas                 | `@studyagent/schemas`             | Shared API/host/runtime contracts, generated schema exports, compatibility aliases                      |
| Template SDK                 | `@studyagent/interactive-core`    | Template definition, model state, reducers, migrations, replay, seeded randomness, action payload types |
| DOM/SVG primitives           | `@studyagent/interactive-dom`     | Accessible controls, layout, motion policy, visual tokens, renderer helpers                             |
| View runtime                 | `@studyagent/mcp-app-view`        | View lifecycle, tool input/results, app-visible tool calls, diagnostics, teardown                       |
| Host runtime                 | `@studyagent/mcp-app-host`        | Resource loading, sandbox proxy, protocol lifecycle, capability negotiation, action adapter             |
| Build/promotion tooling      | `@studyagent/interactive-build`   | Template scaffolding, Vite builds, manifest validation, evidence pack, catalog generation               |
| Optional simulation renderer | `@studyagent/interactive-scenery` | SceneryStack adapter after benchmark approval                                                           |
| API                          | `apps/api`                        | Catalog, resolver, action, promotion, artifact metadata, capability endpoints                           |
| Worker                       | `apps/worker`                     | Build jobs, evidence generation, Template Builder orchestration                                         |
| Web                          | `apps/web`                        | Workspace Stage, Internal MCP App Host integration, Template Promotion Lab                              |

## Core Contracts

### Template Definition

Each template uses a code-first `defineInteractiveTemplate()` API. Zod is the source of truth for:

- Template Instance input;
- Template Model State;
- commands/local events;
- canonical action payloads;
- Canonical Learning State projection;
- migrations;
- fixtures/examples.

The build emits:

- JSON Schema for model-facing generation;
- manifest JSON;
- TypeScript types;
- fixture validation reports;
- catalog entry;
- compatibility metadata.

Promoted templates cannot consume untyped `content`, params, state, local events, or action payloads.

### Manifest

Each promoted template version emits one immutable manifest containing at least:

- template ID and semantic version;
- family and semantic tags;
- resource URI and MIME type;
- artifact content hash;
- manifest hash;
- instance schema version;
- model-state compatibility version;
- Canonical Learning State compatibility version;
- action payload schemas;
- host capabilities;
- renderer profile;
- dependency graph hash and lockfile provenance;
- CSP/sandbox requirements;
- runtime network declaration, normally empty;
- accessibility metadata;
- fallback support;
- build environment/toolchain identity;
- source Git commit;
- evidence pack reference;
- Admin review record reference.

### Catalog

The catalog is generated, not hand-maintained. It is consumed by:

- API resolver;
- web host;
- Template Promotion Lab;
- Template Builder Agent;
- model-facing prompt/catalog schema generation;
- diagnostics template.

Catalog entries are immutable by version. Durable surfaces persist exact `templateId`, template version, schema version, and migration state. No durable learner state resolves `latest`.

### Learning Interaction Request

The hosted runtime model emits semantic intent, not View code:

- interaction family;
- learning objective/concept refs;
- source/Evidence refs;
- difficulty/modality;
- learner constraints;
- desired output style;
- optional `templateId` hint;
- schema-valid instance candidate or parameters.

The deterministic Template Resolver filters by hard constraints, validates instance input, pins exact version, and returns either a Template Instance or trusted fallback.

### Canonical Actions

Template-local events map to a stable platform vocabulary:

- response;
- attempt;
- observation;
- review;
- Evidence open;
- intent;
- completion;
- tutor help.

New durable meanings require Platform-Extension review.

## Runtime Architecture

### Learner Runtime Flow

1. Tutor or page-generation creates a `LearningInteractionRequest`.
2. API resolver filters catalog by family, evidence policy, learner constraints, host capabilities, renderer profile, and action support.
3. Resolver selects an exact template version and validates the Template Instance.
4. API returns an Interactive Learning Block containing template identity, exact version, instance data, canonical state, fallback summary, and action envelope context.
5. Web Workspace Stage receives the block.
6. Internal MCP App Host loads the immutable `ui://` resource.
7. View initializes via official MCP Apps lifecycle.
8. Host sends tool input/results with Template Instance and Canonical Learning State.
9. View runs local model/view state.
10. Meaningful learner actions call app-visible tools.
11. Host adapts tool calls to validated Interactive Learning Actions.
12. API reducers update Artifacts, Mastery Evidence, learning state, plan state, or Notebook events.
13. Host reconciles updated Canonical Learning State back into the View.
14. Reload reconstructs from Template Instance plus Canonical Learning State.

### Fallback Behavior

Every promoted template must define a fallback summary and failure behavior. Fallbacks should preserve learning continuity even when:

- View fails to load;
- protocol initialization fails;
- action submission fails;
- accessibility constraints reject the renderer;
- viewport is too small;
- dependency or performance budgets fail;
- template version is revoked.

Fallback may be a native block, text explanation, reduced interaction, or tutor handoff depending on the template.

### Migration From Current Bridge

The migration should proceed by compatibility wrappers, not by a flag day:

1. keep existing block/action schemas operational;
2. add template identity and exact-version fields alongside existing kind aliases;
3. create generated catalog entries that map current bundle IDs;
4. replace private message shapes with MCP Apps lifecycle behind the same renderer shell;
5. migrate action dispatch from bundle-specific mappings to canonical action schemas;
6. remove the handwritten registry after generated catalog reaches parity;
7. keep native fallbacks until the Golden Template Pack is promoted.

## Promotion Architecture

### Draft Lifecycle

Draft states:

1. created;
2. generating;
3. build queued;
4. building;
5. build failed;
6. evidence running;
7. evidence failed;
8. evidence ready;
9. reviewer changes requested;
10. draft PR opened;
11. PR accepted;
12. Admin review pending;
13. approved;
14. rejected;
15. published;
16. revoked.

Drafts are not learner-facing. Rejected drafts remain outside Trusted Template Mode.

### Promotion Evidence Pack

Every executable template version needs a reviewable evidence pack:

- source Git commit or draft snapshot identity;
- build environment and toolchain versions;
- manifest diff and schema diff;
- dependency graph, integrity, license, security, provenance, bundle impact;
- capability/action/CSP/sandbox/network diff;
- protocol conformance report;
- host-path preview result;
- unit/property/interaction/replay tests;
- migration compatibility tests;
- accessibility report: keyboard, screen reader, contrast, zoom, reduced motion;
- responsive screenshots;
- visual regression report;
- performance report: bundle size, startup, frame time, memory, mobile;
- pedagogy review: objective fit, Evidence behavior, source grounding, misconceptions;
- Synthetic Learner scenarios;
- fallback behavior proof;
- reviewer identity, notes, decision, timestamp.

Automation can fail a draft. Automation cannot publish.

### Admin Lab Requirements

`/admin/interactive-templates` should provide:

- draft/version queue;
- draft detail page;
- build/evidence timeline;
- manifest/schema/action/capability/dependency diffs;
- sandboxed production-equivalent preview;
- responsive and accessibility preview modes;
- screenshots/traces/performance panels;
- pedagogy and Synthetic Learner panels;
- Template-Only vs Platform-Extension classification;
- missing capability explanation;
- draft PR links;
- approve/reject/revoke/request-rebuild controls;
- reviewer identity and decision notes;
- publication record.

The Lab is not a drag-and-drop authoring studio.

### Platform-Extension Handling

Classify a draft as Platform-Extension if it requires:

- new durable action meaning;
- new action handler;
- new table or migration;
- new reducer/event semantics;
- new API or persistence contract;
- new host capability;
- new sandbox permission;
- external runtime network origin;
- new renderer adapter;
- dependency runtime class;
- build infrastructure change.

The Template Builder Agent may generate a patch and open a draft PR. Publication remains blocked until the platform change is reviewed, deployed, and advertised by the host capability catalog.

## Template Builder Agent

The Template Builder Agent is part of the full target build. It should be implemented after deterministic pipeline seams exist, but the implementation plan includes it.

Capabilities:

- read approved SDK docs/examples;
- create or revise template source in an isolated draft workspace;
- run the local promotion runner;
- inspect bounded logs/reports/screenshots;
- request rebuilds;
- generate tests/fixtures/examples;
- classify obvious missing requirements;
- open draft PRs.

Non-authorities:

- no learner data;
- no production credentials;
- no production database;
- no catalog signing key;
- no merge authority;
- no approval authority;
- no publication or revocation authority.

Operational model:

1. maintainer opens a draft request in the Lab or CLI;
2. worker creates isolated draft workspace;
3. agent edits source;
4. executor runs build/evidence gates;
5. agent iterates until evidence ready or blocked;
6. Lab shows evidence;
7. agent may open draft PR;
8. human review and Admin approval handle trust transitions.

## Workspace Stage And Tutor Choreography

### Stage Model

Version 1 Stage has:

- Primary slot: one active rich surface;
- Companion slot: one supporting Evidence/source/reference surface on suitable desktop widths;
- Pinned Tray: learner-managed anchors;
- mobile sheet/fullscreen behavior.

Agents express semantic placement, not coordinates.

### Surface Cues

AG-UI carries idempotent Surface Cues:

- `cueId`;
- tutor session/run/turn identity;
- optional narration/tool anchor;
- monotonic sequence;
- action: stage/focus/replace/dock/minimize/dismiss;
- resolved surface/block/template refs;
- semantic slot/focus policy;
- expiry/relevance boundary.

Client acknowledges:

- applied;
- deferred;
- rejected.

Server stores a compact Choreography Snapshot for reconnect. This is not Canonical Learning State.

### Learner Authority

The layout controller must not:

- steal focus while learner is typing;
- replace active manipulation;
- dismiss pinned surfaces;
- discard unsent input;
- override reduced-motion/accessibility constraints.

Blocked cues queue or appear as Surface Anchors.

## Interaction Director Agent

The Interaction Director Agent is part of the full target but should activate after the catalog contains enough real diversity. It is read-only and cannot bypass deterministic resolver checks.

Inputs:

- eligible promoted templates after hard filtering;
- current objective/concept/Evidence context;
- learner constraints;
- tutor narration plan;
- Workspace Stage state;
- prior interaction outcomes.

Output:

- Turn Interaction Plan with learning purpose, template hint, instance content/parameters, narration checkpoint, and semantic placement intent.

The resolver revalidates the plan and pins exact versions.

## Golden Template Pack Delivery

The Golden Template Pack should be built to prove different risk surfaces:

| Template                 | First useful version                                                                                  | Key proof                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `template-diagnostics`   | Admin/dev-only host inspector with protocol events, input/state panes, action simulator, sandbox info | Host correctness, catalog visibility, promotion diagnostics                               |
| `quiz`                   | choice/free-response with feedback and Mastery Evidence mapping                                       | canonical action path, Artifact/Mastery integration, reload                               |
| `function-explorer`      | DOM/SVG function parameter explorer with observation submission                                       | deterministic model state, SVG renderer, accessibility, observation action                |
| `flashcard-review`       | reveal/rating cycle with keyboard flow                                                                | local View State vs durable review action                                                 |
| `worked-example-stepper` | step model with hints/reveal and partial completion                                                   | guided-work state, bounded checkpointing, typed commands                                  |
| `evidence-comparator`    | two or more source excerpts with comparison prompts and open-source action                            | Evidence refs, source open tool, source-grounded UI                                       |
| `animated-process`       | timeline/process animation with narration sync and reduced-motion fallback                            | Tutor Choreography timing, animation policy                                               |
| `live-plan`              | plan/reflect interaction with intent action                                                           | non-mastery durable outcomes through existing planning state                              |
| `electron-flow-lab`      | electron movement simulation                                                                          | complex sim benchmark, optional SceneryStack decision, Tutor Choreography vision exemplar |

Suggested implementation order:

1. `template-diagnostics`;
2. `quiz`;
3. `function-explorer`;
4. `flashcard-review`;
5. `worked-example-stepper`;
6. `evidence-comparator`;
7. `animated-process`;
8. `live-plan`;
9. `electron-flow-lab`.

## Data Model Sketch

Exact names can change during implementation, but the concepts should exist.

| Concept                   | Durable store                    | Purpose                                                                       |
| ------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| promoted template version | Git + generated catalog          | executable source and immutable manifest identity                             |
| template artifact         | artifact registry/storage        | compiled MCP App View resource and hashes                                     |
| promotion run             | PostgreSQL                       | build/evidence workflow state                                                 |
| promotion evidence        | artifact storage + Postgres refs | reports, screenshots, traces, logs, generated manifests                       |
| review decision           | PostgreSQL                       | reviewer identity, notes, approve/reject/revoke/request-rebuild               |
| capability catalog        | API/config/catalog               | deployed host actions, renderer profiles, sandbox/network/dependency features |
| choreographic state       | PostgreSQL/session state         | compact Stage snapshot and learner overrides                                  |

PostgreSQL must not become the executable source store.

## API Surface Sketch

Internal APIs needed:

- list catalog entries;
- resolve a Learning Interaction Request;
- fetch template manifest/version metadata;
- submit Interactive Learning Action;
- list promotion drafts;
- create draft;
- enqueue build/evidence job;
- fetch evidence pack;
- classify Template-Only vs Platform-Extension;
- request rebuild;
- reject draft;
- approve from accepted Git commit;
- publish immutable artifact;
- revoke template version;
- list host capability catalog;
- record Surface Cue acknowledgement;
- fetch Choreography Snapshot.

Keep external MCP server exposure out of v1.

## Test And Verification Strategy

Minimum gates:

- unit tests for template reducers and migrations;
- property tests for model-state determinism where useful;
- schema validation fixtures for valid/invalid Template Instances;
- replay tests from seed + commands + canonical state;
- MCP Apps protocol conformance tests;
- host sandbox/CSP tests;
- action adapter integration tests;
- API resolver tests;
- Admin Lab review-state tests;
- Playwright host-path previews for Golden Template Pack;
- accessibility checks for keyboard/screen-reader/contrast/reduced-motion;
- visual regression screenshots;
- performance budgets;
- Synthetic Learner scenarios for pedagogy and durable outcomes;
- reconnect tests for Choreography Snapshot and idempotent Surface Cues.

Validation commands should be wired into package scripts as the implementation lands. Until then, ticket acceptance criteria should name the relevant test class rather than a nonexistent command.

## Rollout And Flags

Use explicit flags to keep the path safe while it is built:

- enable generated catalog in dev;
- enable official MCP host in dev;
- enable host path for `template-diagnostics`;
- enable Template Promotion Lab for admins;
- enable promoted `quiz`;
- enable resolver for selected hosted Workspace surfaces;
- enable Workspace Stage;
- enable Surface Cues;
- enable Template Builder Agent;
- enable Interaction Director Agent.

Hosted learner environments should not enable unreviewed generative execution.

## Milestones

### Milestone 0: Baseline And Compatibility Map

Outcome: current bridge, registry, schemas, action handlers, and tutor launch seams are mapped and protected by tests.

Deliverables:

- compatibility matrix from current block kinds to target families/templates;
- migration plan for current `unknown` content/state;
- bridge-to-host replacement plan;
- initial capability catalog shape;
- architecture README links.

### Milestone 1: Template SDK And Build System

Outcome: a template can be defined, validated, built, hashed, and represented in a generated catalog locally.

Deliverables:

- `interactive-core`;
- `interactive-dom`;
- `interactive-build`;
- `defineInteractiveTemplate()`;
- manifest/schema generation;
- deterministic replay harness;
- local runner scaffold.

### Milestone 2: Official MCP App Host Path

Outcome: the web app can load a compiled template through official MCP Apps lifecycle in a sandbox and adapt tool calls to StudyAgent actions.

Deliverables:

- `mcp-app-view`;
- `mcp-app-host`;
- resource loader;
- sandbox policy;
- action adapter;
- `template-diagnostics`.

### Milestone 3: Catalog, Resolver, And First Runtime Template

Outcome: hosted runtime can resolve and render an exact promoted template version without runtime code generation.

Deliverables:

- generated catalog consumed by API and web;
- Template Resolver;
- Learning Interaction Request schema;
- `quiz` template;
- migration aliases for existing quiz block kind;
- action/reload tests.

### Milestone 4: Golden Template Pack Core

Outcome: core template variety exists and proves state/action/rendering patterns.

Deliverables:

- `function-explorer`;
- `flashcard-review`;
- `worked-example-stepper`;
- `evidence-comparator`;
- typed fixtures and Synthetic Learner scenarios.

### Milestone 5: Promotion Evidence And Admin Lab

Outcome: executable template versions require evidence and Admin approval before publication.

Deliverables:

- promotion run tables;
- artifact/evidence storage;
- build/evidence worker jobs;
- Admin Lab queue/detail/preview;
- approve/reject/revoke/request-rebuild;
- Git commit/PR binding;
- immutable publication record.

### Milestone 6: Template Builder Agent

Outcome: maintainers can request generated template work locally, get evidence, and open draft PRs while authority boundaries hold.

Deliverables:

- isolated draft workspace;
- bounded generated-code executor;
- builder instructions and tools;
- draft PR automation;
- failure/report summarization;
- no publication authority.

### Milestone 7: Tutor Choreography And Workspace Stage

Outcome: tutor narration can stage promoted surfaces in learner-authoritative slots with recoverable cues.

Deliverables:

- AG-UI Surface Cue schema;
- Choreography Snapshot;
- Workspace Stage;
- Surface Anchor;
- cue acknowledgement path;
- interaction lock/learner override policy;
- `animated-process` template.

### Milestone 8: Complex Simulation And Renderer Benchmark

Outcome: complex simulation path is proven and SceneryStack decision is evidence-backed.

Deliverables:

- `electron-flow-lab`;
- SceneryStack benchmark if needed;
- optional `interactive-scenery` package only after approval;
- performance/accessibility/mobile results.

### Milestone 9: Interaction Director Agent

Outcome: a bounded read-only agent can rank promoted templates and propose Turn Interaction Plans.

Deliverables:

- candidate filtering handoff;
- Turn Interaction Plan schema;
- director prompt/tools;
- resolver revalidation;
- eval suite;
- latency/fallback policy.

## Risks And Mitigations

| Risk                                           | Mitigation                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Private bridge semantics leak into target host | Build protocol conformance tests before migrating templates                                             |
| Template SDK overgeneralizes too early         | Golden Template Pack drives API shape; avoid proprietary scene graph in v1                              |
| Admin Lab becomes authoring studio             | Keep Lab focused on review/control; authoring happens in Git/draft workspace                            |
| Generated code gets into hosted runtime        | Enforce lane separation, Git-only publication, immutable artifacts, and Admin approval                  |
| Dependency graph becomes unsafe                | Pin exact versions, generate evidence, review license/security/provenance/bundle impact                 |
| Complex simulations break accessibility        | DOM/SVG first; SceneryStack only after benchmark; require reduced-motion and screen-reader alternatives |
| Director agent makes bad choices               | Defer until catalog exists; keep resolver deterministic and final                                       |
| Choreography disrupts learners                 | learner-authoritative slots, interaction locks, cue acknowledgement, reconnect snapshots                |
| Ticket scope becomes horizontal                | implement with tracer-bullet slices that cross schema/API/UI/test where possible                        |

## Definition Of Done For The Program

The program is complete when:

- all Golden Template Pack templates are promoted from Git-backed source;
- Admin Lab can approve/reject/revoke/request rebuild;
- generated catalog replaces handwritten registry;
- official MCP App Host replaces private bridge for promoted templates;
- hosted runtime resolves exact template versions from Learning Interaction Requests;
- Template Builder Agent can generate drafts and open draft PRs without authority leaks;
- Workspace Stage and Surface Cues can present promoted templates during tutor narration;
- Interaction Director can rank eligible templates with resolver revalidation;
- no hosted learner path can execute unreviewed generated code;
- validation covers protocol, state, accessibility, visual, performance, pedagogy, and Synthetic Learner behavior.
