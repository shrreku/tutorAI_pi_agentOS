# TutorBook · Workspace Design Variations

A standalone, backend-free playground showing **5 distinct approaches** to the
TutorBook hosted-beta learner workspace, all in one navigable page.

```bash
open design-variations/index.html
```

No build, no server, no dependencies. Everything is inline. Google Fonts
(Inter, Instrument Serif, Fraunces, JetBrains Mono) load from a CDN.

## Type system (shared across all designs)

A refined, consistent type system with clear roles:

- **Display / titles** — Fraunces (with Instrument Serif fallback): workspace
  titles, chat headers, node XL titles, page H1s, drawer headings. Optical-size
  aware, slightly condensed, feels editorial without being precious.
- **Long-form reading / tutor prose / thinking / quotes** — Instrument Serif:
  everything the learner *reads* at length. Pairs with the display face.
- **UI / labels / body** — Inter (with cv11/ss01 stylistic sets): controls,
  meta, chips, status bars.
- **Eyebrows / locators / monospace meta** — JetBrains Mono: type badges,
  locators, status bars, code-like meta. Generous letter-spacing for labels.

Each design applies the same roles but composes them differently.

## The five variations

| Tab | Name | Layout | Evidence | Evaluation status |
|-----|------|--------|----------|-------------------|
| Improved Original | Mist Glass, polished | `topbar / [400 chat \| canvas]` | right drawer + glass scrim | **Beta default** (shipped) |
| v1 | Focus Map · dock | full-bleed canvas + floating tutor dock + node peek + minimap | spotlight + side drawer | **Contender** |
| v2 | Narrative Doc | `topbar / [TOC rail \| scrollable document]` | footnote popover | Exploration archive |
| v3 | Chat-Primary | `topbar / [chat ~62% \| peek panel]` | inline card in thread | **Contender** |
| v4 | Bento Home | bento tile grid → click to expand a tile to full stage | right drawer | **Contender** |

### Improved Original
Faithful, polished `nodes.pen` spec. The baseline.

### v1 — Focus Map · dock
Canvas-primary. The tutor is a **floating, minimizable dock**; selecting a node
pops an **inline peek**; a **minimap** orients. Evidence is a **spotlight** —
the canvas dims and blurs except the spotlit node.
**Palette:** calm graphite (`#222831`) + muted sage (`#7c9885`). Flat, no neon,
no aurora, no glow. (Recolored from the previous distracty version.)

**Folio prototype priority:** first layout paradigm to receive a full Folio editorial design pass after Folio kit completeness work begins on workspace surfaces. See [`docs/frontend/13-folio-design-kit.md`](../docs/frontend/13-folio-design-kit.md).

### v2 — Narrative Doc
The workspace **reads as a long-form document**: a TOC rail, an H1 hero with a
drop cap and lead paragraph, then numbered sections (Current objective, Study
map as an embedded figure, Sources, Tutor notes, Quiz, Next steps). The tutor
is a **sticky margin note**; evidence is a **footnote popover** anchored to a
superscript citation.
**Paradigm shift:** no graph canvas, no chat rail — content is linear and
readable like a chapter the tutor keeps current.

### v3 — Chat-Primary (kept from before)
The tutor *is* the app; the map is a compact peek; evidence unfolds **inline
inside the chat thread**.

### v4 — Bento Home
A **dashboard of tiles** (objective, study map preview, tutor preview, sources,
quiz, weekly stats). Click any tile and it **expands to a full stage** while
the others collapse into a rail — surfaces are one click away, but the default
view is an overview, not a canvas or chat.
**Paradigm shift:** default is an overview grid; full surfaces live inside
tiles, not as fixed rails.

## Navigation

- **Top segmented control** — switch designs instantly.
- **"Open Evidence" toggle** — opens/closes the evidence surface on the active design.
- **Click a node / citation chip** to open that design's evidence mechanic.
- **v1:** minimize the dock with the `—` control; close the peek with `✕`.
- **v2:** scroll the document; click a citation to open the footnote popover.
- **v3:** click the evidence header to collapse/expand the inline card.
- **v4:** click any tile to expand it to a full stage; click `← Back to overview`
  (or another tile) to return / switch.

## Not wired

Not connected to the backend — all content is static mock data. To wire a
chosen approach for real, port its component tree into
`apps/web/src/NotebookWorkspacePage.tsx` per the "Implementation handoff"
section of `NODES_PEN.md`.
