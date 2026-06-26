// Partial injector for TutorBook UI preview.
// Pages declare containers with data-include="..."; this script fills them.
// Theme is read from <body data-theme="mist|folio|focus"> (default: mist).
// The floating nav is auto-injected on every page and links within the active theme.

const THEME = (document.body && document.body.dataset.theme) || 'mist';

// Relative path prefix to the theme folder root.
// Pages live at the theme root (e.g. /folio/study-map.html) so prefix is ''.
// The root gallery is at ../index.html.
const HERE = '';

function svg(path) {
  return `<svg class="svg-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
const ICONS = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  cap: svg('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5"/>'),
  chev: svg('<polyline points="9 18 15 12 9 6"/>'),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  shield: svg('<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z"/>'),
  send: svg('<path d="m5 12 14-7-5 14-2-5z"/>'),
  chat: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  grid: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  map: svg('<path d="m9 3-6 2v16l6-2 6 2 6-2V3l-6 2-6-2z"/><path d="M9 3v16M15 5v16"/>'),
  wiki: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  evidence: svg('<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>'),
  swap: svg('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
};

const THEME_META = {
  mist: { label: 'Mist Glass', sw: 'mist', desc: 'indigo glass', root: '' },
  folio: { label: 'Folio', sw: 'folio', desc: 'editorial ivory', root: 'folio/' },
  focus: { label: 'Focus', sw: 'focus', desc: 'minimalist slate', root: 'focus/' },
};

// ---- Topbar variants ----
function topbarMist() {
  return `
    <div class="brand">
      <div class="logo">TB</div>
      <div class="title">Organic Chemistry I</div>
      <span class="badge purple">TEXTBOOK INDEXED</span>
    </div>
    <div class="spacer"></div>
    <div class="search">${ICONS.search}<input placeholder="Search map or notes..." /></div>
    <span class="credits">142 Credits</span>`;
}
function topbarFolio() {
  return `
    <div class="brand">
      <div class="logo folio-logo">TB</div>
      <div class="title">TutorBook <span class="folio-edition">Editorial Edition</span></div>
    </div>
    <div class="spacer"></div>
    <div class="folio-session">Organic Chemistry I &nbsp;//&nbsp; Chapter 7</div>`;
}
function topbarFocus() {
  return `
    <div class="brand">
      <div class="logo focus-logo">F</div>
      <div class="title">Focus Space</div>
    </div>
    <div class="spacer"></div>
    <div class="focus-session">Active Session · Organic Chemistry</div>`;
}
function topbar() {
  if (THEME === 'folio') return topbarFolio();
  if (THEME === 'focus') return topbarFocus();
  return topbarMist();
}

// ---- Statusbar ----
function statusbar() {
  const accent = THEME === 'folio' ? 'green-accent' : (THEME === 'focus' ? 'blue-accent' : 'accent');
  return `
    <div class="left">Study Map · 24 nodes · 31 edges</div>
    <div class="center">Selected: SN2 mechanism</div>
    <div class="right"><span class="${accent}">Objective: Obj 5 · SN2 mechanism</span></div>`;
}

