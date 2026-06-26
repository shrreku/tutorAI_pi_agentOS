/* Folio chrome registration. See partials.js for the contract. */
(function () {
  const I = (window.TB && window.TB.ICONS) || {};
  window.TB_THEMES = window.TB_THEMES || {};

  window.TB_THEMES.folio = {
    topbar() {
      return `
        <div class="brand">
          <div class="logo">TB</div>
          <div class="title">TutorBook <span class="folio-edition">Editorial Edition</span></div>
        </div>
        <div class="spacer"></div>
        <div class="search" data-open-palette>${I.search}<input placeholder="Search the library…" /><span class="kbd">⌘K</span></div>
        <span class="credits">${I.bolt}<span class="meter"><span style="width:71%"></span></span> 71%</span>
        <a class="avatar" href="account.html" title="Account">SK</a>`;
    },

    statusbar() {
      return `
        <div class="left">Study Map · 24 nodes · 31 references</div>
        <div class="center">Selected: SN2 mechanism</div>
        <div class="right"><span class="accent">Objective: Obj 5 · SN2 mechanism</span></div>`;
    },

    tutor(context = 'SN2 mechanism') {
      return `
      <aside class="tutor" data-tutor>
        <div class="tutor-header">
          <div class="h-title"><span class="cap-ico">${I.cap}</span> Tutor's Desk</div>
          <div class="spacer"></div>
          <button class="icon-btn dark" data-tutor-collapse title="Collapse">${I.chev}</button>
        </div>
        <div class="tutor-tabs" data-tutor-tabs>
          <button class="active" data-tab="tutor">Dialogue</button>
          <button data-tab="history">History</button>
          <button data-tab="settings">Options</button>
        </div>
        <div class="tutor-body" data-tutor-body>
          <div data-tutor-pane="tutor">
            <div class="focus-row">Topic focus: <span class="badge purple">${context}</span></div>
            <div class="msg-user">Elaborate on the stereochemical changes during the backside attack.</div>
            <div class="msg-agent">
              <div class="agent-avatar-line"><span class="av">${I.cap}</span> TutorBook</div>
              <div class="collapse open" data-collapse>
                <div class="collapse-head" data-collapse-head>${I.chev.replace('class="svg-i"','class="svg-i chev"')} AGENT ACTIVITY <span class="timer">1.4s</span></div>
                <div class="collapse-body">
                  <div class="step"><span class="dot"></span> Parsed stereochemical query</div>
                  <div class="toolcall"><span class="tc-ico">${I.book}</span><span class="tc-name">retrieve("Walden inversion")</span><span class="tc-status">done</span></div>
                  <div class="step active"><span class="dot"></span> Composing the explanation…</div>
                </div>
              </div>
              <div class="collapse open" data-collapse>
                <div class="collapse-head" data-collapse-head>${I.chev.replace('class="svg-i"','class="svg-i chev"')} THINKING</div>
                <div class="collapse-body"><div class="thinking">The student wants the inversion mechanism. Tie the Walden inversion to backside-attack geometry, then cite Ch. 7.</div></div>
              </div>
              <p>The backside attack inverts the configuration at the reacting carbon — the three substituents flip through a planar transition state, producing the opposite stereoisomer.</p>
              <span class="citation">${I.book} Ch. 7 · p. 142</span>
              <div class="artifact-chip"><span class="ac-ico">${I.layers}</span><div><div class="ac-t">Walden inversion · figure</div><div class="ac-s">Generated study aid</div></div></div>
            </div>
          </div>
          <div data-tutor-pane="history" style="display:none">
            ${['SN2 backside attack|Today · 4:32 PM','Leaving group recap|Today · 2:10 PM','Stereochemistry inversion|Yesterday · 9:48 PM'].map(h=>{const[t,s]=h.split('|');return `<div class="history-item"><div class="t">${t}</div><div class="s">${s}</div></div>`}).join('')}
          </div>
          <div data-tutor-pane="settings" style="display:none">
            <div class="setting-row">Show thinking <div class="switch on" data-switch></div></div>
            <div class="setting-row">Auto-cite sources <div class="switch on" data-switch></div></div>
            <div class="setting-row">Editorial prose <div class="switch on" data-switch></div></div>
          </div>
        </div>
        <div class="tutor-input">
          <div class="context-chip">${I.spark} Context: ${context}</div>
          <div class="composer" data-composer>
            <textarea placeholder="Write your inquiry…"></textarea>
            <button class="send" title="Send">${I.send}</button>
          </div>
          <div class="composer-hint"><span>↵ send · ⇧↵ newline</span><span>Session 07</span></div>
        </div>
      </aside>
      <button class="chat-fab" data-chat-fab title="Open chat">${I.chat}</button>`;
    },

    dashboard() {
      const bars = [['M',40,1],['T',70,1],['W',25,1],['T',90,0],['F',55,1],['S',15,1],['S',60,1]]
        .map(([l,h,faint])=>`<div style="flex:1"><div class="bar" style="height:${h}%${faint?';background:var(--text-faint)':''}"></div><div class="lbl">${l}</div></div>`).join('');
      return `
      <div class="folio-masthead">
        <div class="folio-edition-line"><span>The Study Journal · Vol. III</span><span>Friday, 26 June · Edition 07</span></div>
        <h1 class="folio-mast-title">Welcome back, Shreyash.</h1>
        <p class="folio-mast-sub">Your library holds three active notebooks, fourteen concepts under study, and a tutor with a fresh recommendation for the morning's reading.</p>
      </div>
      <div class="dash">
        <div>
          <div class="folio-kicker">Library Catalogue</div>
          <div class="card" style="margin-bottom:18px"><div class="search" data-open-palette style="width:100%;background:var(--bg-soft);border-color:var(--border)">${I.search}<input placeholder="Search notebooks & sources…" /></div></div>
          <div class="card" style="margin-bottom:18px">
            <h3>The Shelf</h3>
            <div class="folio-statgrid">
              <div class="stat-card"><div class="n">7</div><div class="l">Ingested sources</div></div>
              <div class="stat-card"><div class="n">1,200</div><div class="l">Pages indexed</div></div>
              <div class="stat-card"><div class="n">14</div><div class="l">Active concepts</div></div>
              <div class="stat-card"><div class="n">3</div><div class="l">Notebooks</div></div>
            </div>
          </div>
          <div class="card" style="margin-bottom:18px">
            <h3>Concepts Mastery Ledger</h3>
            <div class="folio-mastery-row"><div class="folio-mastery-label"><span>SN2 Mechanism</span><span class="pct">92%</span></div><div class="progress"><span style="width:92%"></span></div></div>
            <div class="folio-mastery-row"><div class="folio-mastery-label"><span>Stereochemistry <span class="badge red" style="margin-left:6px">Review</span></span><span class="pct">45%</span></div><div class="progress"><span class="red" style="width:45%"></span></div></div>
            <div class="folio-mastery-row"><div class="folio-mastery-label"><span>Leaving Groups</span><span class="pct">71%</span></div><div class="progress"><span style="width:71%"></span></div></div>
          </div>
          <div class="card">
            <h3>Weekly Study Activity</h3>
            <div class="bars">${bars}</div>
            <div class="muted" style="font-family:var(--font-ui);font-size:12px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-soft)"><span style="color:var(--accent-deep);font-weight:700">4h 20m</span> studied · peak Thursday · <span style="color:var(--accent-deep);font-weight:700">6-day</span> streak</div>
          </div>
        </div>
        <div>
          <div class="folio-kicker">Featured Lead</div>
          <div class="folio-lead" style="margin-bottom:18px">
            <h2 class="folio-lead-title">Organic Chemistry I · Ch. 7 Substitution</h2>
            <div class="folio-byline">60% complete · 3 of 8 modules mastered · last opened Thursday</div>
            <p class="folio-prose" style="margin:14px 0 0">The bimolecular substitution pathway is nearly within reach. Two objectives remain — backside-attack stereochemistry and product separation — before the chapter closes and elimination begins.</p>
            <div class="folio-lead-actions"><a class="btn primary" href="study-map.html">Continue reading</a><a class="btn" href="page-concept.html">Review concept</a></div>
          </div>
          <div class="folio-kicker">Active Notebooks</div>
          <a class="folio-nb chem" href="study-map.html"><div class="spine"></div><div><div class="row gap-10 wrap" style="align-items:baseline"><span class="t">Organic Chemistry I</span><span class="chapter">Ch. 7 · Substitution</span></div><div class="meta-row"><span>7 sources</span><span>·</span><span>14 concepts</span><span>·</span><span class="next">Next: SN1 elimination</span></div><div class="bar-wrap"><div class="progress"><span style="width:60%"></span></div><span class="pct">60%</span></div></div><div class="side"><span class="badge orange">Chemistry</span><span class="open">Open →</span></div></a>
          <a class="folio-nb math" href="study-map.html"><div class="spine"></div><div><div class="row gap-10 wrap" style="align-items:baseline"><span class="t">Linear Algebra</span><span class="chapter">Vector Spaces</span></div><div class="meta-row"><span>4 sources</span><span>·</span><span>9 concepts</span><span>·</span><span class="next">Next: Basis & dimension</span></div><div class="bar-wrap"><div class="progress"><span style="width:32%"></span></div><span class="pct">32%</span></div></div><div class="side"><span class="badge blue">Mathematics</span><span class="open">Open →</span></div></a>
          <a class="folio-nb bio" href="study-map.html"><div class="spine"></div><div><div class="row gap-10 wrap" style="align-items:baseline"><span class="t">Cell Biology</span><span class="chapter">Cell Division</span></div><div class="meta-row"><span>5 sources</span><span>·</span><span>11 concepts</span><span>·</span><span class="next">Next: Mitosis wrap-up</span></div><div class="bar-wrap"><div class="progress"><span style="width:88%"></span></div><span class="pct">88%</span></div></div><div class="side"><span class="badge green">Biology</span><span class="open">Open →</span></div></a>
          <div class="card" style="margin-top:18px">
            <h3>Recent Activity Ledger</h3>
            <div class="folio-tl-item"><div class="folio-tl-date">Thu</div><div class="folio-tl-body"><div class="t">Completed quiz: Stereochemistry</div><div class="s">Scored 80% · mastered chiral configuration</div></div></div>
            <div class="folio-tl-item"><div class="folio-tl-date">Thu</div><div class="folio-tl-body"><div class="t">Ingested SN2_Mechanisms.pdf</div><div class="s">Generated 10 flashcards & 3 quiz questions</div></div></div>
            <div class="folio-tl-item"><div class="folio-tl-date">Wed</div><div class="folio-tl-body"><div class="t">Tutor session · Walden inversion</div><div class="s">Cited Ch. 7, p. 142 · 4 messages</div></div></div>
          </div>
        </div>
        <div>
          <div class="folio-kicker">From Your Tutor</div>
          <div class="card folio-letter" style="margin-bottom:18px">
            <p class="folio-salutation">Dear Shreyash,</p>
            <p class="folio-prose">I've analysed your recent quiz performance. You're doing excellent work with SN2 rate equations — the bimolecular intuition is settling in nicely. Stereochemical inversion, however, is still wobbling at 45%. Let's turn to stereocenters next.</p>
            <div class="folio-pullquote">"Think of an umbrella flipping inside-out in a gust of wind — that is the Walden inversion."</div>
            <p class="folio-signoff">— TutorBook // Session 07</p>
          </div>
          <div class="folio-kicker">Recommended Plan</div>
          <div class="card" style="margin-bottom:18px;border-color:var(--orange)">
            <div class="folio-plan-item"><div class="mark done">✓</div><div class="label">Read §4.2 · Chiral centers</div><div class="time">8m</div></div>
            <div class="folio-plan-item"><div class="mark next">▶</div><div class="label">Practice 5 Stereocenter flashcards</div><div class="time">5m</div></div>
            <div class="folio-plan-item"><div class="mark todo">3</div><div class="label">Quiz · Identifying stereocenters</div><div class="time">7m</div></div>
          </div>
          <div class="card" style="border-color:var(--green)">
            <h3>Editor's Note</h3>
            <p class="folio-prose">Your Cell Biology notebook is 88% complete — one strong session could finish it. Consider closing it out this weekend to clear the shelf.</p>
          </div>
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
