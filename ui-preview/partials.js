/* ============================================================================
   TutorBook · UI Preview — core chrome + theme orchestration
   ----------------------------------------------------------------------------
   Pages declare slots:  <div data-include="topbar|statusbar|tutor|dashboard|
   evidence-panel|drawer"></div>. This script fills them based on the active
   theme. Theme-specific chrome is registered by themes/<name>.js into
   window.TB_THEMES[<name>] = { topbar, tutor, dashboard, drawer, evidencePanel,
   statusbar } (all optional; falls back to the Mist core below).

   The active theme is stored in localStorage and applied by flipping
   <body data-theme>. Switching themes re-renders all chrome live.
   ============================================================================ */

window.TB_THEMES = window.TB_THEMES || {};
const TB = (window.TB = window.TB || {});

const THEME_META = {
  mist: { label: "Mist Glass", sw: "mist", desc: "Indigo glass" },
  folio: { label: "Folio", sw: "folio", desc: "Editorial ivory" },
  focus: { label: "Focus", sw: "focus", desc: "Minimalist slate" },
  sunrise: { label: "Sunrise", sw: "sunrise", desc: "Warm & rounded" },
  nocturne: { label: "Nocturne", sw: "nocturne", desc: "Dark mode" },
  carbon: { label: "Carbon", sw: "carbon", desc: "Terminal dense" },
};
TB.THEME_META = THEME_META;

function activeTheme() {
  let t;
  try {
    t = new URLSearchParams(location.search).get("theme");
  } catch (e) {}
  if (t && THEME_META[t]) {
    try {
      localStorage.setItem("tb-theme", t);
    } catch (e) {}
    return t;
  }
  t = localStorage.getItem("tb-theme") || document.body.dataset.theme || "mist";
  if (!THEME_META[t]) t = "mist";
  return t;
}

