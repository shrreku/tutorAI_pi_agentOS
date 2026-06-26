// Shared interactions for TutorBook UI preview.
// No backend. All state is local DOM toggles.
// Safe to call multiple times (after partial injection) — each element is bound once.

function bind(el, type, handler) {
  if (!el || el.__tbBound) return;
  el.addEventListener(type, handler);
  el.__tbBound = true;
}

window.initInteractions = function initInteractions() {
  // Collapsible sections
  document.querySelectorAll('[data-collapse-head]').forEach((head) => {
    bind(head, 'click', () => head.closest('[data-collapse]').classList.toggle('open'));
  });

  // Tutor sidebar collapse
  document.querySelectorAll('[data-tutor-collapse]').forEach((btn) => {
    bind(btn, 'click', () => {
      const tutor = document.querySelector('[data-tutor]');
      tutor && tutor.classList.add('collapsed');
      document.body.classList.add('chat-collapsed');
    });
  });
  document.querySelectorAll('[data-chat-fab]').forEach((fab) => {
    bind(fab, 'click', () => {
      const tutor = document.querySelector('[data-tutor]');
      tutor && tutor.classList.remove('collapsed');
      document.body.classList.remove('chat-collapsed');
    });
  });

  // Tutor tabs
  document.querySelectorAll('[data-tutor-tabs] button').forEach((btn) => {
    bind(btn, 'click', () => {
      const group = btn.closest('[data-tutor-tabs]');
      group.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.querySelectorAll('[data-tutor-pane]').forEach((p) => {
        p.style.display = p.dataset.tutorPane === target ? '' : 'none';
      });
    });
  });

  // Surface switcher (active toggle; navigation still works via href)
  document.querySelectorAll('[data-surface] a').forEach((b) => {
    bind(b, 'click', () => {
      const group = b.closest('[data-surface]');
      group.querySelectorAll('a').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    });
  });

  // Module accordion
  document.querySelectorAll('[data-module] .module-head').forEach((head) => {
    bind(head, 'click', () => head.closest('[data-module]').classList.toggle('open'));
  });

  // Quiz option selection
  document.querySelectorAll('[data-quiz-opt]').forEach((opt) => {
    bind(opt, 'click', () => {
      const q = opt.closest('[data-quiz-q]');
      q.querySelectorAll('[data-quiz-opt]').forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  // Flashcard flip
  document.querySelectorAll('[data-flashcard]').forEach((card) => {
    bind(card, 'click', () => card.classList.toggle('flipped'));
  });
  document.querySelectorAll('[data-rating]').forEach((btn) => {
    bind(btn, 'click', (e) => {
      e.stopPropagation();
      const card = btn.closest('[data-flashcard]');
      card && card.classList.remove('flipped');
    });
  });

  // Evidence: open behavior.
  //  - If a docked [data-evidence-panel] exists (workspace pages), expand it.
  //  - If an overlay [data-drawer] exists (reference pages), open that.
  //  - Else, no-op.
  document.querySelectorAll('[data-evidence-open]').forEach((b) => {
    bind(b, 'click', () => {
      const panel = document.querySelector('[data-evidence-panel]');
      if (panel) {
        panel.classList.remove('collapsed');
        document.body.classList.remove('evidence-collapsed');
        return;
      }
      const scrim = document.querySelector('[data-scrim]');
      const drawer = document.querySelector('[data-drawer]');
      if (scrim && drawer) {
        scrim.classList.add('open');
        drawer.classList.add('open');
      }
    });
  });
  // Overlay drawer close
  document.querySelectorAll('[data-drawer-close], [data-scrim]').forEach((b) => {
    bind(b, 'click', () => {
      document.querySelector('[data-scrim]')?.classList.remove('open');
      document.querySelector('[data-drawer]')?.classList.remove('open');
    });
  });
  // Docked evidence panel: collapse + reopen FAB
  document.querySelectorAll('[data-evidence-collapse]').forEach((btn) => {
    bind(btn, 'click', () => {
      const panel = document.querySelector('[data-evidence-panel]');
      panel && panel.classList.add('collapsed');
      document.body.classList.add('evidence-collapsed');
    });
  });
  document.querySelectorAll('[data-evidence-fab]').forEach((fab) => {
    bind(fab, 'click', () => {
      const panel = document.querySelector('[data-evidence-panel]');
      panel && panel.classList.remove('collapsed');
      document.body.classList.remove('evidence-collapsed');
    });
  });
  // Evidence panel tabs
  document.querySelectorAll('[data-ev-tabs] button').forEach((btn) => {
    bind(btn, 'click', () => {
      const group = btn.closest('[data-ev-tabs]');
      group.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Left chat drawer (reference pages): "Ask tutor" opens it.
  // On workspace pages (docked tutor present), it just ensures the tutor is open.
  document.querySelectorAll('[data-ask-tutor]').forEach((b) => {
    bind(b, 'click', () => {
      const docked = document.querySelector('.workspace [data-tutor]');
      if (docked && !document.querySelector('[data-chat-drawer]')) {
        docked.classList.remove('collapsed');
        document.body.classList.remove('chat-collapsed');
        return;
      }
      document.querySelector('[data-chat-drawer]')?.classList.add('open');
      document.querySelector('[data-chat-drawer-scrim]')?.classList.add('open');
    });
  });
  document.querySelectorAll('[data-chat-drawer-scrim], [data-chat-drawer-close]').forEach((b) => {
    bind(b, 'click', () => {
      document.querySelector('[data-chat-drawer]')?.classList.remove('open');
      document.querySelector('[data-chat-drawer-scrim]')?.classList.remove('open');
    });
  });

  // Source reader thumb selection
  document.querySelectorAll('[data-thumb]').forEach((t) => {
    bind(t, 'click', () => {
      t.closest('[data-thumb-list]').querySelectorAll('[data-thumb]').forEach((x) => x.classList.remove('selected'));
      t.classList.add('selected');
    });
  });

  // Drawer tabs
  document.querySelectorAll('[data-drawer-tabs] button').forEach((btn) => {
    bind(btn, 'click', () => {
      const group = btn.closest('[data-drawer-tabs]');
      group.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Settings switches
  document.querySelectorAll('[data-switch]').forEach((s) => {
    bind(s, 'click', () => s.classList.toggle('on'));
  });

  // Composer send (fake echo)
  document.querySelectorAll('[data-composer] .send').forEach((send) => {
    bind(send, 'click', () => {
      const ta = send.closest('[data-composer]').querySelector('textarea');
      if (!ta || !ta.value.trim()) return;
      const body = document.querySelector('[data-tutor-body]');
      if (body) {
        const msg = document.createElement('div');
        msg.className = 'msg-user';
        msg.textContent = ta.value;
        body.appendChild(msg);
        body.scrollTop = body.scrollHeight;
        ta.value = '';
      }
    });
  });
};

document.addEventListener('DOMContentLoaded', () => {
  // Bind any static (non-injected) controls. partials.js will call
  // initInteractions again after injecting topbar/tutor/drawer.
  window.initInteractions();
});
