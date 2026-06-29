# Interactive Learning Pipeline And Authoring Library

Status: accepted for implementation planning after `grill-with-docs`.

This document records the current design for turning a tutor or page-generation need into a trusted Interactive Learning Surface rendered as an official MCP App. It replaces the archived first implementation plan as the active pipeline design; ADR-0020 remains the durable product and trust boundary.

## Current Repository Baseline

The repository already has:

- shared Interactive Learning Block, Action, Simulation Template, and Simulation Draft schemas;
- API composition, validated action dispatch, and durable outcome handlers;
- a hard-coded web bundle registry and a custom iframe bridge scaffold;
- native fallback rendering and contract-level tests.

It does not yet have:

- official MCP Apps host protocol support;
- source code or a build pipeline for the registered `/mcp-apps/*` bundle assets;
- a typed template-authoring library;
- template-specific input/state schemas and compatibility migrations;
- a complete promotion, conformance, accessibility, and cross-host test gate.

## Accepted Decisions

### Two Execution Lanes

The system has two deliberately different lanes:

- **Hosted Workspace runtime** selects and configures already promoted templates for real learners. It cannot generate or execute new View code.
- **Template promotion** may author completely new interactive UI code in an isolated draft workspace, but nothing it produces reaches Trusted Template Mode without the build, evaluation, Admin UI review, and immutable publication gates below.

The restrictions on runtime model output do not restrict the promotion lane's ability to create new UI. They prevent promotion capabilities from leaking into ordinary Notebook sessions.

The promotion lane uses a distinct **Template Builder Agent**. It runs as a bounded job in an isolated ephemeral code workspace and may scaffold, edit, build, test, and preview complete new template implementations. It is not the hosted Tutor Agent and cannot access learner data, production credentials, direct production databases, the trusted catalog publication key, or the final approval command.

The Template Builder Agent may create a branch and open a draft PR for generated template source or Platform-Extension patches. It may not merge, approve review, mark the PR ready for review, publish a template, revoke a template, or issue the Admin approval command. Draft PRs are provenance and review artifacts, not promotion decisions.

The **generated-code execution boundary** is the local or isolated draft executor used by the promotion lane. Generated UI or simulation code may run there for iteration, screenshots, tests, and review evidence. It does not run inside hosted learner Workspaces and it does not become trusted product behavior until promotion publishes an immutable template version.

### Official MCP Apps Boundary

Every released bundle is an official MCP App View. The Internal MCP App Host uses `ui://` resources, `text/html;profile=mcp-app`, capability negotiation, JSON-RPC 2.0 over the required sandbox proxy, MCP tool input/results, app-visible tool calls, and the official lifecycle. StudyAgent may back this with an internal resource/tool provider without exposing an external MCP server.

`InteractiveLearningBlock` remains the canonical StudyAgent contract. App-visible tools adapt to the validated Interactive Learning Action dispatcher; Views never call Notebook APIs directly.

### Semantic Template Boundary

The hosted-runtime model-facing authoring API is a catalog of versioned Interactive Learning Templates named for learning purposes. A model may request a semantic interaction, suggest a template, and supply content, parameters, prompts, learner context, and Evidence. It may not emit raw scene objects, generic controls, animation code, or executable application code in Trusted Template Mode.

The low-level authoring layer is reserved for human library developers and reviewed Simulation or Interactive Block Kind Drafts in the Template Promotion Lab.

### Compiled Code, Runtime Data

Each promoted Interactive Learning Template is reviewed TypeScript code compiled into an immutable, self-contained MCP App View. The learner runtime never generates, evaluates, or interprets scene/application code.

At runtime, the tutor or page generator produces a versioned template instance containing only schema-validated content, parameters, prompts, learner context, and Evidence. Simulation and Interactive Block Kind Drafts may contain generated source code, but only the Template Promotion Lab may build, test, approve, and publish that code as a trusted template version.

A general JSON scene-program interpreter is outside Trusted Template Mode. Declarative instance data may configure a promoted template, but it cannot introduce new object types, controls, actions, executable expressions, or animation programs beyond that template's reviewed schema.

### Hosted Runtime Template Resolution

