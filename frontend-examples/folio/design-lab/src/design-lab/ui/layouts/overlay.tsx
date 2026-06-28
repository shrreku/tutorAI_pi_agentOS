import { useState } from "react";
import { Map, Maximize2, X } from "lucide-react";
import type { GraphEdgeSpec, GraphNodeSpec } from "../nodes.js";
import { GraphCanvas } from "../nodes.js";
import { SurfaceViewer } from "../surfaces.js";
import { ChatPane, WorkspaceHeader } from "../workspace.js";
import { Badge, Button } from "../primitives.js";

/* ============================================================================
   OVERLAY (Halo — focus / glass).
   The chat fills the ENTIRE workspace as a centered reading column; the study
   map is hidden by default. A floating glass minimap card is pinned bottom-right
   and, on click, opens a large centered glass overlay sheet (dim backdrop) that
   holds the full GraphCanvas. Chat is the whole surface; the map is on-demand.
   ============================================================================ */

export function OverlayWorkspace({
  notebook,
  context = "SN2 mechanism",
  nodes,
  edges,
}: {
  notebook: string;
  context?: string;
  nodes: GraphNodeSpec[];
  edges: GraphEdgeSpec[];
}) {
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <WorkspaceHeader
        notebook={notebook}
        right={
          <Button size="sm" variant="outline" onClick={() => setMapOpen(true)}>
            <Map className="h-3.5 w-3.5" /> Surfaces
          </Button>
        }
      />

      {/* Chat is the whole surface — a centered reading column on a soft wash. */}
      <div className="dot-grid relative min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col">
          <ChatPane context={context} header={false} className="h-full" />
        </div>

        {/* Floating glass minimap, pinned bottom-right. */}
        <button
          onClick={() => setMapOpen(true)}
          className="glass group absolute bottom-5 right-5 w-56 overflow-hidden rounded-[var(--radius-xl)] border border-border text-left shadow-pop transition-transform duration-200 hover:-translate-y-0.5"
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Study map
            </span>
            <span className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-accent">
              <Maximize2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="pointer-events-none relative h-28 overflow-hidden">
            {/* Scaled-down preview of the real graph. */}
            <div className="absolute left-0 top-0 origin-top-left scale-[0.34]">
              <GraphCanvas nodes={nodes} edges={edges} height={340} className="w-[640px]" />
            </div>
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-[var(--elevated)]/80 to-transparent py-1 text-[10px] font-medium text-muted-foreground">
              tap to expand
            </span>
          </div>
        </button>
      </div>

      {/* On-demand overlay: dim backdrop + centered large glass sheet. */}
      {mapOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <button
            aria-label="Close study map"
            onClick={() => setMapOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
          />
          <div className="glass relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border shadow-pop">
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
              <span className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] bg-accent/12 text-accent">
                <Map className="h-3.5 w-3.5" />
              </span>
              <span className="font-display text-[14px] font-semibold">Learning surfaces</span>
              <Badge tone="neutral" className="ml-1">
                {context}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                · map · reading · interactive · app · practice
              </span>
              <button
                onClick={() => setMapOpen(false)}
                className="ml-auto grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <SurfaceViewer nodes={nodes} edges={edges} defaultType="map" className="h-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
