# Product Frontend Brief

## Product Register

StudyAgent is a product UI. Design should serve repeated study work. Familiar interaction patterns are preferred when they reduce cognitive load.

## Physical Scene

A student studies alone for 30 to 90 minutes on a laptop, often with dense course material open, switching between explanation, source evidence, practice, and review. The room may be bright or dim, but the mood is focused and slightly pressured. The interface should feel steady, not theatrical.

## Product Promise

StudyAgent turns uploaded course material into a tutoring workspace that compounds over time. The learner can upload sources, follow an adaptive plan, ask the tutor, inspect concept relationships, review Evidence, and use generated study aids without losing context.

## Primary User

An individual student using a personal notebook repeatedly over time.

The student wants to:

- know what to study next;
- get a tutor response grounded in their material;
- understand why a recommendation or explanation is trustworthy;
- move between chat, source, concept, graph, plan, and practice without rebuilding context;
- preserve useful outputs from a session as durable artifacts.

## Product Mental Model

`Notebook + Sources + Durable Wiki + Curriculum + Live Plan + Tutor + Workspace + Evidence + Artifacts`

## Product Loop

### Hosted beta entry (TutorBook)

1. Land on public site → sign in → accept Beta Consent.
2. Choose a Published Study Template or create an empty workspace from the dashboard.
3. Enter the notebook Workspace at `/notebooks/:notebookId`.
4. Continue with the study loop below.

### Core study loop

1. Open a Personal Learner Workspace (from dashboard or direct URL).
2. Upload sources (requires Ingestion Access).
3. Wait for sources to become ready enough to study.
4. Use the Workspace (Study Map, Source Wiki, Reference surfaces).
5. Start or resume the next lesson in tutor chat.
6. Answer checks, quizzes, or interactive surface prompts.
7. Let mastery, weak concepts, artifacts, and next actions update over time.
8. Review session output and continue the next lesson.

Credits, access codes, support, and account management live in the TutorBook app shell (`/app/*`), not inside the Workspace study loop.

## Design Principles

### Keep Orientation Constant

Every major screen should answer:

- Which notebook am I in?
- Are my sources ready?
- What is the current objective or session?
- What context is selected for the tutor?
- What should I do next?

### Make Rigor Legible

Evidence, source excerpts, page readiness, artifact quality, session insights, and weak concepts should be visible in simple language. Do not expose raw confidence scores, claim statuses, IDs, or pipeline metadata in learner mode.

### Let Tutor And Workspace Cooperate

Tutor chat teaches and steers. Workspace hosts durable reference, graph, source, artifact, and interactive surfaces. Rich practice should open in the Workspace unless it is a tiny current-turn check.

### Optimize For Repeated Use

The visual system should be calm, dense enough for serious work, and consistent across surfaces. Avoid giant marketing layouts, decorative illustrations, gamified rewards, or dashboard clutter.

### Adapt Without Surprise

When the system updates a plan, proposes an artifact, records quiz progress, or surfaces weak concepts, the UI should make the cause and result understandable. Plan-changing actions should feel reviewable and tutor-mediated.

## Anti-References

Avoid:

- generic AI chat layout with file upload bolted on;
- classroom LMS admin screens;
- Notion-style document chrome as the core identity;
- gamified study streak surfaces;
- dense analytics dashboards;
- raw graph database explorers;
- decorative AI gradients and flashy motion.

## Target Feel

Calm, precise, academic, adaptive.

The interface can be sophisticated, but it should not look precious. The best StudyAgent UI feels like a high-quality study desk with an active tutor and a reliable source notebook, not a chatbot or a course management system.
