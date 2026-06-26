import { BookOpen } from "lucide-react";
import { ChatPane, WorkspaceHeader } from "../workspace.js";
import { StudyNode, type GraphEdgeSpec, type GraphNodeSpec } from "../nodes.js";
import { Eyebrow } from "../primitives.js";

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
  // edges aren't drawn in an editorial margin — figures are referenced inline,
  // not connected spatially. Touch it so the signature stays uniform.
  void edges;

  return (
    <>
      <WorkspaceHeader notebook={notebook} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Reading column — wide, centered measure. Chat clearly dominant. */}
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="mx-auto flex min-h-0 w-full max-w-[680px] flex-1 flex-col px-2 sm:px-6">
            <ChatPane context={context} header={false} className="flex-1" />
          </div>
        </div>

        {/* Figures margin rail — narrow list of numbered figure cards. */}
        <aside className="hidden min-h-0 flex-col bg-surface/40 lg:flex">
          <div className="border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Figures</span>
            </div>
            <p className="mt-1 font-display text-[11.5px] italic leading-snug text-muted-foreground">
              Referenced alongside the text.
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            <Eyebrow>Plates</Eyebrow>
            <ol className="space-y-3.5">
              {nodes.map((n, i) => {
                const fig = n.num ?? i + 1;
                return (
                  <li key={n.id} className="space-y-1.5">
                    <span className="block font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Fig. {fig}
                    </span>
                    <StudyNode
                      type={n.type}
                      size={i === 0 ? "s" : "xs"}
                      state={n.state ?? "default"}
                      title={n.title}
                      meta={n.meta}
                      className="w-full"
                    />
                  </li>
                );
              })}
            </ol>

            <p className="border-t border-border pt-4 font-display text-[11.5px] italic leading-relaxed text-muted-foreground">
              The full study map opens on request — figures stay in the margin so the dialogue keeps
              the page.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