Inside an actual learner Notebook, the tutor or page-generation model emits a structured **Learning Interaction Request** containing the learning purpose, concept/objective/source/Evidence refs, difficulty, modality, content, parameters, learner constraints, and an optional semantic template hint.

A deterministic server-side Template Resolver owns the final decision. It filters the promoted catalog by pedagogical purpose, Artifact policy, Evidence requirements, learner and accessibility needs, host capabilities, and supported actions; chooses an exact compatible version; validates the Template Instance schema; and produces the Interactive Learning Block. Models cannot select resource URIs, exact versions, renderer/sandbox capabilities, or new action types.

When no promoted template fits, the hosted runtime uses another trusted block, native fallback, or tutor explanation. It does not invoke the promotion lane or generate executable code in the learner request path.

### Deferred Interaction Director Agent

After the promotion pipeline, authoring library, and a substantial trusted template catalog exist, add a bounded read-only **Interaction Director Agent** for non-trivial selection and Tutor Choreography.

The deterministic layer first filters the catalog by hard policy and capability constraints. The Interaction Director then ranks eligible templates and proposes a Turn Interaction Plan containing learning purpose, template hint, instance content/parameters, narration checkpoint, and semantic placement intent. The deterministic resolver revalidates the proposal, pins the exact version, and constructs the block.

The director cannot write learner state, generate template code, publish templates, change manifests/capabilities, or bypass the resolver. The Tutor Agent remains the narrative authority. Simple interactions may continue through the tutor and resolver without invoking the director.

This agent is deliberately sequenced after the catalog exists; building it first would optimize selection over a small or fictional option set.

## Existing Streamed Surface Launch Seam

The repository already has a narrow precursor to tutor-directed presentation:

1. The Pi tutor streams thinking, narration, tool-start, tool-complete, and learner-response events.
2. The tutor may call `interactive_surface.launch` with an existing node and optional block kind.
3. The API appends `session.focus.updated` with `intent: interactive_surface_launch`.
4. The Notebook event stream receives the durable event independently from the tutor response stream.
5. The Workspace shell opens the selected node in its single viewer.

This does not yet implement the envisioned **Tutor Choreography**. Current gaps are:

- no semantic selection among many promoted templates;
- no creation/resolution of a Template Instance as part of launch;
- no ordered cue in the tutor response stream tying narration to presentation;
- no multi-surface stage, replacement, focus, dismiss, or learner-pinning model;
- no semantic placement intent or responsive layout policy;
- no guarantee that the Notebook event stream and tutor stream are observed in the intended order;
- the launch tool cannot currently identify a concrete `blockId` even though the underlying event supports it.

Tutor Choreography should mean ordered semantic presentation cues such as stage, focus, replace, dock, or dismiss. It should not let an agent choose pixel coordinates or override learner layout controls.

### AG-UI Carries Cues; MCP Apps Render Views

Use the tutor's AG-UI stream as the ordered Tutor Choreography transport. Add a typed StudyAgent surface-cue event associated with the current run, narration/tool sequence, target surface/block, and semantic placement intent. Do not send executable UI or an MCP App resource body through AG-UI.

The frontend applies the cue through a responsive **Workspace Stage** and renders the resolved template through the Internal MCP App Host. Desktop placement may use semantic intents such as sidecar, canvas, replace, or focus. Mobile presents the same surface in a sheet or full-screen stage. The layout system, not an agent, owns actual geometry.

Tutor chat renders a compact **Surface Anchor** with title, status, and focus/reopen action so the transcript remains understandable and replayable without mounting full simulation iframes. Genuinely small chat-native controls may remain inline, but rich Interactive Learning Surfaces and simulations do not become transcript children.

AG-UI and MCP Apps retain separate responsibilities:

- AG-UI streams narration, tool lifecycle, ordered surface cues, and choreography state.
- MCP Apps loads and communicates with the sandboxed interactive View.
- StudyAgent actions and canonical state remain behind the host/tool boundary.

### Learner-Authoritative Choreography

Surface Cues are semantic requests, not absolute UI commands. The client may auto-stage a cue only when it directly supports the current explanation and the learner is idle. Choreography must not steal keyboard focus, interrupt typing, discard unsent input, or replace an actively manipulated surface.

