# ADR-0020: Interactive Learning Surfaces And Internal MCP App Bridge

Status: Accepted (amended 2026-06-29)

Date: 2026-06-08

## Amendment: Official MCP Apps Is The Renderer Boundary

Every released MCP App Bundle must conform to the stable official MCP Apps protocol rather than a StudyAgent-private iframe message protocol. The Workspace therefore owns an **Internal MCP App Host**, not a parallel bridge protocol. The host must support the official `ui://` resource model, `text/html;profile=mcp-app` resources, capability negotiation, JSON-RPC 2.0 over `postMessage`, the MCP Apps lifecycle, and a sandbox proxy with restrictive CSP and permissions.

`InteractiveLearningBlock` remains StudyAgent's canonical model-facing and learner-context contract. The host translates a block and its canonical state into MCP tool input/results. App-initiated durable actions call allowlisted app-visible tools through the host; those tools adapt to the existing validated Interactive Learning Action dispatcher. Views never call Notebook APIs directly.

The internal resource and tool provider does not need to be exposed as an external StudyAgent MCP server. It must nevertheless obey the same MCP Apps contracts so released Views can run in another compliant host when their required StudyAgent tools and data are available. Use the official MCP Apps SDK/host primitives by default; any thin internal adapter must pass protocol conformance and cross-host fixture tests.

## Context

StudyAgent is moving from static learner artifacts and reference pages toward richer, interactive learning experiences: quizzes, flashcards, worked examples, Evidence explorers, Live Plan dashboards, and concept simulations. Current product vocabulary already separates tutor chat from Workspace Reference Surfaces: tutor chat is the teaching spine, while the Workspace hosts durable reference, review, Evidence, and action surfaces.

Recent MCP Apps, declarative UI, A2UI-style catalogs, AG-UI, and generative UI research provides several possible directions:

- expose StudyAgent as an external MCP server;
- render all rich surfaces as MCP Apps;
- let the model generate arbitrary HTML/CSS/JS mini-apps;
- use declarative, trusted learning blocks rendered by StudyAgent;
- use sandboxed iframe apps only as an implementation detail for rich blocks.

The system must preserve StudyAgent's existing invariants:

- source-grounded learner surfaces should carry Evidence;
- durable writes must flow through typed tools, reducers, events, and artifact lifecycle policy;
- Mastery Evidence should come only from evaluable learner performance;
- tutor chat should not become a miscellaneous app container;
- learner-facing UI must hide raw debug graph objects, claims, confidence scores, and internal provenance unless Dev Mode is enabled.

## Decision

Adopt **Interactive Learning Surfaces** as the product concept for rich learner interaction. An Interactive Learning Surface is a learner-facing Reference Surface in the Workspace with interactive controls for practice, exploration, review, or Evidence inspection. Tutor chat may launch, steer, and discuss these surfaces, but tutor chat remains the teaching spine.

Adopt **Interactive Learning Blocks** as the model-facing declarative UI contract inside Reference Surfaces. The model should request learning-purpose blocks such as Quiz, Flashcard Deck, Worked Example, Evidence Explorer, Simulation, Live Plan, Source Reader, Personalization Controls, and Dev Mode dashboards. The model should not design generic UI using primitive components such as buttons, sliders, cards, and tabs.

Expose a catalog of trusted **Interactive Learning Templates** as the only hosted-runtime model-facing authoring API. Models request a semantic learning interaction, may suggest a template, and provide learning content, parameters, prompts, learner context, and Evidence. Low-level scene objects, reactive primitives, controls, animation composition, and renderer code remain an expert library-authoring layer available to human developers and reviewed drafts in the Template Promotion Lab, not to ordinary learner-facing generation.

In hosted learner Workspaces, models emit a structured Learning Interaction Request and may suggest a semantic template. A deterministic server-side Template Resolver owns policy filtering, exact template/version selection, schema validation, and fallback. Models do not choose resource URIs, versions, actions, renderer capabilities, or sandbox permissions.

Promoted templates are reviewed TypeScript code compiled into immutable MCP App Views. Learner-facing runtime generation produces only versioned, schema-validated template instance data. Trusted Template Mode does not include a general JSON scene interpreter or any other path that lets runtime data introduce executable behavior. Generated template code may enter only through the review, testing, and promotion path.

Use an **Internal MCP App Host** as the default rich rendering path for new Interactive Learning Blocks. The host renders globally versioned **MCP App Bundles** as official MCP Apps Views in sandboxed iframes, provides block data and canonical state through MCP tool input/results, and routes app tool calls into validated StudyAgent actions. This provides standards-compliant MCP Apps behavior inside StudyAgent without exposing an external MCP server in this phase.

