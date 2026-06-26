/* Carbon chrome registration. Terminal / command-center theme.
   See partials.js for the contract. Mirrors folio.js function shapes so the
   shared app.js interactions keep working. */
(function () {
  const I = (window.TB && window.TB.ICONS) || {};
  window.TB_THEMES = window.TB_THEMES || {};

  // ascii progress meter: [#######---] for a percentage
  function meter(pct, width = 12) {
    const on = Math.round((pct / 100) * width);
    return `[<span class="meter-fill">${"#".repeat(on)}</span><span class="off">${"-".repeat(width - on)}</span>]`;
  }

  window.TB_THEMES.carbon = {
    topbar() {
      return `
        <div class="brand">
          <div class="logo">TB</div>
          <div class="title">tutorbook</div>
          <span class="badge green"><span class="dot-i"></span> SESSION_ACTIVE</span>
        </div>
        <div class="spacer"></div>
        <div class="search" data-open-palette>${I.search}<input placeholder="grep notebooks, sources…" /><span class="kbd">⌘K</span></div>
        <span class="credits">${I.bolt}<span class="meter"><span style="width:71%"></span></span> 71%</span>
        <a class="avatar" href="account.html" title="Account">SK</a>`;
    },

    statusbar() {
      return `
        <div class="left">study_map · 24 nodes · 31 edges</div>
        <div class="center">SELECTED: sn2_mechanism</div>
        <div class="right"><span class="accent">obj_5 :: sn2_mechanism [active]</span></div>`;
    },

    tutor(context = "SN2 mechanism") {
      return `
      <aside class="tutor" data-tutor>
        <div class="tutor-header">
          <div class="h-title"><span class="cap-ico">${I.cap}</span> tutor.sh</div>
          <div class="spacer"></div>
          <button class="icon-btn dark">${I.plus} New</button>
          <button class="icon-btn dark" data-tutor-collapse title="Collapse">${I.chev}</button>
        </div>
        <div class="tutor-tabs" data-tutor-tabs>
          <button class="active" data-tab="tutor">tutor</button>
          <button data-tab="history">history</button>
          <button data-tab="settings">config</button>
        </div>
        <div class="tutor-body" data-tutor-body>
          <div data-tutor-pane="tutor">
            <div class="focus-row">focus: <span class="badge purple">${context}</span></div>
            <div class="msg-user">Show me the backside attack details.</div>
            <div class="msg-agent">
              <div class="agent-avatar-line"><span class="av">${I.cap}</span> tutorbook</div>
              <div class="collapse open" data-collapse>
                <div class="collapse-head" data-collapse-head>${I.chev.replace('class="svg-i"', 'class="svg-i chev"')} AGENT_ACTIVITY · 3 STEPS <span class="timer">1.4s</span></div>
                <div class="collapse-body">
                  <div class="step"><span class="dot"></span> check_learning_state()</div>
                  <div class="toolcall"><span class="tc-ico">${I.book}</span><span class="tc-name">retrieve("sn2_backside")</span><span class="tc-status">ok</span></div>
                  <div class="step active"><span class="dot"></span> <a>synthesize_explanation() ↗</a></div>
                </div>
              </div>
              <div class="collapse open" data-collapse>
                <div class="collapse-head" data-collapse-head>${I.chev.replace('class="svg-i"', 'class="svg-i chev"')} THINKING</div>
                <div class="collapse-body"><div class="thinking">// leaving groups may need recap based on mastery. textbook frames SN2 around steric accessibility + backside-attack geometry.</div></div>
              </div>
              <p>In an SN2 reaction the nucleophile attacks from the side opposite the leaving group, pushing it out in a single concerted step — the carbon's configuration inverts (Walden inversion).</p>
              <span class="citation">${I.book} ch7 :: p.142</span>
              <div class="artifact-chip"><span class="ac-ico">${I.layers}</span><div><div class="ac-t">sn2_stereochem · 5-card deck</div><div class="ac-s">generated study aid · tap to review</div></div></div>
            </div>
          </div>
          <div data-tutor-pane="history" style="display:none">
            ${[
              "SN2 backside attack|today · 16:32",
              "Leaving group recap|today · 14:10",
              "Stereochemistry inversion|yesterday · 21:48",
              "Nucleophile strength|jun 23 · 18:15",
              "Polar aprotic solvents|jun 22 · 11:02",
            ]
              .map((h) => {
                const [t, s] = h.split("|");
                return `<div class="history-item"><div class="t">${t}</div><div class="s">${s}</div></div>`;
              })
              .join("")}
          </div>
          <div data-tutor-pane="settings" style="display:none">
            <div class="setting-row">show_thinking <div class="switch on" data-switch></div></div>
            <div class="setting-row">show_agent_activity <div class="switch on" data-switch></div></div>
            <div class="setting-row">auto_cite <div class="switch on" data-switch></div></div>
            <div class="setting-row">steerable_tutor <div class="switch" data-switch></div></div>
          </div>
        </div>
        <div class="tutor-input">
          <div class="context-chip">${I.spark} ctx: ${context}</div>
          <div class="composer" data-composer>
            <textarea placeholder="ask or steer…"></textarea>
            <button class="send" title="Send">${I.send}</button>
          </div>
          <div class="composer-hint"><span>↵ run · ⇧↵ newline</span><span>71% credits</span></div>
        </div>
      </aside>
      <button class="chat-fab" data-chat-fab title="Open chat">${I.chat}</button>`;
    },

    dashboard() {
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

      const notebooks = [
        [
          "Organic Chemistry I",
          "7 src · 14 concepts · next: sn1_elimination",
          60,
          "CHEM",
          "orange",
          false,
        ],
        ["Linear Algebra", "4 src · 9 concepts · next: basis_dimension", 32, "MATH", "blue", true],
        ["Cell Biology", "5 src · 11 concepts · next: mitosis_wrapup", 88, "BIO", "green", false],
      ]
        .map(
          ([name, sub, pct, tag, clr, warn]) => `
        <a class="cb-nb${warn ? " warn" : ""}" href="study-map.html">
          <div class="nb-top"><span class="nb-name">${name}</span><span class="badge ${clr}">${tag}</span></div>
          <div class="nb-sub">${sub}</div>
          <div class="ascii"><span class="meter">${meter(pct)}</span><span class="pc">${pct}%</span></div>
        </a>`,
        )
        .join("");

      const mastery = [
        ["sn2_mechanism", 92, ""],
        ["leaving_groups", 71, ""],
        ["nucleophilicity", 64, "mid"],
        ["stereochemistry", 45, "lo"],
        ["walden_inversion", 38, "lo"],
      ]
        .map(
          ([nm, pct, cls]) => `
        <tr>
          <td><span class="nm">${nm}</span></td>
          <td class="mini"><div class="progress"><span class="${pct < 50 ? "red" : ""}" style="width:${pct}%"></span></div></td>
          <td><span class="pc ${cls}">${pct}%</span></td>
        </tr>`,
        )
        .join("");

      const log = [
        ["16:32", "OK", "Completed quiz <b>stereochemistry</b> · 80%", "ok"],
        ["15:48", "IN", "Ingested <b>SN2_Mechanisms.pdf</b> · 10 cards", "in"],
        ["14:10", "OK", "Tutor session · <b>walden_inversion</b>", "ok"],
        ["11:02", "OK", "Mastered <b>leaving_groups</b> → 71%", "ok"],
        ["09:15", "WARN", "Review due · <b>stereochemistry</b> 45%", "warn"],
      ]
        .map(
          ([ts, tag, msg, cls]) => `
        <div class="ln"><span class="ts">${ts}</span><span class="tag ${cls}">${tag}</span><span class="msg">${msg}</span></div>`,
        )
        .join("");

      const run = [
        ["✓", "Read §4.2 · chiral_centers", "8m", "done"],
        ["▶", "Practice 5 stereocenter flashcards", "5m", "next"],
        ["○", "Quiz · identifying stereocenters", "7m", "todo"],
        ["○", "Worked example · sn2", "6m", "todo"],
      ]
        .map(
          ([mk, lbl, tm, cls]) => `
        <div class="cb-run"><span class="mk ${cls}">${mk}</span><span class="lbl">${lbl}</span><span class="tm">${tm}</span></div>`,
        )
        .join("");

      const cmds = [
        ["study-map.html", "open", "study_map", I.map],
        ["page-flashcards.html", "review", "flashcards/ch7", I.layers],
        ["interactive-quiz.html", "run", "quiz/nucleophiles", I.help],
        ["page-worked-example.html", "open", "worked_example", I.doc],
        ["notebooks.html", "ls", "notebooks/", I.grid],
        ["page-source.html", "cat", "source/clayden.pdf", I.book],
      ]
        .map(
          ([href, pfx, cmd, ico]) => `
        <a class="cb-cmd" href="${href}"><span class="ico">${ico}</span><span class="cmd"><span class="pfx">${pfx} </span>${cmd}</span><span class="kbd">↵</span></a>`,
        )
        .join("");

      return `
      <div class="cb-shell">
        <div class="cb-prompt-line"><span class="pr">shreyash@tutorbook</span>:<span style="color:var(--accent-2)">~/oc1</span>$ status --today <span class="cur"></span></div>
        <h1 class="cb-greeting">// good afternoon, <span class="hl">Shreyash</span></h1>

        <div class="cb-metrics">
          <div class="cb-tile"><div class="k">uptime / streak</div><div class="v">8<span class="u">d</span></div><div class="d">↑ goal met</div></div>
          <div class="cb-tile amber-tile"><div class="k">credits</div><div class="v">71<span class="u">%</span></div><div class="d warn">~290 left</div></div>
          <div class="cb-tile blue-tile"><div class="k">sources idx</div><div class="v">7</div><div class="d">1,200 pages</div></div>
          <div class="cb-tile"><div class="k">concepts</div><div class="v">14</div><div class="d">active</div></div>
          <div class="cb-tile"><div class="k">studied today</div><div class="v">4.3<span class="u">h</span></div><div class="d">peak: thu</div></div>
        </div>

        <div class="cb-grid">
          <div class="cb-col">
            <div>
              <div class="cb-seclabel">// active_notebooks <span class="cnt">[3]</span></div>
              <div class="cb-panel">
                <div class="cb-panel-head"><span class="t"><span class="ac">$</span> ls ~/notebooks</span><a class="badge gray" href="notebooks.html">view all →</a></div>
                <div>${notebooks}</div>
              </div>
            </div>
            <div>
              <div class="cb-seclabel">// activity_log <span class="cnt">[tail -5]</span></div>
              <div class="cb-panel">
                <div class="cb-panel-head"><span class="t"><span class="ac">$</span> tail -f activity.log</span></div>
                <div class="cb-panel-body cb-log">${log}</div>
                <div class="cb-foot">4h 20m studied · peak thursday · <b>8-day</b> streak</div>
              </div>
            </div>
          </div>

          <div class="cb-col">
            <div>
              <div class="cb-seclabel">// mastery_table <span class="cnt">[5]</span></div>
              <div class="cb-panel">
                <div class="cb-panel-head"><span class="t"><span class="ac">$</span> cat mastery.tsv</span><span class="badge red">1 review</span></div>
                <div class="cb-panel-body">
                  <table class="cb-mtable">
                    <thead><tr><th>concept</th><th>progress</th><th>mastery</th></tr></thead>
                    <tbody>${mastery}</tbody>
                  </table>
                </div>
              </div>
            </div>
            <div>
              <div class="cb-seclabel">// weekly_activity <span class="cnt">[7d]</span></div>
              <div class="cb-panel">
                <div class="cb-panel-head"><span class="t"><span class="ac">$</span> plot --week</span></div>
                <div class="cb-panel-body"><div class="bars">${bars}</div></div>
              </div>
            </div>
          </div>

          <div class="cb-col">
            <div>
              <div class="cb-seclabel">// recommended_run <span class="cnt">[queue]</span></div>
              <div class="cb-panel">
                <div class="cb-panel-head"><span class="t"><span class="ac">$</span> run plan/today</span><span class="badge yellow">26m</span></div>
                <div>${run}</div>
              </div>
            </div>
            <div>
              <div class="cb-seclabel">// quick_commands</div>
              <div class="cb-panel">
                <div class="cb-panel-head"><span class="t"><span class="ac">$</span> aliases</span></div>
                <div>${cmds}</div>
              </div>
            </div>
            <div class="cb-panel">
              <div class="cb-panel-head"><span class="t"><span class="ac">#</span> tutor_note</span></div>
              <div class="cb-panel-body" style="font-family:var(--font);font-size:12.5px;line-height:1.55;color:var(--text-muted)">Stereochemical inversion still wobbling at <span style="color:var(--red);font-weight:700">45%</span>. Cell Biology is <span style="color:var(--accent);font-weight:700">88%</span> — one strong session closes it out.</div>
            </div>
          </div>
        </div>
      </div>`;
    },

    evidencePanel() {
      return `
      <aside class="evidence-panel" data-evidence-panel>
        <div class="evidence-panel-head"><div class="h-title">${I.evidence} evidence.db</div><div class="spacer"></div><button class="icon-btn" data-evidence-collapse title="Collapse">${I.chev}</button></div>
        <div class="evidence-panel-body">
          <div class="ev-tabs" data-ev-tabs><button class="active">pdf</button><button>slides</button><button>wiki</button><button>notes</button></div>
          <div class="ev-card selected"><div class="ev-meta">PDF · P.341</div><div class="ev-title">Clayden Organic Chemistry</div><p class="ev-quote">"…the nucleophile attacks from the side opposite the leaving group. This backside attack causes a concerted inversion of configuration."</p></div>
          <div class="ev-card"><div class="ev-meta">PPT · SLIDE 14</div><div class="ev-title">Lecture · substitution kinetics</div><p class="ev-quote">"SN2 rate depends bimolecularly on both species. Doubling either doubles the observed rate."</p></div>
          <div class="ev-card"><div class="ev-meta">WIKI · SN2</div><div class="ev-title">Nucleophilic substitution</div><p class="ev-quote">"Polar aprotic solvents leave the nucleophile relatively 'naked' and reactive."</p></div>
        </div>
        <div class="evidence-panel-foot"><a class="btn primary block" href="page-source.html">open full source</a></div>
      </aside>
      <button class="evidence-fab" data-evidence-fab title="Open evidence">${I.evidence}</button>`;
    },

    drawer() {
      return `
        <div class="drawer-head">${I.evidence}<strong>evidence.db</strong><div style="flex:1"></div><button class="icon-btn" data-drawer-close>close</button></div>
        <div class="drawer-body">
          <div class="drawer-tabs" data-drawer-tabs><button class="active">pdf</button><button>slides</button><button>wiki</button><button>notes</button></div>
          <div class="snippet selected"><div class="badge gray" style="margin-bottom:8px">ch7 · p.142</div><p style="margin:6px 0">Primary substrates react fastest because steric hindrance is minimised at the transition state.</p></div>
          <div class="snippet"><div class="badge gray" style="margin-bottom:8px">ch7 · p.145</div><p style="margin:6px 0">The backside attack inverts the stereochemical configuration at the carbon centre (Walden inversion).</p></div>
          <div class="snippet"><div class="badge gray" style="margin-bottom:8px">ch7 · p.150</div><p style="margin:6px 0">Polar aprotic solvents leave the nucleophile relatively "naked" and reactive.</p></div>
        </div>
        <div class="drawer-foot"><a class="btn primary block" href="page-source.html">open full source</a></div>`;
    },
  };
})();