Learners may focus, move within allowed layout regions, pin, dismiss, reopen, or disable automatic staging. A learner-pinned surface cannot be replaced or dismissed by the Tutor or Interaction Director. New cues queue while the Stage is interaction-locked and may be offered as a non-blocking Surface Anchor instead.

Reduced-motion, screen-reader, zoom, viewport, and other accessibility/responsive constraints override animation and placement suggestions. The agent expresses semantic intent; the layout controller decides whether and how to apply it.

### Semantic Stage Slots

Version 1 uses a deterministic responsive Stage model rather than a freeform agent-arranged canvas:

- **Primary** — one active rich simulation or Interactive Learning Surface.
- **Companion** — at most one supporting Evidence, source, diagram, formula, or reference surface when viewport and accessibility constraints allow it.
- **Pinned Tray** — learner-managed minimized Surface Anchors that can be reopened without occupying a Stage slot.

On mobile, only one surface is active in a sheet or full-screen Stage; the Pinned Tray remains available as compact anchors. Tutor Choreography may request primary, companion, focus, replace, or minimize intent. The layout controller owns slot eligibility, actual dimensions, ordering, overflow, and responsive transitions.

A multi-block spatial lesson canvas is deferred until observed teaching scenarios show that semantic slots cannot express the required relationships.

### Acknowledged And Recoverable Surface Cues

Surface Cues are idempotent ordered commands rather than fire-and-forget UI effects. Each cue includes:

- stable `cueId`;
- Tutor Session, run, turn, and optional narration/tool anchor identity;
- monotonic session choreography sequence;
- stage, focus, replace, dock, minimize, or dismiss action;
- resolved surface, block, and exact Template Instance references;
- semantic slot/placement and focus policy;
- creation time and optional expiry/relevance boundary.

AG-UI provides ordered live delivery. The server maintains a compact session-scoped **Choreography Snapshot** containing the latest sequence, Primary and Companion assignments, queued cues, and learner overrides needed for recovery. The client acknowledges each cue as applied, deferred, or rejected with a bounded machine-readable reason.

Reconnect uses AG-UI state snapshot/delta semantics to rebuild the Workspace Stage from the Choreography Snapshot without replaying the transcript. Duplicate IDs or already-applied sequences are ignored. Persist meaningful choreography transitions and learner overrides only; never persist animation frames, pointer movement, hover, or other high-frequency View State.

Choreography state controls presentation continuity. It remains strictly separate from Canonical Learning State, Template Model State, and Artifact/Mastery outcomes.

### Four-Layer State Contract

Every Interactive Learning Template separates:

1. **Template Instance** — immutable, versioned, schema-validated learning content, parameters, prompts, Evidence, and explicit random seed.
2. **Template Model State** — deterministic, serializable interaction or simulation state updated through typed commands/reducers. The model layer has no DOM or renderer dependency.
3. **View State** — ephemeral focus, hover, drag, camera, animation-frame, layout, and other presentation-only state.
4. **Canonical Learning State** — server-owned attempts, submitted observations, Mastery Evidence, progress, Artifact state, and other durable outcomes returned through StudyAgent actions.

Randomness is deterministic and explicitly seeded. High-frequency manipulation stays in Template Model State or View State. A View calls an app-visible tool only for a meaningful learning action or bounded checkpoint, attaching the relevant model snapshot when the action schema requires it. Reload reconstructs the experience from Template Instance plus Canonical Learning State; it must not depend on iframe-local durable storage.

Templates cannot invent arbitrary durable learner state, tables, event meanings, or persistence paths. Template-local events and model snapshots must map to the canonical Interactive Learning Action vocabulary and server-owned Canonical Learning State projections. If a draft needs a new durable outcome type, table, reducer, event, migration, or API persistence contract, it is Platform-Extension work.

### Renderer Profiles, Not One Mandatory Engine

The authoring library uses a renderer-adapter boundary rather than forcing every template onto one graphics engine.

- **DOM/SVG profile** is the default for quizzes, flashcards, timelines, diagrams, ordinary manipulatives, controls, and text-heavy learning activities. It prioritizes semantic HTML, low bundle cost, native input behavior, and straightforward responsive/accessibility work.
- **SceneryStack profile** is optional for complex 2D simulations that materially benefit from a scene graph, mixed SVG/Canvas/WebGL rendering, advanced input, pan/zoom, or its parallel accessibility DOM.
- Specialized Canvas/WebGL renderers may be introduced behind the same adapter contract only when a promoted template proves the need.

