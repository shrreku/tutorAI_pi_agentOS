import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Whiteboard from "./Whiteboard.js";
import TutorPanel from "./TutorPanel.js";
import type { SourceLearnerView } from "@studyagent/schemas";
import {
  applyWorkspaceRefreshInvalidations,
  resolveWorkspaceRefreshPolicy,
} from "./workspace-refresh-policy.js";
import { NotebookWorkspaceSyncBridge } from "./notebook-workspace-sync-bridge.js";
import { WorkspaceShellProvider } from "./workspace-shell-context.js";
import { notebookSourcesQueryKey, fetchNotebookSources } from "./notebook-queries.js";
import { NotebookSourceIngestionList } from "./components/NotebookSourceIngestionList.js";
import { useSession } from "./routing/RouteGuards.js";

type Source = SourceLearnerView & { metadataJson?: Record<string, unknown> };

function sourceIsProcessing(source: Source): boolean {
  return !source.tutoringReady && source.readiness.tutoring.status === "pending";
}

function sourceIsFailed(source: Source): boolean {
  return source.readiness.tutoring.status === "failed";
}

const api = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  const devUserId = window.localStorage.getItem("tutorbook.devUserId");
  if (devUserId) {
    headers.set("X-User-Id", devUserId);
  }
  return fetch(`/api/v1${path}`, { ...init, headers, credentials: "include" });
};

export function NotebookWorkspacePage({
  notebookId,
  navigate,
}: {
  notebookId: string;
  navigate: (path: string) => void;
}) {
  const [title, setTitle] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState<number>(35);
  const [theme] = useState<"mist" | "atlas" | "folio">("mist");
  const [selectedNodeRefs, setSelectedNodeRefs] = useState<
    Array<{ refType: string; refId: string }>
  >([]);
  const [graphRefreshToken, setGraphRefreshToken] = useState(0);
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const isDragging = useRef(false);
  const { session } = useSession();
  const showEvalRuns = session?.entitlements.adminAccess ?? false;

  const { data: activeSources = [] } = useQuery({
    queryKey: notebookSourcesQueryKey(notebookId),
    enabled: Boolean(notebookId),
    queryFn: () => fetchNotebookSources(notebookId) as Promise<Source[]>,
  });

  const sourceSummary = useMemo(() => {
    const ready = activeSources.filter((source) => source.tutoringReady).length;
    const improving = activeSources.filter(
      (source) => source.tutoringReady && (!source.sourceWikiReady || !source.projectionReady),
    ).length;
    const processing = activeSources.filter(sourceIsProcessing).length;
    const failed = activeSources.filter(sourceIsFailed).length;
    return { total: activeSources.length, ready, improving, processing, failed };
  }, [activeSources]);

  const handleGraphProjectionUpdated = useCallback(() => {
    setGraphRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(`studyagent.split.${notebookId}`);
    if (!raw) return;
    const next = Number(raw);
    if (Number.isFinite(next)) {
      setSplitPercent(Math.min(70, Math.max(20, next)));
    }
  }, [notebookId]);

  useEffect(() => {
    window.localStorage.setItem(`studyagent.split.${notebookId}`, String(splitPercent));
  }, [notebookId, splitPercent]);

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
      onGraphProjectionUpdated: handleGraphProjectionUpdated,
    });
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.min(70, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100));
      setSplitPercent(pct);
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="study-shell" data-theme={theme}>
      <main className="study-main">
        <header className="study-topbar">
          <div className="study-topbar-heading">
            <h1 className="study-topbar-title">{title ?? "Study workspace"}</h1>
            <div className="study-topbar-subtitle">
              {sourceSummary.total > 0
                ? `${sourceSummary.ready}/${sourceSummary.total} sources ready`
                : "No sources yet"}
              {sourceSummary.processing > 0 ? ` · ${sourceSummary.processing} processing` : ""}
              {sourceSummary.improving > 0 ? ` · ${sourceSummary.improving} improving` : ""}
              {sourceSummary.failed > 0 ? ` · ${sourceSummary.failed} failed` : ""}
              {" · "}
              {selectedNodeRefs.length
                ? `${selectedNodeRefs.length} graph item selected`
                : "Whole notebook context"}
            </div>
          </div>
          <div className="study-topbar-actions">
            <input
              className="study-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search notebook, Study Map, Source Wiki"
              aria-label="Search notebook"
            />
            <button
              type="button"
              className="study-secondary-button"
              onClick={() => navigate("/app")}
            >
              Dashboard
            </button>
            {showEvalRuns ? (
              <button
                type="button"
                className="study-secondary-button"
                onClick={() => navigate("/eval-runs")}
              >
                Eval runs
              </button>
            ) : null}
            <input
              ref={uploadInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadSource(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="study-primary-button"
              onClick={() => uploadInputRef.current?.click()}
            >
              Add source
            </button>
          </div>
        </header>

        <section className="study-workspace">
          {error && <pre className="study-error">{error}</pre>}
          <NotebookSourceIngestionList
            notebookId={notebookId}
            sources={activeSources.map((source) => ({ id: source.id, title: source.title }))}
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
              onGraphProjectionUpdated={handleGraphProjectionUpdated}
            />
            <div className="study-shell-frame">
              <div
                ref={containerRef}
                className="study-split"
                style={{ userSelect: isDragging.current ? "none" : "auto" }}
              >
                <div
                  className="study-split-pane"
                  style={{ width: `${splitPercent}%`, flexShrink: 0 }}
                >
                  <TutorPanel
                    key={notebookId}
                    notebookId={notebookId}
                    selectedNodeRefs={selectedNodeRefs}
                  />
                </div>
                <div className="study-divider" onMouseDown={startDrag} aria-hidden="true" />
                <div className="study-split-pane" style={{ flex: 1 }}>
                  <Whiteboard notebookId={notebookId} externalRefreshToken={graphRefreshToken} />
                </div>
              </div>
            </div>
          </WorkspaceShellProvider>
        </section>
      </main>
    </div>
  );
}
