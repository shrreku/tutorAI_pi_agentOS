import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Whiteboard from "./Whiteboard.js";
import TutorPanel from "./TutorPanel.js";

type NotebookRow = {
  id: string;
  title: string;
  description: string | null;
  updatedAt: string;
};

type Source = { id: string; title: string; status: string; metadataJson?: Record<string, unknown> };

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  uploaded: { bg: "#e0f2fe", text: "#0369a1" },
  parsing: { bg: "#fef3c7", text: "#92400e" },
  chunking: { bg: "#fef3c7", text: "#92400e" },
  embedding: { bg: "#fef3c7", text: "#92400e" },
  indexing: { bg: "#fef3c7", text: "#92400e" },
  enriching: { bg: "#fef3c7", text: "#92400e" },
  tutoring_ready: { bg: "#d1fae5", text: "#065f46" },
  failed: { bg: "#fee2e2", text: "#991b1b" },
};

export const WORKSPACE_REFRESH_EVENT_TYPES = [
  "curriculum.activated",
  "module.updated",
  "objective_list.updated",
  "objective_list.reordered",
  "objective_list.objective_split",
  "objective_list.objectives_merged",
  "session_plan.generated",
  "session_plan.updated",
  "coverage.record.updated",
  "session.started",
  "session.focus.updated",
  "session.completed",
  "session.crystallization.started",
  "session.crystallization.completed",
  "session.digest.draft.updated",
  "learning.mastery_evidence.recorded",
  "learning.mastery.updated",
  "learning.weak_concept.added",
  "learning.review.scheduled",
  "study_plan.updated",
  "objective.completed",
  "artifact.ready",
  "artifact.created",
  "artifact.updated",
  "artifact.proposed",
  "artifact.approved",
  "artifact.rejected",
  "artifact.insert_into_tutor_context",
] as const;