Version 1 will not build a proprietary scene graph. Before SceneryStack becomes a promoted profile, benchmark it with two representative templates against bundle, startup, frame-time, memory, mobile, keyboard, screen-reader, and MCP App sandbox budgets. Templates remain independent of React or SceneryStack at the Template Model State layer.

### Immutable Published Versions And Generated Catalog

Each promoted template version produces one immutable, self-contained MCP App resource. Its `ui://` URI contains the template identity and exact semantic version, for example `ui://studyagent/templates/function-explorer/1.2.0`. A published manifest records at least:

- template ID and exact version;
- resource URI, MIME type, and content hash;
- Template Instance input schema version;
- Template Model State and Canonical Learning State compatibility versions;
- supported Interactive Learning Actions and required app/host capabilities;
- renderer profile, sandbox/CSP requirements, fallback support, and build provenance.

A Template Instance persists the exact template and schema versions; durable state never resolves a mutable `latest` alias. Existing published versions remain readable for reload, replay, and audit. Moving an existing surface to another version requires an explicit compatibility check or state migration.

Build tooling validates template manifests, emits self-contained Views, hashes artifacts, and generates the trusted resource/catalog registry consumed by the host and API. The current handwritten web registry is removed. Templates may share source packages at build time, but a published View must not depend on StudyAgent-private runtime globals or undeclared network assets.

Promoted templates may introduce third-party npm dependencies. The promotion boundary reviews the exact dependency graph rather than requiring every package to pre-exist in a global allowlist. Each promoted version must declare its dependencies, pin exact resolved versions and integrity hashes in the lockfile, include license/security/provenance/bundle evidence, and prove that the compiled View still satisfies the declared sandbox, CSP, network, performance, accessibility, and renderer-profile constraints.

Runtime network access is disabled by default for promoted Views. A template should be self-contained and receive learner, notebook, source, Evidence, and configuration data through host-provided MCP tool input/results and allowlisted app-visible tools. If a draft genuinely needs external runtime network access, it is Platform-Extension work: the review must name exact origins, request purpose, transmitted data classes, learner-data boundary, privacy implications, failure fallback, timeout/caching behavior, telemetry, and CSP/sandbox changes before the host can advertise the capability.

### Human-Gated Template Promotion

Automation may reject an executable template draft, but it cannot publish one in version 1. Every new executable template version requires an explicit human maintainer approval after the pipeline produces a reviewable evidence pack covering:

- dependency graph, capability, action, CSP, network, and sandbox review;
- schema validation, determinism, seeded replay, state compatibility, and migration behavior;
- official MCP Apps protocol conformance and cross-host fixtures;
- unit, property, interaction, error, and fallback tests;
- keyboard, screen-reader, contrast, zoom, reduced-motion, and responsive behavior;
- visual regression, bundle size, startup, frame-time, memory, and mobile budgets;
- pedagogical/content correctness, Evidence behavior, and Synthetic Learner scenarios.

Human approval signs the immutable manifest and permits publication into the trusted catalog. Schema-valid Template Instances may be created automatically from a promoted version; they do not repeat executable-code review. A failed or rejected draft remains outside Trusted Template Mode.

The required approval surface is a Template Promotion Lab under the authenticated Admin UI, not a CLI-only workflow. It provides:

- a draft/version review queue and immutable build identity;
- sandboxed View preview across responsive and accessibility modes;
- manifest, schema, action, capability, dependency, and version diffs;
- automated gate evidence, screenshots, traces, and performance results;
- pedagogical, Evidence, and Synthetic Learner results;
- approve, reject, revoke, and request-rebuild controls;
- reviewer identity, decision notes, timestamps, and signed publication outcome.

Workers and CI own generation, building, and automated evaluation. The Admin UI reads those results and issues authenticated review commands. It is a review/control surface, not a visual authoring studio. CLI tooling may inspect or reproduce builds but cannot perform the production promotion decision.

The promotion lane must be capable of producing a completely new interactive UI, not only filling or remixing existing templates. A draft may contain new template source, model/reducer code, View composition, styles, accessibility descriptions, input/state schemas, action proposals, manifest/capability declarations, fallback behavior, tests, fixtures, examples, and migration proposals. It builds in an isolated workspace with no production learner data, production credentials, or publication authority.

