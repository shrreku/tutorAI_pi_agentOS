# Folio Port Audit

Date: 2026-06-27

## Scope

Live inspection of the TutorBook Design Lab Folio dashboard, workspace, learning-surface variants, and node pack:

- `http://localhost:5173/design-lab.html#folio/dashboard`
- `http://localhost:5173/design-lab.html#folio/workspace`
- `http://localhost:5173/design-lab.html#folio/nodepack`

The inspected server is running from the local `../tutorbook` checkout. The exact live localhost state, including its uncommitted Folio changes beyond `feat/ui-preview-themes` commit `797309c`, is the resolved canonical visual baseline for the port.

## Canonical Folio Baseline

Branch and parent commit:

- checkout: `../tutorbook`;
- branch: `feat/ui-preview-themes`;
- parent commit: `797309c2705cba3e808d41d5b17db4e671dd2786`.

Freeze set:

| File | State | SHA-256 |
| --- | --- | --- |
| `apps/web/src/design-lab/directions/folio.tsx` | modified | `9cfa94e4c91b8a88b50b0655d18d144db4477e54ccc2a4005c8e769b4c0a612f` |
| `apps/web/src/design-lab/lib/data.ts` | modified | `0ee6ab088b667c2f054c502c44379873a58083be5ce33bef6d6f0fe35b4c91e2` |
| `apps/web/src/design-lab/ui/surfaces.tsx` | modified | `25966995b9e24c3e80ec8bcfb217697c4cfa9e91780bc825de61904b0888fb6b` |
| `apps/web/src/design-lab/ui/folio-nodes.tsx` | untracked | `3141e705ed6403c0929b68638d958691555e47d9ff895fcf7634f09c70ca2473` |
| `apps/web/src/design-lab/ui/layouts/folio-margin.tsx` | untracked | `6ee8e10a7d9b9e436160c75b31863fa0258e304a5fa4435c9c15b64f7c586d0b` |

These hashes identify the approved live visual target until the TutorBook checkout is committed or tagged. Any later source changes require an explicit baseline refresh rather than silently changing the port target.

## User Goal And Accessibility Target

Goal: replace the current working StudyAgent frontend with a complete Folio implementation without losing API-backed tutor, Workspace, Evidence, Artifact, graph, ingestion, auth, entitlement, or Interactive Learning behavior.

`docs/frontend/10-responsive-accessibility-states.md` sets a practical WCAG 2.2 AA target for learner-facing UI. This audit identifies visible and DOM-observable risks but does not claim conformance.

## Captured Steps

| Step | Capture | Health | What was verified |
| --- | --- | --- | --- |
| 1 | `01-folio-dashboard.png` | Partial | Live notebook names, editorial dashboard hierarchy, notebook expansion, week/month activity switcher |
| 2 | `02-folio-workspace.png` | At risk at 1280px | Default viewport clips the Design Lab navigation and workspace horizontally |
| 3 | `03-folio-workspace-1440x900.png` | Visually strong, behavior mocked | Intended desktop tutor + Study Map composition |
| 4 | `04-folio-workspace-reading.png` | Visually strong, static | Worked-example Reference Surface treatment |
| 5 | `05-folio-workspace-interactive.png` | Prototype only | Simulator controls update local values; Run produces no new state or durable action |
| 6 | `06-folio-workspace-app.png` | Misleading prototype | “MCP app” is native local markup with zero iframes; Predict reaction is a no-op |
| 7 | `07-folio-workspace-practice.png` | Prototype only | Local quiz selection and disabled submit state |
| 8 | `08-folio-workspace-practice-feedback.png` | Visually clear, not durable | Correct/incorrect feedback appears locally; no API action, mastery evidence, or next-question flow |
| 9 | `09-folio-nodepack-top.png` | Partial capture | Folio node-pack heading and scale ramp |
| 10 | `10-folio-nodepack-bottom.png` | Partial capture | Scale ramp and node type families |
| 11 | `11-folio-nodepack-states.png` | Partial capture | Node types and beginning of state variants |
| 12 | `12-folio-nodepack-final.png` | Partial capture | Default, selected, active, and additional state treatment at the bottom of the page |

User-supplied 2880px reference captures were added after the browser pass:

- `reference-01-dashboard-2880.png` — intended two-column dashboard composition;
- `reference-02-workspace-scrolled-2880.png` — Workspace after document scrolling, with the composer visible;
- `reference-03-workspace-top-2880.png` — intended top-of-Workspace composition.

## Strengths

- Folio has a coherent editorial identity: warm ivory surfaces, low-chroma green accents, serif-led reading hierarchy, compact mono metadata, and restrained borders.
- The 2880px dashboard reference confirms a strong editorial two-column grid: notebooks and recent activity remain the lead story while practice, the recommended plan, and study activity form a useful secondary rail.
- The 1440px workspace keeps Tutor and Workspace visibly cooperative instead of turning the product into generic chat.
- Runtime activity is legible and calmer than the current provisional UI. Tool work, reasoning, Evidence retrieval, and response prose form a comprehensible sequence.
- The Workspace surface switcher makes Study Map, reading, interactive work, apps, and practice discoverable in one stable region.
- Reading and quiz feedback states have strong hierarchy and good visual separation without excessive card chrome.
- The node pack expresses scale, type, and state more distinctly than the current graph nodes and provides a useful target for a semantic renderer.

