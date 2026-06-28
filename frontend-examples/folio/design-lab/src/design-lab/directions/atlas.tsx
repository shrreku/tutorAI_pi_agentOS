import { Compass, MapPin, Navigation, Flag, Mountain, Layers } from "lucide-react";
import { Badge, Button, Eyebrow, Meter } from "../ui/primitives.js";
import { CanvasWorkspace } from "../ui/layouts/canvas.js";
import { NodePack as NodePackShowcase } from "../ui/nodes.js";
import {
  sampleMastery,
  sampleNotebooks,
  samplePlan,
  useCredits,
  useMe,
  useNotebooks,
} from "../lib/data.js";

const MAP_NODES = [
  {
    id: "c",
    x: 28,
    y: 34,
    type: "curriculum" as const,
    size: "l" as const,
    title: "Ch. 7 · Substitution",
    meta: "3 of 8 modules",
    progress: 38,
  },
  {
    id: "p",
    x: 44,
    y: 220,
    type: "plan" as const,
    size: "m" as const,
    title: "Substitution plan",
    meta: "Obj 2 of 3",
  },
  {
    id: "s",
    x: 252,
    y: 60,
    type: "concept" as const,
    size: "m" as const,
    state: "selected" as const,
    title: "SN2 mechanism",
    meta: "needs practice",
  },
  {
    id: "o",
    x: 270,
    y: 224,
    type: "objective" as const,
    size: "s" as const,
    state: "active" as const,
    title: "Backside attack",
  },
];
const MAP_EDGES = [
  { from: [120, 76] as [number, number], to: [252, 94] as [number, number] },
  { from: [302, 108] as [number, number], to: [302, 224] as [number, number], active: true },
  { from: [112, 250] as [number, number], to: [270, 248] as [number, number] },
];

export function Workspace() {
  const nb = useNotebooks();
  const notebook = nb.data?.[0]?.title ?? sampleNotebooks[0]!.title;
  return <CanvasWorkspace notebook={notebook} nodes={MAP_NODES} edges={MAP_EDGES} />;
}

export function NodePack() {
  return <NodePackShowcase directionLabel="Atlas" numbered={false} />;
}

/* ---- Dashboard: "Map of your learning" — spatial / cartographic ---- */

type Territory = {
  id: string;
  title: string;
  prog: number;
  x: number;
  y: number;
  region: string;
  here?: boolean;
};

const TERRITORY_PLOTS: Omit<Territory, "title">[] = [
  { id: "t0", prog: 60, x: 5, y: 14, region: "Reactions", here: true },
  { id: "t1", prog: 32, x: 50, y: 7, region: "Algebra" },
  { id: "t2", prog: 88, x: 60, y: 55, region: "Biology" },
];

// dotted travel route threaded between the territories (percent coords)
const ROUTE = "M 16% 32% C 38% 18%, 50% 22%, 62% 26% S 80% 58%, 71% 72%";

const REGIONS = [
  { id: "r1", label: "Reactions", icon: Mountain, count: 4, active: true },
  { id: "r2", label: "Algebra", icon: Layers, count: 2 },
  { id: "r3", label: "Biology", icon: Layers, count: 5 },
  { id: "r4", label: "Unexplored", icon: Compass, count: 9, muted: true },
];

