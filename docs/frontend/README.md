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
14. [Folio design kit](./13-folio-design-kit.md) — design north star; completeness backlog

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

## Current Implementation Anchors

The web app has two learner-facing shells:

1. **TutorBook app shell** (`apps/web/src/pages/app/`, `apps/web/src/routing/`) — hosted beta dashboard, consent, credits, support, account, template gallery.
2. **Notebook Workspace** (`NotebookWorkspacePage.tsx`, `TutorPanel.tsx`, `Whiteboard.tsx`, …) — the core study loop at `/notebooks/:notebookId`.

Entry point: `App.tsx` → `AppRouter.tsx`.

TutorBook-specific routing, guards, and pages:

- `routing/AppRouter.tsx`, `routing/RouteGuards.tsx`, `routing/routes.ts`, `routing/api.ts`
- `pages/public/*` — landing, login, legal
- `pages/app/CreditsPage.tsx` — credit balance + optional Stripe checkout
- `pages/app/DashboardPage.tsx` — template gallery + onboarding modal
- `pages/admin/*` — admin console
- `tutorbook.css` — TutorBook shell styles

Notebook Workspace (study loop):

- `NotebookWorkspacePage.tsx`: route-mounted workspace; tutor + Whiteboard split.
- `TutorPanel.tsx`: tutor chat, session controls, history, Runtime Work View, artifact review, Live Plan modal, artifact consent.
- `Whiteboard.tsx`: Workspace toolbar, Curriculum, Study Map, Source Wiki, filters, Evidence, Dev Mode, reference viewer.
- `GraphCanvas.tsx`: graph node and edge renderer.
- `FullPanelViewer.tsx`: full-panel Reference Surface, source viewer, interactive blocks, regeneration actions.
- `NodeDetailPanel.tsx`: compact selected-node overlay.
- `ProvenanceDrawer.tsx`: Evidence drawer.
- `interactive-learning/*`: Internal MCP App Bridge, bundle registry, action dispatch.
- `public/mcp-apps/*`: current iframe bundles for interactive blocks.

See [TutorBook hosted beta shell](./12-tutorbook-hosted-beta.md) for routes, guards, auth proxy, and verification.

The docs in this folder describe the target product and design direction while preserving those behaviors.

## Visual Reference (screenshots)

Behavior and anatomy live in the numbered docs below. **Pixel-level visuals** live in [`ui-example/`](../../ui-example/README.md) — PNG exports from Pencil design files, grouped by theme:

| Theme          | Role                                  | Folder                                                            | Notes                                                                                                                |
| -------------- | ------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Mist Glass** | Implementation baseline (hosted beta) | [`ui-example/mist-glass/`](../../ui-example/mist-glass/README.md) | Most complete kit — 84 PNGs from `nodes.pen`                                                                         |
| **Folio**      | Design north star (needs iteration)   | [`ui-example/folio/`](../../ui-example/folio/README.md)           | Preferred aesthetic — editorial ivory, serif — 34 PNGs. Improvement order: completeness → polish → structural change |
| **Focus**      | Exploration archive                   | [`ui-example/focus/`](../../ui-example/focus/README.md)           | Minimalist slate variant — 17 PNGs                                                                                   |

Detailed Mist Glass inventory and Pencil IDs: [`NODES_PEN.md`](../../NODES_PEN.md). Folio north star: [13-folio-design-kit](./13-folio-design-kit.md) + [`ui-example/folio/`](../../ui-example/folio/README.md).

**Screenshot linking policy:** index only — numbered spec docs (`04`–`08`) stay behavior-focused; visuals are discovered via this README and `ui-example/` READMEs, not inline images in spec files.

**Beta theme policy:** production UI stays **100% Mist Glass** until Folio reaches kit parity ([13-folio-design-kit](./13-folio-design-kit.md)); no incremental mixed-theme rollout.

Interactive layout paradigms (not theme swaps): [`design-variations/`](../../design-variations/README.md) — five structural approaches in one HTML page. **Contenders for evaluation:** v1 Focus Map · dock, v3 Chat-primary, v4 Bento Home. Beta ships classic split until a paradigm wins.

### Screenshot folder → spec doc map

| `ui-example` folder                                              | Primary spec                                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-pack/`, `node-components/`                                 | [06-node-design-system](./06-node-design-system.md)                                                                                            |
| `workspace-components/`, `workspace-screens/`                    | [03-app-shell-and-navigation](./03-app-shell-and-navigation.md), [05-workspace-study-map-source-wiki](./05-workspace-study-map-source-wiki.md) |
| `chat-components/`, `chat-showcases/`                            | [04-tutor-chat](./04-tutor-chat.md)                                                                                                            |
| `reference-components/`, `reference-surfaces/`                   | [07-reference-surfaces-evidence](./07-reference-surfaces-evidence.md), [08-artifacts](./08-artifacts.md)                                       |
| `evidence-components/`, `evidence-pages/`, `evidence-workspace/` | [07-reference-surfaces-evidence](./07-reference-surfaces-evidence.md)                                                                          |
| `indices/`                                                       | Canvas navigation frames from Pencil — use with `NODES_PEN.md`                                                                                 |
