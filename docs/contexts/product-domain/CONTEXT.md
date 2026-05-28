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

Source: immutable learner material such as PDFs, markdown, transcripts, articles, lecture notes, or images. Sources are parsed into source spans, document trees, chunks, assets, concepts, and claims. Sources are versioned and citeable.

Source Level: the intended academic level of a source, such as high school, undergraduate, graduate, professional, or unknown.

Source-scoped tutoring: a tutoring mode that prioritizes one or more selected sources while still using notebook curriculum, learner state, weak concepts, and prerequisites unless the learner asks to stay strictly within the selected sources.

LLM Wiki: the durable knowledge layer between raw sources and live tutoring. It contains concepts, claims, pages, relations, citations, artifacts, confidence, contradictions, supersession, and session crystallization outputs. It is compiled incrementally instead of regenerated from scratch per query, and may become more polished over time through background enrichment and tutor-triggered repair.

Source Wiki Page: durable source-grounded reference surface generated from the LLM Wiki for a topic, concept, or source summary.

Claim: atomic source-linked knowledge statement. Claims are evidence objects and should not be the default learner-facing reading surface. They support confidence, provenance, contradiction, and supersession.

Concept: learnable knowledge node. Concepts connect to source evidence, claims, pages, objectives, quizzes, notes, weak concepts, and related concepts.

Concept Mastery: the learner's current understanding of a specific concept, updated through reducer-applied Mastery Evidence from mastery checks, quizzes, mistakes, clear conversational evidence, self-report, and session outcomes.

Curriculum: professor-level syllabus for a coherent path through a notebook or source cluster.

Adaptive Curriculum: curriculum that can be modified when durable learner signals show the current path is no longer the best route.

Module: chapter-sized or supersection-sized teaching block inside a curriculum.

Objective List: ordered module-scoped topic breakdown. This is internal planning state; do not expose it as a standalone learner page.

Objective: focused learning goal that can be taught, checked, remediated, or completed within a session arc.

Objective Progress: the learner's status against a teachable goal, derived from session evidence and relevant concept mastery.

Session Plan: durable plan for one tutoring episode, usually centered on one main objective and a few supporting objectives.

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

Live Plan: learner-facing adaptive plan backed by study plan state. Shows current objective, next objectives, progress, weak concepts, and next actions. It is not an artifact.

Learner Level: the learner's current readiness relative to a concept, objective, or source, inferred from profile, mastery, mistakes, checkpoints, and self-report.

Artifact: generated learner study output such as notes, personalized notes, summaries, quizzes, flashcards, worked examples, formula sheets, comparison pages, diagrams, revision plans, mistake lists, and session digests.

Quiz Artifact: durable quiz study aid with its own payload, quality gate, review UI, and lifecycle.

Personalized Note: a note artifact tailored with learner-specific points based on learning state, performance, weak concepts, mistakes, source evidence, and session context.

Exam Preparation: future learner goal and tutoring mode focused on preparing for a specific exam through exam-aware pacing, revision planning, drills, mock exams, scoring rubrics, and weak-concept prioritization while staying grounded in notebook sources and learner mastery.

Reference Surface: anything the learner can open in the Workspace to read, review, or act on: source, curriculum, module, objective, session, concept, wiki page, or artifact.

Evidence: learner-facing trust layer: citations, source excerpts, source titles/pages, and relevant source-backed claims.

Workspace: learner-facing right-side product area containing Curriculum, Study Map, Source Wiki, and full-panel reference/artifact viewers.

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

Session lifecycle: a tutor session spans many turns and has planned syllabus scope, but its success criterion is mastery movement rather than coverage alone. Turns are not sessions. The tutor asks questions, quizzes, and checkpoints during the session to understand mastery and decide whether to continue, remediate, advance, or crystallize. The Mastery Evaluator should run only on evaluable learner responses such as answers to mastery checks, quiz-like prompts, explanations, worked-problem attempts, self-reported confusion, or self-reported prior knowledge. Explicit checks, quiz answers, and repeated mistake patterns should carry more mastery weight than free-form conversation; vague confidence should not strongly increase mastery without successful application. Digests are created at meaningful end, pause, or crystallization boundaries, not after every assistant message. Sessions can be active, paused, resumed, ended, and crystallized.

