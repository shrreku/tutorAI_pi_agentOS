# Folio Design Kit

**Role:** Design north star — the preferred long-term visual theme for TutorBook.  
**Beta policy:** not shipped in production until kit parity; hosted beta stays **100% Mist Glass** on **classic split layout** until a coordinated theme + layout migration.  
**Layout paradigms:** still under evaluation in [`design-variations/`](../../design-variations/README.md) — orthogonal to Folio completeness work. **First Folio prototype:** v1 Focus Map · dock (canvas-primary, floating tutor dock). Contenders v3 and v4 follow.  
**Implementation baseline (hosted beta):** Mist Glass — see [`NODES_PEN.md`](../../NODES_PEN.md) and [`ui-example/mist-glass/`](../../ui-example/mist-glass/README.md).  
**Screenshots:** [`ui-example/folio/`](../../ui-example/folio/README.md) — 34 PNG exports (2026-06-25).  
**Pencil sources:** [`untitled.pen`](../../untitled.pen), [`gemini.pen`](../../gemini.pen) (Screen 5 · Editorial Ivory).  
**Behavior specs:** numbered docs `04`–`08` in this folder — Folio is skin + chrome only until kit parity is reached.

---

## Improvement priority

Agreed order for Folio work:

1. **Completeness** — reach Mist Glass kit parity in Folio's editorial language
2. **Aesthetic polish** — refine ivory/serif treatment on specific surfaces
3. **Structural change** — layout paradigm shifts only after the full kit exists

Use [`ui-example/mist-glass/`](../../ui-example/mist-glass/README.md) as the anatomy checklist. Interaction patterns (chat spine, evidence drawer, reference surfaces) follow the same product model as Mist Glass.

---

## Visual language

### Folio (Editorial Ivory)

- **Panels:** warm ivory fills (`#faf8f5`, `#f5f0e8`, `#fffef9`) — opaque scrims, not indigo glass
- **Strokes:** warm hairlines (`#e8e0d4`, `#d4c8b8`)
- **Shadows:** soft warm lift — low chroma, no indigo glow
- **Backgrounds:** sand/ivory gradients; curriculum watermark typography as faint canvas landmark
- **Accent:** muted sage for primary actions and selected states; warm amber for artifacts
- **Evidence overlay:** frosted warm ivory backdrop scrim (functional dim, not decorative glass blobs)

### Typography roles

Shared type system across design explorations (`design-variations/README.md`):

| Role                | Typeface                             | Folio usage                                                      |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Display / titles    | Fraunces (Instrument Serif fallback) | Workspace titles, reference H1s, drawer headings, node XL titles |
| Long-form reading   | Instrument Serif                     | Tutor prose, wiki body, worked-example steps                     |
| UI / labels / body  | Inter                                | Controls, meta, chips, status bars, graph labels                 |
| Eyebrows / locators | JetBrains Mono                       | Type badges, locators, compact meta                              |

Mist Glass uses Inter throughout; Folio's differentiation is serif-forward reading surfaces with sans UI chrome.

### Node states (Folio)

Folio adds **Completed** and **Locked** to the Mist Glass state set (Default · Selected · Current path). See `node-pack/08-states.png` in [`ui-example/folio/`](../../ui-example/folio/README.md).

---

## Kit status

| Area                | Folio status                             | Mist Glass reference                                    |
| ------------------- | ---------------------------------------- | ------------------------------------------------------- |
| Node pack (XL→XS)   | **Complete** — 12 showcase frames        | `ui-example/mist-glass/node-pack/`                      |
| Node components     | **Complete** — 5 scales                  | `ui-example/mist-glass/node-components/`                |
| Workspace screens   | **Complete** — 6 screens                 | `ui-example/mist-glass/workspace-screens/`              |
| Reference surfaces  | **Complete** — 13 pages + widget library | `ui-example/mist-glass/reference-surfaces/`             |
| Reference header    | **Complete**                             | `ui-example/mist-glass/reference-components/`           |
| Evidence pages      | **Complete** — 5 format variants         | `ui-example/mist-glass/evidence-pages/`                 |
| Evidence workspace  | **Complete** — 2 overlay screens         | `ui-example/mist-glass/evidence-workspace/`             |
| Dashboard           | **Complete** — library index layout      | `ui-example/mist-glass/workspace-screens/dashboard.png` |
| Tutor chat kit      | **Partial** — tabs + composer only       | `ui-example/mist-glass/chat-components/` (15 files)     |
| Evidence components | **Partial** — dock shell only            | `ui-example/mist-glass/evidence-components/` (12 files) |
| Workspace chrome    | **Missing**                              | `workspace-surface-switcher`, `workspace-status-bar`    |
| Chat showcases      | **Missing**                              | `chat-showcases/`                                       |
| Canvas indices      | **Missing**                              | `indices/`                                              |

