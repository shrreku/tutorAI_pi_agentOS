# Product Domain Context

StudyAgent is a personal learning workspace where a learner studies inside a notebook that compounds over time. The product is not generic chat with uploaded files. It is a notebook-scoped learning system that ingests learner sources, compiles them into a durable LLM-maintained wiki, organizes that wiki into curriculum and session plans, and lets a Pi-based tutor teach from that structure while updating learning state and artifacts.

The default product shape is a left tutor panel plus a right Workspace. The tutor is the active teaching guide. The Workspace is the durable map and reference surface for Curriculum, Study Map, Source Wiki, concept pages, source evidence, sessions, and generated study artifacts.

## Core Mental Model

`Notebook + LLM Wiki + Curriculum/Live Plan + Pi Tutor + Tools/Reducers + Workspace + Evidence`

## Product Loop

1. The learner creates a notebook.
2. The learner uploads sources.
3. Ingestion parses, chunks, indexes, embeds, extracts concepts and claims, and reaches a tutoring-ready gate.
4. The system bootstraps curriculum, modules, objectives, a Live Plan, and a current session plan.
5. The learner opens the Workspace and starts or continues the next lesson.
6. The Pi tutor teaches from the active curriculum, using tools for search, wiki, graph, planning, artifacts, and learning state.
7. Checkpoints, quizzes, and tutoring outcomes update mastery, coverage, weak concepts, session state, and future recommendations.
8. Sessions crystallize into durable notes, digests, artifacts, wiki updates, graph edges, and plan progress.

## Domain Vocabulary

Notebook: the top-level learning container. Owns sources, wiki pages, concepts, claims, curriculum, sessions, artifacts, learner state, graph layout, events, and settings.

Public Preview Access: anonymous access to landing pages, demos, and product information without access to real learner workspaces, tutor sessions, saved progress, or source-backed study material. The `/demo` page is copy-only for hosted beta launch.

Hosted Beta Surface: set of public, learner, and admin pages required to run the hosted product test, including landing/demo/contact pages, login, Beta Consent, template onboarding, workspace creation, learner workspace, credits, access-code redemption, feedback/support, data deletion, and admin console. At launch, anonymous visitors stay on Public Preview Access; authenticated learners enter the real study loop via Study Access.

Landing Page Job: convert anonymous visitors to login so they can accept Beta Consent, choose a Published Study Template, and start a tutor session. Primary CTA is sign-in; secondary CTA is the copy-only demo page.

Public Positioning (Working Brand): lead with **Study OS** in the hero headline — a personal study environment, not generic AI chat. Subcopy explains the **study workspace** (tutor, study map, evidence from real material) and sets honest beta entry: sign in and pick a Published Study Template first; upload is available with Ingestion Access. Avoid "agentic" and lead-with-"AI" in the hero.

Landing Page Structure: hero (headline, subcopy, CTAs, beta trust line) → feature showcase → how you start (sign in → pick topic → study) → Published Study Template strip → final CTA. Deeper product explanation, limitations, and FAQ live on `/demo`.

Landing Feature Showcase: five benefit-led cards — (1) know what to study next (Live Plan), (2) guided tutor grounded in material, (3) study map for concept relationships, (4) evidence-backed answers, (5) practice and artifacts. Study Templates appear in the template strip and how-you-start steps, not as a sixth card. Upload/Ingestion Access is mentioned once, low on the page.

Working Brand: temporary public-facing name and domain used for the hosted beta before final naming is resolved; the current Working Brand is TutorBook on `tutorbook.me`.

Study Access: authenticated access that lets a learner study from pre-ingested StudyAgent material without being allowed to upload sources or trigger ingestion.

Ingestion Access: elevated access that lets a learner upload sources and create or refresh source-backed learning material through ingestion.

Access Code: typed grant bundle that can give a learner specific Product Entitlements, Tutor Credits, Ingestion Credits, Study Template access, or pilot tags without making upload privileges public by default.

Single-Use Access Code: Access Code intended for one learner redemption.

Campaign Access Code: Access Code intended for a bounded pilot, class, or cohort, with explicit redemption limits and expiry.

Product Entitlement: StudyAgent-owned permission or allowance that controls what an authenticated learner can do in the product, such as Study Access, Ingestion Access, or a usage allowance.

Usage Allowance: bounded amount of StudyAgent activity a learner may consume before needing renewal, admin review, payment, or a higher entitlement.

Usage Guardrail: hard product limit that protects learner privacy, system reliability, provider quotas, and hosted spend at expensive or abuse-prone boundaries.

Tutor Credits: cost-backed Usage Allowance consumed by tutor sessions, learner-facing model responses, generated study aids, or other model-backed study activity.

Trial Tutor Budget: one-time Tutor Credits granted to a logged-in learner for initial product validation before Feedback Grants, payment, or admin top-up.

Ingestion Credits: Usage Allowance consumed by uploading, parsing, indexing, embedding, and compiling new learner sources.

Ingestion Queue Limit: Usage Guardrail that caps queued Private Learner Sources per learner while allowing multiple uploads to wait for On-Demand Ingestion.

Credit Ledger: StudyAgent-owned record of credit grants, usage debits, adjustments, expirations, and payment-backed purchases.

Credit Reservation: temporary hold against a learner's Credit Ledger before model-backed tutor or ingestion work starts, settled to actual usage or released after the work finishes.

