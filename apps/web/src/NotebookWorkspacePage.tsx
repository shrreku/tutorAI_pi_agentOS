import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, FlaskConical, Plus, Search } from "lucide-react";
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
import { Button, Dot } from "./ui/primitives.js";
import { cn } from "./ui/cn.js";

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

// Chat is the primary surface: keep the chat pane >= the map pane.
const CHAT_MIN = 44;
const CHAT_MAX = 72;
const CHAT_DEFAULT = 56;

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
  const [splitPercent, setSplitPercent] = useState<number>(CHAT_DEFAULT);
  // Folio is the app-wide design language; the study-shell themes the graph/chat panes.
  const [theme] = useState<"mist" | "atlas" | "folio">("folio");
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

  const statusTone: "success" | "warning" | "danger" | "neutral" =
    sourceSummary.failed > 0
      ? "danger"
      : sourceSummary.processing > 0
        ? "warning"
        : sourceSummary.total > 0
          ? "success"
          : "neutral";

  const handleGraphProjectionUpdated = useCallback(() => {
    setGraphRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(`studyagent.split.${notebookId}`);
    if (!raw) return;
    const next = Number(raw);
    if (Number.isFinite(next)) {
      setSplitPercent(Math.min(CHAT_MAX, Math.max(CHAT_MIN, next)));
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
      const pct = Math.min(
        CHAT_MAX,
        Math.max(CHAT_MIN, ((ev.clientX - rect.left) / rect.width) * 100),
      );
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

  const statusLabel =
    sourceSummary.total > 0
      ? `${sourceSummary.ready}/${sourceSummary.total} sources ready` +
        (sourceSummary.processing > 0 ? ` · ${sourceSummary.processing} processing` : "") +
        (sourceSummary.improving > 0 ? ` · ${sourceSummary.improving} improving` : "") +
        (sourceSummary.failed > 0 ? ` · ${sourceSummary.failed} failed` : "")
      : "No sources yet";

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Folio workspace header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
        <button
          onClick={() => navigate("/app")}
          aria-label="Back to dashboard"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[16px] font-semibold leading-tight">
            {title ?? "Study workspace"}
          </h1>
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Dot tone={statusTone} pulse={sourceSummary.processing > 0} />
            <span className="truncate">{statusLabel}</span>
            <span className="hidden sm:inline">
              {" · "}
              {selectedNodeRefs.length
                ? `${selectedNodeRefs.length} graph item selected`
                : "Whole-notebook context"}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-muted-foreground lg:flex">
            <Search className="h-3.5 w-3.5" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search notebook…"
              aria-label="Search notebook"
              className="w-44 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {showEvalRuns ? (
            <Button size="sm" variant="ghost" onClick={() => navigate("/eval-runs")}>
              <FlaskConical className="h-4 w-4" /> Eval runs
            </Button>
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
          <Button size="sm" variant="primary" onClick={() => uploadInputRef.current?.click()}>
            <Plus className="h-4 w-4" /> Add source
          </Button>
        </div>
      </header>

      {error && (
        <pre className="mx-4 mt-3 overflow-auto rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </pre>
      )}

      <NotebookSourceIngestionList
        notebookId={notebookId}
        sources={activeSources.map((source) => ({ id: source.id, title: source.title }))}
      />

      {/* Chat-primary workspace: the study-shell themes the chat + map panes (Folio variant). */}
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
        <div className="study-shell min-h-0 flex-1" data-theme={theme}>
          <div className="study-shell-frame h-full">
            <div
              ref={containerRef}
              className="study-split"
              style={{ userSelect: isDragging.current ? "none" : "auto" }}
            >
              {/* Chat — primary, dominant pane */}
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
              <div
                className={cn("study-divider")}
                onMouseDown={startDrag}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize chat and map"
              />
              {/* Study Map + learning surfaces — secondary pane */}
              <div className="study-split-pane" style={{ flex: 1 }}>
                <Whiteboard notebookId={notebookId} externalRefreshToken={graphRefreshToken} />
              </div>
            </div>
          </div>
        </div>
      </WorkspaceShellProvider>
    </div>
  );
}
