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