Credit Balance Indicator: learner-facing percentage view of remaining Usage Allowance, while exact dollar, token, provider, and run-level costs remain admin/internal detail.

Credit Exhausted State: learner state where read-only study review remains available but expensive actions such as tutor turns, artifact generation, source upload, ingestion retry, and Paid Credit Checkout are blocked until credits are granted or purchased.

Paid Credit Top-Up: future learner purchase of additional Tutor Credits or Ingestion Credits, disabled by default during the first hosted beta.

Paid Credit Checkout: payment-provider-backed flow that converts a successful learner payment into a Credit Ledger grant.

Feedback Grant: manual or rule-based credit top-up given in exchange for useful product feedback, observed real study usage, or other validation signal.

On-Demand Ingestion: ingestion execution model where uploads enqueue durable work and a worker is started only when there is source processing to do.

Ingestion Trigger: protected system action that starts an On-Demand Ingestion worker after durable source work has been queued.

Ingestion Status: learner-facing state of uploaded source processing, covering queued, processing, ready to study, failed, and retry-needed outcomes.

Ingestion Review: admin review path for failed or repeatedly stalled Private Learner Sources after the learner's self-serve retry is exhausted.

Learning Feedback: structured learner report about a real study attempt, including the goal, whether StudyAgent helped, where it failed or confused the learner, and whether follow-up contact is allowed.

Support Report: typed learner-submitted report for learning feedback, wrong or confusing tutor output, ingestion problems, privacy requests, credit or access issues, bugs, or UX issues, with safe operational context attached for admin review.

Error Monitoring: exception and crash tracking for the web app, API, and worker, separate from Product Analytics Events, Analytics Mirrors, operational metrics, and LLM traces.

Activated Learner: logged-in learner who starts from a Study Template, completes at least one tutor session with a Mastery Check or quiz interaction, and submits Learning Feedback.

Product Analytics Event: first-party record of learner or product activity used to understand activation, retention, credit use, feedback, and access flows without replacing notebook events or operational telemetry.

Analytics Mirror: sanitized copy of selected Product Analytics Events sent to an external analytics tool for dashboards, funnels, cohorts, and experiments.

Identified Analytics: Analytics Mirror data that includes contactable learner identity such as name or email for product follow-up and feedback review, while excluding source contents, tutor transcripts, uploaded files, and private learning-state detail.

Study Workspace Replay: replay-style Analytics Mirror capture of learner browser behavior in StudyAgent, used to understand onboarding friction, tutor/workspace usability, and product bugs without treating replayed study content as the product analytics source of truth.

Analytics Spend Guard: policy that prevents analytics tooling from creating automatic paid overage; lower-value capture such as replay may stop while first-party Product Analytics Events continue.

Admin Console: internal operator surface for reviewing learners, workspaces, entitlements, credits, feedback, activation, and safety controls during the hosted product test.

Study Template: reusable pre-ingested learning material that learners can start from without owning the original ingestion workflow.

Published Study Template: admin-approved Study Template that authenticated learners may use to create Personal Learner Workspaces.

Study Template Summary: learner-facing metadata for a Published Study Template, including topic, Source Level, estimated time, best-fit study mode, and expected learning outcome.

Learner Onboarding Prompt: optional first-run prompt that asks what the learner is trying to study and their rough level so StudyAgent can order templates and improve activation analytics without blocking entry.

Template Readiness: publication gate for a Study Template requiring completed ingestion, learner-readable Source Wiki and Study Map surfaces, a working first lesson, at least one Mastery Check or quiz path, working Evidence links, no obvious unsupported claims in the first path, and an admin smoke test.

Source Rights Review: admin publishing gate that confirms a Study Template's sources are allowed to be exposed to other learners.

Private Learner Source: source uploaded by a learner into a Personal Learner Workspace; it is private by default and never becomes a Study Template without a separate publishing workflow and Source Rights Review.

Learner Data Deletion: learner-facing control to delete Personal Learner Workspaces and Private Learner Sources, plus a request flow for full account deletion across identity, product data, analytics, and retained operational records.

Beta Consent: first-entry acknowledgement that StudyAgent is experimental, AI outputs may be wrong, identified analytics and replay may be collected, uploaded sources are processed by third-party services, and the product is not for high-stakes educational decisions.

Personal Learner Workspace: a learner-owned study space created from a Study Template or learner-uploaded sources, with private sessions, mastery, Live Plan state, artifacts, and feedback.

Source: immutable learner material such as PDFs, markdown, transcripts, articles, lecture notes, or images. Sources are parsed into source spans, document trees, chunks, assets, concepts, and claims. Sources are versioned and citeable.

Source Level: the intended academic level of a source, such as high school, undergraduate, graduate, professional, or unknown.

Source-scoped tutoring: a tutoring mode that prioritizes one or more selected sources while still using notebook curriculum, learner state, weak concepts, and prerequisites unless the learner asks to stay strictly within the selected sources.

Source Scope Boundary: the learner-facing limit of what the uploaded and indexed sources currently cover for a requested study path.

Source Scope Summary: a learner-facing summary of the sections, topics, or objectives currently covered by uploaded and indexed sources.

Source Coverage Complete: a state where the currently available uploaded source scope has been introduced or checked enough to stop advancing within that source, without implying learner mastery.

Planned Scope Boundary: the learner-facing limit of the currently active curriculum scope, such as a session plan or module, even when more uploaded source content remains available.

