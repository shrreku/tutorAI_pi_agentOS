import { useState } from "react";
import {
  Compass,
  Crosshair,
  Layers,
  Locate,
  Plus,
  Search,
  Shield,
  Sparkles,
  Maximize2,
  X,
} from "lucide-react";
import { Badge, Button, Dot, Eyebrow, Meter, Ring } from "../ui/primitives.js";
import { cn } from "../lib/utils.js";
import {
  sampleMastery,
  sampleNotebooks,
  samplePlan,
  useCredits,
  useNotebooks,
} from "../lib/data.js";

/* Notebooks plotted as territories on a map. */
const PLOTS = [
  { x: 30, y: 26, w: 230, mastery: 60, region: "CHEMISTRY", here: true },
  { x: 360, y: 60, w: 210, mastery: 32, region: "MATHEMATICS", here: false },
  { x: 175, y: 250, w: 220, mastery: 88, region: "BIOLOGY", here: false },
  { x: 470, y: 300, w: 200, mastery: 12, region: "PHYSICS", here: false },
  { x: 650, y: 150, w: 190, mastery: 45, region: "ECONOMICS", here: false },
];

export function Dashboard() {
  const nb = useNotebooks();
  const credits = useCredits();
  const notebooks = nb.data && nb.data.length ? nb.data : sampleNotebooks;
  const usingSample = !nb.data || nb.data.length === 0;

  return (
    <div className="flex h-[calc(100dvh-49px)]">
      {/* Left command rail */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface/70 px-4 py-5 lg:flex">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Compass className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[13px] font-semibold leading-tight">Atlas</div>
            <div className="text-[11px] text-muted-foreground">your learning map</div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            placeholder="Search the atlas…"
          />
        </div>

        <Eyebrow className="mt-6">Regions</Eyebrow>
        <ul className="mt-2 space-y-0.5">
          {notebooks.slice(0, 5).map((n, i) => (
            <li key={n.id}>
              <button className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{
                    background: ["#0c6b62", "#e0533d", "#0c8a6a", "#c08436", "#5a6b78"][i % 5]!,
                  }}
                />
                <span className="flex-1 truncate text-[13px]">{n.title}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {PLOTS[i % PLOTS.length]!.mastery}%
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-auto rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-[12px] font-medium">
            <Sparkles className="h-3.5 w-3.5 text-accent" /> Tutor credits
          </div>
          <Meter className="mt-2" value={credits.data?.percentRemaining ?? 71} tone="accent" />
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            {Math.round(credits.data?.percentRemaining ?? 71)}% remaining
          </div>
        </div>
      </aside>

      {/* The map */}
      <main className="relative flex-1 overflow-hidden atlas-grid">
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-5 py-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">Map of your learning</h1>
            <p className="text-[13px] text-muted-foreground">
              Every notebook is a territory. Follow the route to your next waypoint.
            </p>
          </div>
          {usingSample && (
            <Badge tone="outline" className="mt-1">
              sample data
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline">
              <Locate className="h-4 w-4" /> Recenter
            </Button>
            <Button size="sm" variant="primary">
              <Plus className="h-4 w-4" /> New notebook
            </Button>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 top-28">
          {/* route line */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            <path
              d="M 145 110 C 320 140, 300 180, 470 150 S 560 330, 285 335"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray="2 7"
              strokeLinecap="round"
              opacity="0.7"
            />
          </svg>

          <div className="absolute inset-0">
            {notebooks.slice(0, 5).map((n, i) => {
              const plot = PLOTS[i % PLOTS.length]!;
              return (
                <button
                  key={n.id}
                  className={cn(
                    "group absolute rounded-xl border bg-card p-4 text-left shadow-soft transition-transform hover:-translate-y-0.5 hover:shadow-pop",
                    plot.here ? "border-accent ring-2 ring-accent/25" : "border-border",
                  )}
                  style={{ left: plot.x, top: plot.y, width: plot.w }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {plot.region}
                    </span>
                    {plot.here && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent">
                        <Dot tone="accent" pulse /> you are here
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[16px] font-semibold leading-tight">{n.title}</div>
                  <div className="mt-3 flex items-center gap-2">
                    <Meter value={plot.mastery} tone={plot.mastery < 40 ? "warning" : "primary"} />
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {plot.mastery}%
                    </span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    <Crosshair className="h-3.5 w-3.5" /> Travel here
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* map controls */}
        <div className="absolute bottom-5 left-5 flex flex-col rounded-lg border border-border bg-card shadow-soft">
          {["+", "−"].map((s) => (
            <button key={s} className="h-9 w-9 text-[16px] text-muted-foreground hover:bg-muted">
              {s}
            </button>
          ))}
          <button className="grid h-9 w-9 place-items-center text-muted-foreground hover:bg-muted">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </main>

      {/* Right: today's route */}
      <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-surface/70 px-4 py-5 xl:flex">
        <div className="flex items-center justify-between">
          <Eyebrow>Today&apos;s route</Eyebrow>
          <Ring
            value={60}
            size={40}
            label={<span className="text-[10px] font-semibold">60%</span>}
          />
        </div>
        <ol className="mt-4 space-y-3">
          {samplePlan.map((p, i) => (
            <li key={p.id} className="relative pl-6">
              {i < samplePlan.length - 1 && (
                <span className="absolute left-[9px] top-5 h-full w-px bg-border" />
              )}
              <span
                className={cn(
                  "absolute left-0 top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border text-[9px]",
                  p.status === "done"
                    ? "border-success bg-success text-white"
                    : p.status === "active"
                      ? "border-accent text-accent"
                      : "border-border text-muted-foreground",
                )}
              >
                {p.status === "done" ? "✓" : i + 1}
              </span>
              <div
                className={cn("text-[13px]", p.status === "active" && "font-medium text-accent")}
              >
                {p.label}
              </div>
              <div className="text-[11px] text-muted-foreground">{p.minutes} min</div>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <Eyebrow>Needs review</Eyebrow>
          {sampleMastery
            .filter((m) => m.review)
            .map((m) => (
              <div
                key={m.concept}
                className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              >
                <div className="text-[13px] font-medium text-destructive">{m.concept}</div>
                <Meter className="mt-2" value={m.value} tone="danger" />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {m.value}% · last seen 2d ago
                </div>
              </div>
            ))}
        </div>
      </aside>
    </div>
  );
}

const GRAPH_NODES = [
  {
    id: "curr",
    x: 80,
    y: 90,
    w: 190,
    kind: "Curriculum",
    title: "Ch. 7 · Substitution",
    tone: "primary" as const,
  },
  {
    id: "plan",
    x: 90,
    y: 280,
    w: 190,
    kind: "Live Plan",
    title: "Substitution path",
    tone: "primary" as const,
  },
  {
    id: "sn2",
    x: 380,
    y: 120,
    w: 180,
    kind: "Concept",
    title: "SN2 mechanism",
    tone: "accent" as const,
    here: true,
  },
  {
    id: "inv",
    x: 400,
    y: 300,
    w: 170,
    kind: "Objective",
    title: "Backside inversion",
    tone: "primary" as const,
  },
  {
    id: "rate",
    x: 650,
    y: 150,
    w: 150,
    kind: "Checkpoint",
    title: "SN2 rate",
    tone: "primary" as const,
  },
];

export function Workspace() {
  const nb = useNotebooks();
  const notebook = nb.data?.[0] ?? sampleNotebooks[0]!;
  const [evidence, setEvidence] = useState(false);

  return (
    <div className="relative h-[calc(100dvh-49px)] overflow-hidden">
      {/* full-bleed map */}
      <div className="absolute inset-0 atlas-grid">
        <svg className="absolute inset-0 h-full w-full">
          <path
            d="M 200 130 C 320 130 300 150 380 160"
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
          />
          <path
            d="M 470 165 C 470 230 470 250 480 300"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeDasharray="5 5"
          />
          <path
            d="M 200 305 C 320 305 320 330 400 325"
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
          />
          <path
            d="M 560 145 C 610 150 620 150 650 165"
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
          />
        </svg>
        {GRAPH_NODES.map((n) => (
          <button
            key={n.id}
            className={cn(
              "absolute rounded-xl border bg-card p-3 text-left shadow-soft transition-transform hover:-translate-y-0.5",
              "here" in n && n.here ? "border-accent ring-2 ring-accent/25" : "border-border",
            )}
            style={{ left: n.x, top: n.y, width: n.w }}
          >
            <div
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.1em]",
                n.tone === "accent" ? "text-accent" : "text-muted-foreground",
              )}
            >
              {n.kind}
            </div>
            <div className="mt-0.5 text-[14px] font-semibold leading-tight">{n.title}</div>
          </button>
        ))}
      </div>

      {/* slim left intent rail */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <div className="rounded-lg border border-border bg-card/90 px-3 py-2 shadow-soft backdrop-blur">
          <div className="text-[13px] font-semibold">{notebook.title}</div>
          <div className="text-[11px] text-muted-foreground">24 nodes · 31 edges</div>
        </div>
        {[
          ["Study Map", Compass],
          ["Layers", Layers],
          ["Locate", Locate],
        ].map(([label, Icon]) => {
          const I = Icon as typeof Compass;
          return (
            <button
              key={label as string}
              className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card/90 text-muted-foreground shadow-soft backdrop-blur hover:text-foreground"
              title={label as string}
            >
              <I className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* evidence toggle */}
      <button
        onClick={() => setEvidence((v) => !v)}
        className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2 text-[13px] font-medium shadow-soft backdrop-blur hover:bg-muted"
      >
        <Shield className="h-4 w-4 text-accent" /> Evidence
      </button>

      {/* floating tutor dock */}
      <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center px-4">
        <div className="w-full max-w-2xl rounded-2xl border border-border bg-elevated/90 p-2 shadow-pop backdrop-blur">
          <div className="flex items-start gap-3 px-3 pb-2 pt-2">
            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent">
              <Dot tone="accent" pulse /> Tutor
            </span>
            <p className="flex-1 text-[13px] leading-relaxed text-foreground/90">
              You&apos;re on <strong>SN2 mechanism</strong>. The backside attack inverts
              configuration — want the rate law or a quick check?
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <input
              className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
              placeholder="Ask about this node…"
            />
            <Button size="sm" variant="accent">
              Ask
            </Button>
          </div>
        </div>
      </div>

      {/* evidence slide-over */}
      {evidence && (
        <>
          <div className="absolute inset-0 z-30 bg-black/20" onClick={() => setEvidence(false)} />
          <aside className="absolute right-0 top-0 z-40 flex h-full w-[380px] flex-col border-l border-border bg-card shadow-pop">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Shield className="h-4 w-4 text-accent" />
              <span className="text-[14px] font-semibold">Evidence</span>
              <button
                className="ml-auto grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
                onClick={() => setEvidence(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {[
                [
                  "Clayden Organic Chemistry",
                  "PDF · p. 142",
                  "…the nucleophile attacks from the side opposite the leaving group, causing a concerted inversion of configuration.",
                ],
                [
                  "Lecture · Substitution kinetics",
                  "Slide 14",
                  "SN2 rate depends bimolecularly on both species; doubling either doubles the observed rate.",
                ],
              ].map(([t, m, q]) => (
                <div key={t} className="rounded-lg border border-border p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                    {m}
                  </div>
                  <div className="mt-0.5 text-[14px] font-semibold">{t}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{q}</p>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
