import { useEffect, useState, type ComponentType } from "react";
import { Segmented } from "./ui/primitives.js";
import * as Focus from "./directions/focus.js";
import * as Atlas from "./directions/atlas.js";
import * as Folio from "./directions/folio.js";
import * as Halo from "./directions/halo.js";
import * as Sunrise from "./directions/sunrise.js";

export type Direction = "focus" | "atlas" | "folio" | "halo" | "sunrise";
export type Surface = "dashboard" | "workspace" | "nodepack";

const DIRECTIONS: Array<{ value: Direction; label: string; blurb: string }> = [
  { value: "focus", label: "Focus", blurb: "Clean & minimal. Calm reading, one thing at a time." },
  {
    value: "atlas",
    label: "Atlas",
    blurb: "Spatial. Your learning as a map; the graph is the canvas.",
  },
  { value: "folio", label: "Folio", blurb: "Editorial. Serif prose tutor, numbered figure-nodes." },
  { value: "halo", label: "Halo", blurb: "Modern glassmorphism. Soft indigo, frosted panels." },
  { value: "sunrise", label: "Sunrise", blurb: "Warm & friendly. Coral, rounded, encouraging." },
];

type DirModule = {
  Dashboard: ComponentType;
  Workspace: ComponentType;
  NodePack: ComponentType;
};

const registry: Record<Direction, DirModule> = {
  focus: Focus,
  atlas: Atlas,
  folio: Folio,
  halo: Halo,
  sunrise: Sunrise,
};

const SURFACES: Array<{ value: Surface; label: string }> = [
  { value: "dashboard", label: "Dashboard" },
  { value: "workspace", label: "Workspace" },
  { value: "nodepack", label: "Node Pack" },
];

const DIRS: Direction[] = ["focus", "atlas", "folio", "halo", "sunrise"];

function readInitial(): { dir: Direction; surface: Surface } {
  const hash = window.location.hash.replace(/^#/, "");
  const [dir, surface] = hash.split("/");
  const validDir = DIRS.includes(dir as Direction) ? (dir as Direction) : "focus";
  const validSurface = (["dashboard", "workspace", "nodepack"] as const).includes(
    surface as Surface,
  )
    ? (surface as Surface)
    : "workspace";
  return { dir: validDir, surface: validSurface };
}

export function DesignLab() {
  const initial = readInitial();
  const [dir, setDir] = useState<Direction>(initial.dir);
  const [surface, setSurface] = useState<Surface>(initial.surface);

  useEffect(() => {
    window.location.hash = `${dir}/${surface}`;
  }, [dir, surface]);

  const mod = registry[dir];
  const Surface =
    surface === "dashboard"
      ? mod.Dashboard
      : surface === "workspace"
        ? mod.Workspace
        : mod.NodePack;
  const blurb = DIRECTIONS.find((d) => d.value === dir)?.blurb ?? "";

  return (
    <div data-direction="focus" className="min-h-dvh bg-[#0e0f13] text-[#e8eaf0]">
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
          options={SURFACES}
          className="border-white/15 bg-white/5"
        />
        <span className="hidden text-[12px] text-white/45 lg:inline">{blurb}</span>
        <span className="ml-auto text-[11px] text-white/35">
          chat-first · live /api/v1 · 5 directions
        </span>
      </header>

      <div
        data-direction={dir}
        className="flex min-h-[calc(100dvh-49px)] flex-col bg-background text-foreground"
      >
        <Surface />
      </div>
    </div>
  );
}