Module Milestone: a learner-facing pause point reached when the current module's planned source-backed objectives are complete enough to recommend consolidation before advancing.

Boundary Signal: tutor-facing evidence that a source, session plan, or module boundary has likely been reached; it guides tutoring behavior without acting as a hard constraint.

Outside-Source Extension: learner-approved teaching that goes beyond the uploaded source scope while clearly separating general pedagogical knowledge from source-backed material.

LLM Wiki: the durable knowledge layer between raw sources and live tutoring. It contains concepts, claims, pages, relations, citations, artifacts, confidence, contradictions, supersession, and session crystallization outputs. It is compiled incrementally instead of regenerated from scratch per query, and may become more polished over time through background enrichment and tutor-triggered repair.

Portable Source Knowledge Bundle: shareable representation of source-derived notebook knowledge. It contains source-grounded concepts, pages, claims, citations, Evidence relationships, and knowledge links, and excludes learner-specific mastery, sessions, Live Plan state, private artifacts, credits, and personal annotations.

Source-Scoped Knowledge Bundle: Portable Source Knowledge Bundle centered on one Source and the source-derived concepts, pages, claims, Evidence, and knowledge links needed to reuse that source's knowledge elsewhere.

Notebook-Scoped Knowledge Bundle: Portable Source Knowledge Bundle centered on a curated multi-source notebook knowledge set. It may combine multiple sources and cross-source concepts, pages, claims, Evidence, and links while still excluding learner-specific state.

Portable Knowledge Import Review: validation step for bringing a Portable Source Knowledge Bundle into a notebook. It resolves incoming portable identities against existing notebook knowledge and treats creates, updates, contradictions, and supersessions as reviewable knowledge changes before they become durable StudyAgent knowledge.

Portable Knowledge Identity: stable human-readable identity for a knowledge object inside a Portable Source Knowledge Bundle. It is independent of StudyAgent database IDs, which may be retained only as optional round-trip metadata.

StudyAgent OKF Profile: StudyAgent's OKF-compatible knowledge bundle convention. It keeps the open markdown/frontmatter/link shape while adding source-grounded learning fields for Evidence, readiness, claims, source links, and round-trip identity.

Source Wiki Page: durable source-grounded reference surface generated from the LLM Wiki for a topic, concept, or source summary.

Page Readiness: persisted learner-facing state for a Source Wiki Page or node, shown as a concise badge such as Still improving, Ready to study, Needs more source support, or Needs refresh.

Topic Page: notebook-global Source Wiki Page that teaches a source-grounded topic by combining multiple related concepts, with links to the modules, objectives, sources, and Concept Pages where it appears.

Claim: atomic source-linked knowledge statement. Claims are evidence objects and should not be the default learner-facing reading surface. They support confidence, provenance, contradiction, and supersession.

Portable Claim Document: first-class claim representation inside a Portable Source Knowledge Bundle. It exists for auditability, Evidence tracing, contradiction, and supersession, while learner-facing pages may embed selected claim text as readable notes.

Concept: learnable knowledge node. Concepts connect to source evidence, claims, pages, objectives, quizzes, notes, weak concepts, and related concepts.

Concept Touch: a durable tutor or learner action involving a concept strongly enough to justify synchronously ensuring its Concept Page exists or is improved during the tutor turn.

Topic Touch: a durable tutor or learner action involving a topic strongly enough to justify synchronously ensuring its Topic Page exists or is improved during the tutor turn.

Concept Mastery: the learner's current understanding of a specific concept, updated through reducer-applied Mastery Evidence from mastery checks, quizzes, mistakes, clear conversational evidence, self-report, and session outcomes.

Curriculum: professor-level syllabus for a coherent path through a notebook or source cluster.

Initial Build Window: the first post-ingestion learner-ready slice, covering one active curriculum outline, a deep build for the first module, that module's objectives, and Source Wiki pages for topics and concepts needed by those objectives.

Rolling Module Build: module-by-module deep generation after the Initial Build Window, triggered by a Module Milestone, learner jump, or tutor decision using source evidence and durable learner signals.

Adaptive Curriculum: curriculum that can be modified when durable learner signals show the current path is no longer the best route.

Module: chapter-sized or supersection-sized teaching block inside a curriculum.

Objective List: ordered module-scoped topic breakdown. This is internal planning state; do not expose it as a standalone learner page.

Objective: focused learning goal that can be taught, checked, remediated, or completed within a session arc.

Objective Progress: the learner's status against a teachable goal, derived from session evidence and relevant concept mastery.

Session Plan: durable plan for one tutoring episode, usually centered on one main objective and a few supporting objectives.

Session Node: learner-facing Study Map representation of a real tutor session, distinct from the Session Plan that guides it.

Tutor Activity: learner-facing summary of what the tutor is doing during a live response or completed turn; raw traces remain Dev Mode/debug language.

Session Liveness: whether a Tutor Session remains active and ready to continue without an explicit resume. Session Liveness protects conversation continuity; it is not evidence that the learner was studying for the entire elapsed period.

Tutor Turn Disposition: structured description of what the learner is expected to do after a Tutor Turn, such as read an informational response, answer a question, or complete an Interactive Learning task. It determines the Session Liveness wait policy without treating punctuation or free-form prose as canonical state.

Study Activity Interval: bounded period of learner engagement in a Personal Learner Workspace, attributed to a surface such as Tutor, Study Map, Reference, Evidence, Practice, or Interactive. Study time is the sum of these intervals; hidden-tab time, inactivity beyond the allowed grace period, and raw session elapsed time are excluded.

