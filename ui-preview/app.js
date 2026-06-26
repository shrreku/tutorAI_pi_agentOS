/* ============================================================================
   TutorBook · UI Preview — interactions (no backend; local DOM state only)
   Safe to call initInteractions() repeatedly: every element is bound once.
   ============================================================================ */

/* Create the shared namespace + icon object BEFORE any theme plug-in loads, so
   theme scripts that capture window.TB.ICONS get a live reference that
   partials.js populates (partials.js loads last). */
window.TB = window.TB || {};
window.TB.ICONS = window.TB.ICONS || {};

function bind(el, type, handler) {
  if (!el || el.__tbBound) return;
  el.addEventListener(type, handler);
  el.__tbBound = true;
}

window.initInteractions = function initInteractions() {
  /* collapsibles */
  document
    .querySelectorAll("[data-collapse-head]")
    .forEach((h) => bind(h, "click", () => h.closest("[data-collapse]").classList.toggle("open")));

  /* tutor collapse / reopen */
  document.querySelectorAll("[data-tutor-collapse]").forEach((b) =>
    bind(b, "click", () => {
      document.querySelector("[data-tutor]")?.classList.add("collapsed");
      document.body.classList.add("chat-collapsed");
    }),
  );
  document.querySelectorAll("[data-chat-fab]").forEach((f) =>
    bind(f, "click", () => {
      document.querySelector("[data-tutor]")?.classList.remove("collapsed");
      document.body.classList.remove("chat-collapsed");
    }),
  );

  /* tutor tabs */
  document.querySelectorAll("[data-tutor-tabs] button").forEach((btn) =>
    bind(btn, "click", () => {
      const g = btn.closest("[data-tutor-tabs]");
      g.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const t = btn.dataset.tab;
      g.closest("[data-tutor], .tutor")
        ?.querySelectorAll("[data-tutor-pane]")
        .forEach((p) => {
          p.style.display = p.dataset.tutorPane === t ? "" : "none";
        });
    }),
  );

  /* surface switcher */
  document.querySelectorAll("[data-surface] a").forEach((b) =>
    bind(b, "click", () => {
      const g = b.closest("[data-surface]");
      g.querySelectorAll("a").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    }),
  );

  /* accordion modules */
  document
    .querySelectorAll("[data-module] .module-head")
    .forEach((h) => bind(h, "click", () => h.closest("[data-module]").classList.toggle("open")));

  /* quiz options */
  document.querySelectorAll("[data-quiz-opt]").forEach((opt) =>
    bind(opt, "click", () => {
      const q = opt.closest("[data-quiz-q]");
      q.querySelectorAll("[data-quiz-opt]").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
    }),
  );

  /* flashcards */
  document
    .querySelectorAll("[data-flashcard]")
    .forEach((c) => bind(c, "click", () => c.classList.toggle("flipped")));
  document.querySelectorAll("[data-rating]").forEach((b) =>
    bind(b, "click", (e) => {
      e.stopPropagation();
      b.closest("[data-flashcard]")?.classList.remove("flipped");
    }),
  );

  /* generic single-select groups (onboarding choices, etc.) */
  document.querySelectorAll("[data-select-group]").forEach((g) =>
    g.querySelectorAll("[data-select]").forEach((it) =>
      bind(it, "click", () => {
        g.querySelectorAll("[data-select]").forEach((x) => x.classList.remove("selected"));
        it.classList.add("selected");
      }),
    ),
  );

  /* evidence open (docked panel or overlay drawer) */
  document.querySelectorAll("[data-evidence-open]").forEach((b) =>
    bind(b, "click", () => {
      const panel = document.querySelector("[data-evidence-panel]");
      if (panel) {
        panel.classList.remove("collapsed");
        document.body.classList.remove("evidence-collapsed");
        return;
      }
      document.querySelector("[data-scrim]")?.classList.add("open");
      document.querySelector("[data-drawer]")?.classList.add("open");
    }),
  );
  document.querySelectorAll("[data-drawer-close], [data-scrim]").forEach((b) =>
    bind(b, "click", () => {
      document.querySelector("[data-scrim]")?.classList.remove("open");
      document.querySelector("[data-drawer]")?.classList.remove("open");
    }),
  );
  document.querySelectorAll("[data-evidence-collapse]").forEach((b) =>
    bind(b, "click", () => {
      document.querySelector("[data-evidence-panel]")?.classList.add("collapsed");
      document.body.classList.add("evidence-collapsed");
    }),
  );
  document.querySelectorAll("[data-evidence-fab]").forEach((f) =>
    bind(f, "click", () => {
      document.querySelector("[data-evidence-panel]")?.classList.remove("collapsed");
      document.body.classList.remove("evidence-collapsed");
    }),
  );
  document.querySelectorAll("[data-ev-tabs] button, [data-drawer-tabs] button").forEach((btn) =>
    bind(btn, "click", () => {
      const g = btn.closest("[data-ev-tabs], [data-drawer-tabs]");
      g.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    }),
  );

  /* left chat drawer (reference pages) */
  document.querySelectorAll("[data-ask-tutor]").forEach((b) =>
    bind(b, "click", () => {
      const docked = document.querySelector(".workspace [data-tutor]");
      if (docked && !document.querySelector("[data-chat-drawer]")) {
        docked.classList.remove("collapsed");
        document.body.classList.remove("chat-collapsed");
        return;
      }
      document.querySelector("[data-chat-drawer]")?.classList.add("open");
      document.querySelector("[data-chat-drawer-scrim]")?.classList.add("open");
    }),
  );
  document.querySelectorAll("[data-chat-drawer-scrim], [data-chat-drawer-close]").forEach((b) =>
    bind(b, "click", () => {
      document.querySelector("[data-chat-drawer]")?.classList.remove("open");
      document.querySelector("[data-chat-drawer-scrim]")?.classList.remove("open");
    }),
  );

  /* source thumbs */
  document.querySelectorAll("[data-thumb]").forEach((t) =>
    bind(t, "click", () => {
      t.closest("[data-thumb-list]")
        .querySelectorAll("[data-thumb]")
        .forEach((x) => x.classList.remove("selected"));
      t.classList.add("selected");
    }),
  );

  /* settings switches */
  document
    .querySelectorAll("[data-switch]")
    .forEach((s) => bind(s, "click", () => s.classList.toggle("on")));

  /* composer fake echo */
  document.querySelectorAll("[data-composer] .send").forEach((send) =>
    bind(send, "click", () => {
      const ta = send.closest("[data-composer]").querySelector("textarea");
      if (!ta || !ta.value.trim()) return;
      const body =
        send.closest(".tutor")?.querySelector("[data-tutor-body]") ||
        document.querySelector("[data-tutor-body]");
      if (body) {
        const msg = document.createElement("div");
        msg.className = "msg-user";
        msg.textContent = ta.value;
        body.appendChild(msg);
        body.scrollTop = body.scrollHeight;
        ta.value = "";
      }
    }),
  );

  /* theme switch (floatnav menu) */
  const themeBtn = document.querySelector("[data-fn-theme]");
  const themeMenu = document.querySelector("[data-fn-menu]");
  if (themeBtn && themeMenu && !themeBtn.__tbBound) {
    themeBtn.__tbBound = true;
    themeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      themeMenu.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!themeMenu.contains(e.target) && e.target !== themeBtn)
        themeMenu.classList.remove("open");
    });
  }
  document.querySelectorAll("[data-set-theme]").forEach((b) =>
    bind(b, "click", (e) => {
      e.stopPropagation();
      window.TB.setTheme(b.dataset.setTheme);
    }),
  );
  document
    .querySelectorAll("[data-theme-chip]")
    .forEach((b) => bind(b, "click", () => window.TB.setTheme(b.dataset.themeChip)));

  /* command palette */
  document
    .querySelectorAll("[data-open-palette]")
    .forEach((b) => bind(b, "click", () => openPalette()));
  const pal = document.querySelector("[data-palette]");
  if (pal && !pal.__tbBound) {
    pal.__tbBound = true;
    pal.addEventListener("click", (e) => {
      if (e.target === pal) closePalette();
    });
    const input = pal.querySelector("[data-palette-input]");
    input && input.addEventListener("input", () => filterPalette(input.value));
  }
};

function openPalette() {
  const p = document.querySelector("[data-palette]");
  if (!p) return;
  p.classList.remove("hidden");
  const i = p.querySelector("[data-palette-input]");
  i && setTimeout(() => i.focus(), 30);
}
function closePalette() {
  document.querySelector("[data-palette]")?.classList.add("hidden");
}
function filterPalette(q) {
  q = (q || "").toLowerCase();
  document.querySelectorAll("[data-palette] .pal-item").forEach((it) => {
    const t = it.querySelector(".pi-t")?.textContent.toLowerCase() || "";
    it.style.display = t.includes(q) ? "" : "none";
  });
  document.querySelectorAll("[data-palette] .pal-group").forEach((g) => {
    let n = g.nextElementSibling,
      any = false;
    while (n && n.classList.contains("pal-item")) {
      if (n.style.display !== "none") any = true;
      n = n.nextElementSibling;
    }
    g.style.display = any ? "" : "none";
  });
}

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    const p = document.querySelector("[data-palette]");
    if (p && p.classList.contains("hidden")) openPalette();
    else closePalette();
  }
  if (e.key === "Escape") closePalette();
});
