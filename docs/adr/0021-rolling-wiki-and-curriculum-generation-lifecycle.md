# ADR-0021: Rolling Wiki And Curriculum Generation Lifecycle

Status: Accepted

Date: 2026-06-08

## Context

StudyAgent already treats the LLM Wiki and curriculum as durable notebook state rather than transient RAG output. ADR-0002 established the durable LLM Wiki between sources and tutoring. ADR-0003 established curriculum-first tutor behavior. ADR-0008 established worker-owned ingestion and a minimum tutoring-ready gate. ADR-0020 established Interactive Learning Surfaces and Interactive Learning Blocks as the Workspace rendering path for rich learning interactions.

The current implementation still leaves a product gap: ingestion can extract concepts and claims, generate thin heuristic concept pages, and bootstrap curriculum objects, but the learner often sees sparse pages that repeat extracted claims and say "Still improving." These pages are useful as placeholders but are not the intended polished learning surfaces. Curriculum and module pages also need a clearer generation lifecycle, and tutor turns need a governed way to synchronously improve topic/concept pages when those pages become central to teaching.

The system needs to balance competing pressures:

- First lesson readiness should be fast and reliable.
- The Workspace should not look empty after ingestion.
- LLM-written pages should be source-grounded, cited, and quality-checked.
- Later modules should benefit from learner evidence from earlier modules.
- Tutor-triggered page improvement should feel immediate when the learner is actively studying a concept/topic.
- Automatic generation should not create durable study-aid artifacts such as flashcards without the artifact lifecycle policy.
- Interactive UI should use trusted Interactive Learning Blocks, not arbitrary generated code.

## Decision

Adopt a rolling generation lifecycle for curriculum, modules, Source Wiki pages, and page-embedded learning blocks.

### One Active Curriculum

Ingestion creates one active curriculum for the notebook/source cluster. A curriculum is a coherent learning path, not a generic knowledge slice. The initial curriculum generation should produce the full module outline for that curriculum so the learner and tutor can see the course map.

The system should not generate alternate curriculum shells during the initial build by default. Future alternate paths such as exam preparation, short revision, beginner path, or advanced path may be created by explicit learner/tutor intent or a later planning flow.

### Heuristic Baseline Everywhere

After ingestion, StudyAgent should create heuristic baseline pages broadly enough that the Workspace is navigable:

- curriculum page;
- module pages for the full active curriculum outline;
- topic pages from source headings and planned learning topics;
- concept pages for discovered concepts.

Heuristic pages may be thin and marked with Page Readiness such as `Still improving`, but they should contain useful learner-safe structure, source-backed bullets where available, Evidence affordances, related links, and next actions. They must not expose raw claim IDs, claim statuses, confidence scores, or pipeline/debug metadata in learner mode.

### Initial Build Window

The Initial Build Window is the first post-ingestion learner-ready slice. It includes:

- one active curriculum outline;
- deep build for module 1;
- module 1 objectives;
- polished module 1 page;
- polished notebook-global Topic Pages needed by module 1 objectives;
- polished notebook-global Concept Pages only for core concepts needed by the first objective/session;
- heuristic Topic and Concept Pages for the broader discovered knowledge graph.

Initial Build should focus on static reference quality. It should not generate rich interactive quick checks or worked examples in the first pass. Deterministic Evidence affordances, related links, and learner intent actions are allowed.

### Rolling Module Build

Later modules are deep-built one module at a time. Rolling Module Build is triggered automatically at Module Milestones, learner jumps, or tutor decisions. It should use source evidence plus durable learner signals from prior interaction to personalize the next module's objectives and teaching emphasis.

Rolling Module Build deep-builds the next module only. It may lightly refresh the following module's outline when learner evidence suggests the path may change, but it should not deeply build multiple future modules because that weakens personalization.

The tutor may restructure future modules after durable evidence, but current-module changes should not happen silently. Material path changes require learner confirmation.

### Topic And Concept Pages

Concept Pages and Topic Pages are notebook-global Source Wiki Pages.