Teaching Arc: internal pedagogical execution plan for an objective: orient, intuition, formalism, examples, misconception, checkpoint, summary, branch.

Mastery Check: lightweight in-session question, quiz prompt, or checkpoint used by the tutor to assess learner understanding during live tutoring.

Mastery Evaluator: governed evaluator that judges learner responses against concepts, objectives, source evidence when relevant, and recent tutoring context, returning structured mastery evidence without directly mutating canonical learning state. It is not a learner-facing persona.

Learner Trait Model: shared vocabulary of stable or slowly changing learner qualities that can describe either authored Synthetic Learner Personas or evidence-backed real learner profiles without replacing dynamic mastery, weak-concept, or recent-performance state.

Learner Trait Estimate: evidence-backed estimate of a real learner's trait value, carrying enough confidence and provenance to avoid treating one interaction as a permanent learner quality.

Learner Trait Signal: low-level observation that may support a future Learner Trait Estimate, such as a pace request, help-seeking behavior, confidence mismatch, persistence pattern, assessment preference, or self-explanation pattern.

Learner Trait Set: the initial tutoring-actionable Learner Trait Model dimensions: pace preference, depth preference, help-seeking style, confidence style, metacognitive accuracy, persistence style, source familiarity, assessment preference, example preference, and urgency context.

Learner Trait Archetype: named combination of Learner Trait Model values used to generate Synthetic Learner Personas or summarize evidence-backed real learner trait estimates for recommendation, not learner identity.

Personalization Recommendation: tutor-facing suggestion derived from Learner Trait Estimates that can shape pacing, explanation style, examples, checks, and artifact choices without overriding Mastery Evidence, learner goals, or source grounding.

Portable Learner Profile: future explicit cross-notebook learner model for traits or preferences that should transfer across notebooks, kept separate from notebook-scoped learning state.

Synthetic Learner: test-only harness actor that simulates learner behavior, goals, mistakes, confusion, prior knowledge, persistence, and study habits for end-to-end StudyAgent evaluation. It is not a tutor, Mastery Evaluator, durable learner profile, or learner-facing persona.

Synthetic Learner Eval Set: versioned evaluation asset that combines source fixtures, learner persona fixtures, scenario scripts, assertion rubrics, and golden journeys to test StudyAgent behavior with Synthetic Learners.

Eval Source Fixture: versioned reusable pre-ingested source package that can seed eval notebooks with tutoring-ready source knowledge without rerunning ingestion, with explicit freshness metadata and regeneration checks.

Synthetic Learner Persona: structured test fixture that describes a Synthetic Learner's goal, authored Learner Trait Model values, background, learner level, source familiarity, behaviors, misconceptions, study habits, and response policy, then renders into prompts or scripted responses for eval execution.

Synthetic Learner Scenario: bounded eval contract that combines starting notebook/source state, a Synthetic Learner Persona, learner goal, turn budget, allowed actions, stop conditions, required feature coverage, and pass/fail assertions.

Beat-Driven LLM Synthetic Learner Run: Synthetic Learner eval where an LLM writes learner messages inside explicit scenario beat constraints and persona policy.

Scenario-Autonomous Synthetic Learner Run: Synthetic Learner eval where an LLM chooses learner turns within a named scenario's goal, allowed actions, stop conditions, and persona policy.

Fully Autonomous Synthetic Learner Run: discovery-oriented Synthetic Learner eval where an LLM has broad learner freedom across allowed eval-owned product surfaces and is judged against product invariants rather than narrow scripted outcomes.

Synthetic Learner Assertion: eval check that inspects learner-visible output, runtime traces, persisted state, or quality rubrics to decide whether StudyAgent behaved correctly in a Synthetic Learner Scenario.

Eval Run: persisted execution record for a Synthetic Learner eval suite, containing scenario runs, steps, assertion results, artifacts, trace references, and exported reports without becoming learner-facing notebook state.

Live Eval Observation: real-time CLI and dashboard view of a running Synthetic Learner Scenario, showing student messages, tutor messages, agent/tool events, assertions, traces, artifacts, and screenshots from one shared eval event stream.

Mastery Evidence: structured judgment from learner performance that separates correctness, per-concept mastery deltas, misconception evidence, readiness to advance, tutoring intervention recommendation, and uncertainty; low-confidence evidence should ask for more evidence instead of strongly changing mastery.

Tutoring Intervention: evaluator-recommended next teaching move: clarify, reteach, worked example, guided practice, quick check, or advance.

Live Plan: learner-facing adaptive plan backed by study plan state. Shows current objective, next objectives, progress, weak concepts, and next actions. It is a distinct Reference Surface, not an Objective or an Artifact.

Live Plan Action: learner interaction with the Live Plan. Safe actions may open, start, resume, or review existing learning surfaces; plan-changing actions should express learner intent for tutor or reducer-governed handling rather than directly marking mastery, completing objectives, or rewriting curriculum.

Learner Level: the learner's current readiness relative to a concept, objective, or source, inferred from profile, mastery, mistakes, checkpoints, and self-report.

Artifact: generated learner study output such as notes, personalized notes, summaries, quizzes, flashcards, worked examples, formula sheets, comparison pages, diagrams, revision plans, mistake lists, and session digests.

Quiz Artifact: durable quiz study aid with its own payload, quality gate, review UI, and lifecycle.

