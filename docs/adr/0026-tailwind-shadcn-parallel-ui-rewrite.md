# ADR-0026: Tailwind, shadcn, And Parallel UI Rewrite

Status: Superseded by ADR-0027

Date: 2026-06-26

> Historical decision. ADR-0027 replaces the parallel Legacy/Next rollout with a single Folio frontend generation.

## Context

The learner web app (`apps/web`) ships a **Provisional UI** — hand-written CSS (`study-shell.css`, `tutorbook.css`) wired to the API. **Design Kits** in `ui-example/` and `ui-preview/` are the visual authority for Mist Glass, Folio, and related themes. We need both themes (plus an experimental Atlas theme) checkable against the live Docker stack, without discarding the working Provisional UI mid-rewrite.

## Decision

Adopt **Tailwind CSS + shadcn/ui (Radix primitives)** as the implementation stack for a full app rewrite. **shadcn primitives and theme tokens** live in `@studyagent/ui`; **study-specific composites** (tutor rail, graph chrome, evidence drawer) stay in `apps/web/src/next/`.

Keep the repository's existing Tailwind 3.4 toolchain for the Folio port. Translate the Design Lab's Tailwind 4 `@theme` declarations into shared CSS custom properties and Tailwind 3 configuration; do not combine the visual migration with a Tailwind major-version upgrade.

Run the rewrite as a **parallel UI generation** alongside Provisional UI:

- **`legacy`** (default) — existing routes and components unchanged; production always uses this until an explicit cutover.
- **`next`** — new Tailwind/shadcn surfaces; dev-only opt-in via a floating switcher (`localStorage`); same API contracts.

**Layout:** classic split (top bar + tutor rail | workspace canvas) for both themes — no layout-paradigm migration in this program.

**Themes (dev switcher only):**

| Theme     | Role                                        | Typography (via `@fontsource`)                                    |
| --------- | ------------------------------------------- | ----------------------------------------------------------------- |
| **mist**  | Implementation baseline; production default | Inter UI; Source Serif 4 reading                                  |
| **folio** | Design north star                           | Inter UI; Newsreader display and reading; JetBrains Mono locators |
| **atlas** | Distinct experimental third theme           | Inter UI; IBM Plex Sans display; denser chrome                    |

Folio gaps with no PNG export are **designed in implementation** using Mist Glass anatomy as skeleton, not blocked on new `ui-example/` assets.

**Theme policy:** production builds ignore the dev switcher and mount `legacy` + `mist` only.

**Verification target:** Docker stack (`docker-compose`); acceptance = core study loop + hosted-beta shell (consent, credits, templates, support) — not admin or MCP-interactive surfaces for v1 of the rewrite.

## Consequences

- Two UI generations coexist until `next` reaches parity and an explicit cutover ADR or release note retires `legacy`.
- Provisional CSS files remain imported for `legacy`; `next` uses `@studyagent/ui` globals — no forced deletion of working code during the rewrite.
- Bundle size grows temporarily (dual CSS + font packages); acceptable until cutover.
- Graph (React Flow) and tutor streaming stay custom components in `apps/web`; they consume shared tokens, not shadcn layout primitives.

## Alternatives Considered

**Skin Provisional UI with shared CSS variables only (no Tailwind):**

- Rejected as the long-term target. shadcn/Tailwind is needed for hosted-beta forms, dialogs, and consistent dual-theme primitives; bolting onto legacy CSS creates permanent two-style-system debt.

**Phased Tailwind (shell first, workspace stays plain CSS):**

- Rejected in favor of big-bang `next` generation, but **legacy preservation** replaces the need to delete working code before the new stack is complete.

**Replace Provisional UI in place on existing routes:**

- Rejected. User requirement: keep the current working version intact until `next` is ready.

**Google Fonts CDN:**

- Rejected. Use `@fontsource` for reproducible Docker/offline builds.

## References

- `docs/contexts/web-workspace/CONTEXT.md` — Design Kit, Provisional UI, Visual Theme, Atlas
- `docs/frontend/13-folio-design-kit.md`
- `docs/frontend/11-implementation-handoff.md`
- ADR-0001: Notebook-Scoped Learning Workspace