- A Concept Page explains one atomic reusable idea. Concepts are the canonical unit for mastery, weak concept tracking, artifacts, tutor checks, and reducer-applied learning state.
- A Topic Page explains a larger source-grounded topic by combining multiple related concepts. Topic Pages may show aggregate learning state, but canonical mastery remains on Concepts and Objectives.

Topic Pages are created from both source headings and curriculum/objective planning. Source-heading topic pages provide the broad heuristic baseline. LLM-polished topic pages should be driven by curriculum/module objectives. If a source heading and objective describe the same topic, they should merge into one notebook-global Topic Page with aliases and source links.

Topic Page polishing may discover missing Concepts and create/link them through a governed concept upsert path with Evidence refs. Concept Page polishing may link to existing Topic Pages, but must not create new Topic Page shells. Missing Topic Pages are created by source-heading ingestion, curriculum/objective planning, Topic Touch, or Rolling Module Build.

### Concept Touch And Topic Touch

Concept Touch and Topic Touch are durable tutor or learner actions involving a concept/topic strongly enough to justify synchronously ensuring its page exists or is improved during the tutor turn.

Triggers include:

- current objective concept/topic;
- mastery check concept;
- weak concept remediation;
- artifact generation concept;
- learner explicitly asks about a concept/topic;
- tutor opens/searches a concept/topic and finds no page or a weak page;
- repeated search or Workspace usage lands on the page;
- Rolling Module Build needs the page.

Incidental analogies or one-off mentions should not trigger page generation.

Touch behavior is foreground-started, time-bounded, and background-continuable:

1. Ensure a heuristic page exists quickly if missing.
2. If the page is central to the turn, start an LLM polish pass.
3. Wait up to approximately 8 seconds when the page is needed immediately.
4. If the polish is still running, continue the tutor response with the current/heuristic page and Page Readiness badge.
5. Let the polish finish asynchronously and refresh the Workspace node/page when complete.

The tutor should mention generation only when relevant to the learner's next action. Usually the Workspace badge is enough.

### Page Readiness And Generation Mode

Page Readiness is learner-facing persisted state shown as a concise badge on pages and graph nodes. Recommended labels:

- `Still improving`
- `Ready to study`
- `Needs more source support`
- `Needs refresh`

Generation Mode is internal/debug metadata. Recommended values include:

- `heuristic`
- `llm_polished`
- `llm_repair`
- `tutor_touch`
- `rolling_module_build`

Page Readiness is strictly separate from learner mastery/readiness. A polished page can still describe a weak concept for the learner, and a heuristic page can cover something the learner already knows.

### Static Pages And Interactive Blocks

Generated curriculum/module/topic/concept surfaces are Reference Surfaces. They may include static reference blocks and, when appropriate, validated Interactive Learning Blocks using the implemented `InteractiveLearningBlock` contract, action envelope, dispatcher, and renderer path.

Initial Build should not generate rich interactive blocks such as quick checks or worked examples. Heuristic pages may include deterministic, low-risk blocks/affordances:

- Evidence explorer from known Evidence refs;
- related concept/topic links;
- "ask tutor to explain" intent action;
- "make flashcards" intent action that routes through artifact consent/policy.

Concept Touch and Topic Touch may generate page-embedded Interactive Learning Blocks when useful, but only through trusted block kinds and validated schemas. The LLM may propose learning-purpose blocks, not arbitrary UI primitives or generated code. Artifact-backed block kinds such as quiz, flashcard deck, and worked example must include an allowed artifact reference and go through Artifact Lifecycle consent/policy before learner-visible durable use. Durable flashcards, concept cards, quizzes, and other study-aid artifacts are not created automatically by wiki/page generation.

### Evidence And Quality

LLM-polished pages must be source-grounded. Source-backed sections need Evidence refs at section level where practical. Broader pedagogical content such as intuition, analogies, prerequisite reminders, and practice prompts may be included, but must be clearly separated from source-specific claims.

