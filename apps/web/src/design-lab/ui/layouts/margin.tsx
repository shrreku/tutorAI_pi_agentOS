import { ChatPane, WorkspaceHeader } from "../workspace.js";
import type { GraphEdgeSpec, GraphNodeSpec } from "../nodes.js";
import { SurfaceViewer } from "../surfaces.js";

/* ============================================================================
   MARGIN (editorial) — no graph pane. The chat is a wide, centered READING
   column with a generous measure, so the conversation reads like a printed
   dialogue/document. The map nodes live in a narrow right-hand "Figures" rail
   as small numbered figure cards (Fig. 1, Fig. 2 …) — referenceable alongside
   the prose, never a spatial canvas. Calm, lots of whitespace, chat dominant.
   ============================================================================ */

export function MarginWorkspace({
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
    <>
      <WorkspaceHeader notebook={notebook} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Reading column — wide, centered measure. Chat clearly dominant. */}
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="mx-auto flex min-h-0 w-full max-w-[680px] flex-1 flex-col px-2 sm:px-6">
            <ChatPane context={context} header={false} className="flex-1" />
          </div>
        </div>

        {/* Learning surface — reading-first; switch to interactive / app / practice / map. */}
        <aside className="hidden min-h-0 flex-col bg-surface/40 lg:flex">
          <SurfaceViewer
            nodes={nodes}
            edges={edges}
            defaultType="reading"
            className="h-full bg-transparent"
          />
        </aside>
      </div>
    </>
  );
}