// ---- Evidence drawer ----
function drawer() {
  if (THEME === 'folio') {
    return `
      <div class="drawer-head folio-head">
        ${ICONS.chev.replace('class="svg-i"', 'class="svg-i folio-arrow"')}
        <strong>Evidence Sources</strong>
        <div style="flex:1"></div>
        <button class="icon-btn light folio-close" data-drawer-close>Close</button>
      </div>
      <div class="drawer-body folio-body">
        <div class="ev-item">
          <div class="ev-meta">PDF SOURCE · PAGE 341</div>
          <div class="ev-title">Clayden Organic Chemistry</div>
          <p class="ev-quote">"…the nucleophile attacks from the side opposite to the leaving group. This backside attack causes a concerted inversion of configuration at the reaction center carbon."</p>
        </div>
        <div class="ev-item">
          <div class="ev-meta">PPT SLIDE · SLIDE 14</div>
          <div class="ev-title">Lecture · Substitution kinetics</div>
          <p class="ev-quote">"SN2 reaction rate depends bimolecularly on both reactant species. Doubling either substrate or nucleophile doubles the observed rate."</p>
        </div>
      </div>
      <div class="drawer-foot folio-foot">
        <button class="btn folio-btn-primary" style="width:100%;justify-content:center">Open full source</button>
      </div>`;
  }
  // mist + focus share the snippet drawer
  return `
    <div class="drawer-head">
      ${ICONS.shield}<strong>Evidence</strong>
      <div style="flex:1"></div>
      <button class="icon-btn light" data-drawer-close>Close</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-tabs" data-drawer-tabs>
        <button class="active">PDF</button>
        <button>Slides</button>
        <button>Wiki</button>
        <button>Notes</button>
      </div>
      <div class="snippet selected">
        <div class="badge gray" style="margin-bottom:8px">Ch. 7 · p. 142</div>
        <p style="margin:6px 0">Primary substrates react fastest because steric hindrance is minimized at the transition state.</p>
      </div>
      <div class="snippet">
        <div class="badge gray" style="margin-bottom:8px">Ch. 7 · p. 145</div>
        <p style="margin:6px 0">The backside attack inverts the stereochemical configuration at the carbon center (Walden inversion).</p>
      </div>
      <div class="snippet">
        <div class="badge gray" style="margin-bottom:8px">Ch. 7 · p. 150</div>
        <p style="margin:6px 0">Polar aprotic solvents leave the nucleophile relatively "naked" and reactive.</p>
      </div>
    </div>
    <div class="drawer-foot">
      <button class="btn primary" style="width:100%;justify-content:center">Open full source</button>
    </div>`;
}

// ---- Evidence panel (docked into the RIGHT of .workspace) ----
function evidencePanel() {
  if (THEME === 'folio') {
    return `
    <aside class="evidence-panel" data-evidence-panel>
      <div class="evidence-panel-head">
        <div class="h-title">${ICONS.chev.replace('class="svg-i"', 'class="svg-i"')} Evidence Sources</div>
        <div class="spacer"></div>
        <button class="icon-btn light" data-evidence-collapse title="Collapse evidence">${ICONS.chev}</button>
      </div>
      <div class="evidence-panel-body">
        <div class="ev-tabs" data-ev-tabs>
          <button class="active">PDF</button><button>Slides</button><button>Wiki</button><button>Notes</button>
        </div>
        <div class="ev-card selected">
          <div class="ev-meta">PDF SOURCE · PAGE 341</div>
          <div class="ev-title">Clayden Organic Chemistry</div>
          <p class="ev-quote">"…the nucleophile attacks from the side opposite to the leaving group. This backside attack causes a concerted inversion of configuration at the reaction center carbon."</p>
        </div>
        <div class="ev-card">
          <div class="ev-meta">PPT SLIDE · SLIDE 14</div>
          <div class="ev-title">Lecture · Substitution kinetics</div>
          <p class="ev-quote">"SN2 reaction rate depends bimolecularly on both reactant species. Doubling either substrate or nucleophile doubles the observed rate."</p>
        </div>
        <div class="ev-card">
          <div class="ev-meta">WIKI · NUCLEOPHILIC SUBSTITUTION</div>
          <div class="ev-title">Wikipedia — SN2</div>
          <p class="ev-quote">"Polar aprotic solvents leave the nucleophile relatively 'naked' and reactive, accelerating the bimolecular step."</p>
        </div>
      </div>
      <div class="evidence-panel-foot">
        <button class="btn folio-btn-primary" style="width:100%;justify-content:center">Open full source</button>
      </div>
    </aside>
    <button class="evidence-fab" data-evidence-fab title="Open evidence">${ICONS.evidence}</button>`;
  }
  return `
  <aside class="evidence-panel" data-evidence-panel>
    <div class="evidence-panel-head">
      <div class="h-title">${ICONS.evidence} Evidence</div>
      <div class="spacer"></div>
      <button class="icon-btn light" data-evidence-collapse title="Collapse evidence">${ICONS.chev}</button>
    </div>
    <div class="evidence-panel-body">
      <div class="ev-tabs" data-ev-tabs>
        <button class="active">PDF</button><button>Slides</button><button>Wiki</button><button>Notes</button>
      </div>
      <div class="ev-card selected">
        <div class="ev-meta">CH. 7 · P. 142</div>
        <div class="ev-title">Primary substrates</div>
        <p class="ev-quote">Primary substrates react fastest because steric hindrance is minimized at the transition state.</p>
      </div>
      <div class="ev-card">
        <div class="ev-meta">CH. 7 · P. 145</div>
        <div class="ev-title">Walden inversion</div>
        <p class="ev-quote">The backside attack inverts the stereochemical configuration at the carbon center (Walden inversion).</p>
      </div>
      <div class="ev-card">
        <div class="ev-meta">CH. 7 · P. 150</div>
        <div class="ev-title">Solvent effects</div>
        <p class="ev-quote">Polar aprotic solvents leave the nucleophile relatively "naked" and reactive.</p>
      </div>
    </div>
    <div class="evidence-panel-foot">
      <button class="btn primary" style="width:100%;justify-content:center">Open full source</button>
    </div>
  </aside>
  <button class="evidence-fab" data-evidence-fab title="Open evidence">${ICONS.evidence}</button>`;
}

