import type { CSSProperties, ReactNode } from "react";
import { cn } from "../lib/utils.js";
import { Eyebrow } from "./primitives.js";

export type FolioNodeType =
  | "curriculum"
  | "plan"
  | "concept"
  | "objective"
  | "checkpoint"
  | "artifact"
  | "source"
  | "pin";

const FOLIO_TYPE: Record<
  FolioNodeType,
  { label: string; roman: string; ink: string; wash: string }
> = {
  curriculum: { label: "Curriculum", roman: "II", ink: "#8a6b2e", wash: "#f7f0e4" },
  plan: { label: "Learning Path", roman: "I", ink: "#6b5b8a", wash: "#f0edf8" },
  concept: { label: "Concept", roman: "III", ink: "#2f6f4f", wash: "#eef8f3" },
  objective: { label: "Objective", roman: "IV", ink: "#4a6a72", wash: "#eef6f8" },
  pin: { label: "Pin", roman: "IV", ink: "#3d7a82", wash: "#e8f4f6" },
  checkpoint: { label: "Checkpoint", roman: "V", ink: "#2f6f4f", wash: "#eef8f3" },
  artifact: { label: "Artifact", roman: "VI", ink: "#9a7b1f", wash: "#faf4e6" },
  source: { label: "Source", roman: "VII", ink: "#6f6a59", wash: "#f5f2ea" },
};

export type FolioNodeState = "default" | "selected" | "active" | "completed" | "locked";

const SIZE_BOX: Record<"xs" | "s" | "m" | "l" | "xl", string> = {
  xs: "w-[112px] min-h-[44px] p-2",
  s: "w-[148px] min-h-[80px] p-2.5",
  m: "w-[184px] min-h-[112px] p-3",
  l: "w-[200px] min-h-[168px] p-3.5",
  xl: "w-[200px] min-h-[220px] p-4",
};

