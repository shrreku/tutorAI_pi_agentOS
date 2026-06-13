(function (global) {
  var CHANNEL = "studyagent-mcp-app";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function send(type, extra) {
    global.parent.postMessage(
      Object.assign({ channel: CHANNEL, direction: "app-to-host", type: type }, extra || {}),
      "*",
    );
  }

  function dispatchAction(actionName, payload) {
    send("action", { actionName: actionName, payload: payload || {} });
  }

  function navigate(nodeId) {
    if (typeof nodeId === "string" && nodeId.length > 0) {
      send("navigate", { nodeId: nodeId });
    }
  }

  function blockContent(state) {
    var block = state.block;
    if (!block) return {};
    return block.content && typeof block.content === "object" ? block.content : {};
  }

  function statusHtml(state) {
    var status = state.ui && state.ui.statusMessage;
    if (!status || !status.text) return "";
    var kind = status.kind || "info";
    return (
      '<div class="sa-status sa-status-' +
      escapeHtml(kind) +
      '">' +
      escapeHtml(status.text) +
      "</div>"
    );
  }

  function pendingOverlay(state) {
    return state.ui && state.ui.pending
      ? '<div class="sa-status sa-status-info">Saving…</div>'
      : "";
  }

  function headerHtml(title, subtitle, eyebrow) {
    return (
      '<div class="sa-header"><div><div class="sa-eyebrow">' +
      escapeHtml(eyebrow || "Interactive") +
      "</div><h1 class=\"sa-title\">" +
      escapeHtml(title) +
      "</h1>" +
      (subtitle ? '<p class="sa-subtitle">' + escapeHtml(subtitle) + "</p>" : "") +
      "</div></div>"
    );
  }

  function createBridge(options) {
    var state = Object.assign(
      {
        host: null,
        block: null,
        canonicalState: {},
        ui: { statusMessage: null, pending: false },
      },
      (options && options.state) || {},
    );
    var tornDown = false;
    var render = options && options.render;

    function root() {
      return document.getElementById("sa-root");
    }

    function setStatus(message, kind) {
      state.ui.statusMessage = message ? { text: message, kind: kind || "info" } : null;
      mount();
    }

    function mount() {
      if (tornDown) return;
      var el = root();
      if (!el || typeof render !== "function") return;
      try {
        render({
          root: el,
          state: state,
          content: blockContent(state),
          helpers: {
            escapeHtml: escapeHtml,
            send: send,
            dispatchAction: dispatchAction,
            navigate: navigate,
            setStatus: setStatus,
            headerHtml: headerHtml,
            statusHtml: statusHtml,
            pendingOverlay: pendingOverlay,
            blockContent: blockContent,
          },
        });
      } catch (error) {
        el.innerHTML =
          '<div class="sa-empty">This activity failed to render. Try refreshing the panel.</div>';
        send("error", { message: error instanceof Error ? error.message : "render failed" });
      }
    }

    function submitAction(actionName, payload) {
      state.ui.pending = true;
      state.ui.statusMessage = null;
      mount();
      dispatchAction(actionName, payload);
    }

    function onHostMessage(msg) {
      if (!msg || msg.channel !== CHANNEL || msg.direction !== "host-to-app") return;
      if (msg.type === "teardown") {
        tornDown = true;
        var el = root();
        if (el) el.classList.add("sa-torn-down");
        return;
      }
      if (msg.type === "ui/initialize") state.host = msg.payload;
      if (msg.type === "tool-input") state.block = (msg.payload && msg.payload.block) || msg.payload;
      if (msg.type === "block-state") {
        state.block = (msg.payload && msg.payload.block) || state.block;
        state.canonicalState = (msg.payload && msg.payload.canonicalState) || state.canonicalState || {};
      }
      if (msg.type === "tool-result") {
        state.ui.pending = false;
        if (msg.payload && msg.payload.error) {
          setStatus(msg.payload.error, "error");
          return;
        }
        state.canonicalState = (msg.payload && msg.payload.canonicalState) || state.canonicalState || {};
        setStatus("Saved", "success");
        window.setTimeout(function () {
          if (state.ui.statusMessage && state.ui.statusMessage.text === "Saved") {
            state.ui.statusMessage = null;
            mount();
          }
        }, 1400);
      }
      mount();
    }

    global.addEventListener("message", function (event) {
      onHostMessage(event.data);
    });

    send("ready");
    mount();

    return {
      state: state,
      mount: mount,
      submitAction: submitAction,
      setStatus: setStatus,
    };
  }

  global.StudyAgentShell = {
    CHANNEL: CHANNEL,
    createBridge: createBridge,
    escapeHtml: escapeHtml,
    send: send,
    dispatchAction: dispatchAction,
    navigate: navigate,
    blockContent: blockContent,
    headerHtml: headerHtml,
    statusHtml: statusHtml,
  };
})(window);
