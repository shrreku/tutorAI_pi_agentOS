import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Whiteboard from "../../Whiteboard.js";
import TutorPanel from "../../TutorPanel.js";
import type { SourceLearnerView } from "@studyagent/schemas";
import {
  applyWorkspaceRefreshInvalidations,
  resolveWorkspaceRefreshPolicy,
} from "../../workspace-refresh-policy.js";
import { NotebookWorkspaceSyncBridge } from "../../notebook-workspace-sync-bridge.js";
import { WorkspaceShellProvider } from "../../workspace-shell-context.js";
import { notebookSourcesQueryKey, fetchNotebookSources } from "../../notebook-queries.js";
import { NotebookSourceIngestionList } from "../../components/NotebookSourceIngestionList.js";
import { useSession } from "../../routing/RouteGuards.js";
import { ResizableSplit } from "../components/ResizableSplit.js";
import { IconSearch } from "../../kit/components/KitIcons.js";
import { useVisualTheme } from "../shell/ThemeProvider.js";
import { BookOpen, ListChecks, Map, MessageCircle, Settings } from "lucide-react";
import { useWorkspaceShell } from "../../workspace-shell-context.js";

type Source = SourceLearnerView & { metadataJson?: Record<string, unknown> };

const api = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  const devUserId = window.localStorage.getItem("tutorbook.devUserId");
  if (devUserId) headers.set("X-User-Id", devUserId);
  return fetch(`/api/v1${path}`, { ...init, headers, credentials: "include" });
};

function sourceIsProcessing(source: Source): boolean {
  return !source.tutoringReady && source.readiness.tutoring.status === "pending";
}

function FocusWorkspaceDock({
  tutorCollapsed,
  onToggleTutor,
}: {
  tutorCollapsed: boolean;
  onToggleTutor: () => void;
}) {
  const { shell, dispatchShell } = useWorkspaceShell();
  const iconSize = 19;

  const controls = [
    {
      label: "Study Map",
      active: shell.viewMode === "study_map",
      icon: <Map size={iconSize} />,
      onClick: () => dispatchShell({ type: "setViewMode", viewMode: "study_map" }),
    },
    {
      label: "Source Wiki",
      active: shell.viewMode === "source_wiki_map",
      icon: <BookOpen size={iconSize} />,
      onClick: () => dispatchShell({ type: "setViewMode", viewMode: "source_wiki_map" }),
    },
    {
      label: "Curriculum",
      active: shell.viewMode === "curriculum",
      icon: <ListChecks size={iconSize} />,
      onClick: () => dispatchShell({ type: "setViewMode", viewMode: "curriculum" }),
    },
    {
      label: "Tutor",
      active: !tutorCollapsed,
      icon: <MessageCircle size={iconSize} />,
      onClick: onToggleTutor,
    },
    {
      label: "Developer Mode",
      active: shell.isDeveloperMode,
      icon: <Settings size={iconSize} />,
      onClick: () => dispatchShell({ type: "setDeveloperMode", enabled: !shell.isDeveloperMode }),
    },
  ];

  return (
    <div className="focus-workspace-dock" role="toolbar" aria-label="Focus workspace controls">
      {controls.map((control) => (
        <button
          key={control.label}
          type="button"
          aria-label={control.label}
          title={control.label}
          data-active={control.active}
          onClick={control.onClick}
        >
          {control.icon}
        </button>
      ))}
    </div>
  );
}