If a draft requires a new durable action, API capability, or host permission, it must surface that requirement as a separately reviewable platform change. The draft cannot grant itself new backend behavior or sandbox capability merely by declaring it in its manifest.

### Local Draft Execution Boundary

Version 1 optimizes for local generative exploration. A maintainer may ask the Template Builder Agent to generate or revise UI, simulations, schemas, tests, fixtures, and examples, then run the result locally through the promotion runner. This local runner is a draft executor, not the learner runtime.

The draft executor may:

- install or use declared, exact-version-pinned template-authoring dependencies;
- build the draft, run unit/property/interaction/replay/accessibility/performance checks, and capture bounded logs, traces, screenshots, and artifacts;
- serve a sandboxed preview of the draft MCP App View for local review;
- classify the draft as Template-Only or Platform-Extension against the current capability catalogs.

A fast direct framework preview may exist for authoring convenience, but it is non-authoritative. Promotion evidence must come from a production-equivalent path: the compiled draft loads through the Internal MCP App Host, official MCP Apps lifecycle, sandbox proxy, CSP and permission policy, capability negotiation, app-visible tools, action adapter, and responsive Workspace Stage shell where relevant.

The draft executor must not:

- receive production learner data, production credentials, auth cookies, direct database access, catalog signing keys, or publication authority;
- call Notebook APIs directly or rely on hosted learner Workspace state;
- publish to the trusted catalog;
- widen app capabilities, sandbox permissions, network access, durable actions, or backend behavior by manifest declaration alone.

This makes generated code useful for trying generative UI and simulations locally without creating an unreviewed execution path in hosted notebooks. Promotion is the trust transition: the approved source must land in Git, the immutable artifact must be built from that accepted source, and the Admin UI approval record must authorize publication.

### Template-Only And Platform-Extension Drafts

Classify every executable draft before promotion:

1. **Template-Only Draft** — introduces new View code, Template Model behavior, visuals, instance/state schemas, tests, pedagogy, and reviewed third-party dependencies while using already deployed actions, host capabilities, renderer profiles, sandbox policy, and durable outcome paths. After all gates and Admin approval pass, it may publish as an immutable catalog version without redeploying the StudyAgent application.
2. **Platform-Extension Draft** — requires a new action type/handler, durable outcome type, table, reducer, event, API or persistence contract, host/sandbox capability, external runtime network origin, renderer adapter, dependency runtime class, build infrastructure, or other platform behavior. The Template Builder Agent may generate the complete proposed patch and tests, but the Lab must hand it off as a normal reviewable code change. Template promotion remains blocked until that platform version is reviewed, deployed, and advertised by the host capability catalog.

A manifest cannot self-authorize its draft class or grant a missing capability. Deterministic comparison against the deployed capability/action/renderer catalogs assigns the class and explains any blocking platform requirements.

### Git Source, Immutable Artifact Registry

Promoted template source is code, not database content. Git is authoritative for each promoted template's source, manifest, schemas, migrations, fixtures, tests, examples, and documentation under `interactive-templates/<template-id>/`.

Draft workspaces remain isolated and ephemeral. Durable draft source snapshots, build logs, screenshots, reports, and evidence packs live in artifact storage while review is pending. PostgreSQL stores promotion-run state, classifications, evidence references, reviewer decisions, catalog metadata, and publication/revocation records; it does not become the executable source-code store.

Admin approval authorizes source promotion. The pipeline creates or updates a reviewable template-source commit/PR tied to the approved draft and evidence pack. The Template Builder Agent may open that PR as a draft, but a maintainer must move it through normal review before it becomes publication source. Immutable MCP App resources are built and published only from an accepted Git commit. The Template Promotion Lab must not publish directly from an ephemeral draft workspace, draft-source snapshot, artifact-storage blob, or PostgreSQL record. The publication record binds:

- repository and exact Git commit;
- template ID/version and manifest hash;
- compiled resource content hash and artifact location;
- build environment/toolchain identity;
- Admin reviewer identity and approval record.

