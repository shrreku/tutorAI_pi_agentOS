# UI Examples — Mist Glass (Screen 1) Design Kit

PNG exports of every frame and reusable component in [`nodes.pen`](../../nodes.pen).  
Full design documentation: [`NODES_PEN.md`](../../NODES_PEN.md).

**Source:** Pencil `export_nodes` (2× scale for components, 1× for full screens)  
**Exported:** 2026-06-21 · **84 screenshots**

---

## Folder structure

```
ui-example/mist-glass/
├── node-pack/              # Variable-size node scale showcases (XL→XS)
├── node-components/        # Reusable study node components
├── workspace-components/   # Topbar, surface switcher, status bar
├── workspace-screens/      # Full 1440×900 workspace screens
├── chat-components/        # Tutor panel parts
├── chat-showcases/         # Component library + tab showcase
├── reference-components/   # Shared reference page header
├── reference-surfaces/     # Full-page node views (concept, quiz, etc.)
├── evidence-components/    # Drawer, thumbs, citations, glass overlay
├── evidence-pages/         # Evidence drawer variant showcases
├── evidence-workspace/     # Workspace + evidence drawer open
└── indices/                # Canvas index / label frames
```

---

## node-pack/

Variable-size study map nodes (21hrs-inspired). Mist Glass aesthetic.

| File                                                                     | Pencil ID | Description                                                   |
| ------------------------------------------------------------------------ | --------- | ------------------------------------------------------------- |
| [00-header.png](./node-pack/00-header.png)                               | `BXIH9`   | Section title + philosophy                                    |
| [01-size-legend.png](./node-pack/01-size-legend.png)                     | `tDFeN`   | XL / L / M / S / XS use cases                                 |
| [02-type-legend.png](./node-pack/02-type-legend.png)                     | `BAkUi`   | Type → accent color reference                                 |
| [03-xl-planning.png](./node-pack/03-xl-planning.png)                     | `PKLEw`   | XL Live Plan + objective stack                                |
| [04-l-curriculum.png](./node-pack/04-l-curriculum.png)                   | `B8gCh`   | L Curriculum anchor nodes                                     |
| [05-m-gateway.png](./node-pack/05-m-gateway.png)                         | `UTey9`   | M gateway variants (source, concept, session, wiki, artifact) |
| [06-s-compact.png](./node-pack/06-s-compact.png)                         | `qNHl2`   | S compact objective / topic pins                              |
| [07-xs-pins.png](./node-pack/07-xs-pins.png)                             | `E9kSH`   | XS map punctuation pins                                       |
| [08-states.png](./node-pack/08-states.png)                               | `kcDkD`   | Default · Selected · Current path                             |
| [09-sample-canvas-section.png](./node-pack/09-sample-canvas-section.png) | `vW4c3`   | Mixed-scale canvas section frame                              |
| [10-mixed-scale-canvas.png](./node-pack/10-mixed-scale-canvas.png)       | `aKfCx`   | Composed XL/L/M/S/XS on gradient canvas                       |
| [11-artifacts.png](./node-pack/11-artifacts.png)                         | `w5BsHW`  | Typed artifact nodes (quiz, flashcards, etc.)                 |

---

## node-components/

| File                                                                 | Pencil ID | Size    | Component             |
| -------------------------------------------------------------------- | --------- | ------- | --------------------- |
| [study-node-scale-xl.png](./node-components/study-node-scale-xl.png) | `GZwTm`   | 200×220 | Planning stack anchor |
| [study-node-scale-l.png](./node-components/study-node-scale-l.png)   | `azNBc`   | 200×168 | Curriculum anchor     |
| [study-node-scale-m.png](./node-components/study-node-scale-m.png)   | `EML1j`   | 184×112 | Default gateway node  |
| [study-node-scale-s.png](./node-components/study-node-scale-s.png)   | `oOu4m`   | 148×80  | Compact bracket pin   |
| [study-node-scale-xs.png](./node-components/study-node-scale-xs.png) | `w9pjgK`  | 112×44  | Map punctuation pin   |

