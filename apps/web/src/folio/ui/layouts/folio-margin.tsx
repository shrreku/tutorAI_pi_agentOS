import { ChatPane, WorkspaceHeader } from "../workspace.js";
import { FolioGraphCanvas } from "../folio-nodes.js";
import { SurfaceViewer } from "../surfaces.js";
import type { GraphEdgeSpec, GraphNodeSpec } from "../nodes.js";

const EMPTY_NODES: GraphNodeSpec[] = [];
const EMPTY_EDGES: GraphEdgeSpec[] = [];

export function FolioMarginWorkspace({
  notebook,
  context = "SN2 mechanism",
}: {
  notebook: string;
  context?: string;
}) {
  return (
    <>
      <WorkspaceHeader notebook={notebook} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="mx-auto flex min-h-0 w-full max-w-[680px] flex-1 flex-col px-2 sm:px-6">
            <ChatPane context={context} header={false} className="flex-1" />
          </div>
        </div>

        <aside className="hidden min-h-0 flex-col bg-surface/40 lg:flex">
          <SurfaceViewer
            nodes={EMPTY_NODES}
            edges={EMPTY_EDGES}
            defaultType="map"
            renderMap={<FolioGraphCanvas />}
            className="h-full bg-transparent"
          />
        </aside>
      </div>
    </>
  );
}