Personalized Note: a note artifact tailored with learner-specific points based on learning state, performance, weak concepts, mistakes, source evidence, and session context.

Exam Preparation: future learner goal and tutoring mode focused on preparing for a specific exam through exam-aware pacing, revision planning, drills, mock exams, scoring rubrics, and weak-concept prioritization while staying grounded in notebook sources and learner mastery.

Reference Surface: anything the learner can open in the Workspace to read, review, or act on: source, curriculum, module, objective, Live Plan, session, concept, wiki page, or artifact.

Interactive Learning Surface: a learner-facing Reference Surface with interactive controls for practice, exploration, review, or Evidence inspection. It is not a separate durable object by default; durable learner outputs remain Artifacts, Mastery Evidence, or learning state. The tutor may launch, steer, and discuss it, but the tutor chat remains the teaching spine.

Interactive Learning Signal: a learner action inside an Interactive Learning Surface. Only evaluable performance such as an answer, worked attempt, explanation, misconception choice, or explicit self-report should become Mastery Evidence. Meaningful submitted actions may update tutor context; high-frequency UI behavior should stay local or become aggregated telemetry, artifact/session state, or future Learner Trait Signals.

Interactive Learning Template: a trusted reusable learning interaction selected by semantic purpose and filled with learner-specific content, parameters, prompts, and Evidence. Its executable behavior is reviewed and versioned before release; models configure it with validated instance data rather than authoring raw scene objects, controls, animation programs, or application code in learner flows.
_Avoid_: Interactive UI template, generated mini-app

Interaction Family: stable semantic category for Interactive Learning Templates: Explain, Explore, Practice, Guided Work, Evidence, Plan and Reflect, or Diagnostic. The family describes the learning role; the template identity describes the specific interaction.

Canonical Interactive Action: compact platform-level learner outcome vocabulary shared across templates, covering response, attempt, observation, review, Evidence open, intent, completion, and tutor help. Template-local events map to these actions through strict payload schemas; a genuinely new durable meaning requires a Platform-Extension Draft.

Learning Interaction Request: structured hosted-Workspace request for an interactive learning experience, containing pedagogical purpose, learning references, Evidence, learner constraints, content, parameters, and an optional template preference. A deterministic Template Resolver turns it into an exact promoted Template Instance or a trusted fallback.

Template Resolver: deterministic policy boundary that selects and pins an exact promoted Interactive Learning Template version for a Learning Interaction Request. It enforces Artifact, Evidence, learner/accessibility, capability, action, and schema constraints rather than accepting executable choices from the tutor model.

Interaction Director Agent: future bounded read-only agent that ranks eligible promoted templates and proposes a Turn Interaction Plan for non-trivial teaching moments. It may propose semantic selection, parameters, narration checkpoints, and placement intent, but the Template Resolver verifies the choice and the Tutor Agent remains the narrative authority.

Tutor Choreography: ordered coordination of tutor narration with semantic presentation cues for Interactive Learning Surfaces. It can request stage, focus, replace, dock, or dismiss behavior, while learner focus, active interaction, pinning, dismissal, auto-stage preference, responsive layout, reduced motion, and accessibility constraints remain authoritative.

Workspace Stage: responsive learner-facing region where Tutor Choreography presents rich Interactive Learning Surfaces. Version 1 has one Primary slot, one optional Companion slot on suitable viewports, and a learner-managed Pinned Tray; mobile presents one active sheet or full-screen surface. It is not a freeform agent-arranged canvas or the tutor transcript.

Surface Anchor: compact tutor-message reference to a choreographed Interactive Learning Surface, showing enough title/status context to focus or reopen it without embedding the full rich View in chat history.

Choreography Snapshot: compact Tutor Session presentation state used to recover the Workspace Stage after reconnect, including the latest cue sequence, current semantic slots, queued cues, and learner overrides. It is not Canonical Learning State or evidence of learning.

Template Instance: immutable configured use of an exact Interactive Learning Template version, containing validated learning content, parameters, prompts, Evidence, and any explicit random seed. It selects reviewed behavior without introducing new executable behavior or resolving a mutable latest version.

Template Model State: deterministic, serializable state of an Interactive Learning Template's interaction or simulation. It is distinct from temporary View presentation and from server-owned Canonical Learning State.

Canonical Learning State: durable learner outcome state owned by StudyAgent, such as attempts, submitted observations, Mastery Evidence, progress, or Artifact state. Interactive Views may receive it and propose validated actions, but they do not own it.

Simulation Template: a trusted reusable Interactive Learning Surface pattern for visualizing or manipulating a concept, such as a function plotter, physics model, algorithm animation, probability sampler, or graph traversal. Learner-facing simulations should use Simulation Templates with tutor-generated parameters and prompts rather than arbitrary generated code.

Simulation Draft: an experimental generated simulation used to explore or test a future Simulation Template. It is not learner-facing product state until it is reviewed and promoted into a trusted Simulation Template.

Trusted Template Mode: the default learner runtime for hosted beta and production. Reference Surfaces may render only promoted Simulation Templates, allowlisted Interactive Learning Block kinds, and globally versioned MCP App Bundles. Block content and parameters may vary per notebook; renderer code and action contracts may not.

Generative Interactive Mode: a local or isolated promotion-lane environment where unreviewed Simulation Drafts and Interactive Block Kind Drafts may be generated, regenerated, added, or removed for iteration. It is not the same as Workspace Dev Mode and is not enabled in hosted learner Workspaces.

