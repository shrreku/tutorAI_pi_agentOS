/* Focus chrome registration. See partials.js for the contract.
   Minimalist slate — light/white tutor, blue accents, serif (Lora) headings,
   a single centered calm dashboard column. */
(function () {
  const I = (window.TB && window.TB.ICONS) || {};
  window.TB_THEMES = window.TB_THEMES || {};

  window.TB_THEMES.focus = {
    topbar() {
      return `
        <div class="brand">
          <div class="logo">TB</div>
          <div class="title">Organic Chemistry I</div>
          <span class="badge purple">TEXTBOOK INDEXED</span>
        </div>
        <div class="spacer"></div>
        <div class="search" data-open-palette>${I.search}<input placeholder="Search or jump to…" /><span class="kbd">⌘K</span></div>
        <span class="credits">${I.bolt}<span class="meter"><span style="width:71%"></span></span> 71%</span>
        <a class="avatar" href="account.html" title="Account">SK</a>`;
    },

    statusbar() {
      return `
        <div class="left">Study Map · 24 nodes · 31 edges</div>
        <div class="center">Selected: SN2 mechanism</div>
        <div class="right"><span class="accent">Objective: Obj 5 · SN2 mechanism</span></div>`;
    },

    tutor(context = 'SN2 mechanism') {
      return `
      <aside class="tutor" data-tutor>
        <div class="tutor-header">
          <div class="h-title"><span class="cap-ico">${I.cap}</span> Tutor</div>
          <div class="spacer"></div>
          <button class="icon-btn dark">${I.plus} New</button>
          <button class="icon-btn dark" data-tutor-collapse title="Collapse chat">${I.chev}</button>
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
              <div class="agent-avatar-line"><span class="av">${I.cap}</span> TutorBook</div>
              <div class="collapse open" data-collapse>
                <div class="collapse-head" data-collapse-head>${I.chev.replace('class="svg-i"','class="svg-i chev"')} AGENT ACTIVITY · 3 STEPS <span class="timer">1.4s</span></div>
                <div class="collapse-body">
                  <div class="step"><span class="dot"></span> Checking learning state</div>
                  <div class="toolcall"><span class="tc-ico">${I.book}</span><span class="tc-name">retrieve_evidence("SN2 backside")</span><span class="tc-status">done</span></div>
                  <div class="step active"><span class="dot"></span> <a>Synthesising explanation ↗</a></div>
                </div>
              </div>
              <div class="collapse open" data-collapse>
                <div class="collapse-head" data-collapse-head>${I.chev.replace('class="svg-i"','class="svg-i chev"')} THINKING</div>
                <div class="collapse-body"><div class="thinking">Leaving groups may need a brief recap based on mastery. The textbook frames SN2 around steric accessibility and backside-attack geometry.</div></div>
              </div>
              <p class="lead">In an SN2 reaction the nucleophile attacks from the side opposite the leaving group, pushing it out in one concerted step.</p>
              <p>The carbon's configuration inverts — a Walden inversion — flipping the three remaining substituents through a planar transition state.</p>
              <span class="citation">${I.book} Ch. 7 · p. 142</span>
              <div class="artifact-chip"><span class="ac-ico">${I.layers}</span><div><div class="ac-t">SN2 stereochemistry · 5-card deck</div><div class="ac-s">Generated study aid · tap to review</div></div></div>
            </div>
          </div>
          <div data-tutor-pane="history" style="display:none">
            ${['SN2 backside attack|Today · 4:32 PM','Leaving group recap|Today · 2:10 PM','Stereochemistry inversion|Yesterday · 9:48 PM','Nucleophile strength|Jun 23 · 6:15 PM','Polar aprotic solvents|Jun 22 · 11:02 AM'].map(h=>{const[t,s]=h.split('|');return `<div class="history-item"><div class="t">${t}</div><div class="s">${s}</div></div>`}).join('')}
          </div>
          <div data-tutor-pane="settings" style="display:none">
            <div class="setting-row">Show thinking blocks <div class="switch on" data-switch></div></div>
            <div class="setting-row">Show agent activity <div class="switch on" data-switch></div></div>
            <div class="setting-row">Auto-cite sources <div class="switch on" data-switch></div></div>
            <div class="setting-row">Steerable tutor <div class="switch" data-switch></div></div>
          </div>
        </div>
        <div class="tutor-input">
          <div class="context-chip">${I.spark} Context: ${context}</div>
          <div class="composer" data-composer>
            <textarea placeholder="Ask a follow-up or steer…"></textarea>
            <button class="send" title="Send">${I.send}</button>
          </div>
          <div class="composer-hint"><span>↵ send · ⇧↵ newline</span><span>71% credits</span></div>
        </div>
      </aside>
      <button class="chat-fab" data-chat-fab title="Open chat">${I.chat}</button>`;
    },

    dashboard() {
      const bars = [['M',45,0],['T',72,0],['W',28,0],['T',92,0],['F',58,0],['S',16,1],['S',62,0]]
        .map(([l,h,dim])=>`<div><div class="bar${dim?' dim':''}" style="height:${h}%"></div><div class="lbl">${l}</div></div>`).join('');
      return `
      <div class="focus-wrap">
        <div class="focus-head">
          <p class="focus-eyebrow">Friday · 26 June</p>
          <h1 class="focus-greeting">Good afternoon, Shreyash.</h1>
          <p class="focus-sub">Three active notebooks, fourteen concepts under study, and one clear next step from your tutor. Take it one calm session at a time.</p>
        </div>

        <div class="focus-dash-card">
          <div class="focus-dash-grid">

            <div class="focus-col">
              <div class="focus-sec">
                <div class="focus-sec-head">
                  <h3 class="focus-sec-title">Active Notebooks</h3>
                  <a class="focus-link" href="notebooks.html">View all</a>
                </div>
                <a class="focus-nb chem" href="study-map.html">
                  <div class="nb-top"><span class="nb-name">Organic Chemistry I</span><span class="nb-pct">60%</span></div>
                  <div class="nb-meta">7 sources · 14 concepts · Ch. 7 Substitution</div>
                  <div class="progress"><span style="width:60%"></span></div>
                </a>
                <a class="focus-nb math" href="study-map.html">
                  <div class="nb-top"><span class="nb-name">Linear Algebra</span><span class="nb-pct">32%</span></div>
                  <div class="nb-meta">4 sources · 9 concepts · Vector Spaces</div>
                  <div class="progress"><span style="width:32%"></span></div>
                </a>
                <a class="focus-nb bio" href="study-map.html">
                  <div class="nb-top"><span class="nb-name">Cell Biology</span><span class="nb-pct">88%</span></div>
                  <div class="nb-meta">5 sources · 11 concepts · Cell Division</div>
                  <div class="progress"><span style="width:88%"></span></div>
                </a>
              </div>

              <div class="focus-sec">
                <div class="focus-sec-head">
                  <h3 class="focus-sec-title">Concepts Mastery</h3>
                  <a class="focus-link" href="study-map.html">Study map</a>
                </div>
                <div class="focus-mastery">
                  <div class="m-label"><span>SN2 Mechanism</span><span class="m-pct">92%</span></div>
                  <div class="progress"><span style="width:92%"></span></div>
                </div>
                <div class="focus-mastery">
                  <div class="m-label"><span>Stereochemistry <span class="badge red" style="margin-left:6px">Review</span></span><span class="m-pct">45%</span></div>
                  <div class="progress"><span class="red" style="width:45%"></span></div>
                </div>
                <div class="focus-mastery">
                  <div class="m-label"><span>Leaving Groups</span><span class="m-pct">71%</span></div>
                  <div class="progress"><span style="width:71%"></span></div>
                </div>
              </div>
            </div>

            <div class="focus-col">
              <div class="focus-sec">
                <div class="focus-sec-head">
                  <h3 class="focus-sec-title">Tutor's Recommended Plan</h3>
                  <a class="focus-link" href="page-live-plan.html">Open plan</a>
                </div>
                <p class="focus-plan-note">"Stereochemical inversion is still wobbling at 45%. Let's turn to stereocenters next — a short, focused pass should settle it."</p>
                <a class="focus-plan-item" href="page-concept.html"><div class="mark done">✓</div><div class="p-label">Read §4.2 · Chiral centers</div><div class="p-time">8m</div></a>
                <a class="focus-plan-item" href="page-flashcards.html"><div class="mark next">▶</div><div class="p-label">Practice 5 Stereocenter flashcards</div><div class="p-time">5m</div></a>
                <a class="focus-plan-item" href="page-quiz.html"><div class="mark todo">3</div><div class="p-label">Quiz · Identifying stereocenters</div><div class="p-time">7m</div></a>
                <a class="focus-plan-item" href="page-worked-example.html"><div class="mark todo">4</div><div class="p-label">Worked example · SN2 inversion</div><div class="p-time">6m</div></a>
              </div>

              <div class="focus-sec">
                <div class="focus-sec-head">
                  <h3 class="focus-sec-title">Recent Activity</h3>
                  <a class="focus-link" href="interactive-quiz.html">Continue</a>
                </div>
                <div class="focus-act"><div class="a-ico green">${I.cap}</div><div><div class="a-t">Completed quiz · Stereochemistry</div><div class="a-s">Scored 80% · mastered chiral configuration</div></div></div>
                <div class="focus-act"><div class="a-ico blue">${I.doc}</div><div><div class="a-t">Ingested SN2_Mechanisms.pdf</div><div class="a-s">Generated 10 flashcards & 3 quiz questions</div></div></div>
                <div class="focus-act"><div class="a-ico">${I.book}</div><div><div class="a-t">Tutor session · Walden inversion</div><div class="a-s">Cited Ch. 7, p. 142 · 4 messages</div></div></div>
              </div>

              <div class="focus-sec focus-log">
                <div class="focus-sec-head">
                  <h3 class="focus-sec-title">Activity Log</h3>
                  <span class="focus-link" style="color:var(--text-faint);cursor:default">This week</span>
                </div>
                <div class="bars">${bars}</div>
                <div class="log-foot"><b>4h 20m</b> studied · peak Thursday · <b>8-day</b> streak</div>
              </div>
            </div>

          </div>
        </div>
      </div>`;
    },

    evidencePanel() {
      return `
      <aside class="evidence-panel" data-evidence-panel>
        <div class="evidence-panel-head"><div class="h-title">${I.evidence} Evidence</div><div class="spacer"></div><button class="icon-btn" data-evidence-collapse title="Collapse evidence">${I.chev}</button></div>
        <div class="evidence-panel-body">
          <div class="ev-tabs" data-ev-tabs><button class="active">PDF</button><button>Slides</button><button>Wiki</button><button>Notes</button></div>
          <div class="ev-card selected"><div class="ev-meta">CH. 7 · P. 142</div><div class="ev-title">Primary substrates</div><p class="ev-quote">Primary substrates react fastest because steric hindrance is minimised at the transition state.</p></div>
          <div class="ev-card"><div class="ev-meta">CH. 7 · P. 145</div><div class="ev-title">Walden inversion</div><p class="ev-quote">The backside attack inverts the stereochemical configuration at the carbon centre.</p></div>
          <div class="ev-card"><div class="ev-meta">CH. 7 · P. 150</div><div class="ev-title">Solvent effects</div><p class="ev-quote">Polar aprotic solvents leave the nucleophile relatively "naked" and reactive.</p></div>
        </div>
        <div class="evidence-panel-foot"><a class="btn primary block" href="page-source.html">Open full source</a></div>
      </aside>
      <button class="evidence-fab" data-evidence-fab title="Open evidence">${I.evidence}</button>`;
    },

    drawer() {
      return `
        <div class="drawer-head">${I.evidence}<strong>Evidence</strong><div style="flex:1"></div><button class="icon-btn" data-drawer-close>Close</button></div>
        <div class="drawer-body">
          <div class="ev-card selected"><div class="ev-meta">CH. 7 · P. 142</div><div class="ev-title">Primary substrates</div><p class="ev-quote">Primary substrates react fastest because steric hindrance is minimised at the transition state.</p></div>
          <div class="ev-card"><div class="ev-meta">CH. 7 · P. 145</div><div class="ev-title">Walden inversion</div><p class="ev-quote">The backside attack inverts the stereochemical configuration at the carbon centre.</p></div>
        </div>
        <div class="drawer-foot"><a class="btn primary block" href="page-source.html">Open full source</a></div>`;
    },
  };
})();
