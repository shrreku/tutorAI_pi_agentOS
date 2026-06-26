/* Nocturne chrome registration. See partials.js for the contract. */
(function () {
  const I = (window.TB && window.TB.ICONS) || {};
  window.TB_THEMES = window.TB_THEMES || {};

  window.TB_THEMES.nocturne = {
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
                <div class="collapse-body"><div class="thinking">The textbook frames SN2 around steric accessibility and backside-attack geometry. Tie the Walden inversion to the planar transition state, then cite Ch. 7.</div></div>
              </div>
              <p>In an SN2 reaction the nucleophile attacks from the side opposite the leaving group, pushing it out in a single concerted step — the carbon's configuration inverts (Walden inversion).</p>
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
            <div class="setting-row">Glow accents <div class="switch on" data-switch></div></div>
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
      const bars = [['M',40],['T',70],['W',25],['T',90],['F',55],['S',15],['S',60]]
        .map(([l,h])=>`<div><div class="bar" style="height:${h}%"></div><div class="lbl">${l}</div></div>`).join('');
      return `
      <div class="noc-hero">
        <div class="noc-hero-inner">
          <div class="noc-eyebrow"><span class="pulse"></span> Command Deck · Session 07</div>
          <h1>Good evening, <span class="accent">Shreyash</span>.</h1>
          <p>Three notebooks are live, fourteen concepts are under study, and your tutor has lined up the next move on stereochemistry. The deck is yours.</p>
          <div class="noc-hero-actions">
            <a class="btn primary" href="page-live-plan.html">${I.play} Resume SN2 mechanism</a>
            <a class="btn" href="study-map.html">${I.map} Open study map</a>
          </div>
          <div class="noc-tiles">
            <div class="noc-tile"><div class="tl">${I.doc} Sources</div><div class="tn">7</div><div class="ts">1,200 pages indexed</div></div>
            <div class="noc-tile"><div class="tl">${I.cap} Concepts</div><div class="tn">14</div><div class="ts">Across 3 notebooks</div></div>
            <div class="noc-tile"><div class="tl">${I.bolt} Streak</div><div class="tn">8 days</div><div class="ts">Daily goal met</div></div>
            <div class="noc-tile"><div class="tl">${I.layers} Notebooks</div><div class="tn">3</div><div class="ts">2 in progress</div></div>
          </div>
        </div>
      </div>
      <div class="dash">
        <div>
          <div class="noc-section-label">Mastery Signals</div>
          <div class="card" style="margin-bottom:18px">
            <div class="noc-meter"><div class="noc-meter-top"><span>SN2 Mechanism</span><span class="pct">92%</span></div><div class="progress"><span style="width:92%"></span></div></div>
            <div class="noc-meter"><div class="noc-meter-top"><span>Stereochemistry <span class="badge red" style="margin-left:6px">Review</span></span><span class="pct">45%</span></div><div class="progress"><span class="red" style="width:45%"></span></div></div>
            <div class="noc-meter"><div class="noc-meter-top"><span>Leaving Groups</span><span class="pct">71%</span></div><div class="progress"><span style="width:71%"></span></div></div>
          </div>
          <div class="noc-section-label">Weekly Activity</div>
          <div class="card" style="margin-bottom:18px">
            <div class="bars">${bars}</div>
            <div class="noc-foot-note"><span class="hl">4h 20m</span> studied · peak Thursday · <span class="hl">8-day</span> streak</div>
          </div>
          <div class="noc-section-label">Streak</div>
          <div class="card">
            <div class="noc-streak"><span class="flame">🔥</span><div><div class="big">8 days</div><div class="sub">Longest this term · one more session keeps it alive</div></div></div>
          </div>
        </div>
        <div>
          <div class="noc-section-label">Active Notebooks</div>
          <a class="noc-nb chem" href="study-map.html"><div class="spine"></div><div><div class="row gap-10 wrap" style="align-items:baseline"><span class="t">Organic Chemistry I</span><span class="chapter">Ch. 7 · Substitution</span></div><div class="meta-row"><span>7 sources</span><span>·</span><span>14 concepts</span><span>·</span><span class="next">Next: SN1 elimination</span></div><div class="bar-wrap"><div class="progress"><span style="width:60%"></span></div><span class="pct">60%</span></div></div><div class="side"><span class="badge orange">Chemistry</span><span class="open">Open →</span></div></a>
          <a class="noc-nb math" href="study-map.html"><div class="spine"></div><div><div class="row gap-10 wrap" style="align-items:baseline"><span class="t">Linear Algebra</span><span class="chapter">Vector Spaces</span></div><div class="meta-row"><span>4 sources</span><span>·</span><span>9 concepts</span><span>·</span><span class="next">Next: Basis & dimension</span></div><div class="bar-wrap"><div class="progress"><span style="width:32%"></span></div><span class="pct">32%</span></div></div><div class="side"><span class="badge blue">Mathematics</span><span class="open">Open →</span></div></a>
          <a class="noc-nb bio" href="study-map.html"><div class="spine"></div><div><div class="row gap-10 wrap" style="align-items:baseline"><span class="t">Cell Biology</span><span class="chapter">Cell Division</span></div><div class="meta-row"><span>5 sources</span><span>·</span><span>11 concepts</span><span>·</span><span class="next">Next: Mitosis wrap-up</span></div><div class="bar-wrap"><div class="progress"><span class="green" style="width:88%"></span></div><span class="pct">88%</span></div></div><div class="side"><span class="badge green">Biology</span><span class="open">Open →</span></div></a>
          <div class="noc-section-label" style="margin-top:20px">Quick Launch</div>
          <a class="noc-action primary" href="page-live-plan.html"><span class="ico">${I.play}</span><div><div class="a-t">Resume: SN2 mechanism</div><div class="a-s">Live plan · Obj 5 in progress</div></div><span class="go">Resume →</span></a>
          <a class="noc-action" href="page-flashcards.html"><span class="ico">${I.layers}</span><div><div class="a-t">Flashcards: Ch. 7 deck</div><div class="a-s">24 cards · spaced recall</div></div><span class="go">Open →</span></a>
          <a class="noc-action" href="interactive-quiz.html"><span class="ico">${I.help}</span><div><div class="a-t">Quiz: Nucleophiles</div><div class="a-s">5 questions · ready</div></div><span class="go">Start →</span></a>
          <a class="noc-action" href="page-worked-example.html"><span class="ico">${I.doc}</span><div><div class="a-t">Worked example · SN2</div><div class="a-s">Step-by-step walkthrough</div></div><span class="go">View →</span></a>
        </div>
        <div>
          <div class="noc-section-label">From Your Tutor</div>
          <div class="card" style="margin-bottom:18px;border-color:rgba(139,92,246,0.5);box-shadow:0 0 24px rgba(139,92,246,0.18)">
            <div class="row gap-10" style="margin-bottom:10px"><span class="badge">${I.spark} Suggested</span></div>
            <p style="margin:0 0 12px;color:var(--text-muted)">Your SN2 rate intuition is solid, but stereochemical inversion is wobbling at 45%. Let's lock in stereocenters next.</p>
            <a class="btn primary block" href="page-concept.html">Review stereocenters</a>
          </div>
          <div class="noc-section-label">Recommended Plan</div>
          <div class="card" style="margin-bottom:18px">
            <a class="noc-action" href="page-module.html"><span class="ico" style="background:var(--green-soft);color:var(--green)">✓</span><div><div class="a-t">Read §4.2 · Chiral centers</div><div class="a-s">8 min · completed</div></div></a>
            <a class="noc-action primary" href="page-flashcards.html"><span class="ico">${I.layers}</span><div><div class="a-t">Practice 5 Stereocenter cards</div><div class="a-s">5 min · up next</div></div><span class="go">Start →</span></a>
            <a class="noc-action" href="page-quiz.html"><span class="ico">${I.help}</span><div><div class="a-t">Quiz · Identifying stereocenters</div><div class="a-s">7 min · then this</div></div><span class="go">→</span></a>
          </div>
          <div class="noc-section-label">Recent Activity</div>
          <div class="card">
            <div class="noc-tl-item"><span class="dot green"></span><div><div class="t">Completed quiz · Stereochemistry</div><div class="s">Scored 80% · mastered chiral configuration</div></div></div>
            <div class="noc-tl-item"><span class="dot"></span><div><div class="t">Ingested SN2_Mechanisms.pdf</div><div class="s">Generated 10 flashcards & 3 quiz questions</div></div></div>
            <div class="noc-tl-item"><span class="dot teal"></span><div><div class="t">Tutor session · Walden inversion</div><div class="s">Cited Ch. 7, p. 142 · 4 messages</div></div></div>
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
          <div class="drawer-tabs" data-drawer-tabs><button class="active">PDF</button><button>Slides</button><button>Wiki</button><button>Notes</button></div>
          <div class="snippet selected"><div class="badge gray" style="margin-bottom:8px">Ch. 7 · p. 142</div><p style="margin:6px 0">Primary substrates react fastest because steric hindrance is minimised at the transition state.</p></div>
          <div class="snippet"><div class="badge gray" style="margin-bottom:8px">Ch. 7 · p. 145</div><p style="margin:6px 0">The backside attack inverts the stereochemical configuration at the carbon centre (Walden inversion).</p></div>
          <div class="snippet"><div class="badge gray" style="margin-bottom:8px">Ch. 7 · p. 150</div><p style="margin:6px 0">Polar aprotic solvents leave the nucleophile relatively "naked" and reactive.</p></div>
        </div>
        <div class="drawer-foot"><a class="btn primary block" href="page-source.html">Open full source</a></div>`;
    },
  };
})();
