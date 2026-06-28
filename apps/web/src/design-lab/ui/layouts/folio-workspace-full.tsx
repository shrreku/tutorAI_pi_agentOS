import { useState } from "react";
import { BookOpen, ChevronDown, Upload, X } from "lucide-react";
import { cn } from "../../lib/utils.js";
import {
  folioEvidence,
  folioNotebookBootstrap,
  FOLIO_SURFACE_LABELS,
  type FolioWorkspaceSurface,
} from "../../lib/folio-mock-data.js";
import { Badge, Button, Dot } from "../primitives.js";
import { FolioGraphCanvas } from "../folio-nodes.js";
import {
  AppSurface,
  PracticeSurface,
  SimulationSurface,
  TextSurface,
} from "../surfaces.js";
import { ChatPane, SplitWorkspace } from "../workspace.js";

const SURFACE_TO_VIEWER: Record<
  Exclude<FolioWorkspaceSurface, "study_map" | "tutor">,
  typeof TextSurface
> = {
  reading: TextSurface,
  interactive: SimulationSurface,
  app: AppSurface,
  practice: PracticeSurface,
};

function FolioEvidenceDrawer({
  open,
  nodeTitle,
  onClose,
}: {
  open: boolean;
  nodeTitle: string;
  onClose: () => void;
}) {
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
            <h2 className="font-display text-[18px] font-semibold">{nodeTitle}</h2>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex-1 space-y-4 overflow-y-auto p-4">
          {folioEvidence.map((item) => (
            <li key={item.id} className="rounded-[var(--radius)] border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-accent" />
                <span className="font-display text-[14px] font-medium">{item.source}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{item.page}</span>
              </div>
              <p className="mt-2 font-display text-[13.5px] leading-relaxed text-foreground/85">
                {item.excerpt}
              </p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function FolioSourceStrip({ notebookTitle }: { notebookTitle: string }) {
  const [open, setOpen] = useState(false);
  const sources = [
    "Clayden · Ch. 7",
    "SN2_Mechanisms.pdf",
    "Lecture 14 slides",
    "Problem set 3",
    "Wikipedia: SN2",
    "Practice quiz bank",
    "Office hours notes",
  ];

  return (
    <div className="border-b border-border bg-surface/50">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted/50"
        onClick={() => setOpen((v) => !v)}
      >
        <Upload className="h-3.5 w-3.5" />
        <span>
          <Dot tone="success" /> 7 / 7 sources ready · {notebookTitle}
        </span>
        <ChevronDown
          className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <ul className="grid gap-1 border-t border-border px-4 py-2 sm:grid-cols-2">
          {sources.map((title) => (
            <li
              key={title}
              className="rounded-[var(--radius-sm)] border border-border bg-card px-2.5 py-1.5 text-[12px]"
            >
              {title}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FolioWorkspaceFull({
  notebookId,
  onBack,
}: {
  notebookId: string;
  onBack: () => void;
}) {
  const bootstrap = folioNotebookBootstrap(notebookId);
  const [activeSurface, setActiveSurface] = useState<FolioWorkspaceSurface>("study_map");
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const ActiveSurface =
    activeSurface !== "study_map" && activeSurface !== "tutor"
      ? SURFACE_TO_VIEWER[activeSurface]
      : null;

  return (
    <div className="folio-workspace-root flex min-h-0 flex-1 flex-col overflow-hidden">
      <FolioSourceStrip notebookTitle={bootstrap.notebook.title} />

      <header className="folio-workspace-header shrink-0">
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
              {bootstrap.notebook.title}
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {bootstrap.sourceSummary.ready}/{bootstrap.sourceSummary.total} sources ready
              {bootstrap.studySummary.moduleTitle
                ? ` · ${bootstrap.studySummary.moduleTitle}`
                : ""}
              {bootstrap.studySummary.objectiveTitle
                ? ` · ${bootstrap.studySummary.objectiveTitle}`
                : ""}
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
                onClick={() => setActiveSurface(surface)}
              >
                {FOLIO_SURFACE_LABELS[surface]}
              </button>
            ))}
          </div>
        </div>

        {activeSurface === "study_map" ? (
          <button
            type="button"
            className="mt-3 rounded-[var(--radius)] border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-accent hover:bg-muted"
            onClick={() => setEvidenceOpen(true)}
          >
            View evidence · SN2 Reaction
          </button>
        ) : null}
      </header>

      <SplitWorkspace
        chat={<ChatPane context="SN2 mechanism" className="flex-1" header={false} />}
        map={
          <div className="flex h-full min-h-0 flex-col">
            {activeSurface === "study_map" ? (
              <div className="relative min-h-0 flex-1">
                <FolioGraphCanvas height={560} />
              </div>
            ) : activeSurface === "tutor" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <Badge tone="accent">Tutor focus</Badge>
                <p className="max-w-sm font-display text-[15px] italic text-muted-foreground">
                  The tutor column is expanded. Switch to another surface to open reading, practice,
                  or the study map alongside chat.
                </p>
              </div>
            ) : ActiveSurface ? (
              <ActiveSurface />
            ) : null}
          </div>
        }
      />

      <FolioEvidenceDrawer
        open={evidenceOpen}
        nodeTitle="SN2 Reaction"
        onClose={() => setEvidenceOpen(false)}
      />
    </div>
  );
}