Generated pages should preserve human-authored blocks. Quality checks should reject or repair pages with missing required sections, unsupported source claims, absent citations for source-specific claims, learner-visible debug metadata, broken refs, or empty "Still improving" placeholders where evidence exists.

### Tutoring-Ready Gate

The source should become tutoring-ready after minimum viable structure exists:

- parsed/indexed source;
- retrievable chunks and citations;
- concept inventory;
- active curriculum outline;
- module 1 objectives or heuristic fallback;
- heuristic pages and visible Page Readiness/warnings.

Tutoring-ready should not wait for every LLM-polished page. Polishing may complete after readiness and refresh Workspace nodes/pages.

### Failure And Fallback

If LLM generation is unavailable or fails, ingestion should fall back to heuristic curriculum/module/objective/page generation and preserve clear Page Readiness/plan warnings. Ingestion should not fail only because LLM polish failed.

Generation targets must be idempotent. Page key + generation target + generation mode should prevent duplicate work. Existing worker queue and notebook events may be used first if sufficient, but a durable generation job table should be added when retries, progress, or partial failure tracking need it.

## Consequences

- Learners see a populated Workspace quickly after ingestion.
- The first lesson is usable without waiting for full wiki polish.
- Module 2+ planning can be personalized from module 1 learner evidence.
- Tutor turns can improve missing/weak pages at the moment of need without unbounded latency.
- Topic and Concept Pages remain stable notebook-global references while module/session surfaces carry personalization.
- Page content quality becomes visible in the graph through Page Readiness badges.
- The worker and tutor need shared generation services so automatic builds and synchronous touches do not fork behavior.
- The system needs stronger schemas for page readiness, generation mode, page refs, topic refs, and page generation output that composes with the implemented Interactive Learning Block contract.
- Tests must cover idempotency, fallback, human block preservation, citations, readiness badges, node display, and tutor touch latency/background continuation.

## Alternatives Considered

Generate all pages deeply during ingestion:

- Rejected because large sources would delay tutoring-ready state, waste LLM calls on content the learner may never study, and reduce the value of personalization from early learner evidence.

Generate only heuristic pages and rely entirely on tutor touch:

- Rejected because the first module and topic pages should be good enough for the first lesson and Workspace reading without forcing every page through live tutor latency.

Deep-build the first three modules initially:

- Rejected after design review because later modules should benefit from learner interaction in module 1. The full module outline remains visible, but detailed objectives and page polish roll forward module by module.

Create multiple curricula during initial ingestion:

- Rejected because a curriculum is a coherent learning path, not a knowledge slice. One active curriculum should guide "start studying"; alternate curricula require explicit later intent.

Make Topic Pages module-scoped:

- Rejected. Topic Pages are notebook-global canonical source-grounded references. Module pages can include contextual excerpts or "why this matters now" blocks instead.

Allow Concept Page polish to create missing Topic Page shells:

- Rejected to avoid noisy topic proliferation from narrow concept touches. Topic Pages should be created by source-heading ingestion, planning, Topic Touch, or Rolling Module Build.

Persist app instances for page-embedded interactive blocks:

- Rejected for this lifecycle. Interactive blocks are Reference Surface content/rendering; durable learner outputs remain Artifacts, Mastery Evidence, learning state, planning state, and events.

## References

- ADR-0002: Durable LLM Wiki Between Sources And Tutoring
- ADR-0003: Curriculum-First Tutor Behavior
- ADR-0005: Typed Tools And Reducers Govern Agent Writes
- ADR-0008: Worker-Owned Ingestion And Tutoring-Ready Gate
- ADR-0010: Workspace Reference Surfaces And Evidence Vocabulary
- ADR-0011: Artifact Lifecycle Consent And Quality Gates
- ADR-0018: Postgres-First Agentic Coordination
- ADR-0020: Interactive Learning Surfaces And Internal MCP App Bridge
- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/knowledge-graph/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
- `docs/archive/2026-h1/architecture/rolling-wiki-and-curriculum-generation-implementation-plan.md`