---

## workspace-components/

| File                                                                                    | Pencil ID | Component                          |
| --------------------------------------------------------------------------------------- | --------- | ---------------------------------- |
| [workspace-topbar.png](./workspace-components/workspace-topbar.png)                     | `O4nHt`   | Logo, title, search, credits       |
| [workspace-surface-switcher.png](./workspace-components/workspace-surface-switcher.png) | `Bn5nK`   | Study Map / Curriculum / Wiki tabs |
| [workspace-status-bar.png](./workspace-components/workspace-status-bar.png)             | `pDSTm`   | Node count, selection, objective   |

---

## workspace-screens/

Full **1440×900** workspace layouts.

| File                                                             | Pencil ID | Screen                                                     |
| ---------------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| [study-map.png](./workspace-screens/study-map.png)               | `sTdmJ`   | Study Map Workspace (Full-Width, Centered, No Chat)        |
| [dashboard.png](./workspace-screens/dashboard.png)               | `vsrEX`   | Mist Glass Dashboard page (translucent bento grid)         |
| [source-wiki.png](./workspace-screens/source-wiki.png)           | `sw865`   | Source Wiki with topic sidebar                             |
| [curriculum.png](./workspace-screens/curriculum.png)             | `QSqPI`   | Curriculum path + module timeline                          |
| [interactive-quiz.png](./workspace-screens/interactive-quiz.png) | `sMNzU`   | Interactive Quiz Workspace (Full-Width, Centered, No Chat) |
| [evidence-open.png](./workspace-screens/evidence-open.png)       | `tQmL5`   | Study Map Workspace with active evidence drawer            |

---

## chat-components/

| File                                                                         | Pencil ID | Component                         |
| ---------------------------------------------------------------------------- | --------- | --------------------------------- |
| [chat-user-row.png](./chat-components/chat-user-row.png)                     | `NhUKO`   | User message bubble               |
| [chat-agent-step.png](./chat-components/chat-agent-step.png)                 | `p4BE3p`  | Completed agent step              |
| [chat-agent-step-running.png](./chat-components/chat-agent-step-running.png) | `D1kyb`   | In-progress step (spinner)        |
| [chat-thinking.png](./chat-components/chat-thinking.png)                     | `v4uDIe`  | Thinking block                    |
| [chat-tutor-prose.png](./chat-components/chat-tutor-prose.png)               | `z2HwxR`  | Tutor reply + citation chip       |
| [chat-activity-block.png](./chat-components/chat-activity-block.png)         | `Icgfv`   | Collapsible agent activity stream |
| [chat-composer.png](./chat-components/chat-composer.png)                     | `esDjV`   | Input + send                      |
| [chat-header-tutor.png](./chat-components/chat-header-tutor.png)             | `TYINm`   | Header — Tutor tab active         |
| [chat-header-history.png](./chat-components/chat-header-history.png)         | `M6kzz`   | Header — History tab active       |
| [chat-header-settings.png](./chat-components/chat-header-settings.png)       | `kV9UJ`   | Header — Settings tab active      |
| [chat-history-view.png](./chat-components/chat-history-view.png)             | `hff4l`   | Session list                      |
| [chat-settings-view.png](./chat-components/chat-settings-view.png)           | `C1NQ5O`  | Settings panel                    |
| [chat-panel.png](./chat-components/chat-panel.png)                           | `whFny`   | Full tutor panel                  |
| [chat-panel-history.png](./chat-components/chat-panel-history.png)           | `d8sg2`   | History panel                     |
| [chat-panel-settings.png](./chat-components/chat-panel-settings.png)         | `w1rfJ`   | Settings panel                    |
| [chat-collapsed-rail.png](./chat-components/chat-collapsed-rail.png)         | `NCtBe`   | Collapsed chat seam + FAB         |