Interactive Block Kind Draft: an experimental generated Interactive Learning Block kind that may introduce a new learning-purpose block type, new Interactive Learning Actions, a new MCP App Bundle, and new durable outcome routing. It is not learner-facing product state in Trusted Template Mode until it passes the Template Promotion Lab and is promoted into the global allowlist.

Template Promotion Lab: authenticated Admin UI pipeline and review surface for proposing, sandbox-testing, evaluating, and promoting Simulation Drafts and Interactive Block Kind Drafts, including completely new interactive UI. It collects security, protocol, schema, determinism, accessibility, performance, visual, pedagogical, and Synthetic Learner evidence plus reviewer identity and decision notes. Workers and CI may build, test, and reject drafts, but only the Admin UI approval boundary may publish or revoke executable template versions. It is not a visual authoring studio or part of the ordinary learner study loop.

Template Builder Agent: bounded promotion-lane agent that can author, build, test, preview, and open draft PRs for completely new Interactive Learning Template code in an isolated workspace. It is separate from the Tutor Agent and has no learner data, production credentials, trusted-catalog publication key, merge authority, approval authority, or publication authority.

Generated-Code Execution Boundary: the local or isolated draft executor where generated UI or simulation code may run for iteration, testing, screenshots, preview, and promotion evidence. It is outside hosted learner Workspaces; generated code becomes trusted product behavior only after Template Promotion Lab approval and immutable publication.

Template-Only Draft: proposed executable Interactive Learning Template version that uses already deployed actions, host capabilities, renderer profiles, sandbox policy, and durable outcome paths. It may publish independently after all promotion gates and human approval pass.

Platform-Extension Draft: proposed Interactive Learning Template version that requires new StudyAgent platform behavior such as an action handler, durable outcome type, table, reducer, event, API/persistence contract, host permission, external runtime network origin, renderer adapter, dependency runtime class, or build infrastructure. It remains blocked until the generated platform change completes ordinary review and deployment.

Interactive Learning Block: a model-facing declarative unit inside an Interactive Learning Surface that references an Interaction Family and exact Interactive Learning Template, such as a Mastery Check, Quiz, Flashcard Deck, Worked Example, Evidence Map, Simulation, Live Plan, Comparison, or Concept Timeline. Generic UI primitives remain renderer-owned implementation details.

Page-Embedded Interactive Block: an Interactive Learning Block attached to a Source Wiki, Curriculum, Module, Topic, or Concept Reference Surface; artifact-backed blocks such as Quiz, Flashcard Deck, and Worked Example still require Artifact Lifecycle governance.

Tutor-Initiated Interactive Surface: a lightweight non-durable Interactive Learning Surface the tutor opens during an active lesson to support explanation, practice, Evidence inspection, or exploration. Durable study aids remain governed by Artifact consent policy.

Interactive Learning Action: a validated learner action emitted by an Interactive Learning Block, such as submitting a quiz answer, rating a flashcard, answering a worked-example step, submitting a simulation observation, selecting a Live Plan action, or completing a surface. It carries a learning context envelope with notebook, surface, block, reference, source/Evidence, and optional tutor session or turn identity. Durable outcomes from these actions must flow through the appropriate Artifacts, Mastery Evidence, learning state, and events rather than through renderer-specific state.

Interactive Learning Intervention: tutor help or recommended next action prompted by Interactive Learning Actions. Ordinary actions should update state and Workspace surfaces without automatically invoking the tutor; tutor intervention should be explicit, tutor-led within an active lesson, or suggested when repeated evidence crosses an intervention threshold.

Evidence: learner-facing trust layer: citations, source excerpts, source titles/pages, and relevant source-backed claims.

Portable Evidence Document: bounded source excerpt or citation record inside a Portable Source Knowledge Bundle. It carries enough source span and rights context to ground claims and pages without requiring the full original source to be redistributed.

Interactive Evidence: progressively disclosed Evidence inside an Interactive Learning Surface. Source-grounded blocks should carry Evidence refs, show compact citation affordances, and reveal relevant excerpts when feedback, worked steps, or source-specific claims are shown.

Source Open Target: learner-safe navigation target from Evidence or another Reference Surface into the original source. It combines source identity, a source-appropriate locator, and an authenticated destination without exposing object-storage details.

Workspace: learner-facing right-side product area containing Curriculum, Study Map, Source Wiki, and full-panel reference/artifact viewers.

Workspace Read Model: learner-facing interpretation of Workspace objects and relationships. It owns learner visibility, semantic state, relative importance, Evidence availability, learner-safe labels, and available actions without prescribing visual layout or styling.

Progress State: a Workspace object's position in the active learning path: current, upcoming, completed, locked, or not applicable.

Readiness State: whether a Workspace object's content is available and suitable for study: processing, still improving, ready to study, needs more source support, needs refresh, needs review, unavailable, or not applicable.

Learning State: the learner's relationship to material represented by a Workspace object: not started, in progress, needs practice, proficient, or not applicable.

Source Wiki: Workspace view organized by source-grounded knowledge structure, including source topics, topic pages, concept pages, wiki pages, citations, and evidence.

Study Map: Workspace view organized by learning progress, including curriculum, modules, objectives, sessions, artifacts, weak concepts, mastery state, and next actions.

## Learner-Facing Terms

Use:

