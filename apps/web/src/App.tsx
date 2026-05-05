import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Whiteboard from "./Whiteboard.js";
import TutorPanel from "./TutorPanel.js";
import { DeveloperTimelinePanel } from "./DeveloperTimelinePanel.js";

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

const api = (path: string, init?: RequestInit) => fetch(`/api/v1${path}`, init);

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
  const [notebooks, setNotebooks] = useState<NotebookRow[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState<number>(35);
  const [selectedNodeRefs, setSelectedNodeRefs] = useState<Array<{ refType: string; refId: string }>>([]);
  const [graphRefreshToken, setGraphRefreshToken] = useState(0);
  const [showDeveloperTimeline, setShowDeveloperTimeline] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
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
    const res = await api("/notebooks");
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const data = (await res.json()) as { notebooks: NotebookRow[] };
    setNotebooks(data.notebooks);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId && notebooks[0]) {
      setSelectedId(notebooks[0].id);
    }
  }, [notebooks, selectedId]);

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
    <div style={{ fontFamily: "system-ui", maxWidth: 1400, margin: "0 auto", padding: "16px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>StudyAgent</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "2px 0 0" }}>Personal learning workspace</p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowDeveloperTimeline((value) => !value)}
            style={{ padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 6, background: showDeveloperTimeline ? "#eff6ff" : "white", color: showDeveloperTimeline ? "#1d4ed8" : "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            {showDeveloperTimeline ? "Hide timeline" : "Developer timeline"}
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void createNotebook()}
            placeholder="New notebook title…"
            style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, width: 220 }}
          />
          <button
            type="button"
            onClick={() => void createNotebook()}
            style={{ padding: "6px 14px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            Create
          </button>
        </div>
      </div>

      {error && (
        <pre style={{ background: "#fff4f4", border: "1px solid #f0b4b4", padding: 12, overflow: "auto", borderRadius: 6, marginBottom: 12 }}>
          {error}
        </pre>
      )}

      {/* Notebook selector — horizontal pill list */}
      {notebooks.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {notebooks.map((nb) => (
            <button
              key={nb.id}
              type="button"
              onClick={() => setSelectedId(nb.id)}
              style={{
                padding: "5px 14px",
                border: selectedId === nb.id ? "2px solid #2563eb" : "1px solid #d1d5db",
                borderRadius: 9999,
                background: selectedId === nb.id ? "#eff6ff" : "white",
                color: selectedId === nb.id ? "#1d4ed8" : "#374151",
                fontWeight: selectedId === nb.id ? 600 : 400,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {nb.title}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void refresh()}
            style={{ padding: "5px 12px", border: "1px solid #d1d5db", borderRadius: 9999, background: "white", fontSize: 12, color: "#6b7280", cursor: "pointer" }}
          >
            ↺
          </button>
        </div>
      )}

      {notebooks.length === 0 && (
        <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 12 }}>
          No notebooks yet — create one above.
        </div>
      )}

      {selectedId && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 130px)",
            minHeight: 500,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {/* Sources bar with SSE */}
          <SourcesBar
            notebookId={selectedId}
            onGraphProjectionUpdated={handleGraphProjectionUpdated}
          />

          {showDeveloperTimeline && (
            <DeveloperTimelinePanel notebookId={selectedId} onSelectNodeRefs={setSelectedNodeRefs} />
          )}

          {/* Left Tutor / Right Graph split */}
          <div
            ref={containerRef}
            style={{
              display: "flex",
              flexDirection: "row",
              flex: 1,
              overflow: "hidden",
              userSelect: isDragging.current ? "none" : "auto",
            }}
          >
            <div style={{ width: `${splitPercent}%`, overflow: "hidden", flexShrink: 0 }}>
              <TutorPanel notebookId={selectedId} selectedNodeRefs={selectedNodeRefs} />
            </div>
            <div
              onMouseDown={startDrag}
              style={{
                width: 5,
                cursor: "col-resize",
                background: "#e5e7eb",
                flexShrink: 0,
                transition: "background 150ms",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#3b82f6")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#e5e7eb")}
            />
            <div style={{ flex: 1, overflow: "hidden" }}>
              <Whiteboard
                notebookId={selectedId}
                onSelectedNodeRefsChange={setSelectedNodeRefs}
                externalRefreshToken={graphRefreshToken}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
