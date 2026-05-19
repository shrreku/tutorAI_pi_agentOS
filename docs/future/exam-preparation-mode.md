# Future Feature: Exam Preparation Mode

Status: future plan

Exam Preparation Mode is a future learner goal and tutoring mode for preparing a learner to perform well on a specific exam, test, or assessment while staying grounded in the current Notebook and selected Sources.

## Product Intent

Exam Preparation Mode should use the same core StudyAgent system: Notebook, Sources, LLM Wiki, Curriculum, Live Plan, Pi Tutor, Workspace, Evidence, Artifacts, and mastery state. It should not become generic test-prep chat disconnected from source evidence, curriculum objectives, or learner performance.

The mode exists when ordinary tutoring needs exam-specific behavior: deadlines, target syllabus coverage, past-paper style practice, timed mock exams, scoring rubrics, and revision planning.

## Expected Behavior

- Ask for or infer the exam target, date, syllabus scope, allowed resources, scoring pattern, and learner confidence.
- Prioritize weak concepts, repeated mistakes, high-weight topics, prerequisites, and objectives that are likely to affect exam performance.
- Increase mastery-check frequency through short questions, drills, quizzes, and exam-style prompts.
- Adjust pacing based on remaining time, learner level, source level, mastery state, and recent performance.
- Generate or propose exam-focused artifacts such as revision plans, formula sheets, mistake lists, flashcards, summary notes, worked examples, quizzes, and mock exams.
- Separate source-grounded notes from broader exam strategy or learner-specific tips.
- Use Evidence for source-specific claims and keep unsupported or debug knowledge out of learner-facing surfaces.

## Workspace Expectations

The Workspace should keep the same core views:

- Source Wiki for readable source-grounded topic and concept pages.
- Study Map for objectives, weak concepts, mastery state, sessions, artifacts, and next actions.
- Evidence for citations, excerpts, and source support.

Exam Preparation Mode may add exam-specific overlays later, such as high-priority topics, deadline pressure, mock-exam history, scoring gaps, or revision schedule progress.

## Session Behavior

Exam preparation sessions should have planned syllabus scope, but success should be measured by mastery movement and exam readiness rather than coverage alone.

The tutor should ask questions and quizzes during the session, observe mistakes, update mastery, and adapt the plan. It may cover less than planned when remediation is needed or move faster when the learner shows strong mastery.

## Artifact Policy

Exam-focused artifacts follow the normal artifact lifecycle:

- They should be user-requested, user-approved, or governed by per-type consent policy.
- They should connect to current objectives, weak concepts, repeated mistakes, source evidence, session outcomes, or exam goals.
- User-editable notes may include personalized exam tips and learner-specific mistakes without becoming a separate artifact type.

Exam-style practice should reuse quiz artifacts with exam metadata until timed attempts, scoring rubrics, attempt history, exam sections, and performance analytics require a separate Mock Exam lifecycle.

## Not Yet Decided

- Whether Exam Preparation Mode should be a top-level tutor mode or a learner goal inside `learn`, `practice`, and `revise`.
- How to represent exam metadata in durable state.
- How scoring rubrics should affect mastery and objective progress.