MCP App Bundles are implementation artifacts, not product-domain objects. The learner-facing contract remains the Interactive Learning Block. Quiz, flashcard, worked-example, Evidence, Live Plan, Dev Mode, and Simulation Template blocks may all render through MCP App Bundles by default, with native fallback rendering where practical.

Canonical interaction state remains owned by StudyAgent. MCP App Renderers may own temporary presentation state, such as selected controls, card flip state, animation playback, local slider values, or layout. Durable interaction outcomes must be emitted as **Interactive Learning Actions** and validated by the API/runtime. Durable outcomes route through Artifacts, Mastery Evidence, learning state, planning state, reducer-governed writes, and notebook events as appropriate.

Every template must distinguish immutable Template Instance data, deterministic serializable Template Model State, ephemeral View State, and server-owned Canonical Learning State. Random behavior requires an explicit seed. High-frequency simulation and manipulation state stays local; only meaningful learning actions and bounded checkpoints cross the host/tool boundary. Reload reconstructs from the Template Instance and Canonical Learning State rather than iframe-owned persistence.

Templates cannot invent arbitrary durable learner state, tables, event meanings, or persistence paths. Template-local events and model snapshots must map to canonical Interactive Learning Actions and server-owned Canonical Learning State projections. A new durable outcome type, table, reducer, event, migration, or API persistence contract is Platform-Extension work.

Keep the View renderer pluggable. Use semantic DOM and SVG as the default profile. Allow SceneryStack for complex simulations only after representative bundle, performance, sandbox, and accessibility spikes pass explicit budgets. Do not build a StudyAgent-specific scene graph in the first library version.

Publish each promoted template version as an immutable, self-contained MCP App resource with an exact version and content hash. Template Instances persist exact template and schema versions rather than `latest`. Build tooling generates the trusted catalog and compatibility metadata; a handwritten runtime registry is not authoritative. Existing versions remain available until no durable surface, replay, or migration requires them.

Allow promoted templates to introduce third-party npm dependencies. The promotion boundary reviews the exact dependency graph rather than limiting templates to a pre-existing global package allowlist: dependencies must be declared, exact-version pinned with integrity, checked for license/security/provenance/bundle impact, and proven compatible with the template's sandbox, CSP, network, performance, accessibility, and renderer-profile constraints.

Disable runtime network access by default for promoted Views. Templates should be self-contained and receive learner/source/Evidence data through host-provided MCP tool input/results and allowlisted app-visible tools. External runtime network access is Platform-Extension work requiring exact origin allowlisting, privacy and learner-data-boundary review, failure fallback, timeout/caching behavior, telemetry, and CSP/sandbox changes before the host advertises that capability.

Require explicit human maintainer approval before any new executable template version enters Trusted Template Mode. Automated security, protocol, schema, determinism, accessibility, performance, visual, pedagogical, and Synthetic Learner gates may reject a draft and produce promotion evidence, but they may not self-publish executable code. This approval does not apply to ordinary schema-valid Template Instances created from an already promoted version.

Make the authenticated Template Promotion Lab Admin UI the required approval boundary. Workers and CI may generate, build, test, and reject drafts; CLI tooling may inspect or reproduce evidence. Only an authorized Admin UI review command with reviewer identity and decision notes may approve, revoke, or publish an executable template version. The first Lab is a review/control surface, not an authoring studio.

The promotion lane may build a completely new interactive UI: new template code, model/reducer behavior, View composition, styles, accessibility descriptions, schemas, action proposals, manifests, tests, fixtures, fallbacks, and migrations. It runs outside hosted learner sessions in an isolated workspace without learner data, production credentials, or publication authority. New backend actions or host capabilities remain separate platform changes requiring ordinary code review and deployment.

Classify executable drafts as Template-Only or Platform-Extension. A Template-Only Draft may include reviewed third-party dependencies while using already deployed actions, capabilities, renderers, sandbox policy, and durable paths, then publish independently after promotion. A Platform-Extension Draft needs new application behavior, durable outcome type, table, reducer, event, API/persistence contract, host capability, sandbox permission, external runtime network origin, renderer adapter, dependency runtime class, or build infrastructure; its generated code follows the normal review/deploy path, and template publication stays blocked until the deployed host advertises that capability. A draft manifest cannot grant itself platform authority.

Keep promoted template source, schemas, tests, fixtures, migrations, examples, and manifests in Git. Keep immutable compiled Views in an artifact registry and promotion/review/catalog metadata in PostgreSQL. Publication is allowed only from an accepted Git commit and records that commit, build identity, manifest hash, artifact hash, and Admin approval. The Template Promotion Lab must not publish directly from an ephemeral draft workspace, draft-source snapshot, artifact-storage blob, or PostgreSQL record. Draft source/evidence may live in artifact storage before approval; executable source blobs do not use PostgreSQL as their source of truth.