---

## Completeness backlog

Design these in Folio editorial language before aesthetic polish passes.

### Tutor chat (`chat-components/`)

| Component                    | Mist Glass file               | Folio status                     |
| ---------------------------- | ----------------------------- | -------------------------------- |
| User message row             | `chat-user-row.png`           | Not designed                     |
| Agent step (complete)        | `chat-agent-step.png`         | Not designed                     |
| Agent step (running)         | `chat-agent-step-running.png` | Not designed                     |
| Thinking block               | `chat-thinking.png`           | Not designed                     |
| Tutor prose + citation       | `chat-tutor-prose.png`        | Not designed                     |
| Activity block (collapsible) | `chat-activity-block.png`     | Not designed                     |
| Header — Tutor tab           | `chat-header-tutor.png`       | Covered by `folio-chat-tabs.png` |
| Header — History tab         | `chat-header-history.png`     | Partial (tabs frame)             |
| Header — Settings tab        | `chat-header-settings.png`    | Partial (tabs frame)             |
| History view                 | `chat-history-view.png`       | Not designed                     |
| Settings view                | `chat-settings-view.png`      | Not designed                     |
| Full tutor panel             | `chat-panel.png`              | Not designed                     |
| History panel                | `chat-panel-history.png`      | Not designed                     |
| Settings panel               | `chat-panel-settings.png`     | Not designed                     |
| Collapsed rail + FAB         | `chat-collapsed-rail.png`     | Not designed                     |
| Composer                     | `chat-composer.png`           | **Done** (`f64En`)               |

### Evidence (`evidence-components/`)

| Component              | Mist Glass file                       | Folio status                          |
| ---------------------- | ------------------------------------- | ------------------------------------- |
| Drawer dock shell      | `evidence-drawer-dock.png`            | **Done** (`Ki6X9`)                    |
| PDF drawer body        | `evidence-drawer-pdf.png`             | Not designed (page variant exists)    |
| PPT drawer body        | `evidence-drawer-ppt.png`             | Not designed                          |
| Wiki drawer body       | `evidence-drawer-wiki.png`            | Not designed                          |
| Word drawer body       | `evidence-drawer-word.png`            | Not designed                          |
| Empty drawer           | `evidence-drawer-empty.png`           | Not designed (page variant exists)    |
| Snippet thumb          | `evidence-snippet-thumb.png`          | Not designed                          |
| Snippet thumb selected | `evidence-snippet-thumb-selected.png` | Not designed                          |
| Citation chip          | `citation-chip.png`                   | Not designed                          |
| Citation chip active   | `citation-chip-active.png`            | Not designed                          |
| Evidence button active | `evidence-button-active.png`          | Not designed                          |
| Glass/warm backdrop    | `evidence-glass-backdrop.png`         | Implied in evidence-workspace screens |

### Workspace chrome (`workspace-components/`)

| Component        | Mist Glass ID | Folio status                                |
| ---------------- | ------------- | ------------------------------------------- |
| Topbar           | `O4nHt`       | Not designed (infer from workspace screens) |
| Surface switcher | `Bn5nK`       | Not designed                                |
| Status bar       | `pDSTm`       | Not designed                                |

---

## Designed catalog (Pencil IDs)

Full screenshot filenames: [`ui-example/folio/README.md`](../../ui-example/folio/README.md).

### Node pack

