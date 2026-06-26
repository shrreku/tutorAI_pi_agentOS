/* Sunrise chrome registration. See partials.js for the contract.
   Warm & friendly: light coral chat sidebar + delightful bento dashboard. */
(function () {
  const I = (window.TB && window.TB.ICONS) || {};
  window.TB_THEMES = window.TB_THEMES || {};

  window.TB_THEMES.sunrise = {
    topbar() {
      return `
        <div class="brand">
          <div class="logo">TB</div>
          <div class="title">TutorBook <span class="sunrise-edition">Sunrise</span></div>
        </div>
        <div class="spacer"></div>
        <div class="search" data-open-palette>${I.search}<input placeholder="Search your cozy library…" /><span class="kbd">⌘K</span></div>
        <span class="credits">${I.bolt}<span class="meter"><span style="width:71%"></span></span> 71%</span>
        <a class="avatar" href="account.html" title="Account">SK</a>`;
    },

    statusbar() {
      return `
        <div class="left">Study Map · 24 nodes · 31 references</div>
        <div class="center">Selected: SN2 mechanism</div>
        <div class="right"><span class="accent">Objective: Obj 5 · SN2 mechanism ☀️</span></div>`;
    },

    tutor(context = "SN2 mechanism") {
      return `
      <aside class="tutor" data-tutor>
        <div class="tutor-header">
          <div class="h-title"><span class="cap-ico">${I.cap}</span> Your Tutor</div>
          <div class="spacer"></div>
          <button class="icon-btn dark" data-tutor-collapse title="Collapse">${I.chev}</button>
        </div>
        <div class="tutor-tabs" data-tutor-tabs>
          <button class="active" data-tab="tutor">Chat</button>
          <button data-tab="history">History</button>
          <button data-tab="settings">Options</button>
        </div>
        <div class="tutor-body" data-tutor-body>
          <div data-tutor-pane="tutor">
            <div class="focus-row">Topic focus: <span class="badge purple">${context}</span></div>
            <div class="msg-user">Can you walk me through the stereochemical changes during the backside attack?</div>
            <div class="msg-agent">
              <div class="agent-avatar-line"><span class="av">${I.cap}</span> TutorBook</div>
              <div class="collapse open" data-collapse>
                <div class="collapse-head" data-collapse-head>${I.chev.replace('class="svg-i"', 'class="svg-i chev"')} AGENT ACTIVITY <span class="timer">1.4s</span></div>
                <div class="collapse-body">
                  <div class="step"><span class="dot"></span> Parsed stereochemical query</div>
                  <div class="toolcall"><span class="tc-ico">${I.book}</span><span class="tc-name">retrieve("Walden inversion")</span><span class="tc-status">done</span></div>
                  <div class="step active"><span class="dot"></span> Writing a friendly explanation…</div>
                </div>
              </div>
              <div class="collapse open" data-collapse>
                <div class="collapse-head" data-collapse-head>${I.chev.replace('class="svg-i"', 'class="svg-i chev"')} THINKING</div>
                <div class="collapse-body"><div class="thinking">Tie the Walden inversion to the backside-attack geometry, keep it warm and encouraging, then cite Ch. 7.</div></div>
              </div>
              <p>Great question! 🙌 The backside attack flips the configuration at the reacting carbon — the three substituents turn through a flat transition state, giving you the opposite stereoisomer.</p>
              <span class="citation">${I.book} Ch. 7 · p. 142</span>
              <div class="artifact-chip"><span class="ac-ico">${I.layers}</span><div><div class="ac-t">Walden inversion · figure</div><div class="ac-s">Generated study aid</div></div></div>
            </div>
          </div>
          <div data-tutor-pane="history" style="display:none">
            ${[
              "SN2 backside attack|Today · 4:32 PM",
              "Leaving group recap|Today · 2:10 PM",
              "Stereochemistry inversion|Yesterday · 9:48 PM",
            ]
              .map((h) => {
                const [t, s] = h.split("|");
                return `<div class="history-item"><div class="t">${t}</div><div class="s">${s}</div></div>`;
              })
              .join("")}
          </div>
          <div data-tutor-pane="settings" style="display:none">
            <div class="setting-row">Show thinking <div class="switch on" data-switch></div></div>
            <div class="setting-row">Auto-cite sources <div class="switch on" data-switch></div></div>
            <div class="setting-row">Encouraging tone <div class="switch on" data-switch></div></div>
          </div>
        </div>
        <div class="tutor-input">
          <div class="context-chip">${I.spark} Context: ${context}</div>
          <div class="composer" data-composer>
            <textarea placeholder="Ask me anything…"></textarea>
            <button class="send" title="Send">${I.send}</button>
          </div>
          <div class="composer-hint"><span>↵ send · ⇧↵ newline</span><span>Session 07</span></div>
        </div>
      </aside>
      <button class="chat-fab" data-chat-fab title="Open chat">${I.chat}</button>`;
    },

    dashboard() {
      const bars = [
        ["M", 40, 1],
        ["T", 70, 1],
        ["W", 25, 1],
        ["T", 90, 0],
        ["F", 55, 1],
        ["S", 15, 1],
        ["S", 60, 1],
      ]
        .map(
          ([l, h, faint]) =>
            `<div><div class="bar" style="height:${h}%${faint ? ";background:var(--text-faint)" : ""}"></div><div class="lbl">${l}</div></div>`,
        )
        .join("");
      return `
      <div class="sun-wrap">
        <div class="sun-hero">
          <div class="sun-hero-text">
            <h1 class="sun-hello">Good morning, Shreyash ☀️</h1>
            <p class="sun-sub">You're on a roll! Just two objectives stand between you and finishing Chapter 7 — let's make today count.</p>
          </div>
          <div class="sun-streak">
            <span class="flame">🔥</span>
            <div><div class="sk-n">8 days</div><div class="sk-l">learning streak</div></div>
          </div>
        </div>

        <div class="sun-bento">
          <!-- Continue learning hero -->
          <a class="sun-tile sun-continue span-2 row-2" href="study-map.html">
            <div>
              <div class="ct-top">
                <div class="ct-head">
                  <div class="ct-kick">Continue learning</div>
                  <div class="ct-title">Organic Chemistry I · Ch. 7 Substitution</div>
                  <div class="ct-meta">3 of 8 modules mastered · last opened Thursday</div>
                </div>
                <div class="ct-ring"><div class="inner">60%</div></div>
              </div>
              <p class="ct-prose">Two objectives left — backside-attack stereochemistry and product separation — and the chapter is yours. You've got this! 💪</p>
            </div>
            <div class="ct-actions">
              <span class="ct-btn">${I.play} Continue</span>
              <span class="ct-btn ghost">Review concept</span>
            </div>
          </a>

          <!-- Mastery rings -->
          <div class="sun-tile span-2">
            <h3><span class="emoji">🎯</span> Concept mastery</h3>
            <div class="sun-rings">
              <div class="sun-ring-item">
                <div class="sun-ring coral" style="--p:92%"><div class="ring-in">92%</div></div>
                <div><div class="rl">SN2 Mechanism</div><div class="rs">Mastered</div></div>
              </div>
              <div class="sun-ring-item">
                <div class="sun-ring red" style="--p:45%"><div class="ring-in">45%</div></div>
                <div><div class="rl">Stereochemistry</div><div class="rs">Needs review</div></div>
              </div>
              <div class="sun-ring-item">
                <div class="sun-ring amber" style="--p:71%"><div class="ring-in">71%</div></div>
                <div><div class="rl">Leaving Groups</div><div class="rs">Almost there</div></div>
              </div>
            </div>
          </div>

          <!-- Notebook tiles -->
          <a class="sun-nb chem" href="study-map.html">
            <div class="nb-emoji">🧪</div>
            <div class="nb-t">Organic Chemistry I</div>
            <div class="nb-ch">Ch. 7 · Substitution</div>
            <div class="nb-bar"><div class="progress"><span style="width:60%"></span></div><span class="pct">60%</span></div>
          </a>
          <a class="sun-nb math" href="study-map.html">
            <div class="nb-emoji">📐</div>
            <div class="nb-t">Linear Algebra</div>
            <div class="nb-ch">Vector Spaces</div>
            <div class="nb-bar"><div class="progress"><span class="blue" style="width:32%"></span></div><span class="pct">32%</span></div>
          </a>
          <a class="sun-nb bio" href="study-map.html">
            <div class="nb-emoji">🔬</div>
            <div class="nb-t">Cell Biology</div>
            <div class="nb-ch">Cell Division</div>
            <div class="nb-bar"><div class="progress"><span class="green" style="width:88%"></span></div><span class="pct">88%</span></div>
          </a>

          <!-- Today's plan -->
          <div class="sun-tile">
            <h3><span class="emoji">📋</span> Today's plan</h3>
            <div class="sun-plan-item done"><div class="chk done">✓</div><div class="pl-label">Read §4.2 · Chiral centers</div><div class="pl-time">8m</div></div>
            <div class="sun-plan-item"><div class="chk next">▶</div><div class="pl-label">Practice 5 Stereocenter cards</div><div class="pl-time">5m</div></div>
            <div class="sun-plan-item"><div class="chk todo">3</div><div class="pl-label">Quiz · Identifying stereocenters</div><div class="pl-time">7m</div></div>
          </div>

          <!-- Library stats -->
          <div class="sun-tile">
            <h3><span class="emoji">📚</span> Your library</h3>
            <div class="sun-statgrid">
              <div class="sun-stat"><div class="n">7</div><div class="l">Sources</div></div>
              <div class="sun-stat"><div class="n">1,200</div><div class="l">Pages</div></div>
              <div class="sun-stat"><div class="n">14</div><div class="l">Concepts</div></div>
              <div class="sun-stat"><div class="n">3</div><div class="l">Notebooks</div></div>
            </div>
          </div>

          <!-- Weekly activity bars -->
          <div class="sun-tile span-2">
            <h3><span class="emoji">📈</span> This week</h3>
            <div class="bars">${bars}</div>
            <div class="sun-week-foot"><b>4h 20m</b> studied · peak Thursday · <b>8-day</b> streak 🔥</div>
          </div>

          <!-- Encouraging tutor note -->
          <div class="sun-tile sun-note span-2">
            <h3><span class="emoji">💌</span> A note from your tutor</h3>
            <p class="nt-prose">You're doing wonderfully with SN2 rate equations — the bimolecular intuition has really clicked. Stereochemical inversion is still finding its feet at 45%, so let's give stereocenters some love next.</p>
            <p class="nt-quote">"Think of an umbrella flipping inside-out in the wind — that's the Walden inversion. ☂️"</p>
          </div>

          <!-- Quick links -->
          <a class="sun-tile" href="page-flashcards.html">
            <h3><span class="emoji">🃏</span> Flashcards</h3>
            <p class="sun-sub" style="margin:0">Review 12 weak cards from Ch. 7 →</p>
          </a>
          <a class="sun-tile" href="page-quiz.html">
            <h3><span class="emoji">❓</span> Quick quiz</h3>
            <p class="sun-sub" style="margin:0">Practice · Nucleophiles & stereocenters →</p>
          </a>
        </div>
      </div>`;
    },

    evidencePanel() {
      return `
      <aside class="evidence-panel" data-evidence-panel>
        <div class="evidence-panel-head"><div class="h-title">${I.evidence} Evidence Sources</div><div class="spacer"></div><button class="icon-btn" data-evidence-collapse title="Collapse">${I.chev}</button></div>
        <div class="evidence-panel-body">
          <div class="ev-tabs" data-ev-tabs><button class="active">PDF</button><button>Slides</button><button>Wiki</button><button>Notes</button></div>
          <div class="ev-card selected"><div class="ev-meta">PDF · PAGE 341</div><div class="ev-title">Clayden Organic Chemistry</div><p class="ev-quote">"…the nucleophile attacks from the side opposite the leaving group. This backside attack causes a concerted inversion of configuration."</p></div>
          <div class="ev-card"><div class="ev-meta">PPT · SLIDE 14</div><div class="ev-title">Lecture · Substitution kinetics</div><p class="ev-quote">"SN2 rate depends bimolecularly on both species. Doubling either doubles the observed rate."</p></div>
          <div class="ev-card"><div class="ev-meta">WIKI · SN2</div><div class="ev-title">Nucleophilic substitution</div><p class="ev-quote">"Polar aprotic solvents leave the nucleophile relatively 'naked' and reactive."</p></div>
        </div>
        <div class="evidence-panel-foot"><a class="btn primary block" href="page-source.html">Open full source</a></div>
      </aside>
      <button class="evidence-fab" data-evidence-fab title="Open evidence">${I.evidence}</button>`;
    },

    drawer() {
      return `
        <div class="drawer-head">${I.evidence}<strong>Evidence Sources</strong><div style="flex:1"></div><button class="icon-btn" data-drawer-close>Close</button></div>
        <div class="drawer-body">
          <div class="ev-card selected"><div class="ev-meta">PDF · PAGE 341</div><div class="ev-title">Clayden Organic Chemistry</div><p class="ev-quote">"…the nucleophile attacks from the side opposite the leaving group, causing a concerted inversion of configuration."</p></div>
          <div class="ev-card"><div class="ev-meta">PPT · SLIDE 14</div><div class="ev-title">Lecture · Substitution kinetics</div><p class="ev-quote">"SN2 rate depends bimolecularly on both reactant species."</p></div>
        </div>
        <div class="drawer-foot"><a class="btn primary block" href="page-source.html">Open full source</a></div>`;
    },
  };
})();
