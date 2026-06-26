import { useState } from "react";
import { ChevronUp, Map as MapIcon, Maximize2 } from "lucide-react";
import { cn } from "../../lib/utils.js";
import { ChatPane, WorkspaceHeader } from "../workspace.js";
import { GraphCanvas } from "../nodes.js";
import type { GraphEdgeSpec, GraphNodeSpec } from "../nodes.js";

/* ============================================================================
   SHEET — friendly, app-like (Sunrise). The chat fills the whole workspace and
   stays dominant. The study map lives in a rounded BOTTOM SHEET pinned to the
   bottom edge: collapsed it shows a drag handle + "Study map · peek" bar + a
   thin sliver of the graph; tapping the handle expands it upward to ~55% to
   reveal the full GraphCanvas. Height transition is animated. Mobile-app warmth
   via rounded corners + soft shadow, all themed by tokens.
   ============================================================================ */

export function SheetWorkspace({
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <WorkspaceHeader notebook={notebook} />
      {/* Stage: chat fills everything; sheet floats over the bottom. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Chat — dominant, fills the workspace. Bottom padding leaves room for
            the collapsed sheet so the composer is never hidden behind it. */}
        <ChatPane context={context} header={false} className="absolute inset-0 pb-[88px]" />

        {/* Scrim — only when expanded, so tapping outside collapses the sheet. */}
        <button
          aria-hidden={!open}
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-foreground/20 transition-opacity duration-300",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />

        {/* Bottom sheet */}
        <section
          className={cn(
            "glass absolute inset-x-0 bottom-0 flex flex-col overflow-hidden",
            "rounded-t-[calc(var(--radius)*1.6)] border-x border-t border-border bg-card shadow-pop",
            "transition-[height] duration-300 ease-out",
          )}
          style={{ height: open ? "55%" : "92px" }}
        >
          {/* Grab handle */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="group flex shrink-0 flex-col items-center pt-2.5"
            aria-label={open ? "Collapse study map" : "Expand study map"}
          >
            <span className="h-1.5 w-10 rounded-full bg-border transition-colors group-hover:bg-muted-foreground/50" />
          </button>

          {/* Header bar */}
          <div className="flex shrink-0 items-center gap-2 px-4 py-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/12 text-accent">
              <MapIcon className="h-3.5 w-3.5" />
            </span>
            <span className="font-display text-[13.5px] font-semibold">Study map</span>
            <span className="text-[12px] text-muted-foreground">
              · {open ? `${nodes.length} nodes · ${edges.length} edges` : "peek"}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {open && (
                <button className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen((v) => !v)}
                className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <ChevronUp
                  className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-180")}
                />
              </button>
            </div>
          </div>

          {/* Graph body — a thin sliver peeks when collapsed, full canvas when
              open. The canvas itself is generous; the sheet clips it. */}
          <div className="dot-grid relative min-h-0 flex-1 overflow-hidden border-t border-border">
            <div className="absolute inset-0">
              <GraphCanvas numbered nodes={nodes} edges={edges} height={560} />
            </div>
            {/* Fade hint at the sliver edge when collapsed, inviting a pull-up. */}
            {!open && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