| Section            | ID       |
| ------------------ | -------- |
| Header             | `znwGn`  |
| Size legend        | `AQDmb`  |
| Type legend        | `MAZrE`  |
| XL Planning        | `RtOEi`  |
| L Curriculum       | `AC1hs`  |
| M Gateway          | `bMtX5`  |
| S Compact          | `FE9Yr`  |
| XS Pins            | `YgTiF`  |
| States             | `t0vhl`  |
| Sample canvas      | `U3WWBW` |
| Mixed-scale canvas | `O4mkCa` |
| Artifacts          | `m8Ddg`  |

### Node components

| Scale | ID       | Size    |
| ----- | -------- | ------- |
| XL    | `sNGOM`  | 200×220 |
| L     | `Y2PGui` | 200×168 |
| M     | `bHhyr`  | 184×112 |
| S     | `Gplim`  | 148×80  |
| XS    | `MAQ69`  | 112×44  |

### Workspace screens (1440×900)

| Screen           | ID      |
| ---------------- | ------- |
| Study Map        | `rh9El` |
| Source Wiki      | `zn4aP` |
| Curriculum       | `wvyLU` |
| Evidence open    | `ulGd5` |
| Interactive quiz | `IDi3o` |
| Dashboard        | `btkBw` |

### Chat

| Component                         | ID      |
| --------------------------------- | ------- |
| Tabs (Tutor / History / Settings) | `k3B9t` |
| Composer                          | `f64En` |

### Reference

| Item           | ID      |
| -------------- | ------- |
| Surface header | `PaWJ7` |
| Concept        | `riwmQ` |
| Wiki topic     | `hveFo` |
| Curriculum     | `aothd` |
| Module         | `DOr72` |
| Quiz           | `qVm2J` |
| Session        | `AzUDW` |
| Source         | `aYn3j` |
| Flashcards     | `C3Vbf` |
| Worked example | `eiTY0` |
| Formula sheet  | `aEzDV` |
| Comparison     | `Gm1MV` |
| Live plan      | `qovGy` |
| Widget library | `iQ9DY` |

### Evidence

| Item               | ID       |
| ------------------ | -------- |
| Drawer dock        | `Ki6X9`  |
| PDF page           | `qwLCV`  |
| PPT page           | `CiGrK`  |
| Wiki page          | `NY2a3`  |
| Word page          | `kAQSd`  |
| Empty page         | `G4T4NC` |
| Study map + drawer | `FrNxk`  |
| Concept + drawer   | `FgyIo`  |

---

## Spec alignment

Folio implements the same product anatomy as Mist Glass. Cross-reference:

| Product area                  | Spec doc                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Workspace layout              | [03-app-shell-and-navigation](./03-app-shell-and-navigation.md)               |
| Tutor chat                    | [04-tutor-chat](./04-tutor-chat.md)                                           |
| Study Map / Wiki / Curriculum | [05-workspace-study-map-source-wiki](./05-workspace-study-map-source-wiki.md) |
| Nodes                         | [06-node-design-system](./06-node-design-system.md)                           |
| Reference + Evidence          | [07-reference-surfaces-evidence](./07-reference-surfaces-evidence.md)         |
| Artifacts                     | [08-artifacts](./08-artifacts.md)                                             |

When Folio chat and evidence kits are complete, update this doc's catalog tables and re-export PNGs to `ui-example/folio/`.

---

## Re-exporting screenshots

```json
{
  "tool": "export_nodes",
  "filePath": "untitled.pen",
  "outputDir": "ui-example/folio/<folder>",
  "nodeIds": ["<id>"],
  "format": "png",
  "scale": 1
}
```

- **Scale 2** — `node-components/`, `chat-components/`, `reference-components/`, `evidence-components/`
- **Scale 1** — workspace screens, reference surfaces, evidence pages, evidence-workspace

Edit Folio frames in Pencil only — do not read or edit `.pen` files with text editors.

---

## Not yet decided

- Exact OKLCH token sheet for Folio (derive from Pencil exports during polish phase)
- Whether Folio topbar reuses TutorBook app shell chrome or defines notebook-local chrome
- Folio-specific motion curves (default to [02-design-system](./02-design-system.md) until polish pass)
