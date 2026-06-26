# TutorBook — UI Preview

Static, fully-navigable mockups of the TutorBook learner product. **No backend** — all state is local DOM. One set of pages, **six live-switchable themes**.

## Run it

```bash
cd ui-preview
python3 -m http.server 8123   # or: python3 serve.py  (port 8125)
open http://localhost:8123/index.html
```

Start at `index.html` (the hub). Press **⌘K / Ctrl-K** anywhere for the command palette to jump to any page.

## Themes

Switch live from the floating nav (bottom), the hub's theme strip, or Settings → Appearance. Or deep-link with `?theme=<name>`.

| Theme | Vibe |
|-------|------|
| **Mist Glass** | Indigo glassmorphism, light (default) |
| **Folio** | Editorial ivory, serif, warm green — masthead dashboard |
| **Focus** | Minimalist slate, blue, airy centered layout |
| **Sunrise** | Warm coral/amber, rounded, friendly bento |
| **Nocturne** | Dark mode, violet + cyan glow, glassy |
| **Carbon** | Terminal/command-center, monospace, dense, green-on-black |

## Architecture

```
styles.css            Base + :root (Mist) tokens + ALL shared component styles.
                      Everything is tokenised so a theme only redefines variables
                      (+ a few structural overrides) to retheme the whole app.
themes/<name>.css     Theme overrides, scoped to body[data-theme="<name>"].
themes/<name>.js      Theme chrome plug-in: registers window.TB_THEMES.<name> =
                      { topbar, tutor, dashboard, evidencePanel, drawer, statusbar }.
partials.js           Core: injects chrome into [data-include] slots, the floating
                      nav, the ⌘K command palette, and live theme switching
                      (TB.setTheme). Holds the canonical Mist chrome (fallback for
                      any chrome function a theme doesn't override).
app.js                All interactions (tabs, accordions, quiz, flashcards,
                      evidence, theme switching, palette) — idempotent.
```

Every page loads `styles.css` + all 5 theme CSS files, and `app.js` + all 5 theme JS + `partials.js` (in that order; `partials.js` last). Switching themes flips `body[data-theme]` and re-renders the chrome — no navigation, no page duplication.

### Page contract

```html
<body data-theme="mist">
  <div class="app">
    <div data-include="topbar"></div>
    <!-- workspace pages: .workspace[data-evidence] + <div data-include="tutor">; statusbar -->
    <!-- dashboard:        <div data-include="dashboard"></div> -->
    <!-- reference pages:  .ref-page … + <div data-include="drawer"> + .scrim -->
  </div>
  <!-- floating nav + command palette auto-injected -->
</body>
```

### Adding a theme

1. `themes/<name>.css` — redefine the token block under `body[data-theme="<name>"]` and override component classes as needed (use `themes/folio.css` as the reference for which touch-points to cover; dark themes additionally re-skin cards/inputs/tables/nodes).
2. `themes/<name>.js` — register `window.TB_THEMES.<name>` (mirror `themes/folio.js`).
3. Add it to `THEME_META` in `partials.js` and to the theme strip in `index.html`.
4. Add `<link>`/`<script>` tags to each page (or just to the templates you generate).

## Pages

**Workspace:** dashboard, study-map (graph + agent-working chat + evidence), curriculum, source-wiki, interactive-quiz, live-session, evidence-open.
**Reference:** concept, quiz, flashcards, worked-example, comparison, formula-sheet, wiki-topic, module, source, live-plan, session.
**Library:** notebooks, templates, sources, artifacts.
**Account:** account, settings, credits, support, notifications.
**Public:** landing, login, access-code, onboarding, legal.