Template-Only versions can publish from the accepted template commit without redeploying the web/API. Platform-Extension versions additionally wait for the required platform commit and deployed host capability. Community-authored template PRs are not part of version 1. When enabled later, they enter the same Git PR, build, evidence, Admin review, and publication pipeline rather than a separate marketplace path.

### Source And Package Topology

Add these focused packages:

- `@studyagent/interactive-core` — framework-independent Template SDK, deterministic Template Model State, seeded randomness, commands/reducers, serialization, replay, accessibility description contracts, and test helpers.
- `@studyagent/interactive-dom` — accessible semantic DOM/SVG primitives, responsive layout, motion policy, interaction patterns, and compiled View tokens.
- `@studyagent/mcp-app-view` — official MCP Apps View runtime, initialization, tool input/result handling, app-visible tool calls, state reconciliation, diagnostics, and teardown.
- `@studyagent/mcp-app-host` — sandbox proxy, resource loading, capability negotiation, protocol lifecycle, CSP/permission enforcement, and host diagnostics consumed by `apps/web`.
- `@studyagent/interactive-build` — template scaffold, manifest/schema validation, isolated Vite build, self-contained resource emission, hashing, catalog generation, conformance tests, and evidence-pack production.
- `@studyagent/interactive-scenery` — optional renderer adapter created only after the representative SceneryStack benchmark is approved.

Promoted template source lives in independent pnpm workspaces under `interactive-templates/<template-id>/`. Each template owns its manifest, input/state schemas, model, View, tests, fixtures, examples, migrations, and README while consuming shared StudyAgent packages and declared third-party npm dependencies through the promotion dependency review.

Existing ownership remains:

- `@studyagent/schemas` owns wire contracts shared with API/host/runtime.
- `@studyagent/ui` owns Folio host UI and is not bundled wholesale into MCP App Views.
- `apps/api` owns catalog/resolver/action/promotion APIs.
- `apps/worker` owns Template Builder and evaluation orchestration.
- `apps/web` owns Workspace Stage, Template Promotion Lab, and host integration.

The current coupling of bridge protocol, handwritten registry, network dispatch, and React rendering inside `apps/web/src/interactive-learning/` is a migration source, not the target package boundary.

### Stable Families, Extensible Template Catalog

Do not create a platform block kind and backend action for every UI variation. The target catalog uses a small stable **Interaction Family** vocabulary:

- `explain` — animated explanations, comparisons, timelines, and process views;
- `explore` — simulations, manipulatives, parameter labs, and model explorers;
- `practice` — response, matching, classification, sorting, sequencing, labeling, and construction activities;
- `guided_work` — worked examples, scaffolded derivations, debugging, and stepwise problem solving;
- `evidence` — source readers, excerpt comparison, annotation, and Evidence maps;
- `plan_reflect` — Live Plan, confidence calibration, self-explanation, and reflection;
- `diagnostic` — Admin/Dev Mode instrumentation and evaluation surfaces.

Each template has a stable `templateId`, exact version, family, semantic tags, supported concept/modalities, renderer profile, capabilities, and template-specific input/model-state schemas. The deterministic resolver selects by purpose and capabilities rather than switching directly on a growing block-kind enum.

Template-local events map onto a compact canonical Interactive Learning Action vocabulary such as response, attempt, observation, review, Evidence open, intent, completion, and tutor help. A template may define a stricter payload schema without introducing a new platform action name. New durable semantics still require a Platform-Extension Draft.

Existing quiz, flashcard, worked-example, simulation, comparison, timeline, source-reader, and similar block kinds remain compatibility aliases during migration and become template identities/tags rather than permanent top-level extension points.

### Golden Template Pack

The first library milestone is nine promoted templates chosen to exercise the whole pipeline rather than maximize catalog count:

