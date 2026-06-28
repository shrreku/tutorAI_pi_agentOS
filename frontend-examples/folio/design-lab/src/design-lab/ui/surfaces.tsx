import { useState, type ReactNode } from "react";
import {
  AppWindow,
  BookOpen,
  Check,
  FlaskConical,
  Map as MapIcon,
  Play,
  RotateCcw,
  ListChecks,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { Badge, Button, Dot, Meter } from "./primitives.js";
import { GraphCanvas, type GraphEdgeSpec, type GraphNodeSpec } from "./nodes.js";

/* ============================================================================
   Learning surfaces. The tutor opens these into the workspace alongside chat:
   text-based reading, simulation / interactive blocks, MCP apps, and practice.
   One SurfaceViewer hosts them all (plus the study map) with a surface switcher,
   so every workspace layout can render learning content, not just the graph.
   ============================================================================ */

export type SurfaceType = "map" | "reading" | "interactive" | "app" | "practice";

export const SURFACE_META: Record<
  SurfaceType,
  { label: string; icon: typeof MapIcon; kind: string }
> = {
  map: { label: "Study Map", icon: MapIcon, kind: "graph" },
  reading: { label: "Reading", icon: BookOpen, kind: "text" },
  interactive: { label: "Interactive", icon: FlaskConical, kind: "simulation" },
  app: { label: "App", icon: AppWindow, kind: "mcp" },
  practice: { label: "Practice", icon: ListChecks, kind: "quiz" },
};

function SurfaceFrame({
  kind,
  title,
  children,
}: {
  kind: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pb-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          {title}
        </span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
          {kind}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-accent" /> opened by tutor
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  );
}

/* ---- text-based learning surface (worked example / concept) ---- */
export function TextSurface() {
  return (
    <SurfaceFrame kind="text" title="Worked example">
      <h3 className="font-display text-[19px] font-semibold leading-tight">
        Predict the SN2 product
      </h3>
      <p className="mt-2 text-[14px] leading-relaxed text-foreground/85">
        (S)-2-bromobutane reacts with sodium cyanide (NaCN) in DMSO. Give the product and its
        stereochemistry.
      </p>
      <ol className="mt-4 space-y-3">
        {[
          [
            "Identify the mechanism",
            "Primary/secondary substrate + strong nucleophile (CN⁻) in a polar aprotic solvent → SN2.",
          ],
          [
            "Locate the electrophilic carbon",
            "C-2 bears the bromide leaving group; the nucleophile attacks here.",
          ],
          [
            "Apply backside attack",
            "CN⁻ approaches opposite Br⁻ → inversion of configuration at C-2.",
          ],
        ].map(([t, d], i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/12 text-[12px] font-semibold text-accent">
              {i + 1}
            </span>
            <div>
              <div className="text-[13.5px] font-medium">{t}</div>
              <div className="text-[13px] text-muted-foreground">{d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-muted/50 px-3 py-2 font-mono text-[12.5px]">
        rate = k [CN⁻][substrate] &nbsp;·&nbsp; second order
      </div>
      <div className="mt-4 rounded-[var(--radius-md)] border-l-2 border-success bg-success/8 px-3 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-success">
          Answer
        </div>
        <p className="mt-1 text-[13.5px]">
          (R)-2-methylbutanenitrile — configuration inverted from S to R.
        </p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Badge tone="accent">
          <BookOpen className="h-3 w-3" /> Clayden · p. 142
        </Badge>
        <button className="text-[12px] font-medium text-accent hover:underline">
          Open full page →
        </button>
      </div>
    </SurfaceFrame>
  );
}

/* ---- simulation / interactive learning block ---- */
export function SimulationSurface() {
  const [strength, setStrength] = useState(60);
  const [protic, setProtic] = useState(false);
  const rate = Math.max(0.2, (strength / 50) * (protic ? 0.4 : 1.6));
  return (
    <SurfaceFrame kind="simulation" title="SN2 reaction simulator">
      <div className="relative overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface/60">
        <svg viewBox="0 0 320 130" className="w-full">
          {/* substrate carbon */}
          <circle
            cx="170"
            cy="65"
            r="16"
            fill="color-mix(in oklab, var(--primary) 16%, transparent)"
            stroke="var(--primary)"
          />
          <text
            x="170"
            y="69"
            textAnchor="middle"
            fontSize="11"
            fill="var(--foreground)"
            fontFamily="var(--font-mono)"
          >
            C
          </text>
          {/* leaving group */}
          <circle
            cx="240"
            cy="65"
            r="13"
            fill="color-mix(in oklab, var(--destructive) 14%, transparent)"
            stroke="var(--destructive)"
          />
          <text
            x="240"
            y="69"
            textAnchor="middle"
            fontSize="9"
            fill="var(--destructive)"
            fontFamily="var(--font-mono)"
          >
            Br
          </text>
          <line
            x1="186"
            y1="65"
            x2="227"
            y2="65"
            stroke="var(--border)"
            strokeWidth="2"
            strokeDasharray="3 3"
          />
          {/* nucleophile approaching from backside */}
          <circle
            cx={100 - (strength - 50) * 0.3}
            cy="65"
            r="13"
            fill="color-mix(in oklab, var(--accent) 16%, transparent)"
            stroke="var(--accent)"
          />
          <text
            x={100 - (strength - 50) * 0.3}
            y="69"
            textAnchor="middle"
            fontSize="9"
            fill="var(--accent)"
            fontFamily="var(--font-mono)"
          >
            Nu
          </text>
          <path
            d={`M ${118 - (strength - 50) * 0.3} 65 L 152 65`}
            stroke="var(--accent)"
            strokeWidth="2"
            markerEnd="url(#arr)"
          />
          <defs>
            <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)" />
            </marker>
          </defs>
          {/* inversion hint */}
          <path
            d="M 170 45 A 22 22 0 0 1 170 85"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="2 3"
          />
        </svg>
      </div>

      <div className="mt-4 space-y-4">
        <label className="block">
          <div className="flex justify-between text-[12px]">
            <span className="font-medium">Nucleophile strength</span>
            <span className="font-mono text-muted-foreground">{strength}</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="mt-1.5 w-full accent-[var(--accent)]"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium">Solvent</span>
          <div className="inline-flex rounded-full border border-border bg-surface p-0.5 text-[12px]">
            <button
              onClick={() => setProtic(false)}
              className={cn(
                "rounded-full px-2.5 py-1",
                !protic ? "bg-card font-medium shadow-soft" : "text-muted-foreground",
              )}
            >
              Polar aprotic
            </button>
            <button
              onClick={() => setProtic(true)}
              className={cn(
                "rounded-full px-2.5 py-1",
                protic ? "bg-card font-medium shadow-soft" : "text-muted-foreground",
              )}
            >
              Protic
            </button>
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-border bg-card p-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">Relative rate</span>
            <span className="font-mono font-semibold text-accent">{rate.toFixed(1)}×</span>
          </div>
          <Meter className="mt-2" value={Math.min(100, rate * 30)} tone="accent" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="accent">
            <Play className="h-3.5 w-3.5" /> Run
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setStrength(60);
              setProtic(false);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          <span className="ml-auto self-center text-[11px] text-muted-foreground">
            interactive learning block
          </span>
        </div>
      </div>
    </SurfaceFrame>
  );
}

/* ---- MCP app surface (generative UI bundle) ---- */
export function AppSurface() {
  const reagents = ["CH₃Br", "OH⁻", "CN⁻", "I⁻", "H₂O", "(CH₃)₃CBr"];
  const [picked, setPicked] = useState<string[]>(["CH₃Br", "CN⁻"]);
  const toggle = (r: string) =>
    setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r].slice(-2)));
  return (
    <SurfaceFrame kind="mcp app" title="Reaction Builder">
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-card shadow-soft">
        <div className="flex items-center gap-2 border-b border-border bg-surface/70 px-3 py-2">
          <span className="grid h-5 w-5 place-items-center rounded bg-accent/15 text-accent">
            <AppWindow className="h-3 w-3" />
          </span>
          <span className="text-[12px] font-semibold">Reaction Builder</span>
          <Badge tone="accent" className="ml-1">
            MCP app
          </Badge>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            v1 · sandboxed
          </span>
        </div>
        <div className="p-3">
          <div className="text-[11px] font-medium text-muted-foreground">
            Pick two reagents to react
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reagents.map((r) => (
              <button
                key={r}
                onClick={() => toggle(r)}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[12px] transition-colors",
                  picked.includes(r)
                    ? "border-accent bg-accent/12 text-accent"
                    : "border-border hover:bg-muted",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[var(--radius-sm)] bg-muted/50 p-3 text-center">
            <span className="font-mono text-[13px]">{picked[0] ?? "—"}</span>
            <span className="text-muted-foreground">+</span>
            <span className="font-mono text-[13px]">{picked[1] ?? "—"}</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="accent">
              Predict reaction
            </Button>
            <span className="text-[11px] text-muted-foreground">
              generative UI · served via MCP
            </span>
          </div>
        </div>
      </div>
    </SurfaceFrame>
  );
}

/* ---- practice surface (interactive quiz) ---- */
export function PracticeSurface() {
  const options = [
    { id: "a", t: "Tertiary alkyl bromide" },
    { id: "b", t: "Methyl bromide", correct: true },
    { id: "c", t: "Neopentyl bromide" },
    { id: "d", t: "Aryl bromide" },
  ];
  const [sel, setSel] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  return (
    <SurfaceFrame kind="quiz" title="Practice · 1 of 5">
      <div className="text-[14px] font-medium">
        Which substrate reacts fastest under SN2 conditions?
      </div>
      <div className="mt-3 space-y-2">
        {options.map((o) => {
          const state =
            checked && o.correct
              ? "correct"
              : checked && sel === o.id && !o.correct
                ? "wrong"
                : sel === o.id
                  ? "sel"
                  : "idle";
          return (
            <button
              key={o.id}
              onClick={() => !checked && setSel(o.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-[13.5px] transition-colors",
                state === "correct" && "border-success bg-success/10",
                state === "wrong" && "border-destructive bg-destructive/10",
                state === "sel" && "border-accent bg-accent/8",
                state === "idle" && "border-border hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px]",
                  state === "correct" && "border-success bg-success text-white",
                  state === "wrong" && "border-destructive bg-destructive text-white",
                  state === "sel" && "border-accent text-accent",
                  state === "idle" && "border-border text-transparent",
                )}
              >
                {state === "correct" ? (
                  <Check className="h-3 w-3" />
                ) : state === "wrong" ? (
                  <X className="h-3 w-3" />
                ) : (
                  o.id.toUpperCase()
                )}
              </span>
              {o.t}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="accent" disabled={!sel} onClick={() => setChecked(true)}>
          Check answer
        </Button>
        {checked && (
          <span
            className={cn(
              "text-[12px] font-medium",
              sel === "b" ? "text-success" : "text-destructive",
            )}
          >
            {sel === "b"
              ? "Correct — least steric hindrance."
              : "Not quite — sterics favor methyl."}
          </span>
        )}
      </div>
    </SurfaceFrame>
  );
}

function MapSurface({ nodes, edges }: { nodes: GraphNodeSpec[]; edges: GraphEdgeSpec[] }) {
  return (
    <div className="absolute inset-0">
      <GraphCanvas nodes={nodes} edges={edges} height={560} />
    </div>
  );
}

/* ---- the host: surface switcher + active surface ---- */
export function SurfaceViewer({
  nodes,
  edges,
  defaultType = "map",
  types = ["map", "reading", "interactive", "app", "practice"],
  className,
}: {
  nodes: GraphNodeSpec[];
  edges: GraphEdgeSpec[];
  defaultType?: SurfaceType;
  types?: SurfaceType[];
  className?: string;
}) {
  const [active, setActive] = useState<SurfaceType>(defaultType);
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {types.map((t) => {
          const Icon = SURFACE_META[t].icon;
          const on = t === active;
          return (
            <button
              key={t}
              onClick={() => setActive(t)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                on
                  ? "bg-accent/12 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {SURFACE_META[t].label}
            </button>
          );
        })}
        <span className="ml-auto hidden items-center gap-1 pr-1 text-[10px] text-muted-foreground sm:inline-flex">
          <Dot tone="success" /> live
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden pt-2">
        {active === "map" ? (
          <MapSurface nodes={nodes} edges={edges} />
        ) : active === "reading" ? (
          <TextSurface />
        ) : active === "interactive" ? (
          <SimulationSurface />
        ) : active === "app" ? (
          <AppSurface />
        ) : (
          <PracticeSurface />
        )}
      </div>
    </div>
  );
}