Defer community-authored template submissions from version 1. When enabled later, community templates must enter as Git PRs under the same build, evidence, Admin review, and publication gates as maintainer-authored templates, not through a separate marketplace or direct third-party runtime distribution path.

Scale the library through versioned templates under a small stable Interaction Family and canonical action vocabulary, not by adding a platform block kind and backend action for every View. Templates own strict instance/state/payload schemas and map local events to existing canonical actions. New durable semantics remain Platform-Extension work. Existing specialized block/action names stay as migration aliases until their consumers move to family, template, and capability resolution.

Define templates through a code-first typed SDK with Zod as the source of truth for Template Instance, Template Model State, commands/events, canonical action payloads, Canonical Learning State projection, and migrations. Generate JSON Schema and static manifests from those definitions for models, builders, catalogs, and external tooling. Untyped `content`, state, parameter, and payload records are not allowed in promoted template runtime contracts.

Run promotion code generation through a separate bounded Template Builder Agent rather than granting the hosted Tutor Agent an elevated mode. The builder receives an isolated ephemeral code workspace and authoring/build/test tools, but no learner data, production credentials, production database access, catalog signing key, or approval/publication tool.

Allow the Template Builder Agent to create branches and open draft PRs for generated template source or Platform-Extension patches. It may not merge, approve review, mark PRs ready for review, publish/revoke templates, or issue Admin approval. Draft PRs provide provenance, CI, and code-review surface; they are not promotion decisions.

Treat the generated-code execution boundary as a local or isolated draft executor owned by the promotion lane. Generated UI and simulation code may run there for local iteration, tests, screenshots, preview, and review evidence, but it must not run in hosted learner Workspaces. Promotion is the trust transition: accepted source lands in Git, artifacts are built immutably from that source, and the Admin UI approval record authorizes catalog publication.

Allow direct framework previews only as non-authoritative authoring aids. Promotion evidence must exercise the compiled draft through the production-equivalent Internal MCP App Host path, including official MCP Apps lifecycle, sandbox proxy, CSP and permission policy, capability negotiation, app-visible tools, action adapter, and the responsive Workspace Stage shell where relevant.

Use AG-UI as the ordered Tutor Choreography transport and MCP Apps as the View protocol. AG-UI surface cues may tell the responsive Workspace Stage to stage, focus, replace, dock, or dismiss a resolved surface; they do not carry executable UI. Rich MCP App Views render in the Workspace Stage, while tutor chat shows compact Surface Anchors and only genuinely small native controls. Agents express semantic placement intent, never pixel geometry.

Treat Tutor Choreography as learner-overridable. It may auto-stage only when relevant and non-disruptive; it must not steal focus or interrupt active input. Learner pinning, dismissal, auto-stage preference, interaction locks, responsive layout, reduced motion, and accessibility constraints override Tutor or Interaction Director placement requests.

Make Surface Cues idempotent, sequenced, acknowledged, and reconnectable. AG-UI provides ordered live delivery while a compact session-scoped Choreography Snapshot records the current Stage assignments, pending cues, latest sequence, and learner overrides needed for recovery. Client outcomes are applied, deferred, or rejected with bounded reasons. Choreography state is presentation continuity, not Canonical Learning State.

Use **Simulation Templates** for learner-facing simulations. Arbitrary generated simulation code is allowed only as a **Simulation Draft** path for generating, testing, and promoting future trusted templates. Generated code is a draft path; trusted templates are the product path.

Defer the following from this phase:

- external StudyAgent MCP server;
- MCP App marketplace or third-party app distribution;
- arbitrary generated-code mini-apps in normal learner flows;
- teacher/authoring studio;
- voice or broader multimodal lab.

## Consequences