---

## chat-showcases/

| File                                                                                        | Pencil ID | Description               |
| ------------------------------------------------------------------------------------------- | --------- | ------------------------- |
| [chat-components-library.png](./chat-showcases/chat-components-library.png)                 | `AiOz9`   | Catalog of all chat parts |
| [tutor-history-settings-showcase.png](./chat-showcases/tutor-history-settings-showcase.png) | `d5XOn`   | Side-by-side tab states   |

---

## reference-components/

| File                                                                                | Pencil ID | Component                                         |
| ----------------------------------------------------------------------------------- | --------- | ------------------------------------------------- |
| [reference-surface-header.png](./reference-components/reference-surface-header.png) | `a7XKP`   | Back link, Evidence, Ask tutor, type badge, title |

---

## reference-surfaces/

Full **1020×720** openable node pages.

| File                                                                    | Pencil ID | Page                                |
| ----------------------------------------------------------------------- | --------- | ----------------------------------- |
| [page-concept.png](./reference-surfaces/page-concept.png)               | `matsU`   | Concept — SN2 mechanism             |
| [page-wiki-topic.png](./reference-surfaces/page-wiki-topic.png)         | `etQ8W`   | Wiki topic                          |
| [page-curriculum.png](./reference-surfaces/page-curriculum.png)         | `PtBVL`   | Curriculum path                     |
| [page-module.png](./reference-surfaces/page-module.png)                 | `i6V0TE`  | Module checklist                    |
| [page-quiz.png](./reference-surfaces/page-quiz.png)                     | `pCLJv`   | Quiz — MCQ, short answer, numerical |
| [page-session.png](./reference-surfaces/page-session.png)               | `aAoQ4`   | Session reopen + produced items     |
| [page-source.png](./reference-surfaces/page-source.png)                 | `FBeJj`   | Source reader + page thumbnails     |
| [page-flashcards.png](./reference-surfaces/page-flashcards.png)         | `OfOs8`   | Flashcards + SM-2 ratings           |
| [page-worked-example.png](./reference-surfaces/page-worked-example.png) | `P9K2c`   | Step-reveal worked example          |
| [page-formula-sheet.png](./reference-surfaces/page-formula-sheet.png)   | `HkBYM`   | Formula reference table             |
| [page-comparison.png](./reference-surfaces/page-comparison.png)         | `ReKBb`   | SN1 vs SN2 comparison               |
| [page-live-plan.png](./reference-surfaces/page-live-plan.png)           | `eUIwO`   | Live plan + objective stack         |

---

## evidence-components/

| File                                                                                             | Pencil ID | Component                          |
| ------------------------------------------------------------------------------------------------ | --------- | ---------------------------------- |
| [evidence-snippet-thumb.png](./evidence-components/evidence-snippet-thumb.png)                   | `d49tLB`  | Default page thumbnail             |
| [evidence-snippet-thumb-selected.png](./evidence-components/evidence-snippet-thumb-selected.png) | `sDlup`   | Selected thumbnail (indigo border) |
| [evidence-drawer-pdf.png](./evidence-components/evidence-drawer-pdf.png)                         | `dehEe`   | PDF evidence drawer                |
| [evidence-drawer-ppt.png](./evidence-components/evidence-drawer-ppt.png)                         | `wsDj9`   | PPT slide drawer                   |
| [evidence-drawer-wiki.png](./evidence-components/evidence-drawer-wiki.png)                       | `Z1FkX`   | Wiki section drawer                |
| [evidence-drawer-word.png](./evidence-components/evidence-drawer-word.png)                       | `VTDIx`   | Word document drawer               |
| [evidence-drawer-empty.png](./evidence-components/evidence-drawer-empty.png)                     | `QW7j6`   | Empty evidence state               |
| [citation-chip.png](./evidence-components/citation-chip.png)                                     | `VGyNt`   | Inline citation pill               |
| [citation-chip-active.png](./evidence-components/citation-chip-active.png)                       | `txkNB`   | Active citation (drawer open)      |
| [evidence-glass-backdrop.png](./evidence-components/evidence-glass-backdrop.png)                 | `Nx9MD`   | Frosted workspace scrim            |
| [evidence-drawer-dock.png](./evidence-components/evidence-drawer-dock.png)                       | `O03DNf`  | Right-edge dock shell              |
| [evidence-button-active.png](./evidence-components/evidence-button-active.png)                   | `L8ay6`   | Active Evidence header button      |

