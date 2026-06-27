import { BookOpen, Crosshair, Minus, Plus } from "lucide-react";
import type { GraphEdgeSpec, GraphNodeSpec } from "../nodes.js";
import { SurfaceViewer } from "../surfaces.js";
import { ChatPane } from "../workspace.js";
import { Badge, Dot } from "../primitives.js";

/* ============================================================================
   CANVAS layout (Atlas — spatial). The study map is a full-bleed background
   canvas (atlas-grid) filling the whole workspace. The chat is a large, left-
   docked floating dock panel (~58% width, top/bottom inset) elevated over the
   map. The map shows in the remaining right area and visibly behind/beside the
   floating chat. A slim floating top bar carries the notebook name + map
   controls. Feels like a map app with a conversation panel floating on it.
   ============================================================================ */

function MapControl({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function CanvasWorkspace({
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
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {/* Full-bleed learning-surface canvas — map by default; switch to reading,
          interactive, MCP app, or practice via the surface switcher. */}
      <div className="absolute inset-0">
        <SurfaceViewer
          nodes={nodes}
          edges={edges}
          defaultType="map"
          className="atlas-grid h-full bg-transparent"
        />
      </div>

      {/* Slim floating top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4 pt-4">
        <div className="glass pointer-events-auto flex items-center gap-2.5 rounded-full border border-border px-3.5 py-2 shadow-pop">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-[13px] font-semibold">{notebook}</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Dot tone="success" /> live
          </span>
        </div>
        <div className="ml-auto" />
        <div className="glass pointer-events-auto flex items-center gap-1 rounded-full border border-border p-1 shadow-pop">
          <MapControl label="Zoom out">
            <Minus className="h-4 w-4" />
          </MapControl>
          <span className="px-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            100%
          </span>
          <MapControl label="Zoom in">
            <Plus className="h-4 w-4" />
          </MapControl>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
          <button className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Crosshair className="h-3.5 w-3.5" /> Fit
          </button>
        </div>
      </div>

      {/* Floating chat dock (left, elevated, inset top/bottom) */}
      <div className="absolute bottom-4 left-4 top-[4.5rem] z-10 flex w-[58%] max-w-[680px] min-w-[340px] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-pop">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Badge tone="accent">Conversation</Badge>
          <span className="text-[11px] text-muted-foreground">floating over your study map</span>
        </div>
        <ChatPane context={context} header={false} className="min-h-0 flex-1" />
      </div>

      {/* Subtle hint label out on the open canvas */}
      <div className="pointer-events-none absolute right-5 bottom-5 z-0 hidden items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1.5 text-[11px] text-muted-foreground shadow-soft lg:flex">
        <span className="font-semibold uppercase tracking-[0.1em]">Study map</span>
        <span>· drag to pan</span>
      </div>
    </div>
  );
}