export function NextNotebookWorkspacePage({
  notebookId,
  navigate,
}: {
  notebookId: string;
  navigate: (path: string) => void;
}) {
  const [title, setTitle] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tutorWidthPct, setTutorWidthPct] = useState(32);
  const [tutorCollapsed, setTutorCollapsed] = useState(false);
  const [selectedNodeRefs, setSelectedNodeRefs] = useState<
    Array<{ refType: string; refId: string }>
  >([]);
  const [graphRefreshToken, setGraphRefreshToken] = useState(0);
  const theme = useVisualTheme();
  const queryClient = useQueryClient();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const { session } = useSession();
  const showEvalRuns = session?.entitlements.adminAccess ?? false;
  const credits = session?.credits?.percentRemaining;
  const isFocusTheme = theme === "focus";

  const { data: activeSources = [] } = useQuery({
    queryKey: notebookSourcesQueryKey(notebookId),
    enabled: Boolean(notebookId),
    queryFn: () => fetchNotebookSources(notebookId) as Promise<Source[]>,
  });

  const sourceSummary = useMemo(() => {
    const ready = activeSources.filter((s) => s.tutoringReady).length;
    const processing = activeSources.filter(sourceIsProcessing).length;
    return { total: activeSources.length, ready, processing };
  }, [activeSources]);

  useEffect(() => {
    const raw = window.localStorage.getItem(`studyagent.split.${notebookId}`);
    if (!raw) return;
    const next = Number(raw);
    if (Number.isFinite(next)) setTutorWidthPct(Math.min(50, Math.max(22, next)));
  }, [notebookId]);

  useEffect(() => {
    window.localStorage.setItem(`studyagent.split.${notebookId}`, String(tutorWidthPct));
  }, [notebookId, tutorWidthPct]);

  useEffect(() => {
    document.body.classList.toggle("chat-collapsed", tutorCollapsed);
    return () => document.body.classList.remove("chat-collapsed");
  }, [tutorCollapsed]);

  useEffect(() => {
    void (async () => {
      setError(null);
      const res = await api(`/notebooks/${encodeURIComponent(notebookId)}`);
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const data = (await res.json()) as { notebook: { title: string } };
      setTitle(data.notebook.title);
    })();
  }, [notebookId]);

  const onResizeTutor = useCallback((pct: number) => {
    setTutorWidthPct(pct);
  }, []);

  const uploadSource = async (file: File) => {
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await api(`/notebooks/${encodeURIComponent(notebookId)}/sources`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    applyWorkspaceRefreshInvalidations({
      notebookId,
      policy: resolveWorkspaceRefreshPolicy("source.uploaded"),
      queryClient,
      onGraphProjectionUpdated: () => setGraphRefreshToken((t) => t + 1),
    });
  };

  return (
    <div
      className={`app workspace-page workspace-page--${theme} next-workspace next-workspace--${theme}`}
    >
      <div className="topbar workspace-topbar">
        <div className="brand">
          <div className={`logo ${theme}-logo`}>TB</div>
          <div className="title">{title ?? "Study workspace"}</div>
          {sourceSummary.ready > 0 ? <span className="badge purple">sources ready</span> : null}
        </div>
        <div className="spacer" />
        <div className="search">
          <IconSearch />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search map or notes…"
            aria-label="Search notebook"
          />
        </div>
        {credits != null ? <span className="credits">{credits}% credits</span> : null}
        <button type="button" className="icon-btn light" onClick={() => navigate("/app")}>
          Dashboard
        </button>
        {showEvalRuns ? (
          <button type="button" className="icon-btn light" onClick={() => navigate("/eval-runs")}>
            Eval runs
          </button>
        ) : null}
        <input
          ref={uploadInputRef}
          type="file"
          className="hidden"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadSource(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn primary"
          onClick={() => uploadInputRef.current?.click()}
        >
          Add source
        </button>
      </div>

      {error ? (
        <pre style={{ margin: "8px 24px", color: "var(--red)", fontSize: 12 }}>{error}</pre>
      ) : null}

      <NotebookSourceIngestionList
        notebookId={notebookId}
        sources={activeSources.map((s) => ({ id: s.id, title: s.title }))}
      />

      <WorkspaceShellProvider
        key={notebookId}
        notebookId={notebookId}
        selectedNodeRefs={selectedNodeRefs}
        onSelectedNodeRefsChange={setSelectedNodeRefs}
      >
        <NotebookWorkspaceSyncBridge
          notebookId={notebookId}
          queryClient={queryClient}
          onGraphProjectionUpdated={() => setGraphRefreshToken((t) => t + 1)}
        />
        <div className="workspace workspace-shell" data-evidence ref={workspaceRef}>
          <aside
            className={`tutor next-workspace-tutor ${theme}-tutor${tutorCollapsed ? " collapsed" : ""}`}
            data-tutor
            style={
              tutorCollapsed || isFocusTheme
                ? undefined
                : { width: `${tutorWidthPct}%`, maxWidth: 480, minWidth: 280 }
            }
          >
            <TutorPanel
              notebookId={notebookId}
              selectedNodeRefs={selectedNodeRefs}
              onCollapse={() => setTutorCollapsed(true)}
            />
          </aside>
          {!tutorCollapsed && !isFocusTheme ? (
            <ResizableSplit
              percent={tutorWidthPct}
              onPercentChange={onResizeTutor}
              left={<div />}
              right={null}
              handleOnly
            />
          ) : null}
          <div className="workspace-main next-workspace-canvas">
            <div
              className="workspace-canvas"
              style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 0 }}
            >
              <Whiteboard notebookId={notebookId} externalRefreshToken={graphRefreshToken} />
            </div>
          </div>
          {isFocusTheme ? (
            <FocusWorkspaceDock
              tutorCollapsed={tutorCollapsed}
              onToggleTutor={() => setTutorCollapsed((value) => !value)}
            />
          ) : null}
        </div>
      </WorkspaceShellProvider>

      <button
        type="button"
        className="chat-fab"
        data-chat-fab
        title="Open chat"
        onClick={() => setTutorCollapsed((v) => !v)}
      >
        <MessageCircle size={18} />
      </button>
    </div>
  );
}
