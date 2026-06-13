import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Whiteboard from "./Whiteboard.js";
import TutorPanel from "./TutorPanel.js";
import EvalRunsDashboard from "./EvalRunsDashboard.js";
import type { SourceLearnerView } from "@studyagent/schemas";
import { applyWorkspaceRefreshInvalidations, resolveWorkspaceRefreshPolicy } from "./workspace-refresh-policy.js";
import { NotebookWorkspaceSyncBridge } from "./notebook-workspace-sync-bridge.js";
import { WorkspaceShellProvider } from "./workspace-shell-context.js";
import { notebookSourcesQueryKey, fetchNotebookSources } from "./notebook-queries.js";

type NotebookRow = {
  id: string;
  title: string;
  description: string | null;
  updatedAt: string;
};

type Source = SourceLearnerView & { metadataJson?: Record<string, unknown> };

function sourceIsProcessing(source: Source): boolean {
  return !source.tutoringReady && source.readiness.tutoring.status === "pending";
}

function sourceIsFailed(source: Source): boolean {
  return source.readiness.tutoring.status === "failed";
}

const api = (path: string, init?: RequestInit) => fetch(`/api/v1${path}`, init);

async function apiWithRetry(path: string, init?: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await api(path, init);
      if (response.ok || attempt === attempts - 1) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) {
        throw error;
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("Network request failed");
}


