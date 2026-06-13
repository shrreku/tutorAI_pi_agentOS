# ADR-0020: Interactive Learning Surfaces And Internal MCP App Bridge

Status: Accepted

Date: 2026-06-08

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

Use an **Internal MCP App Bridge** as the default rich rendering path for new Interactive Learning Blocks. The bridge renders globally versioned **MCP App Bundles** in sandboxed iframes and passes block data, host context, and actions through an MCP-App-compatible message shape. This provides MCP App behavior inside StudyAgent without exposing an external MCP server in this phase.

MCP App Bundles are implementation artifacts, not product-domain objects. The learner-facing contract remains the Interactive Learning Block. Quiz, flashcard, worked-example, Evidence, Live Plan, Dev Mode, and Simulation Template blocks may all render through MCP App Bundles by default, with native fallback rendering where practical.

Canonical interaction state remains owned by StudyAgent. MCP App Renderers may own temporary presentation state, such as selected controls, card flip state, animation playback, local slider values, or layout. Durable interaction outcomes must be emitted as **Interactive Learning Actions** and validated by the API/runtime. Durable outcomes route through Artifacts, Mastery Evidence, learning state, planning state, reducer-governed writes, and notebook events as appropriate.

Use **Simulation Templates** for learner-facing simulations. Arbitrary generated simulation code is allowed only as a **Simulation Draft** path for generating, testing, and promoting future trusted templates. Generated code is a draft path; trusted templates are the product path.

Defer the following from this phase:

- external StudyAgent MCP server;
- MCP App marketplace or third-party app distribution;
- arbitrary generated-code mini-apps in normal learner flows;
- teacher/authoring studio;
- voice or broader multimodal lab.

## Consequences

- Reference Surface becomes the main learner-facing container for rich interaction.
- The Workspace gains an Internal MCP App Bridge and sandbox policy.
- New interactive study aids should prefer MCP App Bundle rendering by default, even for quizzes and flashcards, because the current native versions need redesign.
- Native rendering remains valuable as fallback, test surface, and for simple blocks.
- All app actions use one validated Interactive Learning Action envelope rather than renderer-specific routes.
- An active tutor session is optional for actions; every action must still carry a learning context envelope with notebook, surface, block, references, Evidence, and optional tutor session/turn/run identity.
- Ordinary independent actions update state and Workspace surfaces without automatically invoking the tutor.
- Tutor intervention is explicit, tutor-led within an active lesson, or suggested after repeated evidence crosses an intervention threshold.
- Passive interaction such as viewing, scrolling, card flipping, slider movement, or opening Evidence must not become Mastery Evidence by itself.
- Submitted answers, worked attempts, explanations, misconception choices, observations, or explicit self-reports may become Mastery Evidence when evaluable.
- MCP App Bundles should be globally versioned per major block type or Simulation Template and should receive notebook-specific learning content as data, not generated app code.
- App sandboxing should be restrictive by default: no direct notebook API calls, no external network, no subframes, no auth-cookie dependence, and no iframe-owned durable storage unless explicitly reviewed and allowlisted.
- Future external MCP support can reuse block, bundle, and action contracts, but it is not required for the first implementation program.

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
- `docs/architecture/interactive-learning-surfaces-implementation-plan.md`
- `docs/architecture/interactive-learning-surfaces-implementation-tickets.md`
- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
