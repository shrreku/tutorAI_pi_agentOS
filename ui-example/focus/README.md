# UI Examples — Focus (Screen 8) Design Kit

PNG exports of every frame, component, and workspace layout in the **Focus (Screen 8) Minimalist theme** inside [`untitled.pen`](../../untitled.pen) and [`gemini.pen`](../../gemini.pen).  
Full design documentation: [`NODES_PEN.md`](../../NODES_PEN.md) and [`walkthrough.md`](../../walkthrough.md).

**Source:** Pencil `export_nodes` (2× scale for components, 1× for full screens/windows)  
**Exported:** 2026-06-25 · **17 screenshots**

---

## Folder structure

```
ui-example/focus/
├── node-components/        # Reusable study node components (Minimalist Slate/Blue)
├── chat-components/        # Floating bottom navigation dock
├── reference-components/   # Header/Topbar
├── workspace-screens/      # Full 1440×900 workspace and dashboard screens
├── reference-surfaces/     # Center-floating workspace windows (wiki, curriculum, quiz)
├── evidence-components/    # Focus evidence drawer shell dock
├── evidence-pages/         # Focus evidence drawer panel
└── evidence-workspace/     # Workspace + active evidence drawer open
```

---

## node-components/

Reusable study map nodes styled in the minimalist Slate & Blue Focus theme.

| File                                                                 | Pencil ID | Size    | Component               |
| -------------------------------------------------------------------- | --------- | ------- | ----------------------- |
| [study-node-scale-xl.png](./node-components/study-node-scale-xl.png) | `h52y7`   | 180×160 | Focus XL Planning Node  |
| [study-node-scale-l.png](./node-components/study-node-scale-l.png)   | `yyYBI`   | 180×120 | Focus L Curriculum Node |
| [study-node-scale-m.png](./node-components/study-node-scale-m.png)   | `KxTvI`   | 180×100 | Focus M gateway node    |

---

## chat-components/

Minimalist navigation controls.

| File                                                     | Pencil ID | Component                                          |
| -------------------------------------------------------- | --------- | -------------------------------------------------- |
| [floating-dock.png](./chat-components/floating-dock.png) | `IgY3C`   | Floating bottom navigation dock with utility icons |

---

## reference-components/

Shared workspace and page headers.

| File                                            | Pencil ID | Component                                              |
| ----------------------------------------------- | --------- | ------------------------------------------------------ |
| [topbar.png](./reference-components/topbar.png) | `DujSY`   | Clean top navbar with serif title and status indicator |

---

## workspace-screens/

Full **1440×900** workspace layouts (Minimalist distraction-free Slate theme on warm grey/sand backgrounds).

| File                                                             | Pencil ID | Screen                                                            |
| ---------------------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| [study-map.png](./workspace-screens/study-map.png)               | `CzEKf`   | Focus Study Map Workspace (Full-Width, Centered, No Chat)         |
| [source-wiki.png](./workspace-screens/source-wiki.png)           | `V8TA1`   | Focus Source Wiki Window Workspace (Full-Width, No Chat)          |
| [curriculum.png](./workspace-screens/curriculum.png)             | `e7Z3SG`  | Focus Curriculum Timeline Workspace (Full-Width, No Chat)         |
| [evidence-open.png](./workspace-screens/evidence-open.png)       | `CRdFM`   | Focus Study Map with active evidence drawer (Full-Width, No Chat) |
| [interactive-quiz.png](./workspace-screens/interactive-quiz.png) | `yHWLE`   | Focus Study Map with quiz window open (Full-Width, No Chat)       |
| [dashboard.png](./workspace-screens/dashboard.png)               | `UxJv1`   | Focus Minimalist Dashboard page (distraction-free layout)         |

---

## reference-surfaces/

Center-floating overlay workspace window pages.

| File                                                            | Pencil ID | Page                                              |
| --------------------------------------------------------------- | --------- | ------------------------------------------------- |
| [page-wiki-topic.png](./reference-surfaces/page-wiki-topic.png) | `To3nS`   | Focus Wiki reading window with rate formula block |
| [page-curriculum.png](./reference-surfaces/page-curriculum.png) | `S3J3TY`  | Focus Curriculum module checklist timeline window |
| [page-quiz.png](./reference-surfaces/page-quiz.png)             | `yPbp3`   | Focus Quiz window featuring poll option cards     |

---

## evidence-components/

| File                                                                       | Pencil ID | Size    | Component                                     |
| -------------------------------------------------------------------------- | --------- | ------- | --------------------------------------------- |
| [evidence-drawer-dock.png](./evidence-components/evidence-drawer-dock.png) | `g4fSQs`  | 400×848 | Minimalist Focus evidence drawer dock outline |

---

## evidence-pages/

Right-docked evidence drawer Variant.

| File                                                    | Pencil ID | Variant                                        |
| ------------------------------------------------------- | --------- | ---------------------------------------------- |
| [page-evidence.png](./evidence-pages/page-evidence.png) | `g4fSQs`  | Minimalist Focus active source citation drawer |

---

## evidence-workspace/

| File                                                                            | Pencil ID | Screen                                                 |
| ------------------------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| [study-map-evidence-open.png](./evidence-workspace/study-map-evidence-open.png) | `CRdFM`   | Focus Study Map with active evidence drawer scrim open |

---

## Re-exporting

To update the screenshots if the design file changes, use the Pencil MCP `export_nodes` tool:

```json
{
  "tool": "export_nodes",
  "filePath": "untitled.pen",
  "outputDir": "ui-example/focus/<folder>",
  "nodeIds": ["<id>"],
  "format": "png",
  "scale": 1
}
```

Use **scale 2** for reusable components in `node-components`, `chat-components`, and `reference-components` to preserve crispness. Use **scale 1** for all full screens and reference surfaces.