## UX Risks

1. Hash navigation is broken as navigation state. Changing from `#folio/dashboard` to `#folio/workspace` changed the URL but left Dashboard rendered until a full reload.
2. The intended large-desktop composition is sound, but the Design Lab header and Workspace overflow horizontally at 1280px. This remains a required 1024/1280 responsive implementation gap, not a criticism of the 2880px target.
3. The live Workspace uses a chat-first `1.3fr / 1fr` split, but the resolved production default remains 35 percent Tutor and 65 percent Workspace. The divider remains draggable and its value persists per notebook.
4. The two Workspace reference captures show document-level scrolling: as Tutor content reaches the composer, the Study Map scrolls upward and leaves unused space below. The resolved production behavior constrains the shell below the notebook topbar and scrolls Tutor and Workspace independently.
5. The dashboard mixes live notebook names with fabricated progress, chapter labels, recommendations, activity, practice, and time totals. “live /api/v1” overstates what is real.
6. Dashboard Continue reading, Review concept, practice items, and recommendation rows do not navigate or launch product actions.
7. Notebook expansion is hover-sensitive. During browser interaction the expanded item changed as layout movement moved the pointer over another row.
8. Workspace chat, runtime activity, sources-ready count, citations, Artifact card, Study Map, and every learning surface are fixed sample content.
9. The Reading surface exposes the worked-example answer immediately; it does not implement progressive reveal or Artifact state.
10. Simulator parameter controls work locally, but Run is a no-op and no observation can become an Interactive Learning Action.
11. The App surface says “MCP app”, “sandboxed”, and “served via MCP”, but it renders no iframe and dispatches no action.
12. Quiz feedback works locally but has no durable attempt, Mastery Evidence, retry, next-question, completion, or tutor-intervention behavior.
13. The Node Pack is a showcase, not a graph renderer. It has no React Flow selection, pan/zoom, persisted layout, Reference Surface opening, Evidence affordance, or read-model integration.
14. Full Node Pack DOM/screenshot capture repeatedly exceeded 60 seconds; segmented captures succeeded. This is a performance-risk signal, not a measured end-user performance result.

## Accessibility Risks

- Two icon-only composer controls have no accessible names in the inspected DOM.
- Workspace surface controls are plain buttons without tab semantics or an announced selected state.
- Quiz choices are plain buttons rather than a radiogroup or equivalent selection contract.
- Simulator solvent selection does not expose pressed/selected semantics.
- Several state differences depend heavily on color and border treatment.
- Hover-driven notebook expansion is unstable for pointer use and needs an explicit keyboard/pointer selection model.
- Horizontal clipping at 1280px blocks controls rather than reflowing or offering an explicit overflow affordance.
- Screenshot evidence cannot verify complete keyboard order, screen-reader announcements, contrast ratios, zoom resilience, or reduced-motion behavior.

## Current Implementation Reuse And Missing Work

| Folio surface | Current prototype behavior | Existing capability/contract to preserve | Work required before cutover |
| --- | --- | --- | --- |
| Dashboard | Real identity/notebook names/credits plus sample progress and activity | `/me`, `/notebooks`, `/study-templates`, `/credits`, auth and entitlement guards | Add `GET /api/v1/dashboard` as an API-owned projection of persisted notebook progress, practice, recommendations, recent activity, and study-time summaries; every approved section remains in scope and sample values are prohibited |
| Tutor | Static transcript and static Runtime Work View | AG-UI/SSE tutor chat, session lifecycle, trace replay, Artifact consent, current settings | Build a typed tutor client/controller and Folio renderers; add a learner-safe paginated history contract. Reusing `TutorPanel` is optional |
| Study Map | Hand-positioned sample nodes | Graph query, Workspace read model, layout persistence, selection, React Flow interaction outcomes | Build a Folio semantic node renderer over the real graph; do not port the sample canvas. `Whiteboard` and `GraphCanvas` are not preservation units |
| Reference/Reading | Static worked example | `/nodes/:nodeId/reference-surface`, Artifact views, regeneration, primary actions | Build Folio renderers for every surface/block type plus loading, empty, failed, proposed, and quality states; `FullPanelViewer` may be replaced |
| Evidence | Citation chips only | Evidence read model and learner-safe source-opening behavior | Build grouped learner-safe Evidence, source locators/open targets, drawer states, and Folio presentation; `ProvenanceDrawer` may be replaced |
| Interactive | Local simulator state | Interactive Learning Block contracts and action dispatcher | Bind trusted Simulation Templates and validated Interactive Learning Actions; define pending/error/completed states |
| MCP app | Fake local component | Sandboxed MCP App Bridge, registry, action envelope | Render the real iframe bundle, host context, fallback, action dispatch, and sandbox errors in Folio chrome |
| Practice | Local one-question quiz | Quiz normalization, Reference Surface quiz blocks, action client, persisted attempts/Mastery Evidence | Connect selection/submission/result/next-question state to the canonical API pipeline |
| Node Pack | Seven sample families and six states | Workspace visibility/emphasis, learner labels, page readiness, graph node types | Complete mapping for real node families and independent progress/readiness/learning states; retain hidden/dev-only policy |
| Hosted-beta routes | Not represented in Design Lab | Public, login, consent, templates, workspace creation, credits, support, account, admin routes | Design and implement Folio parity across the complete route inventory before replacing the working frontend |