export function shouldInvalidateArtifactsForEvent(eventType: (typeof WORKSPACE_REFRESH_EVENT_TYPES)[number]): boolean {
  return eventType.startsWith("artifact.");
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

function SourcesBar({
  notebookId,
  onGraphProjectionUpdated,
}: {
  notebookId: string;
  onGraphProjectionUpdated: () => void;
}) {
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSeenSequenceRef = useRef(0);
  const queryClient = useQueryClient();
  const { data: sources = [] } = useQuery({
    queryKey: ["notebook-sources", notebookId],
    queryFn: async (): Promise<Source[]> => {
      const res = await api(`/notebooks/${encodeURIComponent(notebookId)}/sources`);
      if (!res.ok) {
        throw new Error(`Failed to load sources (${res.status})`);
      }
      const data = (await res.json()) as { sources: Source[] };
      return data.sources;
    },
  });

  // SSE subscription for live events — drives graph refresh and source status updates
  useEffect(() => {
    let es: EventSource | null = null;
    lastSeenSequenceRef.current = 0;

    const handleNotebookEvent = (
      label: string,
      ev: Event,
      options: { refreshSources?: boolean; refreshGraph?: boolean } = {},
    ) => {
      const rawData = (ev as MessageEvent).data;
      let eventId: string | undefined;
      let sequenceNo: number | undefined;

      try {
        const parsed = JSON.parse(rawData) as { id?: unknown; sequenceNo?: unknown };
        eventId = typeof parsed.id === "string" ? parsed.id : undefined;
        sequenceNo = typeof parsed.sequenceNo === "number" ? parsed.sequenceNo : undefined;
      } catch {
        eventId = undefined;
        sequenceNo = undefined;
      }

      if (sequenceNo !== undefined) {
        if (sequenceNo <= lastSeenSequenceRef.current) {
          return;
        }
        lastSeenSequenceRef.current = sequenceNo;
      }

      setLastEvent(
        `${label}${sequenceNo !== undefined ? ` · #${sequenceNo}` : ""}${eventId ? ` · ${eventId.slice(0, 8)}` : ""}`,
      );

      if (options.refreshSources) {
        void queryClient.invalidateQueries({ queryKey: ["notebook-sources", notebookId] });
      }
      if (options.refreshGraph) {
        onGraphProjectionUpdated();
      }
    };

    try {
      es = new EventSource(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/events/stream?after=0`);
      es.addEventListener("source.tutoring_ready", (ev) => {
        handleNotebookEvent("tutoring ready", ev, { refreshSources: true });
      });
      es.addEventListener("ingestion.job.completed", (ev) => {
        handleNotebookEvent("ingestion done", ev, { refreshSources: true });
      });
      es.addEventListener("ingestion.job.failed", (ev) => {
        handleNotebookEvent("ingestion failed", ev, { refreshSources: true });
      });
      es.addEventListener("graph.neo4j_projection.updated", (ev) => {
        handleNotebookEvent("graph updated", ev, { refreshGraph: true });
      });
      es.addEventListener("source.uploaded", (ev) => {
        handleNotebookEvent("source uploaded", ev, { refreshSources: true });
      });
      const planningRefresh = (label: string, ev: Event) => {
        handleNotebookEvent(label, ev, { refreshGraph: true });
        void queryClient.invalidateQueries({ queryKey: ["whiteboard-study-state", notebookId] });
      };
      for (const eventType of WORKSPACE_REFRESH_EVENT_TYPES) {
        es.addEventListener(eventType, (ev) => {
          const label = eventType.replaceAll(".", " ").replaceAll("_", " ");
          planningRefresh(label, ev);
          if (shouldInvalidateArtifactsForEvent(eventType)) {
            void queryClient.invalidateQueries({ queryKey: ["notebook-artifacts", notebookId] });
          }
        });
      }
      es.onerror = () => setLastEvent("(stream error — reconnecting)");
    } catch {
      setLastEvent("EventSource unavailable");
    }
    return () => es?.close();
  }, [notebookId, onGraphProjectionUpdated, queryClient]);

  const upload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await api(`/notebooks/${encodeURIComponent(notebookId)}/sources`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ["notebook-sources", notebookId] });
    } else {
      const txt = await res.text();
      setLastEvent(`upload failed: ${txt}`);
    }
  };

  const tutoringReady = sources.filter((s) => s.status === "tutoring_ready").length;
  const processing = sources.filter((s) => !["tutoring_ready", "failed", "uploaded"].includes(s.status)).length;
  const embeddingWarnings = sources.filter((s) => typeof s.metadataJson?.embeddingError === "string").length;

  return (
    <div
      style={{
        borderBottom: "1px solid #e5e7eb",
        background: "#fafafa",
        fontSize: 12,
      }}
    >
      {/* Compact bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 12px",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            color: "#374151",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {expanded ? "▾" : "▸"} Sources ({sources.length})
        </button>

        {tutoringReady > 0 && (
          <span style={{ background: "#d1fae5", color: "#065f46", padding: "1px 7px", borderRadius: 9999, fontWeight: 600 }}>
            {tutoringReady} ready
          </span>
        )}
        {processing > 0 && (
          <span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 7px", borderRadius: 9999, fontWeight: 600 }}>
            {processing} processing…
          </span>
        )}
        {embeddingWarnings > 0 && (
          <span style={{ background: "#ffedd5", color: "#9a3412", padding: "1px 7px", borderRadius: 9999, fontWeight: 600 }}>
            {embeddingWarnings} embedding warning{embeddingWarnings > 1 ? "s" : ""}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {lastEvent && (
          <span style={{ color: "#6b7280", fontSize: 11, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lastEvent}
          </span>
        )}

        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: "3px 10px",
            background: uploading ? "#d1d5db" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: uploading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 11,
          }}
        >
          {uploading ? "Uploading…" : "+ Upload"}
        </button>
      </div>

      {/* Expanded source list */}
      {expanded && sources.length > 0 && (
        <div
          style={{
            padding: "4px 12px 8px",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {sources.map((s) => {
            const c = STATUS_COLORS[s.status] ?? { bg: "#f3f4f6", text: "#374151" };
            const embeddingError = typeof s.metadataJson?.embeddingError === "string" ? s.metadataJson.embeddingError : null;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  fontSize: 11,
                }}
              >
                <span style={{ color: "#1f2937", fontWeight: 500 }}>{s.title}</span>
                <span
                  style={{
                    background: c.bg,
                    color: c.text,
                    padding: "1px 6px",
                    borderRadius: 9999,
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {s.status.replace(/_/g, " ")}
                </span>
                {embeddingError && (
                  <span
                    title={embeddingError}
                    style={{
                      background: "#ffedd5",
                      color: "#9a3412",
                      padding: "1px 6px",
                      borderRadius: 9999,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    embedding warning
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {expanded && sources.length === 0 && (
        <div style={{ padding: "4px 12px 8px", color: "#9ca3af" }}>
          No sources yet — upload a PDF, text file, or URL to get started.
        </div>
      )}
    </div>
  );
}

export function App() {
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [notebooks, setNotebooks] = useState<NotebookRow[]>([]);
  const [title, setTitle] = useState("");
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

  useEffect(() => {
    const onPopState = () => setRoutePath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const { data: activeSources = [] } = useQuery({
    queryKey: ["notebook-sources", activeNotebookId],
    enabled: Boolean(activeNotebookId),
    queryFn: async (): Promise<Source[]> => {
      const res = await api(`/notebooks/${encodeURIComponent(activeNotebookId!)}/sources`);
      if (!res.ok) {
        throw new Error(`Failed to load sources (${res.status})`);
      }
      const data = (await res.json()) as { sources: Source[] };
      return data.sources ?? [];
    },
  });
  const sourceSummary = useMemo(() => {
    const ready = activeSources.filter((source) => source.status === "tutoring_ready").length;
    const processing = activeSources.filter((source) => !["tutoring_ready", "failed", "uploaded"].includes(source.status)).length;
    const failed = activeSources.filter((source) => source.status === "failed").length;
    return { total: activeSources.length, ready, processing, failed };
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
    await queryClient.invalidateQueries({ queryKey: ["notebook-sources", activeNotebookId] });
    handleGraphProjectionUpdated();
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
              {sourceSummary.failed > 0 ? ` · ${sourceSummary.failed} failed` : ""}
              {" · "}
              {selectedNodeRefs.length ? `${selectedNodeRefs.length} graph item selected` : "Whole notebook context"}
            </div>
          </div>
          <div className="study-topbar-actions">
            <input className="study-search" placeholder="Search notebook, Study Map, Source Wiki" aria-label="Search notebook" />
            <button
              type="button"
              className="study-secondary-button"
              onClick={() => navigate("/notebooks")}
            >
              Notebooks
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
                  <Whiteboard
                    notebookId={activeNotebookId}
                    onSelectedNodeRefsChange={setSelectedNodeRefs}
                    externalRefreshToken={graphRefreshToken}
                  />
                </div>
              </div>
            </div>
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