- Workspace
- Reference surface
- Artifact
- Live Plan
- Evidence
- Source
- Curriculum
- Module
- Objective
- Session
- Concept page
- Study Map
- Source Wiki

Avoid in learner-facing UI:

- Whiteboard as the main section name
- Provenance as a primary button or panel label
- Claims as a default reading section
- Objective List as a standalone learner page
- Study plan artifact
- artifact type `study_plan`
- raw debug node names such as chunks, coverage records, candidate claims, session-plan internals, teaching arcs, or generic graph objects

Internal code may keep precise technical terms where useful, but learner copy should prefer the product vocabulary above.

## Major Workflows

Source to Workspace: upload source, store original, parse document tree, create source spans and chunks, extract concepts and claims, embed/index, build graph projection, compile source summary, bootstrap curriculum/module/objectives/session plan, seed Live Plan, render Source Wiki and Study Map.

Minimum tutoring-ready state: parsed text, retrievable chunks with citations, search/index readiness, source summary, concept inventory, curriculum skeleton, current and next objectives, and visible warnings. The system should reach this reliable state before waiting for full wiki polish. For large sources, background enrichment should progressively polish high-value topic and concept pages based on curriculum importance, source structure, learner activity, weak concepts, and search or tutor usage.

Learner trait estimation: real learner traits start notebook-scoped and should be inferred from explicit self-report, repeated behavior across sessions, Mastery Evidence patterns, tutor observations, and onboarding profile data in that rough priority order. Self-report can set an estimate quickly, while behavior, mastery patterns, and tutor observations should raise confidence only when repeated.

Learner trait update lanes: explicit Learner Trait Estimates come from learner self-report or settings and may update quickly with high confidence; inferred Learner Trait Estimates come from behavior, Mastery Evidence patterns, or tutor observations and should require repeated signals, evidence refs, and confidence gating before shaping recommendations.

Learner trait update cadence: tutoring turns may record trait-relevant signals, but inferred Learner Trait Estimates should be updated only when required at session or crystallization boundaries, or when the Pi agentic system explicitly decides trait estimation is warranted from accumulated evidence. Trait estimation should not run by default after every session and should not block ordinary live tutor turns.

Learner trait signal persistence: Learner Trait Signals should be persisted as internal notebook-scoped evidence so inferred traits remain auditable, aggregatable across sessions, and recomputable as estimate rules change. They are not learner-facing progress labels.

Learner trait signal ownership: the Pi tutor may record explicit learner preference or self-report signals through governed tools during tutoring, while inferred behavioral signals should come from a reflective extractor over completed turns, session traces, and Mastery Evidence. The Mastery Evaluator may provide evidence patterns but does not own trait estimation.

Learner trait estimate persistence: Learner Trait Estimates should be persisted as current read-optimized notebook-scoped state for tutor recommendations, while retaining references back to Learner Trait Signals and other evidence so estimates remain auditable and recomputable.

Learner trait scope: real Learner Trait Estimates are scoped to notebook, user, and trait by default. Future context-specific estimates may add a target reference such as source, concept, objective, or exam goal, but cross-notebook traits require an explicit Portable Learner Profile.

Learner trait estimation governance: LLM-assisted trait estimation may propose Learner Trait Estimate updates from bounded signal, mastery, profile, and self-report context, but a deterministic guardrail layer should schema-validate, require evidence refs, cap confidence, handle contradictions, and accept, reduce, or reject proposed updates before persistence.

Learner trait conflicts: when explicit learner preferences conflict with inferred trait evidence, the system should preserve the explicit preference, retain contradiction evidence, and produce a reconciled Personalization Recommendation rather than silently overwriting either side.

Learner trait estimation triggers: run LLM-assisted trait estimation only when there is an explicit learner preference change, enough repeated Learner Trait Signals around a trait family, repeated Mastery Evidence contradiction with self-report, repeated tutor-observed friction, learner goal or urgency change, or strong contradictory evidence against an existing estimate. Do not run it for ordinary correct or incorrect answers alone, one-off mood, short sessions without trait-relevant signals, or every session end by default.

Learner trait recommendation boundary: real Learner Trait Estimates may produce Personalization Recommendations for explanation pace, explanation depth, example choice, checkpoint cadence, hint depth, artifact suggestions, confidence verification, reassurance, and structure. They must not directly mutate Concept Mastery, Objective Progress, weak concepts, curriculum progress, artifact consent, source grounding, or explicit learner goals.

Learner trait visibility: learners may edit explicit preferences such as pace, depth, examples, or quiz preference, but inferred trait labels, confidence scores, evidence refs, LLM proposal reasoning, and archetype buckets should remain internal or Dev Mode only. Learner-facing surfaces may phrase inferred personalization as gentle suggestions rather than labels.

Learner trait decay: Learner Trait Estimate confidence should decay over time without deleting supporting evidence. Context-sensitive traits such as urgency context, source familiarity, assessment preference, and pace preference decay faster than help-seeking, example, or depth preferences; confidence style, metacognitive accuracy, and persistence style decay slowest.

Synthetic Learner eval setup: ingestion prepares Eval Source Fixtures with source-derived tutoring-ready state. Synthetic Learner Scenarios seed eval notebooks from those fixtures, then add persona-specific learner state and run the tutoring/product harness without rerunning ingestion by default.

