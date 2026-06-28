import { useEffect, useState, type ComponentType } from "react";
import * as Folio from "./directions/folio.js";
import { Segmented } from "./ui/primitives.js";

export type Surface = "dashboard" | "workspace" | "nodepack";

const SURFACES: Array<{ value: Surface; label: string }> = [
  { value: "dashboard", label: "Dashboard" },
  { value: "workspace", label: "Workspace" },
  { value: "nodepack", label: "Node Pack" },
];

const SURFACE_COMPONENTS: Record<Surface, ComponentType> = {
  dashboard: Folio.Dashboard,
  workspace: Folio.Workspace,
  nodepack: Folio.NodePack,
};

function readInitialSurface(): Surface {
  const candidate = window.location.hash.replace(/^#/, "").split("/").at(-1);
  return SURFACES.some(({ value }) => value === candidate) ? (candidate as Surface) : "workspace";
}

export function DesignLab() {
  const [surface, setSurface] = useState<Surface>(readInitialSurface);

  useEffect(() => {
    window.location.hash = `folio/${surface}`;
  }, [surface]);

  const SurfaceComponent = SURFACE_COMPONENTS[surface];

  return (
    <div data-direction="folio" className="min-h-dvh bg-[#0e0f13] text-[#e8eaf0]">
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 bg-[#0e0f13]/90 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-[11px] font-bold text-black">
            TB
          </span>
          <span className="text-[13px] font-semibold tracking-tight">Folio Design Lab</span>
        </div>
        <Segmented
          size="sm"
          value={surface}
          onChange={(value) => setSurface(value as Surface)}
          options={SURFACES}
          className="border-white/15 bg-white/5"
        />
        <span className="hidden text-[12px] text-white/45 lg:inline">
          Editorial ivory · serif prose tutor · numbered figure-nodes
        </span>
        <span className="ml-auto text-[11px] text-white/35">portable sample data</span>
      </header>

      <main className="flex min-h-[calc(100dvh-49px)] flex-col bg-background text-foreground">
        <SurfaceComponent />
      </main>
    </div>
  );
}