export function Dashboard() {
  const me = useMe();
  const nb = useNotebooks();
  const credits = useCredits();
  const notebooks = nb.data && nb.data.length ? nb.data : sampleNotebooks;
  const usingSample = !nb.data || nb.data.length === 0;
  const name = me.data?.user?.displayName?.split(" ")[0] ?? "Explorer";

  const territories: Territory[] = TERRITORY_PLOTS.map((t, i) => ({
    ...t,
    title: notebooks[i]?.title ?? sampleNotebooks[i % sampleNotebooks.length]!.title,
  }));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col px-5 pb-12 pt-7">
      {/* Heading bar */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <Compass className="h-3.5 w-3.5 text-accent" /> Map of your learning
            {usingSample && <Badge tone="outline">sample</Badge>}
          </div>
          <h1 className="mt-2 font-display text-[34px] font-semibold leading-none tracking-[-0.02em]">
            {name}&apos;s atlas
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="accent">
            <Navigation className="h-3 w-3" /> 3 territories charted
          </Badge>
          <Button size="sm" variant="primary">
            Resume route
          </Button>
        </div>
      </div>

      {/* Three-zone spatial layout: regions rail · atlas canvas · today's route */}
      <div className="mt-4 grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[180px_minmax(0,1fr)_240px]">
        {/* Left: slim regions rail */}
        <aside className="flex flex-col gap-3">
          <Eyebrow>Regions</Eyebrow>
          <nav className="flex flex-col gap-1.5">
            {REGIONS.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.id}
                  className={
                    "group flex items-center gap-2.5 rounded-[var(--radius)] border px-3 py-2.5 text-left transition-colors " +
                    (r.active
                      ? "border-accent bg-accent/8"
                      : "border-border bg-card hover:border-accent/50")
                  }
                >
                  <span
                    className={
                      "grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] " +
                      (r.active
                        ? "bg-accent text-accent-foreground"
                        : r.muted
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{r.label}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {r.count} nodes
                    </span>
                  </span>
                  {r.active && <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" />}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-[var(--radius)] border border-border bg-card p-3 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Tutor credits
              </span>
              <Badge tone="accent">{Math.round(credits.data?.percentRemaining ?? 71)}%</Badge>
            </div>
            <Meter className="mt-2" value={credits.data?.percentRemaining ?? 71} tone="accent" />
          </div>
        </aside>

        {/* Center: big atlas-grid canvas with plotted territories + route + you-are-here */}
        <section className="relative min-h-[460px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-soft">
          <div className="atlas-grid absolute inset-0" />
          {/* compass rose */}
          <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-2.5 py-1 backdrop-blur-sm">
            <Compass className="h-3.5 w-3.5 text-accent" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              N · Organic Chemistry I
            </span>
          </div>

          {/* dotted travel route between territories */}
          <svg
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            style={{ pointerEvents: "none" }}
          >
            <path
              d={ROUTE}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="2 8"
              strokeLinecap="round"
              opacity={0.7}
            />
          </svg>

          {/* territory cards, absolutely positioned across the map */}
          {territories.map((t) => (
            <div
              key={t.id}
              className="absolute z-[1] w-[200px]"
              style={{ left: `${t.x}%`, top: `${t.y}%` }}
            >
              {t.here && (
                <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground shadow-pop">
                  <MapPin className="h-3 w-3" /> You are here
                </div>
              )}
              <button
                className={
                  "group block w-full rounded-[var(--radius)] border bg-card p-3 text-left shadow-soft transition-all hover:shadow-pop " +
                  (t.here
                    ? "border-accent ring-2 ring-accent/25"
                    : "border-border hover:-translate-y-0.5")
                }
              >
                <div className="flex items-center gap-1.5">
                  <Flag
                    className={
                      "h-3 w-3 " +
                      (t.prog >= 75
                        ? "text-success"
                        : t.prog < 50
                          ? "text-warning"
                          : "text-primary")
                    }
                  />
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                    {t.region}
                  </span>
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                    {t.prog}%
                  </span>
                </div>
                <div className="mt-1 font-display text-[15px] font-semibold leading-tight group-hover:text-accent">
                  {t.title}
                </div>
                <Meter
                  className="mt-2"
                  value={t.prog}
                  thickness="sm"
                  tone={t.prog >= 75 ? "success" : t.prog < 50 ? "warning" : "primary"}
                />
              </button>
            </div>
          ))}

          {/* destination flag — next, locked */}
          <div className="absolute bottom-5 right-8 z-[1] flex items-center gap-2 rounded-[var(--radius)] border border-dashed border-accent/60 bg-card/70 px-3 py-2 backdrop-blur-sm">
            <Flag className="h-4 w-4 text-accent" />
            <div className="leading-tight">
              <div className="text-[12px] font-semibold">Ch. 8 · Elimination</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                next destination · locked
              </div>
            </div>
          </div>
        </section>

        {/* Right: today's route timeline */}
        <aside className="flex flex-col gap-3">
          <Eyebrow>Today&apos;s route</Eyebrow>
          <ol className="relative flex-1 space-y-1 border-l border-border pl-4">
            {samplePlan.map((p) => (
              <li key={p.id} className="relative py-1.5">
                <span
                  className={
                    "absolute -left-[21px] top-2.5 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-background " +
                    (p.status === "done"
                      ? "bg-success"
                      : p.status === "active"
                        ? "bg-accent"
                        : "bg-muted-foreground/40")
                  }
                />
                <div
                  className={
                    "flex items-baseline justify-between gap-2 " +
                    (p.status === "done" ? "text-muted-foreground line-through" : "")
                  }
                >
                  <span className="font-display text-[13.5px] leading-snug">{p.label}</span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {p.minutes} min leg
                </span>
              </li>
            ))}
          </ol>

          <div className="rounded-[var(--radius)] border border-border bg-card p-3 shadow-soft">
            <Eyebrow>Terrain to retread</Eyebrow>
            <ul className="mt-2 space-y-2">
              {sampleMastery.slice(0, 3).map((m) => (
                <li key={m.concept}>
                  <div className="flex items-baseline justify-between text-[12.5px]">
                    <span className={m.review ? "text-destructive" : ""}>{m.concept}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{m.value}%</span>
                  </div>
                  <Meter
                    className="mt-1"
                    value={m.value}
                    thickness="sm"
                    tone={m.review ? "danger" : "success"}
                  />
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