/* ---------- icons ---------- */
function svg(path) {
  return `<svg class="svg-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
const ICONS = TB.ICONS || (TB.ICONS = {});
Object.assign(ICONS, {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  cap: svg('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5"/>'),
  chev: svg('<polyline points="9 18 15 12 9 6"/>'),
  chevDown: svg('<polyline points="6 9 12 15 18 9"/>'),
  book: svg(
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  ),
  shield: svg('<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z"/>'),
  send: svg('<path d="m5 12 14-7-5 14-2-5z"/>'),
  chat: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  grid: svg(
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  ),
  home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
  map: svg('<path d="m9 3-6 2v16l6-2 6 2 6-2V3l-6 2-6-2z"/><path d="M9 3v16M15 5v16"/>'),
  wiki: svg(
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  ),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  evidence: svg(
    '<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>',
  ),
  bolt: svg('<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>'),
  layers: svg('<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>'),
  bell: svg(
    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  ),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/>'),
  gear: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  ),
  card: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'),
  help: svg(
    '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  ),
  doc: svg(
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  ),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  command: svg(
    '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  ),
  spark: svg(
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  ),
  play: svg('<polygon points="6 4 20 12 6 20 6 4"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  upload: svg('<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>'),
});

/* ============================================================================
   MIST (core / fallback) chrome
   ============================================================================ */
function coreTopbar() {
  return `
    <div class="brand">
      <div class="logo">TB</div>
      <div class="title">Organic Chemistry I</div>
      <span class="badge purple">TEXTBOOK INDEXED</span>
    </div>
    <div class="spacer"></div>
    <div class="search" data-open-palette>${ICONS.search}<input placeholder="Search or jump to…" /><span class="kbd">⌘K</span></div>
    <span class="credits">${ICONS.bolt}<span class="meter"><span style="width:71%"></span></span> 71%</span>
    <a class="avatar" href="account.html" title="Account">SK</a>`;
}

function coreStatusbar() {
  return `
    <div class="left">Study Map · 24 nodes · 31 edges</div>
    <div class="center">Selected: SN2 mechanism</div>
    <div class="right"><span class="accent">Objective: Obj 5 · SN2 mechanism</span></div>`;
}

function coreTutor(context = "SN2 mechanism") {
  return `
  <aside class="tutor" data-tutor>
    <div class="tutor-header">
      <div class="h-title"><span class="cap-ico">${ICONS.cap}</span> Tutor</div>
      <div class="spacer"></div>
      <button class="icon-btn dark">${ICONS.plus} New</button>
      <button class="icon-btn dark" data-tutor-collapse title="Collapse chat">${ICONS.chev}</button>
    </div>
    <div class="tutor-tabs" data-tutor-tabs>
      <button class="active" data-tab="tutor">Tutor</button>
      <button data-tab="history">History</button>
      <button data-tab="settings">Settings</button>
    </div>
    <div class="tutor-body" data-tutor-body>
      <div data-tutor-pane="tutor">
        <div class="focus-row">Focusing: <span class="badge purple">${context}</span></div>
        <div class="msg-user">Show me the backside attack details.</div>
        <div class="msg-agent">
          <div class="agent-avatar-line"><span class="av">${ICONS.cap}</span> TutorBook</div>
          <div class="collapse open" data-collapse>
            <div class="collapse-head" data-collapse-head>${ICONS.chev.replace('class="svg-i"', 'class="svg-i chev"')} AGENT ACTIVITY · 3 STEPS <span class="timer">1.4s</span></div>
            <div class="collapse-body">
              <div class="step"><span class="dot"></span> Checking learning state</div>
              <div class="toolcall"><span class="tc-ico">${ICONS.book}</span><span class="tc-name">retrieve_evidence("SN2 backside")</span><span class="tc-status">done</span></div>
              <div class="step active"><span class="dot"></span> <a>Synthesising explanation ↗</a></div>
            </div>
          </div>
          <div class="collapse open" data-collapse>
            <div class="collapse-head" data-collapse-head>${ICONS.chev.replace('class="svg-i"', 'class="svg-i chev"')} THINKING</div>
            <div class="collapse-body">
              <div class="thinking">Leaving groups may need a brief recap based on mastery. The textbook frames SN2 around steric accessibility and backside-attack geometry.</div>
            </div>
          </div>
          <p>In an SN2 reaction the nucleophile attacks from the side opposite the leaving group, pushing it out in a single concerted step — the carbon's configuration inverts (Walden inversion).</p>
          <span class="citation">${ICONS.book} Ch. 7 · p. 142</span>
          <div class="artifact-chip"><span class="ac-ico">${ICONS.layers}</span><div><div class="ac-t">SN2 stereochemistry · 5-card deck</div><div class="ac-s">Generated study aid · tap to review</div></div></div>
        </div>
      </div>
      <div data-tutor-pane="history" style="display:none">
        ${[
          "SN2 backside attack|Today · 4:32 PM",
          "Leaving group recap|Today · 2:10 PM",
          "Stereochemistry inversion|Yesterday · 9:48 PM",
          "Nucleophile strength|Jun 23 · 6:15 PM",
          "Polar aprotic solvents|Jun 22 · 11:02 AM",
        ]
          .map((h) => {
            const [t, s] = h.split("|");
            return `<div class="history-item"><div class="t">${t}</div><div class="s">${s}</div></div>`;
          })
          .join("")}
      </div>
      <div data-tutor-pane="settings" style="display:none">
        <div class="setting-row">Show thinking blocks <div class="switch on" data-switch></div></div>
        <div class="setting-row">Show agent activity <div class="switch on" data-switch></div></div>
        <div class="setting-row">Auto-cite sources <div class="switch on" data-switch></div></div>
        <div class="setting-row">Steerable tutor <div class="switch" data-switch></div></div>
      </div>
    </div>
    <div class="tutor-input">
      <div class="context-chip">${ICONS.spark} Context: ${context}</div>
      <div class="composer" data-composer>
        <textarea placeholder="Ask a follow-up or steer…"></textarea>
        <button class="send" title="Send">${ICONS.send}</button>
      </div>
      <div class="composer-hint"><span>↵ send · ⇧↵ newline</span><span>71% credits</span></div>
    </div>
  </aside>
  <button class="chat-fab" data-chat-fab title="Open chat">${ICONS.chat}</button>`;
}

function coreEvidencePanel() {
  return `
  <aside class="evidence-panel" data-evidence-panel>
    <div class="evidence-panel-head">
      <div class="h-title">${ICONS.evidence} Evidence</div>
      <div class="spacer"></div>
      <button class="icon-btn" data-evidence-collapse title="Collapse evidence">${ICONS.chev}</button>
    </div>
    <div class="evidence-panel-body">
      <div class="ev-tabs" data-ev-tabs>
        <button class="active">PDF</button><button>Slides</button><button>Wiki</button><button>Notes</button>
      </div>
      <div class="ev-card selected">
        <div class="ev-meta">CH. 7 · P. 142</div>
        <div class="ev-title">Primary substrates</div>
        <p class="ev-quote">Primary substrates react fastest because steric hindrance is minimised at the transition state.</p>
      </div>
      <div class="ev-card">
        <div class="ev-meta">CH. 7 · P. 145</div>
        <div class="ev-title">Walden inversion</div>
        <p class="ev-quote">The backside attack inverts the stereochemical configuration at the carbon centre.</p>
      </div>
      <div class="ev-card">
        <div class="ev-meta">CH. 7 · P. 150</div>
        <div class="ev-title">Solvent effects</div>
        <p class="ev-quote">Polar aprotic solvents leave the nucleophile relatively "naked" and reactive.</p>
      </div>
    </div>
    <div class="evidence-panel-foot">
      <a class="btn primary block" href="page-source.html">Open full source</a>
    </div>
  </aside>
  <button class="evidence-fab" data-evidence-fab title="Open evidence">${ICONS.evidence}</button>`;
}

function coreDrawer() {
  return `
    <div class="drawer-head">
      ${ICONS.shield}<strong>Evidence</strong>
      <div style="flex:1"></div>
      <button class="icon-btn" data-drawer-close>Close</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-tabs" data-drawer-tabs>
        <button class="active">PDF</button><button>Slides</button><button>Wiki</button><button>Notes</button>
      </div>
      <div class="snippet selected"><div class="badge gray" style="margin-bottom:8px">Ch. 7 · p. 142</div><p style="margin:6px 0">Primary substrates react fastest because steric hindrance is minimised at the transition state.</p></div>
      <div class="snippet"><div class="badge gray" style="margin-bottom:8px">Ch. 7 · p. 145</div><p style="margin:6px 0">The backside attack inverts the stereochemical configuration at the carbon centre (Walden inversion).</p></div>
      <div class="snippet"><div class="badge gray" style="margin-bottom:8px">Ch. 7 · p. 150</div><p style="margin:6px 0">Polar aprotic solvents leave the nucleophile relatively "naked" and reactive.</p></div>
    </div>
    <div class="drawer-foot"><a class="btn primary block" href="page-source.html">Open full source</a></div>`;
}

function coreDashboard() {
  const bars = [
    ["M", 40],
    ["T", 70],
    ["W", 25],
    ["T", 90],
    ["F", 55],
    ["S", 15],
    ["S", 60],
  ]
    .map(
      ([l, h]) =>
        `<div style="flex:1"><div class="bar" style="height:${h}%"></div><div class="lbl">${l}</div></div>`,
    )
    .join("");
  return `
  <div class="dash">
    <div>
      <h1 class="dash-greeting">Good afternoon, Shreyash</h1>
      <div class="card" style="margin-bottom:18px">
        <h3>Your Profile</h3>
        <div class="stat-row"><div class="ico">${ICONS.doc}</div><div><div class="num">7 Ingested sources</div><div class="sub">1,200 pages analysed</div></div></div>
        <div class="stat-row"><div class="ico">${ICONS.cap}</div><div><div class="num">14 Mastered</div><div class="sub">Key chemistry concepts</div></div></div>
        <div class="stat-row"><div class="ico">${ICONS.bolt}</div><div><div class="num">8-day streak</div><div class="sub">Daily learning goal met</div></div></div>
      </div>
      <div class="card">
        <h3>Topic mastery</h3>
        <div style="margin-bottom:14px"><div class="between" style="font-size:13px;margin-bottom:6px"><span>SN2 Mechanism</span><span>92%</span></div><div class="progress"><span style="width:92%"></span></div></div>
        <div><div class="between" style="font-size:13px;margin-bottom:6px"><span>Stereochemistry <span class="badge red" style="margin-left:6px">Review</span></span><span>45%</span></div><div class="progress"><span class="red" style="width:45%"></span></div></div>
      </div>
    </div>
    <div>
      <div class="search" data-open-palette style="margin-bottom:18px;width:100%">${ICONS.search}<input placeholder="Search notebooks, references…" /><span class="kbd">⌘K</span></div>
      <div class="card" style="margin-bottom:18px">
        <div class="card-head"><h3>Active notebooks</h3><a class="link" href="notebooks.html" style="color:var(--accent-deep);font-weight:650;font-size:12px">View all →</a></div>
        <a class="notebook-row" href="study-map.html"><div class="meta"><div class="t">Organic Chemistry I</div><div class="s">60% complete · 7 sources</div></div><div style="width:120px"><div class="progress"><span style="width:60%"></span></div></div></a>
        <a class="notebook-row" href="study-map.html"><div class="meta"><div class="t">Linear Algebra</div><div class="s">32% complete · 4 sources</div></div><div style="width:120px"><div class="progress"><span style="width:32%"></span></div></div></a>
        <a class="notebook-row" href="study-map.html"><div class="meta"><div class="t">Cell Biology</div><div class="s">88% complete · 5 sources</div></div><div style="width:120px"><div class="progress"><span style="width:88%"></span></div></div></a>
      </div>
      <div class="card">
        <h3>Continue learning</h3>
        <a class="notebook-row" href="page-live-plan.html"><div class="meta"><div class="t">Resume: SN2 mechanism</div><div class="s">Live plan · Obj 5 in progress</div></div><span class="badge purple">Resume →</span></a>
        <a class="notebook-row" href="page-flashcards.html"><div class="meta"><div class="t">Flashcards: Ch. 7 deck</div><div class="s">24 cards · spaced recall</div></div><span class="badge purple">Open →</span></a>
        <a class="notebook-row" href="interactive-quiz.html"><div class="meta"><div class="t">Quiz: Nucleophiles</div><div class="s">5 questions · ready</div></div><span class="badge purple">Start →</span></a>
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:18px">
        <h3>Suggested by your tutor</h3>
        <div class="suggest-item"><span class="ico">${ICONS.layers}</span><span>Review 12 weak flashcards · Ch. 7</span><a class="link" href="page-flashcards.html">Open →</a></div>
        <div class="suggest-item"><span class="ico">${ICONS.doc}</span><span>Worked example on SN2</span><a class="link" href="page-worked-example.html">Resume →</a></div>
        <div class="suggest-item"><span class="ico">${ICONS.help}</span><span>Practice quiz · Nucleophiles</span><a class="link" href="page-quiz.html">Start →</a></div>
      </div>
      <div class="card" style="margin-bottom:18px">
        <h3>Recent activity</h3>
        <div class="suggest-item"><span class="ico" style="color:var(--green)">✓</span><div><div style="font-weight:650">Completed quiz · Stereochemistry</div><div class="muted">80% · mastered chiral configuration</div></div></div>
        <div class="suggest-item"><span class="ico">${ICONS.doc}</span><div><div style="font-weight:650">Ingested SN2_Mechanisms.pdf</div><div class="muted">Generated 10 flashcards & 3 quiz questions</div></div></div>
      </div>
      <div class="card">
        <h3>Weekly activity</h3>
        <div class="bars">${bars}</div>
      </div>
    </div>
  </div>`;
}

/* chat drawer (reference pages) reuses the active tutor markup */
function coreChatDrawer(ctx) {
  const panel = themeChrome("tutor", ctx);
  const asideHtml = panel.replace(/<button class="chat-fab[\s\S]*?<\/button>/, "");
  return `
  <div class="chat-drawer-scrim" data-chat-drawer-scrim></div>
  <div class="chat-drawer" data-chat-drawer>
    <button class="chat-drawer-close" data-chat-drawer-close title="Close chat">${ICONS.chev.replace('points="9 18 15 12 9 6"', 'points="15 18 9 12 15 6"')}</button>
    <div class="chat-drawer-inner">${asideHtml}</div>
  </div>`;
}

/* ---------- command palette (global navigation) ---------- */
const PAGES = [
  {
    g: "Workspace",
    items: [
      ["dashboard.html", "Dashboard", ICONS.home],
      ["study-map.html", "Study Map", ICONS.map],
      ["curriculum.html", "Curriculum", ICONS.list],
      ["source-wiki.html", "Source Wiki", ICONS.wiki],
      ["interactive-quiz.html", "Interactive Quiz", ICONS.help],
      ["evidence-open.html", "Evidence drawer", ICONS.evidence],
      ["live-session.html", "Live session", ICONS.play],
    ],
  },
  {
    g: "Reference surfaces",
    items: [
      ["page-concept.html", "Concept · SN2", ICONS.book],
      ["page-quiz.html", "Quiz", ICONS.help],
      ["page-flashcards.html", "Flashcards", ICONS.layers],
      ["page-worked-example.html", "Worked example", ICONS.doc],
      ["page-comparison.html", "Comparison · SN1 vs SN2", ICONS.list],
      ["page-formula-sheet.html", "Formula sheet", ICONS.doc],
      ["page-wiki-topic.html", "Wiki topic", ICONS.wiki],
      ["page-module.html", "Module", ICONS.list],
      ["page-source.html", "Source reader", ICONS.doc],
      ["page-live-plan.html", "Live plan", ICONS.map],
      ["page-session.html", "Past session", ICONS.book],
    ],
  },
  {
    g: "Library",
    items: [
      ["notebooks.html", "Notebooks library", ICONS.grid],
      ["templates.html", "Template gallery", ICONS.layers],
      ["sources.html", "Sources manager", ICONS.doc],
      ["artifacts.html", "Artifacts gallery", ICONS.layers],
    ],
  },
  {
    g: "Account",
    items: [
      ["account.html", "Account", ICONS.user],
      ["settings.html", "Settings", ICONS.gear],
      ["credits.html", "Tutor credits", ICONS.card],
      ["notifications.html", "Notifications", ICONS.bell],
      ["support.html", "Help & support", ICONS.help],
    ],
  },
  {
    g: "Public & onboarding",
    items: [
      ["index.html", "Preview hub", ICONS.grid],
      ["landing.html", "Marketing landing", ICONS.spark],
      ["login.html", "Sign in", ICONS.user],
      ["access-code.html", "Access code", ICONS.shield],
      ["onboarding.html", "Onboarding", ICONS.spark],
      ["legal.html", "Consent & legal", ICONS.shield],
    ],
  },
];

function paletteMarkup() {
  const groups = PAGES.map(
    (grp) => `
    <div class="pal-group">${grp.g}</div>
    ${grp.items.map(([href, label, icon], i) => `<a class="pal-item${i === 0 && grp === PAGES[0] ? " active" : ""}" href="${href}"><span class="pi-ico">${icon}</span><span class="pi-meta"><span class="pi-t">${label}</span></span><span class="kbd">↵</span></a>`).join("")}
  `,
  ).join("");
  return `
  <div class="palette" data-palette-box>
    <div class="pal-input">${ICONS.search}<input placeholder="Jump to any page or action…" data-palette-input /><span class="kbd">esc</span></div>
    <div class="pal-body">${groups}</div>
  </div>`;
}

/* ---------- floating nav ---------- */
function floatNav() {
  const theme = activeTheme();
  const items = [
    ["index.html", "Hub", ICONS.home],
    ["dashboard.html", "Dashboard", ICONS.grid],
    ["study-map.html", "Workspace", ICONS.map],
    ["notebooks.html", "Library", ICONS.layers],
    ["credits.html", "Credits", ICONS.card],
    ["account.html", "Account", ICONS.user],
  ];
  const path = location.pathname.split("/").pop() || "index.html";
  const itemsHtml = items
    .map(([href, label, icon]) => {
      const active = href === path ? " active" : "";
      return `<a class="fn-item${active}" href="${href}" title="${label}">${icon}<span>${label}</span></a>`;
    })
    .join("");
  const menu = Object.entries(THEME_META)
    .map(
      ([k, m]) => `
    <button class="fm-row${k === theme ? " active" : ""}" data-set-theme="${k}">
      <span class="sw ${m.sw}"></span>
      <span><span style="display:block;font-weight:700">${m.label}</span><span class="d" style="margin:0">${m.desc}</span></span>
      ${k === theme ? `<span class="check">${ICONS.chev.replace('points="9 18 15 12 9 6"', 'points="20 6 9 17 4 12"')}</span>` : ""}
    </button>`,
    )
    .join("");
  return `
  <nav class="floatnav" data-floatnav aria-label="Primary">
    <div class="brand-dot">TB</div>
    <div class="row gap-4">${itemsHtml}</div>
    <div class="fn-sep"></div>
    <button class="fn-theme" data-open-palette title="Command palette">${ICONS.search} <span class="kbd">⌘K</span></button>
    <button class="fn-theme" data-fn-theme title="Switch theme"><span class="sw ${THEME_META[theme].sw}"></span> ${THEME_META[theme].label} ${ICONS.chevDown.replace('class="svg-i"', 'class="svg-i" style="width:12px;height:12px"')}</button>
    <div class="floatnav-menu" data-fn-menu><div class="fm-label">Theme</div>${menu}</div>
  </nav>`;
}

/* ============================================================================
   theme chrome resolution + rendering
   ============================================================================ */
function themeChrome(part, ...args) {
  const theme = activeTheme();
  const reg = window.TB_THEMES[theme];
  if (reg && typeof reg[part] === "function") return reg[part](...args);
  const core = {
    topbar: coreTopbar,
    statusbar: coreStatusbar,
    tutor: coreTutor,
    evidencePanel: coreEvidencePanel,
    drawer: coreDrawer,
    dashboard: coreDashboard,
  };
  return core[part] ? core[part](...args) : "";
}

function renderChrome() {
  // slot-based includes
  document.querySelectorAll('[data-include="topbar"]').forEach((el) => {
    el.classList.add("topbar");
    el.innerHTML = themeChrome("topbar");
  });
  document.querySelectorAll('[data-include="statusbar"]').forEach((el) => {
    el.classList.add("statusbar");
    el.innerHTML = themeChrome("statusbar");
  });
  document.querySelectorAll('[data-include="dashboard"]').forEach((el) => {
    el.innerHTML = themeChrome("dashboard");
  });
  document.querySelectorAll('[data-include="tutor"]').forEach((el) => {
    el.innerHTML = themeChrome("tutor", el.dataset.context || "SN2 mechanism");
  });
  document.querySelectorAll('[data-include="drawer"]').forEach((el) => {
    el.classList.add("drawer");
    el.setAttribute("data-drawer", "");
    el.innerHTML = themeChrome("drawer");
  });
  document.querySelectorAll('[data-include="evidence-panel"]').forEach((el) => {
    el.innerHTML = themeChrome("evidencePanel");
  });

  // docked evidence into workspaces opting in via [data-evidence]
  document.querySelectorAll(".workspace[data-evidence]").forEach((ws) => {
    ws.querySelectorAll("[data-evidence-panel], .evidence-fab").forEach((n) => n.remove());
    const wrap = document.createElement("div");
    wrap.innerHTML = themeChrome("evidencePanel");
    Array.from(wrap.children).forEach((c) => ws.appendChild(c));
  });

  // left chat drawer for reference pages
  document
    .querySelectorAll("[data-chat-drawer], [data-chat-drawer-scrim]")
    .forEach((n) => n.remove());
  if (document.querySelector(".ref-page")) {
    const ctx = document.body.dataset.chatContext || "SN2 mechanism";
    const wrap = document.createElement("div");
    wrap.innerHTML = coreChatDrawer(ctx);
    Array.from(wrap.children).forEach((c) => document.body.appendChild(c));
    const stray = document.querySelector("[data-chat-drawer] .chat-fab");
    if (stray) stray.remove();
  }

  // floating nav
  document.querySelectorAll("[data-floatnav]").forEach((n) => n.remove());
  const navWrap = document.createElement("div");
  navWrap.innerHTML = floatNav();
  document.body.appendChild(navWrap.firstElementChild);

  // command palette (once)
  if (!document.querySelector("[data-palette]")) {
    const pal = document.createElement("div");
    pal.className = "palette-scrim hidden";
    pal.setAttribute("data-palette", "");
    pal.innerHTML = paletteMarkup();
    document.body.appendChild(pal);
  }
}

TB.setTheme = function (name) {
  if (!THEME_META[name]) name = "mist";
  document.body.dataset.theme = name;
  try {
    localStorage.setItem("tb-theme", name);
  } catch (e) {}
  renderChrome();
  if (window.initInteractions) window.initInteractions();
};

document.addEventListener("DOMContentLoaded", () => {
  document.body.dataset.theme = activeTheme();
  renderChrome();
  if (window.initInteractions) window.initInteractions();
});
