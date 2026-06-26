import { useEffect, useState, type ComponentType } from "react";
import { Segmented } from "./ui/primitives.js";
import * as Atlas from "./directions/atlas.js";
import * as Focus from "./directions/focus.js";
import * as Console from "./directions/console.js";

export type Direction = "atlas" | "focus" | "console";
export type Surface = "dashboard" | "workspace";

const DIRECTIONS: Array<{ value: Direction; label: string; blurb: string }> = [
  {
    value: "focus",
    label: "Focus",
    blurb: "Calm, reading-first. One thing at a time, dock navigation.",
  },
  {
    value: "atlas",
    label: "Atlas",
    blurb: "Spatial. Your learning as a map; the graph is the workspace.",
  },
  {
    value: "console",
    label: "Console",
    blurb: "Dense IDE. Multi-pane, keyboard-driven command center.",
  },
];

const registry: Record<Direction, { Dashboard: ComponentType; Workspace: ComponentType }> = {
  atlas: { Dashboard: Atlas.Dashboard, Workspace: Atlas.Workspace },
  focus: { Dashboard: Focus.Dashboard, Workspace: Focus.Workspace },
  console: { Dashboard: Console.Dashboard, Workspace: Console.Workspace },
};

function readInitial(): { dir: Direction; surface: Surface } {
  const hash = window.location.hash.replace(/^#/, "");
  const [dir, surface] = hash.split("/");
  const validDir = (["atlas", "focus", "console"] as const).includes(dir as Direction)
    ? (dir as Direction)
    : "focus";
  const validSurface = surface === "workspace" ? "workspace" : "dashboard";
  return { dir: validDir, surface: validSurface };
}

export function DesignLab() {
  const initial = readInitial();
  const [dir, setDir] = useState<Direction>(initial.dir);
  const [surface, setSurface] = useState<Surface>(initial.surface);

  useEffect(() => {
    window.location.hash = `${dir}/${surface}`;
  }, [dir, surface]);

  const active = registry[dir];
  const Surface = surface === "dashboard" ? active.Dashboard : active.Workspace;
  const blurb = DIRECTIONS.find((d) => d.value === dir)?.blurb ?? "";

  return (
    <div data-direction="focus" className="min-h-dvh bg-[#0e0f13] text-[#e8eaf0]">
      {/* Lab chrome — neutral tooling bar, deliberately distinct from product chrome */}
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 bg-[#0e0f13]/90 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-[11px] font-bold text-black">
            TB
          </span>
          <span className="text-[13px] font-semibold tracking-tight">Design Lab</span>
        </div>
        <Segmented
          size="sm"
          value={dir}
          onChange={(v) => setDir(v as Direction)}
          options={DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))}
          className="border-white/15 bg-white/5"
        />
        <Segmented
          size="sm"
          value={surface}
          onChange={(v) => setSurface(v as Surface)}
          options={[
            { value: "dashboard", label: "Dashboard" },
            { value: "workspace", label: "Workspace" },
          ]}
          className="border-white/15 bg-white/5"
        />
        <span className="hidden text-[12px] text-white/45 md:inline">{blurb}</span>
        <span className="ml-auto text-[11px] text-white/35">
          live data via /api/v1 · 3 directions
        </span>
      </header>

      {/* Product surface, themed per direction */}
      <div data-direction={dir} className="min-h-[calc(100dvh-49px)] bg-background text-foreground">
        <Surface />
      </div>
    </div>
  );
}