Curriculum-first tutoring: when the learner says "teach me" or "start studying," the tutor should not behave like generic chat. It loads active curriculum, module, objective list, session plan, student profile, weak concepts, recent mistakes, and selected Workspace context. If planning is missing, it creates the minimum planning objects. It then teaches the current objective, asks checkpoints, records evidence, adapts explanation and pacing, and modifies the syllabus path when durable signals such as checkpoint performance, repeated mistakes, explicit learner self-report, mastery changes, weak concept recurrence, source coverage gaps, or multi-turn confusion show the current path should change. Learner steering such as skipping, slowing down, focusing a chapter, requesting a quiz, claiming prior knowledge, or preparing for an exam can immediately affect tutoring behavior; durable curriculum or mastery changes still need explicit confirmation or supporting evidence. It prioritizes the current source or notebook while teaching transferable mastery through examples, prerequisites, and remediation when that helps the learner perform better.

Boundary handling: Boundary Signals should shape the next tutor move without becoming hard gates. A session-plan boundary may roll forward inside the same module, a Module Milestone should pause for consolidation choices before advancing, and a Source Scope Boundary should surface only when it affects the learner's requested path or next action.

Session lifecycle: a tutor session spans many turns and has planned syllabus scope, but its success criterion is mastery movement rather than coverage alone. Turns are not sessions. The tutor asks questions, quizzes, and checkpoints during the session to understand mastery and decide whether to continue, remediate, advance, or crystallize. The Mastery Evaluator should run only on evaluable learner responses such as answers to mastery checks, quiz-like prompts, explanations, worked-problem attempts, self-reported confusion, or self-reported prior knowledge. Explicit checks, quiz answers, and repeated mistake patterns should carry more mastery weight than free-form conversation; vague confidence should not strongly increase mastery without successful application. Digests are created at meaningful end, pause, or crystallization boundaries, not after every assistant message. Sessions can be active, paused, resumed, ended, and crystallized.

Artifact lifecycle: canonical planning scaffolding may be automatic. Learner-visible study aids should be user-requested, user-approved, or governed by per-type consent policy. Artifacts should connect to current objectives, weak concepts, source evidence, repeated mistakes, or session outcomes. Notes may be personalized and user-editable without becoming a separate artifact type. Source Wiki pages are reference surfaces, not artifacts, and are governed by wiki compilation rather than artifact consent. Durable artifact writes go through typed tools, reducers, events, quality gates, and source/evidence refs where applicable.

Workspace navigation: notebook open flow should derive one obvious next action: upload source, build curriculum, continue session, resume session, start next lesson, or review last session. The right panel can show Curriculum, Study Map, Source Wiki, or a full-panel reference/artifact viewer. Learner mode hides low-signal debug nodes and opens every visible node into a useful surface.

Study Map session relationships: Session Nodes connect inside the Study Map graph to the modules, objectives, artifacts, concepts, or sources that the real tutor session used or produced.

Future exam preparation mode: exam preparation is currently a learner goal inside the same tutoring system. A future Exam Preparation Mode may add deadlines, target syllabus scope, past-paper style practice, scoring rubrics, timed mock exams, and exam-specific revision overlays while preserving notebook/source grounding, mastery checks, Evidence, and artifact consent. The inactive exploration is archived at `docs/archive/2026-h1/future/exam-preparation-mode.md`.

Evidence and trust: pages and artifacts show citations and source excerpts first. Claims support trust but should not clutter learner maps. User-facing Source Wiki topic pages and concept pages should read like polished source-grounded notes, not raw statistics or debug summaries. If a page is incomplete, weakly supported, or still improving, use simple learner-facing status language rather than confidence scores, claim statuses, extraction stats, or pipeline metadata. Tutoring is strict about source grounding for claims about uploaded material, source-specific explanations, generated notes, and artifacts. The tutor may use general pedagogical knowledge for analogies, prerequisites, hints, transferable examples, and remediation, but should not present those as source claims. Artifacts should distinguish source-specific notes from broader learner-specific tips. Unsupported, candidate, inferred, low-confidence, contradicted, or superseded claims stay hidden unless Dev Mode is enabled.

Mastery visibility: learners should see humane derived progress summaries such as strengths, weak concepts, needs review, or ready to advance. Raw Mastery Evidence scores, deltas, confidence, uncertainty, and evaluator reasoning belong in internal traces or Dev Mode.

## Architectural Intent

Seven deepening modules govern runtime behavior: Tutor Turn, Reference Surface, Source-to-LLM-Wiki Compilation, Workspace Read Model, Artifact Lifecycle, Graph Projection, and Tool Contract. See `CONTEXT-MAP.md` and `docs/architecture/README.md`.

The architecture is TypeScript-first with one embedded Pi runtime. Pi owns tutoring, session orchestration, crystallization, eval-style judgment, and wiki-steward tasks. Deterministic workers own parsing, chunking, embeddings, indexing, source spans, graph projection, and low-level persistence.

Postgres is the system of record for notebooks, sources, events, artifacts, sessions, ownership, and transactional state. Neo4j is the graph projection/query layer. Search combines lexical, vector, graph, and compiled wiki context. Object storage holds original files/assets.

Durable state changes must flow through typed StudyAgent tools and reducers. Pi operational memory and Pi session files are not canonical product state. Critical pedagogical context should be rehydrated from StudyAgent storage before important runs, especially after compaction or runtime replacement.

Avoid generic RAG, chat-first tutoring, eager full-wiki generation, decorative graphs, ungoverned LLM writes, learner-visible debug objects, and generated artifacts disconnected from curriculum, evidence, or weak concepts.