export function FolioNode({
  type,
  size = "m",
  state = "default",
  title,
  meta,
  roman,
  progress,
  steps,
  claim,
  className,
  style,
}: {
  type: FolioNodeType;
  size?: keyof typeof SIZE_BOX;
  state?: FolioNodeState;
  title: ReactNode;
  meta?: ReactNode;
  roman?: string;
  progress?: number;
  steps?: Array<{ label: string; done?: boolean; active?: boolean }>;
  claim?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const tm = FOLIO_TYPE[type];
  const numeral = roman ?? tm.roman;
  const titleSize =
    size === "xs" ? "text-[12px]" : size === "xl" || size === "l" ? "text-[17px]" : "text-[15px]";

  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border shadow-soft transition-all duration-150",
        SIZE_BOX[size],
        state === "selected"
          ? "border-accent ring-2 ring-accent/25"
          : state === "active"
            ? "border-accent/60"
            : "border-border/80",
        state === "locked" && "opacity-50",
        className,
      )}
      style={{ background: tm.wash, ...style }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[13px] font-semibold tabular-nums" style={{ color: tm.ink }}>
          {numeral}.
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: tm.ink }}>
          {tm.label}
        </span>
        {state === "completed" && <span className="ml-auto text-[11px] font-medium text-success">✓</span>}
        {state === "locked" && <span className="ml-auto text-[11px] text-muted-foreground">🔒</span>}
        {state === "active" && (
          <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        )}
      </div>
      <div className={cn("mt-1.5 font-display font-semibold leading-snug", titleSize)}>{title}</div>
      {progress != null && (
        <div className="mt-2.5">
          {meta && (
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {meta}
            </div>
          )}
          <div className="h-1.5 overflow-hidden rounded-full bg-black/8">
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {steps && (
        <ul className="mt-2.5 space-y-1 font-display text-[12.5px] leading-snug">
          {steps.map((s) => (
            <li
              key={s.label}
              className={cn(
                s.done && "text-muted-foreground line-through",
                s.active && "font-semibold text-foreground",
                !s.done && !s.active && "text-muted-foreground",
              )}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {claim && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-success">
          <span className="grid h-4 w-4 place-items-center rounded-full border border-success/40 bg-success/10 text-[9px]">
            ✓
          </span>
          {claim}
        </div>
      )}
      {meta && progress == null && !steps && (
        <div className="mt-1.5 text-[11px] text-muted-foreground">{meta}</div>
      )}
    </div>
  );
}

function FolioCanvas({ children, height = 380 }: { children: ReactNode; height?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius)] border border-border"
      style={{
        height,
        backgroundImage: `repeating-linear-gradient(-32deg, transparent, transparent 14px, color-mix(in oklab, var(--destructive) 6%, transparent) 14px, color-mix(in oklab, var(--destructive) 6%, transparent) 15px)`,
        backgroundColor: "color-mix(in oklab, var(--surface) 70%, white)",
      }}
    >
      <svg className="absolute inset-0 h-full w-full opacity-90" style={{ pointerEvents: "none" }}>
        <path d="M 120 95 C 200 95, 200 55, 280 55" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d="M 95 200 C 160 200, 200 120, 280 120" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 5" />
        <path d="M 320 140 L 480 95" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d="M 120 280 L 280 250" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="4 4" />
      </svg>
      {children}
    </div>
  );
}

export type FolioGraphNodeSpec = {
  id: string;
  x: number;
  y: number;
  type: FolioNodeType;
  size?: keyof typeof SIZE_BOX;
  state?: FolioNodeState;
  title: string;
  meta?: string;
  progress?: number;
  steps?: Array<{ label: string; done?: boolean; active?: boolean }>;
  claim?: string;
};

export const FOLIO_WORKSPACE_NODES: FolioGraphNodeSpec[] = [
  {
    id: "c",
    x: 8,
    y: 12,
    type: "curriculum",
    size: "l",
    title: "Substitution Reactions",
    meta: "Completed: 3 of 8 modules",
    progress: 38,
  },
  {
    id: "s",
    x: 42,
    y: 8,
    type: "concept",
    size: "m",
    state: "selected",
    title: "SN2 Reaction",
    claim: "Verified claim",
  },
  {
    id: "p",
    x: 14,
    y: 48,
    type: "plan",
    size: "xl",
    title: "Substitution Steps",
    steps: [
      { label: "Step 1: Proton transfer (Done)", done: true },
      { label: "Step 2: Backside attack", active: true },
      { label: "Step 3: Product isolation" },
    ],
  },
  { id: "pin", x: 48, y: 52, type: "pin", size: "m", title: "Transition State" },
  { id: "o", x: 62, y: 58, type: "objective", size: "s", title: "SN2 Inversion", state: "active" },
];

export function FolioGraphCanvas({
  nodes = FOLIO_WORKSPACE_NODES,
  height = 560,
}: {
  nodes?: FolioGraphNodeSpec[];
  height?: number;
}) {
  return (
    <div className="absolute inset-0">
      <FolioCanvas height={height}>
        {nodes.map((n) => (
          <div key={n.id} className="absolute" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
            <FolioNode
              type={n.type}
              size={n.size ?? "m"}
              state={n.state ?? "default"}
              title={n.title}
              {...(n.meta != null ? { meta: n.meta } : {})}
              {...(n.progress != null ? { progress: n.progress } : {})}
              {...(n.steps != null ? { steps: n.steps } : {})}
              {...(n.claim != null ? { claim: n.claim } : {})}
            />
          </div>
        ))}
      </FolioCanvas>
    </div>
  );
}

export function FolioNodePack() {
  const sizes = ["xl", "l", "m", "s", "xs"] as const;
  const types: FolioNodeType[] = ["plan", "curriculum", "concept", "objective", "checkpoint", "artifact", "source", "pin"];
  const states: FolioNodeState[] = ["default", "selected", "active", "completed", "locked"];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">Folio node pack</h1>
      <p className="mt-2 max-w-2xl font-display text-[15px] italic leading-relaxed text-muted-foreground">
        Editorial ivory nodes — Roman figure labels, serif titles, tinted type washes.
      </p>

      <section className="mt-8">
        <Eyebrow>Scale ramp</Eyebrow>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          {sizes.map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <FolioNode type="concept" size={s} title="SN2 Reaction" meta={s === "xs" ? undefined : "Ch. 7"} />
              <span className="font-mono text-[10px] uppercase text-muted-foreground">{s}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <Eyebrow>Node types</Eyebrow>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <FolioNode
            type="plan"
            size="l"
            title="Substitution Steps"
            steps={[
              { label: "Step 1: Proton transfer (Done)", done: true },
              { label: "Step 2: Backside attack", active: true },
              { label: "Step 3: Product isolation" },
            ]}
          />
          <FolioNode type="curriculum" size="l" title="Substitution Reactions" meta="Completed: 3 of 8 modules" progress={38} />
          <FolioNode type="concept" size="m" title="SN2 Reaction" claim="Verified claim" />
          <FolioNode type="pin" size="m" title="Transition State" />
          <FolioNode type="objective" size="s" title="SN2 Inversion" />
          <FolioNode type="checkpoint" size="m" title="SN2 rate quiz" meta="5 questions" />
          <FolioNode type="artifact" size="s" title="Ch. 7 flashcards" meta="12 cards" />
          <FolioNode type="source" size="s" title="Clayden · Ch. 7" meta="p. 142" />
        </div>
      </section>

      <section className="mt-10">
        <Eyebrow>Type reference</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {types.map((t) => (
            <FolioNode key={t} type={t} size="s" title={FOLIO_TYPE[t].label} meta="Editorial wash" />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <Eyebrow>States</Eyebrow>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {states.map((st) => (
            <div key={st} className="flex flex-col items-center gap-2">
              <FolioNode type="concept" size="s" state={st} title="Backside attack" />
              <span className="font-mono text-[10px] uppercase text-muted-foreground">{st}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <Eyebrow>Sample canvas</Eyebrow>
        <FolioCanvas height={400}>
          <div className="absolute left-[8%] top-[12%]">
            <FolioNode type="curriculum" size="l" title="Substitution Reactions" meta="Completed: 3 of 8 modules" progress={38} />
          </div>
          <div className="absolute left-[42%] top-[8%]">
            <FolioNode type="concept" size="m" state="selected" title="SN2 Reaction" claim="Verified claim" />
          </div>
          <div className="absolute left-[14%] top-[48%]">
            <FolioNode
              type="plan"
              size="xl"
              title="Substitution Steps"
              steps={[
                { label: "Step 1: Proton transfer (Done)", done: true },
                { label: "Step 2: Backside attack", active: true },
                { label: "Step 3: Product isolation" },
              ]}
            />
          </div>
          <div className="absolute left-[48%] top-[52%]">
            <FolioNode type="pin" size="m" title="Transition State" />
          </div>
          <div className="absolute left-[62%] top-[58%]">
            <FolioNode type="objective" size="s" title="SN2 Inversion" state="active" />
          </div>
        </FolioCanvas>
      </section>
    </div>
  );
}