## Technical Conflicts To Resolve

- Resolved: the port stays on the repository's Tailwind 3.4 + shared shadcn/Radix stack. Translate the live Design Lab's Tailwind 4 `@theme` values into shared CSS custom properties and Tailwind 3 configuration; a Tailwind major upgrade is outside this migration.
- Resolved: Newsreader is the canonical Folio display and reading serif, with Inter for UI and JetBrains Mono for locators. All are self-hosted through `@fontsource`; the current Fraunces and Source Serif imports remain an implementation migration gap.
- Resolved: Folio is the sole frontend generation and production theme. Mist Glass remains an anatomy reference only; the working API integrations and numbered frontend behavior specs remain authoritative.
- Resolved: production Folio keeps the documented 35/65 Tutor-to-Workspace default, a draggable persisted divider, and independent pane scrolling. The live prototype's approximately 56/44 document-scrolling layout is reference-only.
- Resolved by ADR-0027: remove the Legacy/Next boundary, production Mist theme, provisional pages, and provisional CSS. The current worktree's single-generation direction is intentional, but it still requires complete functional parity before release.
- Resolved: the entire current frontend implementation is disposable. Preserve verified behavior, domain semantics, learner state, security rules, and production contracts—not component identities, hooks, contexts, routing code, fetch wrappers, CSS, or incidental dependencies. Reuse is optional and risk-driven.
- Resolved: the exact live local Folio source is canonical. Its five-file freeze set and hashes are recorded above; it should be committed or tagged before implementation begins.
- Resolved: the Folio port covers all public and authenticated learner routes. Admin and development-only operator surfaces keep their dense information architecture while adopting the shared Folio tokens, primitives, accessibility rules, and state treatments.
- Resolved: routes and states without existing Folio references are designed and implemented directly from the canonical Folio system during the port; separate Design Lab frames are not a gate. No route may retain generic, Legacy, or Mist presentation.
- Resolved: every approved Folio dashboard section remains in scope and must use the real Learner Dashboard Summary from `GET /api/v1/dashboard`. Missing state renders honest empty/not-ready states; mock or client-reconstructed learning data is prohibited.
- Resolved: dashboard reads never invoke an LLM. Recommendation eligibility and ranking are deterministic; LLM enrichment is generated upstream or by an explicit asynchronous refresh, persisted with generation state, and displayed with deterministic fallbacks.
- Resolved: study CTAs deep-link into a typed Workspace surface/reference/intent and do not mutate on open. Local display controls stay local; only explicit commands call mutating APIs. The current Workspace still needs a shared URL codec and state-bootstrap path.
- Resolved by ADR-0028: Study time aggregates persisted Study Activity Intervals across Tutor, Study Map, Reference, Evidence, Practice, and Interactive surfaces. Session Liveness is separate, using structured 15/30-minute wait policies. The interval model, pulse route, client controller, dashboard projection, and missing implicit resume event are Folio prerequisites.

## Recommended Porting Boundary

Treat the live Folio implementation as the visual and interaction target, not as the behavioral codebase. Build the new frontend around production contracts rather than around the current component tree. Preserve verified auth/entitlement outcomes, tutor streaming and session semantics, graph/read-model behavior, Reference Surface and Evidence contracts, Artifact lifecycle, ingestion state, and MCP App Bridge behavior; the current frontend code that happens to implement them may be replaced. Apply the complete Folio treatment to public and learner routes; keep Admin and development-only routes operator-first but token-aligned. Keep a 35/65 default split with a draggable persisted divider and independent Tutor/Workspace scrolling. Ship one Folio frontend generation with no Legacy/Mist runtime fallback; complete route and behavior parity is therefore a release gate.

## Evidence Limits

- This run inspected the live local Design Lab and relevant source code. It did not mutate the Folio source or current frontend.
- The Design Lab uses sample state for most study behavior, so successful clicks do not prove real API/runtime success.
- The 1280px captures document responsive clipping; the 1440px browser captures and 2880px user references document the intended desktop composition.
- Full Node Pack capture was not reliable; the saved segmented captures cover its visible sections.