Artifact lifecycle: canonical planning scaffolding may be automatic. Learner-visible study aids should be user-requested, user-approved, or governed by per-type consent policy. Artifacts should connect to current objectives, weak concepts, source evidence, repeated mistakes, or session outcomes. Notes may be personalized and user-editable without becoming a separate artifact type. Source Wiki pages are reference surfaces, not artifacts, and are governed by wiki compilation rather than artifact consent. Durable artifact writes go through typed tools, reducers, events, quality gates, and source/evidence refs where applicable.

Workspace navigation: notebook open flow should derive one obvious next action: upload source, build curriculum, continue session, resume session, start next lesson, or review last session. The right panel can show Curriculum, Study Map, Source Wiki, or a full-panel reference/artifact viewer. Learner mode hides low-signal debug nodes and opens every visible node into a useful surface.

Future exam preparation mode: exam preparation is currently a learner goal inside the same tutoring system. A future Exam Preparation Mode may add deadlines, target syllabus scope, past-paper style practice, scoring rubrics, timed mock exams, and exam-specific revision overlays while preserving notebook/source grounding, mastery checks, Evidence, and artifact consent. See `docs/future/exam-preparation-mode.md`.

Evidence and trust: pages and artifacts show citations and source excerpts first. Claims support trust but should not clutter learner maps. User-facing Source Wiki topic pages and concept pages should read like polished source-grounded notes, not raw statistics or debug summaries. If a page is incomplete, weakly supported, or still improving, use simple learner-facing status language rather than confidence scores, claim statuses, extraction stats, or pipeline metadata. Tutoring is strict about source grounding for claims about uploaded material, source-specific explanations, generated notes, and artifacts. The tutor may use general pedagogical knowledge for analogies, prerequisites, hints, transferable examples, and remediation, but should not present those as source claims. Artifacts should distinguish source-specific notes from broader learner-specific tips. Unsupported, candidate, inferred, low-confidence, contradicted, or superseded claims stay hidden unless Dev Mode is enabled.

Mastery visibility: learners should see humane derived progress summaries such as strengths, weak concepts, needs review, or ready to advance. Raw Mastery Evidence scores, deltas, confidence, uncertainty, and evaluator reasoning belong in internal traces or Dev Mode.

## Architectural Intent

Seven deepening modules govern runtime behavior: Tutor Turn, Reference Surface, Source-to-LLM-Wiki Compilation, Workspace Read Model, Artifact Lifecycle, Graph Projection, and Tool Contract. See `CONTEXT-MAP.md` and `docs/architecture/architecture-deepening-implementation-tickets.md`.

The architecture is TypeScript-first with one embedded Pi runtime. Pi owns tutoring, session orchestration, crystallization, eval-style judgment, and wiki-steward tasks. Deterministic workers own parsing, chunking, embeddings, indexing, source spans, graph projection, and low-level persistence.

Postgres is the system of record for notebooks, sources, events, artifacts, sessions, ownership, and transactional state. Neo4j is the graph projection/query layer. Search combines lexical, vector, graph, and compiled wiki context. Object storage holds original files/assets.

Durable state changes must flow through typed StudyAgent tools and reducers. Pi operational memory and Pi session files are not canonical product state. Critical pedagogical context should be rehydrated from StudyAgent storage before important runs, especially after compaction or runtime replacement.

Avoid generic RAG, chat-first tutoring, eager full-wiki generation, decorative graphs, ungoverned LLM writes, learner-visible debug objects, and generated artifacts disconnected from curriculum, evidence, or weak concepts.