// ---- Left chat drawer (for reference pages — slides over canvas) ----
function chatDrawer(context = 'SN2 mechanism') {
  // Reuse the tutor panel markup wrapped in a drawer container.
  const panel = tutorPanel(context);
  // The tutorPanel returns "<aside .../>  <button chat-fab .../>".
  // Strip the chat-fab (the drawer has its own close) and wrap aside.
  const asideHtml = panel.replace(/<button class="chat-fab[\s\S]*?<\/button>/, '');
  return `
  <div class="chat-drawer-scrim" data-chat-drawer-scrim></div>
  <div class="chat-drawer" data-chat-drawer>
    <button class="chat-drawer-close" data-chat-drawer-close title="Close chat" aria-label="Close chat">${ICONS.chev.replace('polyline points="9 18 15 12 9 6"', 'polyline points="15 18 9 12 15 6"')}</button>
    <div class="chat-drawer-inner" data-chat-drawer-inner>${asideHtml}</div>
  </div>`;
}

// ---- Tutor panel ----
function tutorPanel(context = 'SN2 mechanism') {
  if (THEME === 'folio') return folioTutor(context);
  if (THEME === 'focus') return focusTutor(context);
  return mistTutor(context);
}

function mistTutor(context) {
  return `
  <aside class="tutor" data-tutor>
    <div class="tutor-header">
      <div class="h-title">${ICONS.cap} Tutor</div>
      <div class="spacer"></div>
      <button class="icon-btn">+ New</button>
      <button class="icon-btn chat-collapse-btn" data-tutor-collapse title="Collapse chat">${ICONS.chev}</button>
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
          <div class="collapse open" data-collapse>
            <div class="collapse-head" data-collapse-head>${ICONS.chev.replace('class="svg-i"', 'class="svg-i chev"')} AGENT ACTIVITY · 2 STEPS · 1:25</div>
            <div class="collapse-body">
              <div class="step"><span class="dot"></span> Checking learning state</div>
              <div class="step active"><span class="dot"></span> <a>Retrieving textbook evidence ↗</a></div>
            </div>
          </div>
          <div class="collapse open" data-collapse>
            <div class="collapse-head" data-collapse-head>${ICONS.chev.replace('class="svg-i"', 'class="svg-i chev"')} THINKING</div>
            <div class="collapse-body">
              <div class="thinking">Leaving groups may need a brief recap based on mastery. The textbook frames SN2 around steric accessibility and backside attack geometry.</div>
            </div>
          </div>
          <p style="margin:8px 0">In an SN2 reaction the nucleophile attacks from the side opposite the leaving group, pushing out the leaving group in a single concerted step.</p>
          <span class="citation">${ICONS.book} Ch. 7 · p. 142</span>
        </div>
      </div>
      <div data-tutor-pane="history" style="display:none">
        ${['SN2 backside attack|Today · 4:32 PM','Leaving group recap|Today · 2:10 PM','Stereochemistry inversion|Yesterday · 9:48 PM','Nucleophile strength|Jun 23 · 6:15 PM','Polar aprotic solvents|Jun 22 · 11:02 AM'].map(h => {const [t,s]=h.split('|');return `<div class="history-item"><div class="t">${t}</div><div class="s">${s}</div></div>`}).join('')}
      </div>
      <div data-tutor-pane="settings" style="display:none">
        <div class="setting-row">Show thinking blocks <div class="switch on" data-switch></div></div>
        <div class="setting-row">Show agent activity <div class="switch on" data-switch></div></div>
        <div class="setting-row">Auto-cite sources <div class="switch on" data-switch></div></div>
        <div class="setting-row">Steerable tutor <div class="switch" data-switch></div></div>
      </div>
    </div>
    <div class="tutor-input">
      <div class="context-chip">Context: ${context}</div>
      <div class="composer" data-composer>
        <textarea placeholder="Ask a follow-up or steer..."></textarea>
        <button class="send" title="Send">${ICONS.send}</button>
      </div>
      <div class="composer-hint"><span>↵ send · ⇧↵ steer</span><span>TutorBook</span></div>
    </div>
  </aside>
  <button class="chat-fab" data-chat-fab title="Open chat">${ICONS.chat}</button>`;
}

function folioTutor(context) {
  return `
  <aside class="tutor folio-tutor" data-tutor>
    <div class="tutor-header folio-tutor-header">
      <div class="h-title folio-h-title">Tutor Session <span class="folio-slash">//</span> <span class="folio-sess">07</span></div>
      <div class="spacer"></div>
      <button class="icon-btn folio-collapse" data-tutor-collapse title="Collapse chat">${ICONS.chev}</button>
    </div>
    <div class="folio-links" data-tutor-tabs>
      <button class="active" data-tab="tutor">Dialogue</button><span class="folio-sep">/</span>
      <button data-tab="history">History</button><span class="folio-sep">/</span>
      <button data-tab="settings">Options</button>
    </div>
    <div class="tutor-body folio-tutor-body" data-tutor-body>
      <div data-tutor-pane="tutor">
        <div class="folio-topic">Topic focus: ${context}</div>
        <div class="folio-msg-user">Student: Elaborate on the stereochemical changes during backside attack.</div>
        <div class="msg-agent">
          <div class="collapse open folio-collapse" data-collapse>
            <div class="collapse-head folio-collapse-head" data-collapse-head>${ICONS.chev.replace('class="svg-i"', 'class="svg-i chev"')} AGENT ACTIVITY</div>
            <div class="collapse-body">
              <div class="step folio-step"><span class="dot"></span> Parsed user stereochemical query ✓</div>
              <div class="step active folio-step"><span class="dot"></span> Retrieving SN2 backside attack evidence…</div>
            </div>
          </div>
          <div class="collapse open folio-collapse" data-collapse>
            <div class="collapse-head folio-collapse-head" data-collapse-head>${ICONS.chev.replace('class="svg-i"', 'class="svg-i chev"')} THINKING PROCESS</div>
            <div class="collapse-body">
              <div class="thinking folio-thinking">The student wants to understand stereochemical inversion. I should explain the Walden inversion and tie it to the backside-attack geometry.</div>
            </div>
          </div>
          <p class="folio-prose">The backside attack inverts the configuration at the reacting carbon — the three substituents flip through a planar transition state, producing the opposite stereoisomer.</p>
          <span class="citation folio-citation">[Reference: Ch. 7, p. 142]</span>
        </div>
      </div>
      <div data-tutor-pane="history" style="display:none">
        ${['SN2 backside attack|Today · 4:32 PM','Leaving group recap|Today · 2:10 PM','Stereochemistry inversion|Yesterday · 9:48 PM'].map(h => {const [t,s]=h.split('|');return `<div class="history-item folio-history"><div class="t">${t}</div><div class="s">${s}</div></div>`}).join('')}
      </div>
      <div data-tutor-pane="settings" style="display:none">
        <div class="setting-row folio-setting">Show thinking process <div class="switch on" data-switch></div></div>
        <div class="setting-row folio-setting">Auto-cite sources <div class="switch on" data-switch></div></div>
        <div class="setting-row folio-setting">Editorial prose <div class="switch on" data-switch></div></div>
      </div>
    </div>
    <div class="tutor-input folio-tutor-input">
      <div class="folio-composer" data-composer>
        <textarea placeholder="Write your inquiry here..."></textarea>
        <button class="send folio-send" title="Send">${ICONS.send}</button>
      </div>
    </div>
  </aside>
  <button class="chat-fab folio-fab" data-chat-fab title="Open chat">${ICONS.chat}</button>`;
}

function focusTutor(context) {
  return `
  <aside class="tutor focus-tutor" data-tutor>
    <div class="tutor-header focus-tutor-header">
      <div class="h-title focus-h-title">Tutor Assistant</div>
      <div class="spacer"></div>
      <button class="icon-btn focus-collapse" data-tutor-collapse title="Collapse chat">${ICONS.chev}</button>
    </div>
    <div class="tutor-body focus-tutor-body" data-tutor-body>
      <div data-tutor-pane="tutor">
        <p class="focus-prose">I've centered your Study Map on the canvas. Click any node to read the concept details or launch a practice quiz.</p>
        <div class="collapse open focus-collapse" data-collapse>
          <div class="collapse-head focus-collapse-head" data-collapse-head>${ICONS.chev.replace('class="svg-i"', 'class="svg-i chev"')} Agent steps</div>
          <div class="collapse-body">
            <div class="step focus-step"><span class="dot"></span> Centered map on SN2</div>
            <div class="step active focus-step"><span class="dot"></span> Ready for your question</div>
          </div>
        </div>
        <div class="collapse focus-collapse" data-collapse>
          <div class="collapse-head focus-collapse-head" data-collapse-head>${ICONS.chev.replace('class="svg-i"', 'class="svg-i chev"')} Thinking</div>
          <div class="collapse-body"><div class="thinking focus-thinking">Distraction-free mode: minimal chrome, focused surface.</div></div>
        </div>
      </div>
    </div>
    <div class="tutor-input focus-tutor-input">
      <div class="composer focus-composer" data-composer>
        <textarea placeholder="Ask a question..."></textarea>
        <button class="send focus-send" title="Send">${ICONS.send}</button>
      </div>
    </div>
  </aside>
  <button class="chat-fab focus-fab" data-chat-fab title="Open chat">${ICONS.chat}</button>`;
}

// ---- Floating navigation overlay (visible on every page) ----
function floatNav() {
  const r = THEME_META[THEME].root;
  const items = [
    { key: 'index', href: `${r}index.html`, label: 'Home', icon: ICONS.grid },
    { key: 'dashboard', href: `${r}dashboard.html`, label: 'Dashboard', icon: ICONS.grid },
    { key: 'study-map', href: `${r}study-map.html`, label: 'Study Map', icon: ICONS.map },
    { key: 'curriculum', href: `${r}curriculum.html`, label: 'Curriculum', icon: ICONS.list },
    { key: 'source-wiki', href: `${r}source-wiki.html`, label: 'Source Wiki', icon: ICONS.wiki },
    { key: 'interactive-quiz', href: `${r}interactive-quiz.html`, label: 'Quiz', icon: ICONS.list },
    { key: 'evidence-open', href: `${r}evidence-open.html`, label: 'Evidence', icon: ICONS.evidence },
  ];
  // Detect current page from URL to mark active.
  const path = location.pathname.split('/').pop() || 'index.html';
  const itemsHtml = items.map((it) => {
    const active = it.href.endsWith(path) ? ' active' : '';
    return `<a class="fn-item${active}" href="${it.href}" title="${it.label}">${it.icon}<span>${it.label}</span></a>`;
  }).join('<div class="fn-sep"></div>');

  const themeMenu = Object.entries(THEME_META).map(([k, m]) => {
    const cur = k === THEME ? '<span class="d">current</span>' : `<span class="d">${m.desc}</span>`;
    return `<a href="${k === 'mist' ? '../index.html' : '../' + m.root + 'index.html'}"><span class="sw ${m.sw}"></span> ${m.label} ${cur}</a>`;
  }).join('');

  return `
  <nav class="floatnav" data-floatnav aria-label="Primary">
    <div class="brand-dot">TB</div>
    <div class="fn-group">${itemsHtml}</div>
    <div class="fn-sep"></div>
    <button class="fn-theme" data-fn-theme title="Switch theme">${THEME_META[THEME].label} ▾</button>
    <div class="floatnav-menu" data-fn-menu>${themeMenu}</div>
  </nav>`;
}

document.addEventListener('DOMContentLoaded', () => {
  // Inject topbar
  document.querySelectorAll('[data-include="topbar"]').forEach((el) => {
    el.classList.add('topbar');
    el.innerHTML = topbar();
  });
  // Inject statusbar
  document.querySelectorAll('[data-include="statusbar"]').forEach((el) => {
    el.classList.add('statusbar');
    el.innerHTML = statusbar();
  });
  // Inject drawer
  document.querySelectorAll('[data-include="drawer"]').forEach((el) => {
    el.classList.add('drawer');
    el.setAttribute('data-drawer', '');
    el.innerHTML = drawer();
  });
  // Inject tutor panel
  document.querySelectorAll('[data-include="tutor"]').forEach((el) => {
    const ctx = el.dataset.context || 'SN2 mechanism';
    el.innerHTML = tutorPanel(ctx);
  });
  // Inject evidence panel: auto into any .workspace that already has a tutor,
  // plus any explicit [data-include="evidence-panel"] placeholders.
  document.querySelectorAll('div[data-include="evidence-panel"]').forEach((el) => {
    el.innerHTML = evidencePanel();
  });
  document.querySelectorAll('.workspace').forEach((ws) => {
    if (ws.querySelector('[data-evidence-panel]')) return; // already has one
    if (ws.querySelector('[data-tutor]')) {
      // Only auto-add the docked evidence panel to workspace pages that opted in
      // via data-evidence attribute on the .workspace element.
      if (ws.dataset.evidence !== undefined) {
        const wrap = document.createElement('div');
        wrap.innerHTML = evidencePanel();
        // evidencePanel() returns <aside .../> + <button evidence-fab .../>
        Array.from(wrap.children).forEach((c) => ws.appendChild(c));
      }
    }
  });
  // Inject left chat drawer for reference pages (.ref-page) unless disabled.
  if (document.querySelector('.ref-page') && !document.querySelector('[data-chat-drawer]')) {
    const ctx = (document.body.dataset.chatContext) || 'SN2 mechanism';
    const wrap = document.createElement('div');
    wrap.innerHTML = chatDrawer(ctx);
    Array.from(wrap.children).forEach((c) => document.body.appendChild(c));
    // Re-parent the chat-fab out of the drawer so it acts as the reopen button.
    const drawerFab = document.querySelector('[data-chat-drawer] .chat-fab');
    if (drawerFab) drawerFab.remove();
  }
  // Inject floating nav on every page (append to body)
  if (!document.querySelector('[data-floatnav]')) {
    const navWrap = document.createElement('div');
    navWrap.innerHTML = floatNav();
    document.body.appendChild(navWrap.firstElementChild);
  }

  // Bind theme menu toggle + interactions.
  if (window.initInteractions) window.initInteractions();
  bindFloatNav();
});

function bindFloatNav() {
  const btn = document.querySelector('[data-fn-theme]');
  const menu = document.querySelector('[data-fn-menu]');
  if (btn && menu && !btn.__fnBound) {
    btn.__fnBound = true;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('open');
    });
  }
}