| Template                 | Family           | What it proves                                                                                                         |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `animated-process`       | Explain          | Narration-synchronized sequence, transformation, animation, reduced-motion alternative, and Surface Cue timing         |
| `quiz`                   | Practice         | Choice and free-response attempts, evaluation feedback, Artifact/Mastery integration, and reload                       |
| `flashcard-review`       | Practice         | Local reveal state, durable review action, keyboard navigation, and repeated items                                     |
| `worked-example-stepper` | Guided Work      | Step model, hint/reveal boundaries, evaluable responses, and partial completion                                        |
| `evidence-comparator`    | Evidence         | Source excerpts, locator/open actions, comparison, annotation, and learner-safe Evidence                               |
| `function-explorer`      | Explore          | Deterministic SVG model, parameter manipulation, observation submission, and math accessibility                        |
| `electron-flow-lab`      | Explore          | Complex simulation, multimodal explanation, Tutor Choreography example, and SceneryStack benchmark candidate           |
| `live-plan`              | Plan and Reflect | Intent actions, canonical planning state, safe direct navigation, and non-mastery interactions                         |
| `template-diagnostics`   | Diagnostic       | MCP Apps protocol, host capability, state/replay, accessibility, sandbox, and performance inspection in Admin/Dev Mode |

All nine pass the same promotion pipeline and use exact immutable versions. The Template Builder Agent expands the catalog only after this pack establishes reliable authoring patterns, fixtures, budgets, and review evidence. The Interaction Director remains deferred until the catalog has enough real diversity to justify semantic ranking.

### Typed Template Definition

Every template is authored through a code-first `defineInteractiveTemplate()` API. Zod schemas are the source of truth for:

- Template Instance input;
- deterministic Template Model State;
- typed model commands and local events;
- canonical action payloads keyed by the stable action vocabulary;
- Canonical Learning State projection consumed by the View;
- versioned migration input/output where compatibility requires migration.

The definition also supplies the static manifest metadata, `createModel`, pure `reduce`, canonical-state reconciliation, accessibility description, and renderer entry point. The build system validates the definition and generates JSON Schema, manifest JSON, fixtures/types, and model-facing catalog schemas from it.

All runtime, host, action, builder, migration, and test boundaries parse with the Zod source schemas. Promoted templates cannot use untyped `content`, parameters, model state, commands, local events, or action payloads. Existing `unknown`/open-record contracts are migration inputs only and must be removed from the trusted runtime path.

## Inspiration Boundaries

Use PhET's separation of simulation model and view, reusable common-code layers, instrumentation, and multimodal accessibility as architectural guidance. Do not copy its repository topology or require its full framework.

Use Manim's Scene, object, grouping, transformation, animation, and timeline composition as guidance for the expert authoring layer. Do not expose those primitives directly to tutor/model generation, and do not make offline video rendering the runtime model.

## Provisional Pipeline Shape

Two related paths share the same contracts:

1. **Learner runtime**: identify a learning need, select a promoted Interactive Learning Template, validate its versioned input, resolve its MCP App resource, render it through the Internal MCP App Host, route app-visible tool calls to Interactive Learning Actions, and reconcile canonical state from the API.
2. **Template authoring and promotion**: author or generate a draft in the expert library, validate schemas and pedagogy, build a self-contained MCP App resource, run protocol/security/accessibility/visual/learning tests, obtain human approval, publish an immutable version, and add it to the trusted catalog.

The learner runtime never waits for template code generation or promotion. When no promoted template fits, it uses another trusted block, native fallback, or tutor explanation.

## Dependency Order

1. Official MCP Apps host and resource/tool provider.
2. Template authoring library, build system, immutable catalog, and initial template set.
3. Template Builder Agent, automated gates, and required Template Promotion Lab Admin UI.
4. Hosted Learning Interaction Request and deterministic Template Resolver.
5. Ordered surface-cue transport and responsive Workspace choreography.
6. Interaction Director Agent after the catalog is large enough to require semantic ranking and multi-surface planning.

## Open Design Branches

- generated schema/manifest artifact format and legacy contract migration;
- current block-kind/action migration and compatibility window;
- renderer-adapter API and SceneryStack benchmark outcome;
- build orchestration, generated-artifact retention, and deployment layout;
- template-source commit/PR automation and artifact-registry provider;
- Template Promotion Lab evidence-pack storage and signing implementation;
- hosted planner/director activation policy, latency budget, and evaluation set;
- platform-extension patch/PR handoff and deployed-capability reconciliation;
- acknowledgement transport, choreography snapshot storage, placement vocabulary, and interaction-lock rules;
- accessibility, internationalization, theming, and responsive contracts;
- protocol conformance, visual regression, pedagogy, and Synthetic Learner gates;
- Golden Template Pack implementation order and acceptance fixtures;
- telemetry and performance budgets.
