# UI Examples — Folio (Screen 5) Design Kit

PNG exports of every frame and reusable component in the **Folio (Screen 5) Editorial theme** inside [`untitled.pen`](../../../untitled.pen) and [`gemini.pen`](../../../gemini.pen).
Full design documentation: [13-folio-design-kit.md](../../../docs/frontend/13-folio-design-kit.md) (backlog + catalog) and [`NODES_PEN.md`](../../../NODES_PEN.md) (interaction patterns).

**Source:** Pencil `export_nodes` (2× scale for components, 1× for full screens)  
**Exported:** 2026-06-25 · **34 screenshots**  
**Role:** Canonical Folio visual reference for the clean-room frontend. Complete behavior and state coverage before aesthetic polish.

### Completeness gaps (vs `mist-glass/`)

Folio is not yet at kit parity. Missing categories to design in Folio's editorial language:

| Category                | Status                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Tutor chat kit          | Partial — tabs + composer only; missing activity stream, history/settings panels, collapsed rail |
| Evidence components     | Partial — dock shell only; missing citation chips, snippet thumbs, per-format drawers            |
| Workspace chrome        | Missing — surface switcher, status bar                                                           |
| Chat showcases, indices | Not started                                                                                      |

Use [`ui-example/mist-glass/`](../../../ui-example/mist-glass/README.md) only as an anatomy checklist; [`NODES_PEN.md`](../../../NODES_PEN.md) documents interaction patterns.

---

## Folder structure

```
frontend-examples/folio/screenshots/
├── node-pack/              # Variable-size node scale showcases (XL→XS)
├── node-components/        # Reusable study node components (Editorial Ivory)
├── workspace-screens/      # Full 1440×900 workspace screens
├── chat-components/        # Tutor panel parts (Tabs, Composer)
├── reference-components/   # Shared reference page header
├── reference-surfaces/     # Full-page node views (worked example, comparison, etc.)
├── evidence-components/    # Drawer dock shell
├── evidence-pages/         # Standalone evidence drawer variant showcases
└── evidence-workspace/     # Workspace + evidence drawer open overlays
```

---

## node-pack/

Variable-size study map nodes (21hrs-inspired). Editorial Ivory aesthetic.

| File                                                                     | Pencil ID | Description                                                   |
| ------------------------------------------------------------------------ | --------- | ------------------------------------------------------------- |
| [00-header.png](./node-pack/00-header.png)                               | `znwGn`   | Section title + philosophy                                    |
| [01-size-legend.png](./node-pack/01-size-legend.png)                     | `AQDmb`   | XL / L / M / S / XS use cases                                 |
| [02-type-legend.png](./node-pack/02-type-legend.png)                     | `MAZrE`   | Type → accent color reference                                 |
| [03-xl-planning.png](./node-pack/03-xl-planning.png)                     | `RtOEi`   | XL Live Plan + objective stack                                |
| [04-l-curriculum.png](./node-pack/04-l-curriculum.png)                   | `AC1hs`   | L Curriculum anchor nodes                                     |
| [05-m-gateway.png](./node-pack/05-m-gateway.png)                         | `bMtX5`   | M gateway variants (source, concept, session, wiki, artifact) |
| [06-s-compact.png](./node-pack/06-s-compact.png)                         | `FE9Yr`   | S compact objective / topic pins                              |
| [07-xs-pins.png](./node-pack/07-xs-pins.png)                             | `YgTiF`   | XS map punctuation pins                                       |
| [08-states.png](./node-pack/08-states.png)                               | `t0vhl`   | Default · Selected · Completed · Locked states                |
| [09-sample-canvas-section.png](./node-pack/09-sample-canvas-section.png) | `U3WWBW`  | Mixed-scale canvas section frame                              |
| [10-mixed-scale-canvas.png](./node-pack/10-mixed-scale-canvas.png)       | `O4mkCa`  | Composed XL/L/M/S/XS on warm background                       |
| [11-artifacts.png](./node-pack/11-artifacts.png)                         | `m8Ddg`   | Typed artifact nodes (quiz, flashcards, etc.)                 |

---

## node-components/

Reusable study map node components in the editorial warm ivory theme.

| File                                                                 | Pencil ID | Size    | Component             |
| -------------------------------------------------------------------- | --------- | ------- | --------------------- |
| [study-node-scale-xl.png](./node-components/study-node-scale-xl.png) | `sNGOM`   | 200×220 | Planning stack anchor |
| [study-node-scale-l.png](./node-components/study-node-scale-l.png)   | `Y2PGui`  | 200×168 | Curriculum anchor     |
| [study-node-scale-m.png](./node-components/study-node-scale-m.png)   | `bHhyr`   | 184×112 | Default gateway node  |
| [study-node-scale-s.png](./node-components/study-node-scale-s.png)   | `Gplim`   | 148×80  | Compact bracket pin   |
| [study-node-scale-xs.png](./node-components/study-node-scale-xs.png) | `MAQ69`   | 112×44  | Map punctuation pin   |

---

## workspace-screens/

Full **1440×900** workspace layouts (Editorial theme, warm ivory scrims, serif displaying, sans labels).