---

## evidence-pages/

Standalone evidence drawer showcases (420×680 frames).

| File                                                                        | Pencil ID | Variant             |
| --------------------------------------------------------------------------- | --------- | ------------------- |
| [page-evidence-pdf.png](./evidence-pages/page-evidence-pdf.png)             | `LhoQI`   | PDF source          |
| [page-evidence-ppt.png](./evidence-pages/page-evidence-ppt.png)             | `AOyB8`   | PPT source          |
| [page-evidence-wiki.png](./evidence-pages/page-evidence-wiki.png)           | `J0bAo`   | Wiki source         |
| [page-evidence-word.png](./evidence-pages/page-evidence-word.png)           | `J7wew`   | Word source         |
| [page-evidence-empty.png](./evidence-pages/page-evidence-empty.png)         | `Pe9ua`   | Empty state         |
| [evidence-section-header.png](./evidence-pages/evidence-section-header.png) | `hsu3e`   | Section title frame |

---

## evidence-workspace/

Workspace with evidence drawer open (glass overlay).

| File                                                                                              | Pencil ID | Screen                                       |
| ------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------- |
| [study-map-evidence-open.png](./evidence-workspace/study-map-evidence-open.png)                   | `tQmL5`   | Study Map + frosted workspace + right drawer |
| [concept-evidence-open.png](./evidence-workspace/concept-evidence-open.png)                       | `KIZi9`   | Concept page + glass + drawer                |
| [evidence-drawer-overlay-showcase.png](./evidence-workspace/evidence-drawer-overlay-showcase.png) | `q3abBD`  | Early overlay showcase                       |

---

## indices/

Canvas navigation / label frames from the Pencil file.

| File                                                                       | Pencil ID | Frame                        |
| -------------------------------------------------------------------------- | --------- | ---------------------------- |
| [label-workspace-complete.png](./indices/label-workspace-complete.png)     | `GZR6N`   | Label / Workspace Complete   |
| [label-chat-collapsed.png](./indices/label-chat-collapsed.png)             | `Ty80Z`   | Label / Chat Collapsed       |
| [label-source-wiki.png](./indices/label-source-wiki.png)                   | `AwqTl`   | Label / Source Wiki          |
| [label-curriculum.png](./indices/label-curriculum.png)                     | `i5aqd`   | Label / Curriculum           |
| [label-evidence-interaction.png](./indices/label-evidence-interaction.png) | `qkb77`   | Label / Evidence interaction |
| [workspace-screen-index.png](./indices/workspace-screen-index.png)         | `glYQo`   | Workspace / Screen Index     |
| [node-pages-header.png](./indices/node-pages-header.png)                   | `WgYCc`   | Node Pages / Header          |
| [node-pages-index.png](./indices/node-pages-index.png)                     | `E1olU`   | Node Pages / Index           |

---

## Re-exporting

If `nodes.pen` changes, re-export with Pencil MCP:

```json
{
  "tool": "export_nodes",
  "filePath": "nodes.pen",
  "outputDir": "ui-example/mist-glass/<folder>",
  "nodeIds": ["<id>"],
  "format": "png",
  "scale": 2
}
```

Use **scale 1** for frames ≥ 1020px wide. Export one node at a time if batch calls fail.