- Reference Surface becomes the main learner-facing container for rich interaction.
- The Workspace gains an official-protocol Internal MCP App Host, internal resource/tool provider, and sandbox policy.
- New interactive study aids should prefer MCP App Bundle rendering by default, even for quizzes and flashcards, because the current native versions need redesign.
- Model output remains compact and testable because it selects versioned semantic templates rather than emitting scene graphs or executable renderer code.
- Template code changes require a new reviewed build/version; learner-specific instance data never changes executable View behavior.
- Deterministic, renderer-independent Template Model State enables replay, testing, accessibility descriptions, and alternate Views without confusing interaction state with durable learning outcomes.
- Simple learning activities avoid paying for a simulation engine, while complex simulations can adopt a reviewed renderer profile without changing the model-facing template contract.
- Exact immutable resources make a learner interaction reproducible and prevent a visual deployment from silently changing executable behavior or invalidating durable state.
- Human promotion keeps executable learning behavior and pedagogy reviewable without making every learner-specific template instance a manual workflow.
- Admin-owned review makes production promotion auditable and operable without granting a local CLI implicit publication authority.
- Runtime template resolution stays deterministic and bounded while the isolated promotion lane retains the ability to invent genuinely new interactive experiences.
- A separate Template Builder Agent prevents code-authoring privileges and promotion context from leaking into ordinary tutoring sessions.
- Draft classification permits independent template delivery without bypassing ordinary review for backend, persistence, renderer, dependency, or sandbox changes.
- Git-backed source and content-hashed build artifacts make promoted templates reproducible, reviewable, and open to a future community contribution workflow.
- A stable family/action vocabulary lets Template-Only Drafts expand the catalog without forcing API deployments for ordinary interaction variations.
- One typed source prevents drift between model instructions, build manifests, host validation, action dispatch, replay, migrations, and template tests.
- Separating AG-UI choreography from MCP Apps rendering keeps narration ordering, sandbox communication, canonical state, and responsive layout independently testable.
- Learner-authoritative placement prevents agentic presentation from becoming disruptive or inaccessible while preserving timely teaching cues.
- Acknowledged snapshots prevent duplicate or lost surface presentation across stream reconnects without turning transient animation/input state into durable learning data.
- Native rendering remains valuable as fallback, test surface, and for simple blocks.
- All durable app actions use app-visible MCP tools that adapt to one validated Interactive Learning Action envelope rather than renderer-specific routes.
- An active tutor session is optional for actions; every action must still carry a learning context envelope with notebook, surface, block, references, Evidence, and optional tutor session/turn/run identity.
- Ordinary independent actions update state and Workspace surfaces without automatically invoking the tutor.
- Tutor intervention is explicit, tutor-led within an active lesson, or suggested after repeated evidence crosses an intervention threshold.
- Passive interaction such as viewing, scrolling, card flipping, slider movement, or opening Evidence must not become Mastery Evidence by itself.
- Submitted answers, worked attempts, explanations, misconception choices, observations, or explicit self-reports may become Mastery Evidence when evaluable.
- MCP App Bundles should be globally versioned per major block type or Simulation Template and should receive notebook-specific learning content as data, not generated app code.
- App sandboxing should be restrictive by default: no direct notebook API calls, no external network, no subframes, no auth-cookie dependence, and no iframe-owned durable storage unless explicitly reviewed and allowlisted.
- Released Views must be testable against the official MCP Apps protocol. Future external StudyAgent MCP server exposure can reuse the resource, tool, block, bundle, and action contracts, but external server deployment is not required for the first implementation program.

## Alternatives Considered

Expose StudyAgent as an external MCP server now:

- Rejected for this phase because external auth, consent, tool exposure, and cross-host compatibility would distract from the core learner experience. The internal bridge preserves future compatibility without opening the external surface yet.

Use arbitrary generated HTML/CSS/JS for learner-facing mini-apps:

- Rejected for normal learner flows because it risks incorrect pedagogy, accessibility regressions, source-grounding drift, security issues, and untestable UI behavior. Generated code remains useful for Simulation Drafts.

Render everything natively without MCP App iframes:

- Rejected as the only path because simulations, rich app-like quizzes, Evidence explorers, and Dev Mode dashboards benefit from iframe isolation, lifecycle boundaries, and independently versioned bundles. Native rendering remains the fallback path.

Make MCP Apps the product abstraction:

- Rejected because learner-facing vocabulary should remain StudyAgent vocabulary: Workspace, Reference Surface, Interactive Learning Surface, Interactive Learning Block, Artifact, Live Plan, and Evidence. MCP Apps are a renderer/runtime mechanism.

Persist app instances as first-class durable objects:

- Rejected for now. Interactive UI is a Reference Surface/block rendering path. Durable learner outputs remain Artifacts, Mastery Evidence, learning state, planning state, and events. A separate app-instance table can be introduced later only if resumable cross-session UI state emerges that does not fit existing objects.

## References

- ADR-0005: Typed Tools And Reducers Govern Agent Writes
- ADR-0010: Workspace, Reference Surfaces, And Evidence Vocabulary
- ADR-0011: Artifact Lifecycle, Consent, And Quality Gates
- ADR-0013: Mastery Evaluator Produces Durable Evidence; Reducers Apply Learning State
- `docs/archive/2026-h1/architecture/interactive-learning-surfaces-implementation-plan.md`
- `docs/archive/2026-h1/architecture/interactive-learning-surfaces-implementation-tickets.md`
- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