export function App() {
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [notebooks, setNotebooks] = useState<NotebookRow[]>([]);
  const [title, setTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState<number>(35);
  const [theme] = useState<"mist" | "atlas" | "folio">("mist");
  const [selectedNodeRefs, setSelectedNodeRefs] = useState<Array<{ refType: string; refId: string }>>([]);
  const [graphRefreshToken, setGraphRefreshToken] = useState(0);
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const isDragging = useRef(false);
  const selectedNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === selectedId) ?? notebooks[0] ?? null,
    [notebooks, selectedId],
  );
  const activeNotebookId = selectedId ?? selectedNotebook?.id ?? null;
  const navigate = useCallback((path: string) => {
    window.history.pushState(null, "", path);
    setRoutePath(path);
  }, []);
  const routeNotebookId = useMemo(() => {
    const match = routePath.match(/^\/notebooks\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }, [routePath]);
  const routeEvalRunId = useMemo(() => {
    const match = routePath.match(/^\/eval-runs(?:\/([^/]+))?/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }, [routePath]);

  useEffect(() => {
    const onPopState = () => setRoutePath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const { data: activeSources = [] } = useQuery({
    queryKey: notebookSourcesQueryKey(activeNotebookId),
    enabled: Boolean(activeNotebookId),
    queryFn: () => fetchNotebookSources(activeNotebookId) as Promise<Source[]>,
  });
  const sourceSummary = useMemo(() => {
    const ready = activeSources.filter((source) => source.tutoringReady).length;
    const improving = activeSources.filter((source) => source.tutoringReady && (!source.sourceWikiReady || !source.projectionReady)).length;
    const processing = activeSources.filter(sourceIsProcessing).length;
    const failed = activeSources.filter(sourceIsFailed).length;
    return { total: activeSources.length, ready, improving, processing, failed };
  }, [activeSources]);
  const handleGraphProjectionUpdated = useCallback(() => {
    setGraphRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const raw = window.localStorage.getItem(`studyagent.split.${selectedId}`);
    if (!raw) return;
    const next = Number(raw);
    if (Number.isFinite(next)) {
      setSplitPercent(Math.min(70, Math.max(20, next)));
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    window.localStorage.setItem(`studyagent.split.${selectedId}`, String(splitPercent));
  }, [selectedId, splitPercent]);

  const refresh = useCallback(async () => {
    setError(null);
    setIsLoadingNotebooks(true);
    try {
      const res = await apiWithRetry("/notebooks");
      if (!res.ok) {
        const body = await res.text();
        setError(body || `Failed to load notebooks (${res.status})`);
        return;
      }
      const data = (await res.json()) as { notebooks: NotebookRow[] };
      setNotebooks(data.notebooks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notebooks");
    } finally {
      setIsLoadingNotebooks(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (routeNotebookId && notebooks.some((notebook) => notebook.id === routeNotebookId)) {
      setSelectedId(routeNotebookId);
      return;
    }
    if (!selectedId && notebooks[0] && routePath !== "/notebooks") {
      setSelectedId(notebooks[0].id);
    }
  }, [notebooks, routeNotebookId, routePath, selectedId]);

  const createNotebook = async () => {
    setError(null);
    const res = await api("/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || "Untitled notebook" }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setTitle("");
    await refresh();
  };

  const uploadSource = async (file: File) => {
    if (!activeNotebookId) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await api(`/notebooks/${encodeURIComponent(activeNotebookId)}/sources`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    applyWorkspaceRefreshInvalidations({
      notebookId: activeNotebookId,
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

  if (routePath === "/" || routePath === "/notebooks" || (routePath === "/notebooks/" && !routeNotebookId)) {
    return (
      <div className="study-shell study-shell-index" data-theme={theme}>
        <main className="notebook-page">
          <header className="notebook-page-header">
            <div>
              <div className="study-brand-title">StudyAgent</div>
              <h1 className="study-topbar-title">Notebooks</h1>
              <div className="study-topbar-subtitle">Choose the material you want to study, then continue into the tutor workspace.</div>
            </div>
            <div className="study-create notebook-create">
              <input
                className="study-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void createNotebook()}
                placeholder="New notebook title"
                aria-label="New notebook title"
              />
              <button type="button" className="study-primary-button" onClick={() => void createNotebook()}>
                New notebook
              </button>
            </div>
          </header>
          {error && <pre className="study-error">{error}</pre>}
          <section className="notebook-grid">
            {isLoadingNotebooks && notebooks.length === 0 && (
              <div className="study-empty">
                <div>
                  <div style={{ color: "var(--text-strong)", fontSize: 18, fontWeight: 850 }}>Loading notebooks</div>
                  <div style={{ marginTop: 6 }}>Connecting to the study workspace.</div>
                </div>
              </div>
            )}
            {notebooks.map((nb) => (
              <article key={nb.id} className="notebook-card">
                <div>
                  <h2>{nb.title}</h2>
                  <p>{nb.description ?? "Study workspace with tutor, sources, artifacts, and curriculum."}</p>
                </div>
                <div className="notebook-card-meta">
                  <span>Updated {new Date(nb.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>
                <button type="button" className="study-primary-button" onClick={() => navigate(`/notebooks/${encodeURIComponent(nb.id)}`)}>
                  Continue
                </button>
              </article>
            ))}
            {!isLoadingNotebooks && notebooks.length === 0 && !error && (
              <div className="study-empty">
                <div>
                  <div style={{ color: "var(--text-strong)", fontSize: 18, fontWeight: 850 }}>No notebooks yet</div>
                  <div style={{ marginTop: 6 }}>Create one, then upload source material.</div>
                </div>
              </div>
            )}
            {!isLoadingNotebooks && notebooks.length === 0 && error && (
              <div className="study-empty">
                <div>
                  <div style={{ color: "var(--text-strong)", fontSize: 18, fontWeight: 850 }}>Could not load notebooks</div>
                  <div style={{ marginTop: 6 }}>The workspace API may still be restarting.</div>
                  <button type="button" className="study-secondary-button" style={{ marginTop: 12 }} onClick={() => void refresh()}>
                    Retry
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  if (routePath === "/eval-runs" || routePath === "/eval-runs/" || routePath.startsWith("/eval-runs/")) {
    return (
      <EvalRunsDashboard
        selectedRunId={routeEvalRunId}
        onSelectRun={(runId) => navigate(`/eval-runs/${encodeURIComponent(runId)}`)}
        onBackToNotebooks={() => navigate("/notebooks")}
      />
    );
  }

 	  return (
 	    <div className="study-shell" data-theme={theme}>
	      <main className="study-main">
        <header className="study-topbar">
          <div className="study-topbar-heading">
            <h1 className="study-topbar-title">{selectedNotebook?.title ?? "Resume lesson"}</h1>
            <div className="study-topbar-subtitle">
              {sourceSummary.total > 0
                ? `${sourceSummary.ready}/${sourceSummary.total} sources ready`
                : "No sources yet"}
              {sourceSummary.processing > 0 ? ` · ${sourceSummary.processing} processing` : ""}
              {sourceSummary.improving > 0 ? ` · ${sourceSummary.improving} improving` : ""}
              {sourceSummary.failed > 0 ? ` · ${sourceSummary.failed} failed` : ""}
              {" · "}
              {selectedNodeRefs.length ? `${selectedNodeRefs.length} graph item selected` : "Whole notebook context"}
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
              onClick={() => navigate("/notebooks")}
            >
              Notebooks
            </button>
            <button
              type="button"
              className="study-secondary-button"
              onClick={() => navigate("/eval-runs")}
            >
              Eval runs
            </button>
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
              disabled={!activeNotebookId}
            >
              Add source
            </button>
            <button type="button" className="study-icon-button" onClick={() => void refresh()} aria-label="Refresh notebooks">
              ↻
            </button>
          </div>
        </header>

        <section className="study-workspace">
          {error && <pre className="study-error">{error}</pre>}

          {activeNotebookId ? (
            <WorkspaceShellProvider
              key={activeNotebookId}
              notebookId={activeNotebookId}
              selectedNodeRefs={selectedNodeRefs}
              onSelectedNodeRefsChange={setSelectedNodeRefs}
            >
              <NotebookWorkspaceSyncBridge
                notebookId={activeNotebookId}
                queryClient={queryClient}
                onGraphProjectionUpdated={handleGraphProjectionUpdated}
              />
              <div className="study-shell-frame">
                <div
                  ref={containerRef}
                  className="study-split"
                  style={{ userSelect: isDragging.current ? "none" : "auto" }}
                >
                  <div className="study-split-pane" style={{ width: `${splitPercent}%`, flexShrink: 0 }}>
                    <TutorPanel key={activeNotebookId} notebookId={activeNotebookId} selectedNodeRefs={selectedNodeRefs} />
                  </div>
                  <div className="study-divider" onMouseDown={startDrag} aria-hidden="true" />
                  <div className="study-split-pane" style={{ flex: 1 }}>
                    <Whiteboard notebookId={activeNotebookId} externalRefreshToken={graphRefreshToken} />
                  </div>
                </div>
              </div>
            </WorkspaceShellProvider>
          ) : (
            <div className="study-empty">
              <div>
                <div style={{ color: "var(--text-strong)", fontSize: 18, fontWeight: 850 }}>No active notebook</div>
                <div style={{ marginTop: 6 }}>Create a notebook, then add sources from the top bar.</div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
