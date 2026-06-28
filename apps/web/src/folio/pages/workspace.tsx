import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, ChevronDown, Upload, X } from "lucide-react";
import { workspaceBootstrapQueryOptions } from "@studyagent/api-client";
import type { DashboardSurface, NotebookWorkspaceBootstrap } from "@studyagent/schemas";
import { apiClient } from "../../platform/api-client.js";
import { cn } from "../lib/utils.js";
import { Badge, Button, Dot, Skeleton } from "../ui/primitives.js";
import { FolioGraphCanvas } from "../ui/folio-nodes.js";
import { AppSurface, PracticeSurface, SimulationSurface, TextSurface } from "../ui/surfaces.js";
import { ChatPane, SplitWorkspace } from "../ui/workspace.js";

const SURFACE_LABELS: Record<DashboardSurface, string> = {
  study_map: "Study Map",
  reading: "Reading",
  interactive: "Simulation",
  app: "Interactive app",
  practice: "Practice",
  tutor: "Tutor focus",
};

const SURFACE_VIEWERS: Partial<Record<DashboardSurface, typeof TextSurface>> = {
  reading: TextSurface,
  interactive: SimulationSurface,
  app: AppSurface,
  practice: PracticeSurface,
};

function SourceStrip({
  title,
  ready,
  total,
}: {
  title: string;
  ready: number;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const allReady = total > 0 && ready === total;
  return (
    <div className="border-b border-border bg-surface/50">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted/50"
        onClick={() => setOpen((v) => !v)}
      >
        <Upload className="h-3.5 w-3.5" />
        <span className="inline-flex items-center gap-1.5">
          <Dot tone={allReady ? "success" : total === 0 ? "neutral" : "warning"} />
          {total > 0 ? `${ready} / ${total} sources ready` : "No sources yet"} · {title}
        </span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-2 text-[12px] text-muted-foreground">
          Source list and upload open here.
        </div>
      ) : null}
    </div>
  );
}

function EvidenceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px]">
      <button type="button" className="flex-1" aria-label="Close evidence" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-elevated shadow-pop">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Evidence
            </p>
            <h2 className="font-display text-[18px] font-semibold">Selected concept</h2>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="rounded-[var(--radius)] border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-accent" />
              <span className="font-display text-[14px] font-medium">Select a node</span>
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              Pick a node on the Study Map to see the source excerpts that ground it.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function WorkspaceView({ bootstrap }: { bootstrap: NotebookWorkspaceBootstrap }) {
  const navigate = useNavigate();
  const surfaces: DashboardSurface[] =
    bootstrap.allowedSurfaces.length > 0 ? bootstrap.allowedSurfaces : ["study_map"];
  const [active, setActive] = useState<DashboardSurface>(surfaces[0] ?? "study_map");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const ViewerForActive = SURFACE_VIEWERS[active];

  return (
    <div className="folio-workspace-root flex min-h-0 flex-1 flex-col overflow-hidden">
      <SourceStrip
        title={bootstrap.notebook.title}
        ready={bootstrap.sourceSummary.ready}
        total={bootstrap.sourceSummary.total}
      />

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

        {active === "study_map" ? (
          <button
            type="button"
            className="mt-3 rounded-[var(--radius)] border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-accent hover:bg-muted"
            onClick={() => setEvidenceOpen(true)}
          >
            View evidence
          </button>
        ) : null}
      </header>

      <SplitWorkspace
        chat={<ChatPane context={bootstrap.notebook.title} className="flex-1" header={false} />}
        map={
          <div className="flex h-full min-h-0 flex-col">
            {active === "study_map" ? (
              <div className="relative min-h-0 flex-1">
                <FolioGraphCanvas height={560} />
              </div>
            ) : active === "tutor" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <Badge tone="accent">Tutor focus</Badge>
                <p className="max-w-sm font-display text-[15px] italic text-muted-foreground">
                  The tutor column is expanded. Switch surfaces to open reading, practice, or the
                  study map alongside chat.
                </p>
              </div>
            ) : ViewerForActive ? (
              <ViewerForActive />
            ) : null}
          </div>
        }
      />

      <EvidenceDrawer open={evidenceOpen} onClose={() => setEvidenceOpen(false)} />
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

  return <WorkspaceView bootstrap={bootstrapQuery.data} />;
}