| File                                                             | Pencil ID | Screen                                                                      |
| ---------------------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| [study-map.png](./workspace-screens/study-map.png)               | `rh9El`   | Folio Study Map Workspace (Full-Width, Centered, No Chat)                   |
| [source-wiki.png](./workspace-screens/source-wiki.png)           | `zn4aP`   | Folio Source Wiki with topic sidebar (Full-Width, No Chat)                  |
| [curriculum.png](./workspace-screens/curriculum.png)             | `wvyLU`   | Folio Curriculum path + module timeline (Full-Width, Spaced Out, No Chat)   |
| [evidence-open.png](./workspace-screens/evidence-open.png)       | `ulGd5`   | Folio Study Map with active evidence drawer (Full-Width, Centered, No Chat) |
| [interactive-quiz.png](./workspace-screens/interactive-quiz.png) | `IDi3o`   | Folio Study Map with quiz panel open (Full-Width, Centered, No Chat)        |
| [dashboard.png](./workspace-screens/dashboard.png)               | `btkBw`   | Folio Editorial Dashboard page (library index card layout)                  |

---

## chat-components/

Editorial style chat components.

| File                                                         | Pencil ID | Component                                  |
| ------------------------------------------------------------ | --------- | ------------------------------------------ |
| [folio-chat-tabs.png](./chat-components/folio-chat-tabs.png) | `k3B9t`   | Header — tabs for Tutor, History, Settings |
| [chat-composer.png](./chat-components/chat-composer.png)     | `f64En`   | Input + send container                     |

---

## reference-components/

| File                                                                                | Pencil ID | Component                                                                           |
| ----------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| [reference-surface-header.png](./reference-components/reference-surface-header.png) | `PaWJ7`   | Editorial back link, Evidence indicator, Ask tutor control, page badge, serif title |

---

## reference-surfaces/

Full **1020×720** openable node pages styled with Folio editorial specs (serif body text, warm backgrounds, sage buttons).

| File                                                                    | Pencil ID | Page                                 |
| ----------------------------------------------------------------------- | --------- | ------------------------------------ |
| [page-concept.png](./reference-surfaces/page-concept.png)               | `riwmQ`   | Concept — SN2 mechanism              |
| [page-wiki-topic.png](./reference-surfaces/page-wiki-topic.png)         | `hveFo`   | Wiki topic page                      |
| [page-curriculum.png](./reference-surfaces/page-curriculum.png)         | `aothd`   | Curriculum pathway                   |
| [page-module.png](./reference-surfaces/page-module.png)                 | `DOr72`   | Module checklist                     |
| [page-quiz.png](./reference-surfaces/page-quiz.png)                     | `qVm2J`   | Quiz MCQ/Short answer/Numerical deck |
| [page-session.png](./reference-surfaces/page-session.png)               | `AzUDW`   | Session overview                     |
| [page-source.png](./reference-surfaces/page-source.png)                 | `aYn3j`   | Source reader                        |
| [page-flashcards.png](./reference-surfaces/page-flashcards.png)         | `C3Vbf`   | Flashcards + SM-2 rating controls    |
| [page-worked-example.png](./reference-surfaces/page-worked-example.png) | `eiTY0`   | Step-reveal worked example           |
| [page-formula-sheet.png](./reference-surfaces/page-formula-sheet.png)   | `aEzDV`   | Formula reference sheet table        |
| [page-comparison.png](./reference-surfaces/page-comparison.png)         | `Gm1MV`   | Side-by-side comparison page         |
| [page-live-plan.png](./reference-surfaces/page-live-plan.png)           | `qovGy`   | Planning stack roadmap               |
| [widget-library.png](./reference-surfaces/widget-library.png)           | `iQ9DY`   | Dashboard Widget Library             |

---

## evidence-components/

| File                                                                       | Pencil ID | Component                              |
| -------------------------------------------------------------------------- | --------- | -------------------------------------- |
| [evidence-drawer-dock.png](./evidence-components/evidence-drawer-dock.png) | `Ki6X9`   | Right-side drawer dock shell component |

---

## evidence-pages/

Standalone evidence drawer variant showcases (400×848 frames).

| File                                                                | Pencil ID | Variant                     |
| ------------------------------------------------------------------- | --------- | --------------------------- |
| [page-evidence-pdf.png](./evidence-pages/page-evidence-pdf.png)     | `qwLCV`   | PDF source document         |
| [page-evidence-ppt.png](./evidence-pages/page-evidence-ppt.png)     | `CiGrK`   | PPT slide deck source       |
| [page-evidence-wiki.png](./evidence-pages/page-evidence-wiki.png)   | `NY2a3`   | wiki topic source           |
| [page-evidence-word.png](./evidence-pages/page-evidence-word.png)   | `kAQSd`   | Word document source        |
| [page-evidence-empty.png](./evidence-pages/page-evidence-empty.png) | `G4T4NC`  | Empty evidence drawer state |

---

## evidence-workspace/

Workspace layouts with evidence drawer open (frosted warm ivory backdrop scrim).

| File                                                                            | Pencil ID | Screen                                                          |
| ------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| [study-map-evidence-open.png](./evidence-workspace/study-map-evidence-open.png) | `FrNxk`   | Study Map + frosted workspace overlay + open evidence drawer    |
| [concept-evidence-open.png](./evidence-workspace/concept-evidence-open.png)     | `FgyIo`   | Concept page + frosted workspace overlay + open evidence drawer |

---

## Re-exporting

To update the screenshots if the design file changes, use the Pencil MCP `export_nodes` tool:

```json
{
  "tool": "export_nodes",
  "filePath": "untitled.pen",
  "outputDir": "frontend-examples/folio/screenshots/<folder>",
  "nodeIds": ["<id>"],
  "format": "png",
  "scale": 1
}
```

Use **scale 2** for reusable components in `node-components`, `chat-components`, `reference-components`, and `evidence-components` to preserve crispness. Use **scale 1** for all full screens, reference surfaces, and evidence pages.
