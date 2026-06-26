# `nodes.pen` — Complete Design Documentation

**File:** [`nodes.pen`](./nodes.pen)  
**Screenshots:** [`ui-example/mist-glass/`](./ui-example/mist-glass/) — 84 PNG exports in sorted folders  
**Last documented:** 2026-06-21  
**Design tool:** [Pencil](https://pencil.dev) (edit via Pencil canvas + MCP only — do not read/edit `.pen` with text editors)  
**Product:** TutorBook hosted-beta learner workspace  
**Visual language:** **Mist Glass** — frosted panels, indigo accents, cool mist gradients  
**Domain specs:** [`docs/frontend/`](./docs/frontend/) (especially `04`–`08`, `11`)

---

## Table of contents

1. [Executive summary](#executive-summary)
2. [Related design files](#related-design-files)
3. [How this file was built](#how-this-file-was-built)
4. [Design philosophy](#design-philosophy)
5. [Session chronology (full chat history)](#session-chronology-full-chat-history)
6. [Canvas organization](#canvas-organization)
7. [Node pack scale system](#node-pack-scale-system)
8. [Workspace system](#workspace-system)
9. [Tutor chat system](#tutor-chat-system)
10. [Reference surface pages](#reference-surface-pages)
11. [Evidence drawer system](#evidence-drawer-system)
12. [Design tokens and visual language](#design-tokens-and-visual-language)
13. [Complete reusable component catalog](#complete-reusable-component-catalog)
14. [Complete screen and showcase catalog](#complete-screen-and-showcase-catalog)
15. [Interaction patterns](#interaction-patterns)
16. [Implementation handoff](#implementation-handoff)
17. [Pencil MCP workflow notes](#pencil-mcp-workflow-notes)
18. [Spec alignment checklist](#spec-alignment-checklist)
19. [Not yet designed / optional follow-ups](#not-yet-designed--optional-follow-ups)

---

## Executive summary

`nodes.pen` is the consolidated **TutorBook UI design kit** for the hosted-beta learner experience. It contains:

| Area                   | What’s in the file                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Node pack**          | Variable-size study-map nodes (XL → XS), inspired by [21 Hours on the Moon](https://www.21hrs.space/overview) |
| **Workspace**          | Full 1440×900 screens: Study Map, Source Wiki, Curriculum, chat expanded/collapsed                            |
| **Chat**               | Reusable tutor panel: header tabs, agent activity stream, composer, history, settings                         |
| **Reference surfaces** | Openable full-page views for every major node type (concept, quiz, source, etc.)                              |
| **Evidence**           | Right-docked drawer with source pills, miniature page/slide thumbnails, excerpts, glass workspace overlay     |

**Canonical interaction model:**

- **Teaching** happens in tutor chat (left rail, 400px).
- **Durable reference** lives in the workspace (right area).
- **Evidence** opens as a **right-edge drawer** (400px) over a **frosted glass** workspace when the user clicks citations, the Evidence button, or source links.

There are **38 reusable components**, **7 workspace screens**, **12 reference surface pages**, **5 evidence showcase pages**, and extensive off-canvas component staging. All styling uses **inline hex values** (no Pencil design variables are defined).

---

## Related design files

| File                     | Role                                                                                                                                | Notes                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **`nodes.pen`**          | **This file** — primary design kit for nodes, workspace, chat, pages, evidence                                                      | Active development target                                        |
| **`untitled.pen`**       | Earlier accumulation (~911 KB) — fixed-size Node Pack Glass (`rAWXt`), hosted-beta page pack, canonical Mist Glass shell (`g4gt0R`) | **Do not delete or edit** unless explicitly migrating            |
| **`design.pen`**         | Started as layout/theme exploration canvas; reported empty at one point while content lived in `untitled.pen`                       | Historical; layouts A–F, themes, chat approaches originated here |
| **`docs/frontend/*.md`** | Product/UX specs the designs implement                                                                                              | Source of truth for behavior copy and anatomy                    |
| **`images/brand/`**      | Exported logos, meshes, loaders from earlier design session                                                                         | Referenced by hosted-beta pages in `untitled.pen`                |

---

## How this file was built

This documentation was produced from:

1. **Pencil MCP inventory** — `batch_get`, `snapshot_layout`, `get_screenshot` on `nodes.pen` (`.pen` files are encrypted; never use `Read`/`Grep`).
2. **Agent transcript** [`87ddb905-0638-48d1-9b69-d44dcbf56f23`](./.cursor/projects/Users-shreyashkumar-coding-projects-StudyAgent-tutorAI-pi-agentOS/agent-transcripts/87ddb905-0638-48d1-9b69-d44dcbf56f23/87ddb905-0638-48d1-9b69-d44dcbf56f23.jsonl) — full conversation from layout explorations through evidence drawer wiring.
3. **Domain docs** — `docs/frontend/04`–`08`, `11`.

To refresh this doc after design changes: re-run inventory via Pencil MCP and update ID tables.

---

## Design philosophy

### Mist Glass

- Panels: `#ffffffcc`, `#ffffffb8`, `#ffffffaa` fills
- Strokes: `#e2e8f0` or white 1px hairlines
- Shadows: indigo-tinted outer blur (`#6366f110`–`#6366f120`, blur 8–24)
- Backgrounds: linear/radial gradients `#eef2ff` → `#f8fafc` → `#e0e7ff`
- Typography: **Inter** throughout; slate hierarchy (`#0f172a` titles → `#94a3b8` meta)

### Nodes as gateways

Per [`06-node-design-system.md`](./docs/frontend/06-node-design-system.md): nodes are **compact gateways** into reference surfaces, tutor context, and evidence — not raw graph dumps. Size encodes importance; type encodes accent color.

### Chat as teaching spine

Per [`04-tutor-chat.md`](./docs/frontend/04-tutor-chat.md): chat owns the lesson; workspace owns durable content. Agent activity uses **human labels**, not raw tool logs. Mid-turn tutor prose is **plain inline text** (no separate “interim message” pills).

### Evidence as trust layer

Per [`07-reference-surfaces-evidence.md`](./docs/frontend/07-reference-surfaces-evidence.md): source-grounded claims cite evidence. Drawer shows excerpts + locators; “open source” deep-links to PDF page, slide, wiki section, or Word page.

### 21hrs.space influence

| Pattern from 21hrs  | TutorBook adaptation                       |
| ------------------- | ------------------------------------------ |
| Size = importance   | XL planning anchors, XS map punctuation    |
| External labels     | Type badges beside titles on compact tiers |
| Corner brackets     | S/XS node bracket affordance               |
| Bottom timeline     | Objective stack + scroll hint in XL nodes  |
| Landmark typography | Curriculum title as faint canvas watermark |
| Nodes as portals    | Click → reference surface or evidence      |

---

## Session chronology (full chat history)

Chronological record of user requests and what was built across the design session (spanning `design.pen`, `untitled.pen`, and `nodes.pen`).

### Phase 1 — Workspace layout explorations (`design.pen`)

**Request:** Multiple study-workspace UI variations (graph, chat, curriculum, wiki).

**Built:** Six 1440×900 layout variants + shared chrome:

| Variant                 | ID (design.pen) | Concept                                                                |
| ----------------------- | --------------- | ---------------------------------------------------------------------- |
| A · Classic Split       | —               | Tutor left ~33%, workspace right (matches `NotebookWorkspacePage.tsx`) |
| B · Graph-primary rail  | —               | Full map + slim tutor rail                                             |
| C · Focus dock          | —               | One full canvas; bottom dock switches surfaces                         |
| D · Three-column bridge | —               | Curriculum \| Study Map \| Tutor                                       |
| E · Stacked drawer      | —               | Map top, tutor drawer below                                            |
| F · Chat-primary peek   | —               | Tutor 62%; mini-map peek                                               |

**Decision:** A + C favored for implementation; B as map-heavy alternative.

### Phase 2 — Themes and structural differentiation

**Request:** Three themes (Mist, Atlas, Folio); light + dark; themes must differ in **structure**, not only hue.

**Built:** Theme comparison with different button radii, tab styles, composer treatments, and accent palettes. Fixed instance-level `theme` binding (components had baked Mist tokens).

### Phase 3 — Six chat UX approaches

**Request:** Creative agentic chat designs with activity, permissions, feedback.

**Built:** Approaches A–F at y ≈ 2920 in `design.pen`:

| Approach            | Concept                                                     |
| ------------------- | ----------------------------------------------------------- |
| A · Timeline Thread | Classic thread + expandable activity accordion (**chosen**) |
| B · Turn Cards      | Per-turn scannable cards                                    |
| C · Activity Rail   | Vertical stepper beside prose                               |
| D · Composer Hub    | Composer-dominant; steer-while-running                      |
| E · Session Ledger  | Pinned insights + numbered log                              |
| F · Evidence Thread | Perplexity-style “How I answered” + source chips            |

**AG-UI stream model added:** tool steps, thinking blocks, interim prose (plain, no pills), final response with citations + feedback.

### Phase 4 — Glass workspace + node pack (`design.pen` / `untitled.pen`)

**Request:** Polish chat A; glass effects; design all node types; typed artifacts; shell v2 with floating controls.

**Built:**

- Canonical shell **`g4gt0R`** (Var 1 · Mist Glass)
- Fixed-size glass nodes **`rAWXt`** (184×112) + 10 typed artifact variants
- Shell v2: floating surface switcher, canvas tools, collapsible chat seam, unified send (⇧↵ steer)
- Hosted-beta page pack (22+ screens)
- Brand assets + GLSL shaders (`mist-mesh.glsl`, `pulse-dots.glsl`)

### Phase 5 — Variable-size node pack (`nodes.pen`)

**Request:** Nodes with variable sizes by importance (21hrs inspiration); build in `nodes.pen` after Pencil canvas issues with `untitled.pen`.

**Built:** XL/L/M/S/XS tiers, showcases, mixed-scale sample canvas, artifact stripe variants.

### Phase 6 — Complete workspace + chat (`nodes.pen`, y ≈ 2350–5900)

**Request:** Full workspace with collapsible chat, agent activity, Study Map / Wiki / Curriculum; chat as reusable components.

**Built:** `rfoMo`, `y8MAQc`, `sw865`, `QSqPI` + full chat component library + `d5XOn` tab showcase.

### Phase 7 — Tutor / History / Settings (`nodes.pen`)

**Request:** Improve header and tab bodies.

**Built:** Segmented Tutor|History|Settings header (`TYINm`), history list (`hff4l`), settings panel (`C1NQ5O`), panel variants.

### Phase 8 — Reference surface pages (`nodes.pen`, y ≈ 6500–10700)

**Request:** Openable pages per node type — quiz (MCQ, short answer, numerical), markdown concept/wiki, curriculum/module layouts.

**Built:** 12 pages with shared `ReferenceSurfaceHeader` (`a7XKP`); index `E1olU`.

### Phase 9 — Evidence drawer (`nodes.pen`, y ≈ 9000–12200)

**Request:** Evidence panel with sources, miniature snippet thumbnails (PDF pages, PPT slides, wiki sections), clickable to open full source.

**Built:** Snippet thumbs, PDF/PPT/Wiki/Word/Empty drawer variants, standalone showcase pages.

### Phase 10 — Evidence wired into workspace (`nodes.pen`, y ≈ 12944)

**Request:** Drawer on **right of screen** when user clicks evidence/citation; workspace **translucent/glass**.

**Built:**

- `EvidenceGlassBackdrop` (`Nx9MD`) — frosted scrim
- `EvidenceDrawerDock` (`O03DNf`) — 400px right edge, full height
- `CitationChip` / `CitationChip-Active`, `EvidenceButton-Active`
- `tQmL5` (Study Map + drawer), `KIZi9` (Concept + drawer)
- Workspace + chat dim to ~55% opacity + backdrop blur behind drawer

### Phase 11 — This documentation (current)

**Request:** Root-level doc covering everything in `nodes.pen` and full chat discussion.

---

## Canvas organization

The Pencil canvas is organized in **horizontal bands** by Y position and **staging columns** by X.

### Y-axis bands

| Y range           | Section                                        | Key frame IDs                                |
| ----------------- | ---------------------------------------------- | -------------------------------------------- |
| **0 – 2300**      | Node Pack Scale showcases                      | `BXIH9`, `tDFeN`, `PKLEw`–`w5BsHW`, `BAkUi`  |
| **900 – 3700**    | Off-canvas components (chat, workspace chrome) | `NhUKO`–`w1rfJ`, `O4nHt`–`pDSTm`             |
| **2364 – 4700**   | Workspace screens                              | `GZR6N`, `rfoMo`, `y8MAQc`, `sw865`, `QSqPI` |
| **2460 – 2760**   | Evidence micro-components                      | `VGyNt`, `txkNB`, `Nx9MD`, `O03DNf`, `L8ay6` |
| **2636 – 4160**   | Chat Components Library                        | `AiOz9`                                      |
| **5608 – 5900**   | Workspace index, evidence label, chat tabs     | `glYQo`, `qkb77`, `d5XOn`                    |
| **6568 – 10700**  | Reference surface pages                        | `WgYCc`, `matsU`–`eUIwO`                     |
| **9000 – 11900**  | Evidence drawer library + evidence pages       | `d49tLB`–`QW7j6`, `LhoQI`–`Pe9ua`            |
| **11404 – 12200** | Node Pages index, evidence overlay showcase    | `E1olU`, `q3abBD`                            |
| **11772+**        | Evidence section header                        | `hsu3e`                                      |
| **12944+**        | Workspace + evidence open                      | `tQmL5`, `KIZi9`                             |

### X-axis columns

| X range            | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| **−1638 to −1100** | Evidence drawer component library                |
| **−620 to −200**   | Chat + workspace component staging               |
| **0 to 1500**      | Primary showcases (node pack, workspaces, pages) |
| **3000**           | Chat Components Library sidebar                  |

### Index frames (start here in Pencil)

| Index                        | ID      | Location  |
| ---------------------------- | ------- | --------- |
| Workspace / Screen Index     | `glYQo` | y ≈ 5608  |
| Node Pages / Index           | `E1olU` | y ≈ 11404 |
| Label / Evidence interaction | `qkb77` | y ≈ 5668  |

---

## Node pack scale system

### Size taxonomy

Inspired by 21hrs map HUD + [`06-node-design-system.md`](./docs/frontend/06-node-design-system.md).

| Tier   | Component           | ID       | Size    | Use case                                                  |
| ------ | ------------------- | -------- | ------- | --------------------------------------------------------- |
| **XL** | `StudyNodeScale-XL` | `GZwTm`  | 200×220 | Live Plan, objective stack, planning anchors              |
| **L**  | `StudyNodeScale-L`  | `azNBc`  | 200×168 | Curriculum, module path anchors                           |
| **M**  | `StudyNodeScale-M`  | `EML1j`  | 184×112 | Default gateway: source, concept, session, wiki, artifact |
| **S**  | `StudyNodeScale-S`  | `oOu4m`  | 148×80  | Compact: objective, topic, weak concept, claim            |
| **XS** | `StudyNodeScale-XS` | `w9pjgK` | 112×44  | Map punctuation: coverage pins, order markers             |

### XL node anatomy (`GZwTm`)

- `head` — type badge
- `title` — node title
- `objectiveStack` — prev / current / next objectives
- `scrollHint` — bottom timeline affordance

### L node anatomy (`azNBc`)

- `head`, `title`
- `progress` — bar + fraction (e.g. 3/8)
- `modulePreview` — upcoming module hint
- `meta` — status line

### M node anatomy (`EML1j`)

- `head` — icon + type label + readiness pill
- `title`, `summary`
- `foot` — meta + evidence icon (`shield-check`, 12px)

### S node anatomy (`oOu4m`)

- `bracket` — corner L-shapes + type icon
- `body` — `typeLabel`, `title`, `meta`

### XS node anatomy (`w9pjgK`)

- `bracket` — mini corners + icon
- `title` — single line

### Node states showcase (`kcDkD`)

Three M-tier states:

1. **Default** — glass card, white stroke
2. **Selected** — accent ring (`#6366f1` stroke 2px)
3. **Current path** — purple glow (`#8b5cf630` shadow) + “on path” badge

### Typed artifacts (`w5BsHW`)

M-tier nodes with **4px left accent stripe** and subtype labels:

| Subtype        | Stripe / label |
| -------------- | -------------- |
| Flashcards     | amber          |
| Quiz           | amber          |
| Worked Example | amber          |
| Formula Sheet  | amber          |

(Aligns with `artifactType` in [`08-artifacts.md`](./docs/frontend/08-artifacts.md) and `packages/schemas/src/artifacts.ts`.)

### Type accent colors (`BAkUi`)

| Node type            | Hex                   |
| -------------------- | --------------------- |
| Source               | `#10b981` emerald     |
| Topic                | `#0ea5e9` sky         |
| Concept              | `#6366f1` indigo      |
| Needs practice       | `#f43f5e` rose        |
| Curriculum           | `#f97316` orange      |
| Module               | `#ea580c` deep orange |
| Session              | `#2563eb` blue        |
| Artifact             | `#f59e0b` amber       |
| Wiki page            | `#06b6d4` cyan        |
| Live Plan / Planning | `#8b5cf6` purple      |
| Objective (compact)  | indigo                |

### Sample mixed-scale canvas (`aKfCx`)

1060×440 canvas inside `vW4c3` with:

- Faint watermark: “ORGANIC CHEMISTRY I”
- Corner drag affordance brackets + “DRAG TO EXPLORE”
- Composed XL + L + M + S + XS instances
- Selected module card (`q1epkf`, purple ring) at center
- Status bar strip at bottom

### Showcase section IDs

| Section       | ID       |
| ------------- | -------- |
| Header        | `BXIH9`  |
| Size legend   | `tDFeN`  |
| Type legend   | `BAkUi`  |
| XL Planning   | `PKLEw`  |
| L Curriculum  | `B8gCh`  |
| M Gateway     | `UTey9`  |
| S Compact     | `qNHl2`  |
| XS Pins       | `E9kSH`  |
| States        | `kcDkD`  |
| Sample canvas | `vW4c3`  |
| Artifacts     | `w5BsHW` |

---

## Workspace system

All workspace screens: **1440×900**, mist gradient background, vertical layout (topbar + body).

### Workspace chrome components

#### `Component/WorkspaceTopbar` — `O4nHt` (1020×52)

- **Left:** logo mark, workspace title (“Organic Chemistry I”), ingestion status badge
- **Right:** search field, credits chip
- Fill: `#ffffffcc`; bottom stroke `#e2e8f0`

#### `Component/WorkspaceSurfaceSwitcher` — `Bn5nK` (268×33)

Floating pill group (also placed on canvas in Study Map):

| Tab         | State                                      |
| ----------- | ------------------------------------------ |
| Study Map   | Active — indigo fill `#6366f1`, white text |
| Curriculum  | Inactive — ghost                           |
| Source Wiki | Inactive — ghost                           |

#### `Component/WorkspaceStatusBar` — `pDSTm` (1020×28)

- Left: `Study Map · 24 nodes · 31 edges`
- Center: `Selected: SN2 mechanism`
- Right: `Objective: Obj 5 · SN2 mechanism` (purple emphasis)

### Workspace screens

#### `Workspace / Study Map · Chat Expanded` — `rfoMo` (0, 2676)

```
┌──────────────────────────────────────────────────────────────┐
│ WorkspaceTopbar (O4nHt)                                       │
├──────────────┬───────────────────────────────────────────────┤
│ ChatPanel    │ workspace (Vwj6K)                              │
│ (whFny)      │  ├─ canvas (uDg7G) — nodes, floating controls  │
│ 400px        │  └─ StatusBar (pDSTm)                         │
└──────────────┴───────────────────────────────────────────────┘
```

**Canvas contents (`uDg7G`):**

- Floating surface switcher (top-left)
- Canvas tools: filter, layout, evidence, refresh (top-right)
- Node instances at mixed positions (XL/L/M/S/XS refs)
- Selected node detail card (`livu2`) — module “Ch. 7 · Substitution” with purple selection ring
- Radial mist gradient fill; `layout: "none"` with absolute x/y positioning

#### `Workspace / Study Map · Chat Collapsed` — `y8MAQc` (1500, 2676)

- `ChatCollapsedRail` (`NCtBe`, 48px) — chevron seam + floating message-circle FAB
- Full-width study map canvas

#### `Workspace / Source Wiki` — `sw865` (0, 3672)

- Topbar + **topic sidebar** (400px) + wiki content with concept chips
- Surface switcher: Source Wiki active

#### `Workspace / Curriculum` — `QSqPI` (0, 4668)

- Topbar + **module path sidebar** (400px) + curriculum timeline with embedded objectives

#### `Workspace / Study Map · Evidence open` — `tQmL5` (0, 12944)

Evidence interaction demo on Study Map:

```
body (GuxSu, layout: none)
├── tutorWrap (Vtzbn)     — opacity 0.55, blur radius 4
├── workspace (N0Z9q2)    — opacity 0.55, blur radius 4
├── EvidenceGlassBackdrop — full 1440×848 scrim
└── EvidenceDrawerDock    — x:1040, 400×848
```

- Selected node card updated to CONCEPT “SN2 mechanism” with **active citation chip**
- Callout: “↑ Citation click opens Evidence drawer”

#### `Workspace / Concept · Evidence open` — `KIZi9` (1500, 12944)

- Frosted chat (400px) + dimmed concept reference surface (640px) + glass + drawer
- **Evidence button** in header shown in active state (indigo outline)
- Active citation chip in concept body

#### `Workspace / Evidence drawer overlay` — `q3abBD` (−620, 12164)

Smaller 1100×700 showcase: dimmed concept page (45% opacity) + drawer sliding from right. Earlier iteration before full workspace wiring.

### Study Map canvas floating controls

| Control group                | Position       | Contents                          |
| ---------------------------- | -------------- | --------------------------------- |
| `floatingControls` (`E9ILQ`) | top-left       | Surface switcher ref              |
| Filter/layout strip          | below switcher | Compact tool pills                |
| Canvas tools (`bwHc7`)       | top-right      | Filter, layout, evidence, refresh |
| Status chip                  | bottom-left    | Selection / objective             |
| Zoom stack                   | bottom-right   | +/−/fit                           |

---

## Tutor chat system

Canonical approach: **A · Timeline Thread** with AG-UI stream interleaving.

### Stream event → UI mapping

| Runtime event             | Component                                | Visual                                   | Learner feedback? |
| ------------------------- | ---------------------------------------- | ---------------------------------------- | ----------------- |
| `tool_start` / `tool_end` | `ChatAgentStep` / `ChatAgentStepRunning` | ✓ or spinner + human label               | No                |
| `thinking`                | `ChatThinking`                           | Italic prose, left accent bar            | No                |
| `text_message` (mid-run)  | Plain text in thread                     | **No bordered pill** — inline prose only | No                |
| `text_message` (final)    | `ChatTutorProse`                         | Full prose + citation chip               | Yes (thumbs)      |
| `run_finished`            | —                                        | Enable feedback on final turn            | —                 |

### Chat header — `Component/ChatHeader` — `TYINm` (400×149)

| Zone         | Contents                                                             |
| ------------ | -------------------------------------------------------------------- |
| `titleRow`   | Graduation-cap icon, “Tutor” title, **+ New** button                 |
| `tabTrack`   | Segmented **Tutor \| History \| Settings** (frosted track `#f1f5f9`) |
| `sessionBar` | Session context: objective chip (“Learn · SN2 mechanism”), status    |

**Variants:**

| Component             | ID      | Difference                              |
| --------------------- | ------- | --------------------------------------- |
| `ChatHeader-History`  | `M6kzz` | History tab active; session bar dimmed  |
| `ChatHeader-Settings` | `kV9UJ` | Settings tab active; session bar hidden |

### Thread components

| Component              | ID       | Size    | Description                                      |
| ---------------------- | -------- | ------- | ------------------------------------------------ |
| `ChatUserRow`          | `NhUKO`  | 360×20  | Right-aligned user message                       |
| `ChatAgentStep`        | `p4BE3p` | 360×15  | Completed step: check + label                    |
| `ChatAgentStepRunning` | `D1kyb`  | 360×15  | Indigo spinner + “Checking learning state”       |
| `ChatThinking`         | `v4uDIe` | 360×49  | “Thinking” label + italic content                |
| `ChatTutorProse`       | `z2HwxR` | 360×68  | Tutor reply + `citation` chip (“Ch. 7 · p. 142”) |
| `ChatActivityBlock`    | `Icgfv`  | 360×154 | Collapsible “Agent activity” with step refs      |

### Composer — `Component/ChatComposer` — `esDjV` (360×123)

- `context` — attached node/source chips
- `input` — placeholder textarea
- `actions` — hint text (`↵ send · ⇧↵ steer`) + circular **Send** button (single button; steer via keyboard only)

### Full panels

| Component            | ID      | Contents                                                         |
| -------------------- | ------- | ---------------------------------------------------------------- |
| `ChatPanel`          | `whFny` | Header + thread + composer; glass fill `#ffffffb8`, right shadow |
| `ChatPanel-History`  | `d8sg2` | History header + `ChatHistoryView` + footer hint                 |
| `ChatPanel-Settings` | `w1rfJ` | Settings header + `ChatSettingsView`                             |
| `ChatCollapsedRail`  | `NCtBe` | 48px seam chevrons + FAB                                         |

### History view — `ChatHistoryView` — `hff4l` (368×480)

- Search field
- Filter chips (All, This workspace, …)
- Grouped list: TODAY, YESTERDAY
- Session cards with title, preview, timestamp

### Settings view — `ChatSettingsView` — `C1NQ5O` (368×520)

- Tutor mode picker (Learn / Practice / Revise / Explore)
- Study-aid toggles
- Developer mode toggle
- Link to session insights

### Chat showcases

| Showcase                        | ID      | Contents                                     |
| ------------------------------- | ------- | -------------------------------------------- |
| `Chat Components / Library`     | `AiOz9` | All parts labeled with instances             |
| `Chat / Tutor History Settings` | `d5XOn` | Side-by-side Tutor, History, Settings panels |

### Sample thread content (`whFny` / `pnf7V`)

1. User row
2. Activity block (expanded): steps + thinking
3. Tutor prose: “I'll walk through the backside attack step by step.”
4. Tutor prose with citation: “SN2 favors strong nucleophiles… Ch. 7 source shows backside attack.”

---

## Reference surface pages

All pages: **1020×720**, `#f8fafc` frame, 12px corner radius, clip enabled.  
Shared header: `Component/ReferenceSurfaceHeader` — `a7XKP`.

### Header anatomy (`a7XKP`)

| Zone              | Named slots                                   | Contents                                                 |
| ----------------- | --------------------------------------------- | -------------------------------------------------------- |
| Top row (`VDTjC`) | —                                             | Back to Study Map · **Ask tutor** · **Evidence** actions |
| Content (`HZ8Ci`) | `nKlcX` badge, `dI8NP` title, `YIVD0` summary | Type-specific badge color + title + one-line summary     |

**Header actions:**

- `ND6EY` — Ask tutor (`message-circle` icon)
- `nxN5g` — Evidence (`shield-check` icon) — opens evidence drawer

### Page catalog

| Page               | ID       | Position      | Badge                    | Title (sample)                     | Body highlights                                                                    |
| ------------------ | -------- | ------------- | ------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| **Concept**        | `matsU`  | (−620, 6784)  | CONCEPT `#6366f1`        | SN2 mechanism                      | Definition, Intuition callout (`#eef2ff`), key factors bullets, `CitationChip` ref |
| **Wiki Topic**     | `etQ8W`  | (448, 6784)   | WIKI PAGE `#06b6d4`      | Nucleophilic substitution          | Long prose, SN2 pathway, formula block, related sidebar 240px                      |
| **Curriculum**     | `PtBVL`  | (−620, 7552)  | CURRICULUM `#f97316`     | Organic Chemistry I                | Path hero gradient, module timeline                                                |
| **Module**         | `i6V0TE` | (448, 7552)   | MODULE `#ea580c`         | Ch. 7 · Substitution               | Summary, objective checklist, links sidebar 260px                                  |
| **Quiz**           | `pCLJv`  | (−620, 8320)  | QUIZ `#f59e0b`           | SN2 mechanism quiz                 | Progress 2/5, **MCQ** + **short answer** + **numerical** + Submit                  |
| **Session**        | `aAoQ4`  | (448, 8320)   | SESSION `#2563eb`        | SN2 walkthrough                    | Reopen CTA, overview, produced items grid                                          |
| **Source**         | `FBeJj`  | (1516, 8120)  | SOURCE `#10b981`         | Organic Chemistry Textbook · Ch. 7 | **80px thumbnail rail** + reader + highlighted passage                             |
| **Flashcards**     | `OfOs8`  | (−620, 9088)  | FLASHCARDS `#f59e0b`     | SN2 flashcards                     | Card 8/24, centered 480×260 card, SM-2 ratings (Again/Hard/Good/Easy)              |
| **Worked Example** | `P9K2c`  | (448, 9088)   | WORKED EXAMPLE `#f59e0b` | SN2 stereochemistry                | Problem, 3 step-reveal rows, mistakes callout                                      |
| **Formula Sheet**  | `HkBYM`  | (−620, 9856)  | FORMULA SHEET `#f59e0b`  | SN1 vs SN2 reference               | Table rows: variable / formula pairs                                               |
| **Comparison**     | `ReKBb`  | (1516, 9088)  | COMPARISON `#f59e0b`     | SN1 vs SN2                         | Side-by-side comparison table (4 rows)                                             |
| **Live Plan**      | `eUIwO`  | (−620, 10624) | LIVE PLAN `#8b5cf6`      | Session plan · Ch. 7               | Next actions list, objective stack sidebar 320px                                   |

### Quiz page detail (`pCLJv`)

Question types per [`08-artifacts.md`](./docs/frontend/08-artifacts.md):

1. **Multiple choice** — radio options A–D
2. **Short answer** — text input field
3. **Numerical** — number input with units hint

Header summary: “5 questions · Ch. 7 · Ready to study”

### Source page detail (`FBeJj`)

- Left **vertical thumbnail strip** (~80px) — miniature page previews (precursor to evidence snippet thumbs)
- Main reader with highlighted passage callout
- Models how source documents should feel primary, not buried behind metadata

### Concept page citations

- Footer citation row uses `Component/CitationChip` (`VGyNt`) — “Ch. 7 · pp. 142–148”
- Intuition callout: left 3px indigo border, `#eef2ff` fill

---

## Evidence drawer system

The evidence drawer is the **learner-facing trust layer** per [`07-reference-surfaces-evidence.md`](./docs/frontend/07-reference-surfaces-evidence.md).

### Drawer anatomy (all variants)

```
┌ Evidence ───────────────────────────── ✕ ┐
│ SN2 mechanism · Concept                   │
├───────────────────────────────────────────┤
│ SOURCES IN WORKSPACE                      │
│ [Ch. 7 PDF ●] [Lecture 3] [Wiki]         │
├──────┬────────────────────────────────────┤
│ thumb│ Page 142                           │
│ rail │ Organic Chemistry — Ch. 7…         │
│ 56px │ "Primary substrates react via…"    │
│      │ [Open PDF at page 142 →]           │
└──────┴────────────────────────────────────┘
```

1. **Header** — “Evidence”, selected node context, close (✕)
2. **Source pills** — horizontal chips for each workspace source; active source gets colored border
3. **Snippet thumbnail rail** — vertical miniature pages/slides/sections (56×72 PDF, 56×42 PPT slides)
4. **Excerpt pane** — locator, source title, quoted text
5. **Open source CTA** — deep-link button per media type

### Snippet thumbnails

| Component                       | ID       | Size  | Selected state                                    |
| ------------------------------- | -------- | ----- | ------------------------------------------------- |
| `EvidenceSnippetThumb`          | `d49tLB` | 56×72 | Gray fill `#e2e8f0`, subtle lines                 |
| `EvidenceSnippetThumb-Selected` | `sDlup`  | 56×72 | White fill, **indigo border 2px**, highlight line |

**Visual reference:** User screenshot — vertical strip, one page with white fill + purple/indigo stroke, inactive pages gray.

### Drawer variants

| Component              | ID      | Active source accent | Thumbnail shape        | Open CTA                     |
| ---------------------- | ------- | -------------------- | ---------------------- | ---------------------------- |
| `EvidenceDrawer` (PDF) | `dehEe` | Indigo `#6366f1`     | Tall page rects        | “Open PDF at page 142”       |
| `EvidenceDrawer-PPT`   | `wsDj9` | Orange `#f97316`     | Wide slide rects 56×42 | “Open slide deck at slide 7” |
| `EvidenceDrawer-Wiki`  | `Z1FkX` | Sky `#0ea5e9`        | Section cards with §   | “Open wiki page”             |
| `EvidenceDrawer-Word`  | `VTDIx` | Blue `#2563eb`       | Page rects             | “Open document at page 3”    |
| `EvidenceDrawer-Empty` | `QW7j6` | —                    | —                      | Empty copy per spec          |

**Empty state copy:**

> No source excerpts or supporting notes found for this node.  
> Add sources to your workspace or ask the tutor to cite material.

(Spec exact: `No source excerpts or supporting notes found for this node.`)

### Workspace overlay components

| Component               | ID       | Role                                                             |
| ----------------------- | -------- | ---------------------------------------------------------------- |
| `EvidenceGlassBackdrop` | `Nx9MD`  | 1440×848 frosted veil: `#f1f5f9b3` + `background_blur` radius 16 |
| `EvidenceDrawerDock`    | `O03DNf` | 400×848 right dock shell; refs `dehEe`; left shadow blur 32      |
| `CitationChip`          | `VGyNt`  | Default citation pill                                            |
| `CitationChip-Active`   | `txkNB`  | Filled indigo — indicates drawer opened from this citation       |
| `EvidenceButton-Active` | `L8ay6`  | Header Evidence btn highlighted                                  |

### Evidence showcase pages (standalone)

| Page                      | ID      | Drawer ref |
| ------------------------- | ------- | ---------- |
| `Page / Evidence · PDF`   | `LhoQI` | `dehEe`    |
| `Page / Evidence · PPT`   | `AOyB8` | `wsDj9`    |
| `Page / Evidence · Wiki`  | `J0bAo` | `Z1FkX`    |
| `Page / Evidence · Word`  | `J7wew` | `VTDIx`    |
| `Page / Evidence · Empty` | `Pe9ua` | `QW7j6`    |

### Evidence interaction pattern

**Triggers (any of):**

- Click **citation chip** in chat, concept body, or node card
- Click **Evidence** button in reference surface header
- Click **evidence icon** on node foot (M-tier)
- Canvas **evidence tool** (future)

**Result:**

1. `EvidenceGlassBackdrop` covers full workspace area (including chat)
2. Underlying content → **opacity ~0.5–0.55** + **backdrop blur 4–16**
3. `EvidenceDrawerDock` slides in / appears at **x = viewportWidth − 400**
4. Trigger element shows **active** variant (`txkNB` or `L8ay6`)
5. Close (✕) removes overlay and restores workspace

**Z-order (bottom → top):**

```
dimmed chat + workspace → glass backdrop → evidence drawer
```

---

## Design tokens and visual language

> **Note:** Pencil `get_variables` returns `{}` — all tokens below are **inline** in frames. For implementation, promote to CSS custom properties in `tutorbook.css` / `study-shell.css`.

### Typography

| Role          | Size    | Weight  | Color     |
| ------------- | ------- | ------- | --------- |
| Page title    | 22–24px | 600     | `#0f172a` |
| Section label | 11px    | 700     | `#94a3b8` |
| Body          | 13–15px | 400     | `#334155` |
| Meta          | 10–11px | 400–500 | `#64748b` |
| Citation      | 10px    | 500–600 | `#4f46e5` |

### Mist Glass panel recipe

```css
/* Approximate CSS mapping */
.panel-glass {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(99, 102, 241, 0.12);
  backdrop-filter: blur(12px);
}
```

### Indigo accent system

| Token       | Hex                  | Usage                                  |
| ----------- | -------------------- | -------------------------------------- |
| Primary     | `#6366f1`            | Active tabs, selection rings, spinners |
| Deep        | `#4f46e5`, `#4338ca` | Citation text, active labels           |
| Tint bg     | `#eef2ff`            | Chips, session bar, callouts           |
| Tint border | `#c7d2fe`            | Chip strokes, composer border          |

### Workspace gradient

```text
linear-gradient(135deg, #eef2ff 0%, #f8fafc 50%, #e0e7ff 100%)
```

### Effect patterns

| Effect                 | Values                                           |
| ---------------------- | ------------------------------------------------ |
| Glass shadow           | blur 16, `#6366f115`, offset y:4                 |
| Selection glow         | blur 20, `#8b5cf630`, stroke 2px `#8b5cf6`       |
| Evidence drawer shadow | blur 24–32, `#0f172a18`–`#0f172a20`, offset x:−8 |
| Citation active glow   | blur 8, `#6366f140`                              |
| Evidence glass blur    | `background_blur` radius 16                      |

---

## Complete reusable component catalog

**38 reusable components.** Alphabetical by name.

| Name                                      | ID       | Size     |
| ----------------------------------------- | -------- | -------- |
| `Component/ChatActivityBlock`             | `Icgfv`  | 360×154  |
| `Component/ChatAgentStep`                 | `p4BE3p` | 360×15   |
| `Component/ChatAgentStepRunning`          | `D1kyb`  | 360×15   |
| `Component/ChatCollapsedRail`             | `NCtBe`  | 48×640   |
| `Component/ChatComposer`                  | `esDjV`  | 360×123  |
| `Component/ChatHeader`                    | `TYINm`  | 400×149  |
| `Component/ChatHeader-History`            | `M6kzz`  | 400×149  |
| `Component/ChatHeader-Settings`           | `kV9UJ`  | 400×99   |
| `Component/ChatHistoryView`               | `hff4l`  | 368×480  |
| `Component/ChatPanel`                     | `whFny`  | 400×640  |
| `Component/ChatPanel-History`             | `d8sg2`  | 400×640  |
| `Component/ChatPanel-Settings`            | `w1rfJ`  | 400×640  |
| `Component/ChatSettingsView`              | `C1NQ5O` | 368×520  |
| `Component/ChatThinking`                  | `v4uDIe` | 360×49   |
| `Component/ChatTutorProse`                | `z2HwxR` | 360×68   |
| `Component/ChatUserRow`                   | `NhUKO`  | 360×20   |
| `Component/CitationChip`                  | `VGyNt`  | 93×20    |
| `Component/CitationChip-Active`           | `txkNB`  | 93×20    |
| `Component/EvidenceButton-Active`         | `L8ay6`  | 87×25    |
| `Component/EvidenceDrawer`                | `dehEe`  | 400×640  |
| `Component/EvidenceDrawer-Empty`          | `QW7j6`  | 400×640  |
| `Component/EvidenceDrawer-PPT`            | `wsDj9`  | 400×640  |
| `Component/EvidenceDrawer-Wiki`           | `Z1FkX`  | 400×640  |
| `Component/EvidenceDrawer-Word`           | `VTDIx`  | 400×640  |
| `Component/EvidenceDrawerDock`            | `O03DNf` | 400×848  |
| `Component/EvidenceGlassBackdrop`         | `Nx9MD`  | 1440×848 |
| `Component/EvidenceSnippetThumb`          | `d49tLB` | 56×72    |
| `Component/EvidenceSnippetThumb-Selected` | `sDlup`  | 56×72    |
| `Component/ReferenceSurfaceHeader`        | `a7XKP`  | 1020×136 |
| `Component/StudyNodeScale-L`              | `azNBc`  | 200×168  |
| `Component/StudyNodeScale-M`              | `EML1j`  | 184×112  |
| `Component/StudyNodeScale-S`              | `oOu4m`  | 148×80   |
| `Component/StudyNodeScale-XL`             | `GZwTm`  | 200×220  |
| `Component/StudyNodeScale-XS`             | `w9pjgK` | 112×44   |
| `Component/WorkspaceStatusBar`            | `pDSTm`  | 1020×28  |
| `Component/WorkspaceSurfaceSwitcher`      | `Bn5nK`  | 268×33   |
| `Component/WorkspaceTopbar`               | `O4nHt`  | 1020×52  |

---

## Complete screen and showcase catalog

### Workspace screens (7)

| Name                               | ID       | Size     | Position      |
| ---------------------------------- | -------- | -------- | ------------- |
| Study Map · Chat Expanded          | `rfoMo`  | 1440×900 | (0, 2676)     |
| Study Map · Chat Collapsed         | `y8MAQc` | 1440×900 | (1500, 2676)  |
| Source Wiki                        | `sw865`  | 1440×900 | (0, 3672)     |
| Curriculum                         | `QSqPI`  | 1440×900 | (0, 4668)     |
| Study Map · Evidence open          | `tQmL5`  | 1440×900 | (0, 12944)    |
| Concept · Evidence open            | `KIZi9`  | 1440×900 | (1500, 12944) |
| Evidence drawer overlay (showcase) | `q3abBD` | 1100×700 | (−620, 12164) |

### Reference surface pages (12)

| Name                  | ID       |
| --------------------- | -------- |
| Page / Concept        | `matsU`  |
| Page / Wiki Topic     | `etQ8W`  |
| Page / Curriculum     | `PtBVL`  |
| Page / Module         | `i6V0TE` |
| Page / Quiz           | `pCLJv`  |
| Page / Session        | `aAoQ4`  |
| Page / Source         | `FBeJj`  |
| Page / Flashcards     | `OfOs8`  |
| Page / Worked Example | `P9K2c`  |
| Page / Formula Sheet  | `HkBYM`  |
| Page / Comparison     | `ReKBb`  |
| Page / Live Plan      | `eUIwO`  |

### Evidence pages (5)

| Name                    | ID      |
| ----------------------- | ------- |
| Page / Evidence · PDF   | `LhoQI` |
| Page / Evidence · PPT   | `AOyB8` |
| Page / Evidence · Wiki  | `J0bAo` |
| Page / Evidence · Word  | `J7wew` |
| Page / Evidence · Empty | `Pe9ua` |

### Showcases and labels

| Name                             | ID                                                                      |
| -------------------------------- | ----------------------------------------------------------------------- |
| Node Pack Scale / Header         | `BXIH9`                                                                 |
| Node Pack Scale / Size Legend    | `tDFeN`                                                                 |
| Node Pack Scale / Type Legend    | `BAkUi`                                                                 |
| Node Pack Scale / XL–XS sections | `PKLEw`, `B8gCh`, `UTey9`, `qNHl2`, `E9kSH`, `kcDkD`, `vW4c3`, `w5BsHW` |
| Canvas / Mixed Scale             | `aKfCx`                                                                 |
| Chat Components / Library        | `AiOz9`                                                                 |
| Chat / Tutor History Settings    | `d5XOn`                                                                 |
| Label / Workspace Complete       | `GZR6N`                                                                 |
| Label / Chat Collapsed           | `Ty80Z`                                                                 |
| Label / Source Wiki              | `AwqTl`                                                                 |
| Label / Curriculum               | `i5aqd`                                                                 |
| Label / Evidence interaction     | `qkb77`                                                                 |
| Evidence / Header                | `hsu3e`                                                                 |
| Node Pages / Header              | `WgYCc`                                                                 |
| Workspace / Screen Index         | `glYQo`                                                                 |
| Node Pages / Index               | `E1olU`                                                                 |

---

## Interaction patterns

### Open node from Study Map

1. Click node on canvas → selection ring + status bar update
2. Double-click / Open → replace canvas with reference surface page OR navigate in-place
3. Header **Back to Study Map** returns to graph

### Collapse / expand chat

| State     | Component                     | Width     |
| --------- | ----------------------------- | --------- |
| Expanded  | `ChatPanel` (`whFny`)         | 400px     |
| Collapsed | `ChatCollapsedRail` (`NCtBe`) | 48px seam |

Collapse control: **seam chevrons** on panel edge (not header button).

### Switch workspace surface

`WorkspaceSurfaceSwitcher` (`Bn5nK`): Study Map | Curriculum | Source Wiki

Each mode has dedicated full screen (`rfoMo`, `QSqPI`, `sw865`).

### Open evidence drawer

See [Evidence interaction pattern](#evidence-interaction-pattern).

### Quiz flow (designed, not interactive in Pencil)

1. View questions (MCQ, short answer, numerical)
2. Submit → _feedback states not yet designed_
3. Post-submit → reveal evidence per spec

---

## Implementation handoff

### Suggested React component tree

```
<WorkspaceShell>                    // rfoMo layout
  <WorkspaceTopbar />               // O4nHt
  <WorkspaceBody>
    <ChatPanel />                   // whFny — or ChatCollapsedRail
  <WorkspaceCanvas>
      <SurfaceSwitcher />           // Bn5nK
      <StudyMapCanvas />            // uDg7G — React Flow / custom
      <WorkspaceStatusBar />        // pDSTm
    </WorkspaceCanvas>
  </WorkspaceBody>
  {evidenceOpen && (
    <>
      <EvidenceGlassBackdrop />     // Nx9MD
      <EvidenceDrawerDock />        // O03DNf → EvidenceDrawer
    </>
  )}
</WorkspaceShell>
```

### Key files to wire

| Area             | Codebase path                            |
| ---------------- | ---------------------------------------- |
| Workspace page   | `apps/web/src/NotebookWorkspacePage.tsx` |
| Routing          | `apps/web/src/routing/AppRouter.tsx`     |
| Tutor API        | `apps/api/src/routes/tutor.ts`           |
| Artifacts schema | `packages/schemas/src/artifacts.ts`      |
| Styles           | `apps/web/src/tutorbook.css`             |

### Node rendering

Map Pencil tiers to graph node renderer:

```typescript
type NodeScale = "xl" | "l" | "m" | "s" | "xs";

const NODE_DIMENSIONS: Record<NodeScale, { width: number; height: number }> = {
  xl: { width: 200, height: 220 },
  l: { width: 200, height: 168 },
  m: { width: 184, height: 112 },
  s: { width: 148, height: 80 },
  xs: { width: 112, height: 44 },
};
```

Map `properties.artifactType` → left stripe color + icon per `w5BsHW` designs.

### Evidence drawer state

```typescript
type EvidenceState = {
  open: boolean;
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  activeSourceId?: string;
  activeSnippetId?: string;
  trigger?: "citation" | "evidence-button" | "node-icon";
};
```

### SSE → chat UI

```
tool_start/end  → ChatAgentStep / ChatAgentStepRunning
thinking        → ChatThinking
text (mid-run)  → plain <p> in thread order
text (final)    → ChatTutorProse + CitationChip + feedback
run_finished    → enable feedback controls
```

### CSS for evidence overlay

```css
.workspace-evidence-open .workspace-body,
.workspace-evidence-open .chat-panel {
  opacity: 0.55;
  filter: blur(2px); /* subtle; backdrop on overlay does heavy lifting */
  pointer-events: none;
}

.evidence-glass-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(241, 245, 249, 0.7);
  backdrop-filter: blur(16px);
  z-index: 40;
}

.evidence-drawer-dock {
  position: fixed;
  top: 52px; /* below topbar */
  right: 0;
  width: 400px;
  height: calc(100vh - 52px);
  z-index: 50;
  background: #fff;
  border-left: 1px solid #e2e8f0;
  box-shadow: -8px 0 32px rgba(15, 23, 42, 0.12);
}
```

---

## Pencil MCP workflow notes

### Rules

1. **Never** `Read` or `Grep` `.pen` files — they are encrypted; use Pencil MCP only.
2. File must be open in **Pencil canvas view** (not text editor) for MCP to work.
3. Use `batch_design` with `filePath: ".../nodes.pen"` and `input` string.

### Common operations

```javascript
// Insert
frame=Insert(document, {type: "frame", name: "MyFrame", ...})
Insert(frame, {type: "text", content: "Hello", fill: "#0f172a"})

// Copy screen
Copy("rfoMo", document, {name: "New Screen", x: 0, y: 14000})

// Instance customization
Insert(parent, {type: "ref", ref: "a7XKP", descendants: {"dI8NP": {content: "My title"}}})

// Find space
pos = FindEmptySpace({width: 1440, height: 900, direction: "bottom", padding: 80, nodeId: "E1olU"})
```

### Pitfalls encountered in this project

| Issue                                               | Fix                                           |
| --------------------------------------------------- | --------------------------------------------- |
| `I()` undefined                                     | Use `Insert()`                                |
| `strokeWidth` inside `stroke` object                | Put `strokeWidth` at frame top level          |
| `padding` on text nodes                             | Wrap text in a frame                          |
| `parent/child` paths in Replace                     | Use node IDs directly                         |
| Theme on components makes all themes look identical | Set `theme` on each **ref instance**          |
| Flexbox ignores `x`/`y`                             | Set parent `layout: "none"` for overlays      |
| `Copy` into empty reusable component failed         | Rebuild as new component                      |
| `get_screenshot` on large frames                    | Screenshot individual components              |
| `U()` not defined                                   | Use `Update("nodeId", {...})`                 |
| `Replace` inside reusable components                | May fail; customize via `descendants` on refs |

### Useful MCP tools

| Tool               | Use                                   |
| ------------------ | ------------------------------------- |
| `get_editor_state` | Active file, schema                   |
| `batch_get`        | Read node trees by ID or pattern      |
| `batch_design`     | Insert, Update, Copy, Delete, Replace |
| `snapshot_layout`  | Bounds and layout debugging           |
| `get_screenshot`   | Visual verification                   |
| `FindEmptySpace`   | Place new frames without overlap      |

---

## Spec alignment checklist

| Spec doc                                | `nodes.pen` coverage                                                 |
| --------------------------------------- | -------------------------------------------------------------------- |
| `04-tutor-chat.md`                      | Chat panel zones, modes, activity stream, composer, history/settings |
| `05-workspace-study-map-source-wiki.md` | Three surfaces, status bar, floating switcher, selection             |
| `06-node-design-system.md`              | Type families, readiness, evidence affordance, scale tiers           |
| `07-reference-surfaces-evidence.md`     | All surface types, evidence drawer anatomy, empty state, citations   |
| `08-artifacts.md`                       | Quiz, flashcards, worked example, formula sheet, comparison          |
| `11-implementation-handoff.md`          | AG-UI stream mapping, SSE events                                     |

### Gaps vs spec (intentional or pending)

- [ ] Quiz correct/incorrect feedback states after submit
- [ ] Regenerating / regeneration error states on surfaces
- [ ] Dev Mode claim debug rows in evidence drawer
- [ ] Objective List as embedded-only (not standalone page) — **correct, no standalone page**
- [ ] Note artifact editor page
- [ ] Dark mode variants
- [ ] Graph edge / connector styling
- [ ] Wire node-open → canvas transition animation

---

## Not yet designed / optional follow-ups

From session offers and transcript:

- [ ] Sync tokens into `study-shell.css` / `tutorbook.css`
- [ ] Prototype layout in `apps/web` (`NotebookWorkspacePage.tsx`)
- [ ] Quiz feedback states (correct/incorrect)
- [ ] Note editor reference page
- [ ] Wire node pages into workspace mock (open replaces canvas)
- [ ] Dark mode node pack + evidence variants
- [ ] Copy designs into `untitled.pen` hosted-beta pack beside `g4gt0R`
- [ ] Remaining admin detail pages (in `untitled.pen` page pack)
- [ ] Aurora / Atlas / Folio shell variants with variable-size nodes
- [ ] Edge selection and projection warning UI
- [ ] `DESIGN.md` from impeccable document skill
- [ ] Formal Pencil design variables (currently all inline)

---

## Quick ID lookup (most referenced)

| What                 | ID       |
| -------------------- | -------- |
| Study Map workspace  | `rfoMo`  |
| Chat panel           | `whFny`  |
| Chat header          | `TYINm`  |
| Workspace topbar     | `O4nHt`  |
| Node M default       | `EML1j`  |
| Node XL planning     | `GZwTm`  |
| Reference header     | `a7XKP`  |
| Concept page         | `matsU`  |
| Quiz page            | `pCLJv`  |
| Source page          | `FBeJj`  |
| Evidence drawer PDF  | `dehEe`  |
| Evidence glass       | `Nx9MD`  |
| Evidence dock        | `O03DNf` |
| Citation chip        | `VGyNt`  |
| Workspace + evidence | `tQmL5`  |
| Concept + evidence   | `KIZi9`  |
| Workspace index      | `glYQo`  |
| Node pages index     | `E1olU`  |
| Mixed scale canvas   | `aKfCx`  |

---

## Related canonical frames in other files

| ID       | Name                                    | File                          |
| -------- | --------------------------------------- | ----------------------------- |
| `g4gt0R` | Var 1 · Mist Glass (canonical shell v2) | `untitled.pen`                |
| `j1YyR`  | Focus map (chat collapsed)              | `untitled.pen` / `design.pen` |
| `rAWXt`  | Node Pack Glass (fixed 184×112)         | `untitled.pen`                |

The **variable-size** pack in `nodes.pen` supersedes fixed-size `rAWXt` for Study Map density; fixed-size pack remains valid for simpler graph renderers.

---

_This document is the single source of truth for the `nodes.pen` design kit. Update it when adding frames to the Pencil file._
