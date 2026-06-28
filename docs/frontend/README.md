# StudyAgent Frontend Documentation

This directory is the handoff pack for frontend and product designers building the complete StudyAgent learner workspace.

StudyAgent is not generic chat over files. It is a notebook-scoped learning workspace where the tutor, graph, Source Wiki, Evidence, Live Plan, artifacts, and interactive learning surfaces cooperate inside one study loop.

**Hosted beta (TutorBook):** the web app also ships a product shell for dashboard, consent, credits, support, and account management. Start with [TutorBook hosted beta shell](./12-tutorbook-hosted-beta.md) for routes and guards; the Workspace docs below still describe the core study loop at `/notebooks/:notebookId`.

## Read First

1. [Product frontend brief](./00-product-frontend-brief.md)
2. [Information architecture and flows](./01-information-architecture.md)
3. [Design system direction](./02-design-system.md)
4. [App shell and navigation](./03-app-shell-and-navigation.md)
5. [Tutor chat and runtime work](./04-tutor-chat.md)
6. [Workspace, Study Map, and Source Wiki](./05-workspace-study-map-source-wiki.md)
7. [Node design system](./06-node-design-system.md)
8. [Reference surfaces and Evidence](./07-reference-surfaces-evidence.md)
9. [Artifacts and study aids](./08-artifacts.md)
10. [Interactive learning and MCP apps](./09-interactive-learning-and-mcp-apps.md)
11. [Responsive, accessibility, and states](./10-responsive-accessibility-states.md)
12. [Implementation handoff contracts](./11-implementation-handoff.md)
13. [TutorBook hosted beta shell](./12-tutorbook-hosted-beta.md)
14. [Folio design kit](./13-folio-design-kit.md) — sole visual baseline and completeness backlog
15. [Folio production architecture](./14-folio-production-architecture.md) — router, API client, read models, dependencies, performance, testing, and cutover boundaries
16. [Folio end-to-end implementation plan](./15-folio-end-to-end-implementation-plan.md) — delivery waves, route ownership, dependencies, and release gates
17. [Folio ticket drafts](./16-folio-ticket-drafts.md) — issue-ready tracer-bullet acceptance criteria pending publication approval

## Designer Goal

Design a calm, rigorous, repeated-use study product:

- the learner always knows which notebook, source state, objective, session, and selected context they are in;
- the tutor remains the teaching spine;
- the Workspace remains the durable reference, review, and action surface;
- Evidence is visible enough to build trust but not so loud that it interrupts learning;
- generated artifacts feel like useful study aids, not raw model output;
- interactive MCP app renderers feel native to StudyAgent, not third-party widgets;
- Dev Mode can expose internals, but learner mode must hide raw IDs, claims, traces, and pipeline language.

## Core Vocabulary

Use these terms in learner-facing UI:

- Personal Learner Workspace (or **workspace** in UI copy; maps to **Notebook** in API)
- Notebook (API/data-model term; avoid in learner copy when "workspace" is clearer)
- Sources
- Workspace (the study surface inside a notebook — tutor + Study Map + Source Wiki)
- Tutor
- Tutor Activity
- Study Map
- Source Wiki
- Curriculum
- Module
- Objective
- Live Plan
- Session
- Reference surface
- Artifact
- Study aid
- Evidence
- Supporting notes
- Tutor credits (percent remaining — not dollars or token counts)
- Access code

Avoid these terms outside Dev Mode:

- Whiteboard
- Provenance
- Trace
- LLM
- Raw
- Debug
- Claims as a primary page title
- Objective list as a standalone learner page
- Teaching arc
- Session plan internals
- Coverage records
- Raw node IDs

## Current Branch Foundation

This branch deliberately contains a clean frontend foundation rather than the previous
implementation tree:

- `apps/web/`: minimal React/Vite production shell;
- `packages/api-client/`: typed browser transport and stream adapters;
- `packages/schemas/`: shared runtime contracts;
- `frontend-contract/`: product and delivery handoff index;
- `frontend-examples/folio/design-lab/`: sole visual reference.

The previous frontend remains available only through Git history on
`codex/folio-revamp-foundation` at commit `e1a5071`. It is behavioral evidence, not a
module or presentation template. Verified behavior, production contracts, security
rules, and durable learner state are the preservation boundary.

The production foundation is fixed by [ADR-0029](../adr/0029-react-vite-tanstack-fastify-folio-foundation.md): React/Vite, file-based TanStack Router, TanStack Query, a shared Zod-validated `@studyagent/api-client`, existing Fastify REST/SSE, Tailwind 3.4, shared Radix/shadcn-style primitives, and route-split heavy features. GraphQL, tRPC, Next.js, TanStack Start, and a general-purpose client state library are not part of this revamp.

## Visual Reference

The runnable [Folio Design Lab](../../frontend-examples/folio/design-lab/README.md)
is the only visual frontend reference retained on this branch. It covers the
Dashboard, Notebook Workspace, and Node Pack using portable sample data.

The numbered documents remain authoritative for behavior and complete route/state
coverage. Folio is the sole production frontend generation; do not add another theme,
runtime theme switcher, or parallel visual example archive.
