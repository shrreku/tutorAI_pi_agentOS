import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  notebookGraphQueryOptions,
  workspaceBootstrapQueryOptions,
} from "@studyagent/api-client";
import type { DashboardSurface, GraphCanvasNode, NotebookWorkspaceBootstrap } from "@studyagent/schemas";
import { apiClient } from "../../platform/api-client.js";
import { Badge, Skeleton } from "../ui/primitives.js";
import { WorkspaceProvider, useFolioWorkspace } from "../workspace/context.js";
import { FolioEvidenceDrawer, FolioSourceStrip } from "../workspace/sources-evidence.js";
import { FolioStudyMap } from "../workspace/study-map.js";
import { FolioTutorChatPane } from "../workspace/tutor-chat-pane.js";
import { FolioReferenceSurfacePanel } from "../workspace/reference-surface-panel.js";
import { mapGraphNodeToNodeRef } from "../workspace/node-ref.js";

const SURFACE_LABELS: Record<DashboardSurface, string> = {
  study_map: "Study Map",
  reading: "Reading",
  interactive: "Simulation",
  app: "Interactive app",
  practice: "Practice",
  tutor: "Tutor focus",
};

const SURFACE_TO_PANEL: Partial<
  Record<DashboardSurface, "reading" | "practice" | "interactive" | "app">
> = {
  reading: "reading",
  practice: "practice",
  interactive: "interactive",
  app: "app",
};

function WorkspaceSplit({ bootstrap }: { bootstrap: NotebookWorkspaceBootstrap }) {
  const navigate = useNavigate();
  const {
    notebookId,
    selectedNodeId,
    setSelectedNodeId,
    splitPercent,
    setSplitPercent,
    graphRefreshToken,
  } = useFolioWorkspace();

  const surfaces: DashboardSurface[] =
    bootstrap.allowedSurfaces.length > 0 ? bootstrap.allowedSurfaces : ["study_map"];
  const [active, setActive] = useState<DashboardSurface>(surfaces[0] ?? "study_map");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const graphQuery = useQuery(
    notebookGraphQueryOptions(apiClient.request, notebookId, {
      name: "study_map",
      limit: 200,
    }),
  );

  const selectedNode = useMemo<GraphCanvasNode | null>(() => {
    if (!selectedNodeId || !graphQuery.data?.nodes) return null;
    return graphQuery.data.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [graphQuery.data?.nodes, selectedNodeId]);

  const selectedNodeRefs = useMemo(
    () => (selectedNode ? [mapGraphNodeToNodeRef(selectedNode)] : []),
    [selectedNode],
  );

  const panelKind = SURFACE_TO_PANEL[active];

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.min(72, Math.max(44, ((ev.clientX - rect.left) / rect.width) * 100));
      setSplitPercent(pct);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="folio-workspace-root flex min-h-0 flex-1 flex-col overflow-hidden">
      <FolioSourceStrip notebookId={notebookId} title={bootstrap.notebook.title} />

      <header className="folio-workspace-header shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              onClick={() => navigate({ to: "/app" })}
            >
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </button>
            <h1 className="mt-1 truncate font-display text-[22px] font-semibold leading-tight">
              {bootstrap.notebook.title}
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {bootstrap.sourceSummary.ready}/{bootstrap.sourceSummary.total} sources ready
              {bootstrap.studySummary.moduleTitle ? ` · ${bootstrap.studySummary.moduleTitle}` : ""}
            </p>
          </div>

          <div className="folio-surface-tabs" role="tablist" aria-label="Workspace surfaces">
            {surfaces.map((surface) => (
              <button
                key={surface}
                type="button"
                role="tab"
                aria-selected={active === surface}
                className="folio-surface-tab"
                data-active={active === surface}
                onClick={() => setActive(surface)}
              >
                {SURFACE_LABELS[surface] ?? surface}
              </button>
            ))}
          </div>
        </div>

        {active === "study_map" && selectedNodeId ? (
          <button
            type="button"
            className="mt-3 rounded-[var(--radius)] border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-accent hover:bg-muted"
            onClick={() => setEvidenceOpen(true)}
          >
            View evidence
          </button>
        ) : null}
      </header>

      <div ref={containerRef} className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `${splitPercent}% 6px 1fr` }}>
        <div className="flex min-h-0 flex-col border-r border-border">
          <FolioTutorChatPane
            context={bootstrap.notebook.title}
            selectedNodeRefs={selectedNodeRefs}
          />
        </div>
        <button
          type="button"
          aria-label="Resize panes"
          className="folio-split-handle hidden lg:block"
          onMouseDown={startDrag}
        />
        <div className="hidden min-h-0 flex-col lg:flex">
          {active === "study_map" ? (
            <FolioStudyMap
              notebookId={notebookId}
              graphData={graphQuery.data ?? null}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              layoutVersion={graphRefreshToken}
            />
          ) : active === "tutor" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <Badge tone="accent">Tutor focus</Badge>
              <p className="max-w-sm font-display text-[15px] italic text-muted-foreground">
                The tutor column is expanded. Switch surfaces to open reading, practice, or the study
                map alongside chat.
              </p>
            </div>
          ) : panelKind ? (
            <FolioReferenceSurfacePanel
              notebookId={notebookId}
              node={selectedNode}
              surfaceKind={panelKind}
            />
          ) : null}
        </div>
      </div>

      <FolioEvidenceDrawer
        notebookId={notebookId}
        nodeId={selectedNodeId}
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
      />
    </div>
  );
}

export function WorkspacePage({ notebookId }: { notebookId: string }) {
  const bootstrapQuery = useQuery(workspaceBootstrapQueryOptions(apiClient.request, notebookId));

  if (bootstrapQuery.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-72" />
        <Skeleton className="min-h-0 flex-1 w-full" />
      </div>
    );
  }

  if (bootstrapQuery.isError || !bootstrapQuery.data) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8 text-center">
        <div>
          <h1 className="font-display text-[22px] font-semibold">Workspace unavailable</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            We couldn’t load this notebook. It may still be processing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceProvider notebookId={notebookId}>
      <WorkspaceSplit bootstrap={bootstrapQuery.data} />
    </WorkspaceProvider>
  );
}
