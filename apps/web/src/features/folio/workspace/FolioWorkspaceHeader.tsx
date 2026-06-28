import type { DashboardSurface, GraphCanvasNode, NotebookWorkspaceBootstrap } from "@studyagent/schemas";
import { getLearnerNodeTitle } from "../../../whiteboard-utils.js";
import { Badge } from "../primitives.js";

const SURFACE_LABELS: Record<DashboardSurface, string> = {
  study_map: "Study map",
  reading: "Reading",
  interactive: "Interactive",
  app: "App",
  practice: "Practice",
  tutor: "Tutor",
};

export function FolioWorkspaceHeader({
  bootstrap,
  activeSurface,
  onSurfaceChange,
  onBack,
  selectedNodeId,
  selectedNode,
  onOpenEvidence,
}: {
  bootstrap: NotebookWorkspaceBootstrap;
  activeSurface: DashboardSurface;
  onSurfaceChange: (surface: DashboardSurface) => void;
  onBack: () => void;
  selectedNodeId?: string | null;
  selectedNode?: GraphCanvasNode | null;
  onOpenEvidence?: (nodeId: string, title: string, nodeType: string) => void;
}) {
  const { notebook, sourceSummary, studySummary } = bootstrap;

  return (
    <header className="folio-workspace-header">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            ← Dashboard
          </button>
          <h1 className="mt-1 truncate font-display text-[22px] font-semibold leading-tight">
            {notebook.title}
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {sourceSummary.ready}/{sourceSummary.total} sources ready
            {studySummary.moduleTitle ? ` · ${studySummary.moduleTitle}` : ""}
            {studySummary.objectiveTitle ? ` · ${studySummary.objectiveTitle}` : ""}
          </p>
        </div>

        <div className="folio-surface-tabs" role="tablist" aria-label="Workspace surfaces">
          {bootstrap.allowedSurfaces.map((surface) => (
            <button
              key={surface}
              type="button"
              role="tab"
              aria-selected={activeSurface === surface}
              className="folio-surface-tab"
              data-active={activeSurface === surface}
              onClick={() => onSurfaceChange(surface)}
            >
              {SURFACE_LABELS[surface]}
            </button>
          ))}
        </div>
      </div>

      {bootstrap.fallbackReason ? (
        <p className="mt-3 rounded-[var(--radius)] border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-foreground/85">
          {bootstrap.fallbackReason}
        </p>
      ) : null}

      {studySummary.status === "building" ? (
        <div className="mt-2">
          <Badge tone="warning">Curriculum building</Badge>
        </div>
      ) : null}

      {selectedNodeId && selectedNode && onOpenEvidence ? (
        <button
          type="button"
          className="mt-3 rounded-[var(--radius)] border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-accent hover:bg-muted"
          onClick={() =>
            onOpenEvidence(
              selectedNodeId,
              getLearnerNodeTitle(selectedNode),
              selectedNode.nodeType,
            )
          }
        >
          View evidence
        </button>
      ) : null}
    </header>
  );
}
