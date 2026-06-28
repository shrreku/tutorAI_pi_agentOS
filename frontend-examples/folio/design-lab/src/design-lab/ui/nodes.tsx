import type { CSSProperties, ReactNode } from "react";
import { cn } from "../lib/utils.js";
import { Badge, Eyebrow, Meter } from "./primitives.js";

/* ============================================================================
   Study-map node system. One component, themed by tokens, so every direction
   gets a distinct node look (radius, serif vs sans, color) for free. Used by
   the workspace map, the dashboards, and the Node Pack showcase.
   ============================================================================ */

export type NodeType =
  | "curriculum"
  | "concept"
  | "objective"
  | "plan"
  | "checkpoint"
  | "artifact"
  | "source";
export type NodeSize = "xs" | "s" | "m" | "l" | "xl";
export type NodeState = "default" | "active" | "selected" | "mastered" | "review" | "locked";

export const NODE_TYPE_META: Record<NodeType, { label: string; color: string }> = {
  curriculum: { label: "Curriculum", color: "var(--warning)" },
  plan: { label: "Live Plan", color: "var(--primary)" },
  concept: { label: "Concept", color: "var(--accent)" },
  objective: { label: "Objective", color: "var(--muted-foreground)" },
  checkpoint: { label: "Checkpoint", color: "var(--success)" },
  artifact: { label: "Artifact", color: "var(--accent)" },
  source: { label: "Source", color: "var(--muted-foreground)" },
};

const SIZE_CLASS: Record<NodeSize, string> = {
  xs: "w-28 p-2",
  s: "w-40 p-2.5",
  m: "w-52 p-3",
  l: "w-60 p-3.5",
  xl: "w-72 p-4",
};

export function StudyNode({
  type,
  size = "m",
  state = "default",
  title,
  meta,
  num,
  progress,
  pills,
  numbered = false,
  className,
  style,
}: {
  type: NodeType;
  size?: NodeSize;
  state?: NodeState;
  title: ReactNode;
  meta?: ReactNode | undefined;
  num?: number | undefined;
  progress?: number | undefined;
  pills?: ReactNode | undefined;
  numbered?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const tm = NODE_TYPE_META[type];
  const titleSize =
    size === "xs" ? "text-[12px]" : size === "xl" || size === "l" ? "text-[15px]" : "text-[13.5px]";
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border bg-card text-card-foreground transition-all duration-150",
        SIZE_CLASS[size],
        state === "selected"
          ? "border-[var(--ring)] shadow-pop ring-2 ring-[color-mix(in_oklab,var(--ring)_28%,transparent)]"
          : state === "active"
            ? "border-[var(--accent)] shadow-soft"
            : "border-border shadow-soft",
        state === "locked" && "opacity-55",
        className,
      )}
      style={{ borderLeft: `3px solid ${tm.color}`, ...style }}
    >
      <div className="flex items-center gap-1.5">
        {numbered && num != null && (
          <span
            className="font-display text-[12px] font-semibold tabular-nums"
            style={{ color: tm.color }}
          >
            {String(num).padStart(2, "0")}.
          </span>
        )}
        <span
          className="text-[9.5px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: tm.color }}
        >
          {tm.label}
        </span>
        {state === "active" && (
          <span className="ml-auto inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        )}
        {state === "mastered" && <span className="ml-auto text-[11px] text-success">✓</span>}
        {state === "locked" && (
          <span className="ml-auto text-[11px] text-muted-foreground">🔒</span>
        )}
      </div>
      <div className={cn("mt-1 font-display font-semibold leading-tight", titleSize)}>{title}</div>
      {progress != null && <Meter className="mt-2" value={progress} thickness="sm" />}
      {meta && <div className="mt-1.5 text-[11px] text-muted-foreground">{meta}</div>}
      {pills && <div className="mt-2 flex flex-wrap gap-1">{pills}</div>}
    </div>
  );
}

/* ---- positioned graph canvas (mini-map / workspace secondary / dashboards) ---- */
export type GraphNodeSpec = {
  id: string;
  x: number;
  y: number;
  type: NodeType;
  size?: NodeSize;
  state?: NodeState;
  title: string;
  meta?: string;
  num?: number;
  progress?: number;
};
export type GraphEdgeSpec = { from: [number, number]; to: [number, number]; active?: boolean };

export function GraphCanvas({
  nodes,
  edges,
  numbered = false,
  className,
  height = 460,
}: {
  nodes: GraphNodeSpec[];
  edges: GraphEdgeSpec[];
  numbered?: boolean;
  className?: string;
  height?: number;
}) {
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ height }}>
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
        {edges.map((e, i) => {
          const [x1, y1] = e.from;
          const [x2, y2] = e.to;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={e.active ? "var(--accent)" : "var(--border)"}
              strokeWidth={e.active ? 2.5 : 1.75}
              strokeDasharray={e.active ? "5 5" : undefined}
            />
          );
        })}
      </svg>
      {nodes.map((n) => (
        <div key={n.id} className="absolute" style={{ left: n.x, top: n.y }}>
          <StudyNode
            type={n.type}
            size={n.size ?? "m"}
            state={n.state ?? "default"}
            title={n.title}
            meta={n.meta}
            num={n.num}
            progress={n.progress}
            numbered={numbered}
          />
        </div>
      ))}
    </div>
  );
}

/* ---- Node Pack showcase surface ---- */
export function NodePack({
  directionLabel,
  numbered = false,
}: {
  directionLabel: string;
  numbered?: boolean;
}) {
  const sizes: NodeSize[] = ["xs", "s", "m", "l", "xl"];
  const types = Object.keys(NODE_TYPE_META) as NodeType[];
  const states: NodeState[] = ["default", "active", "selected", "mastered", "review", "locked"];
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-[26px] font-semibold tracking-tight">Node pack</h1>
        <Badge tone="outline">{directionLabel}</Badge>
      </div>
      <p className="mt-1 max-w-2xl text-[14px] text-muted-foreground">
        The study-map building blocks — node types, scale ramp, and states — rendered in this
        direction&apos;s visual language. The same components compose the workspace graph.
      </p>

      <section className="mt-8">
        <Eyebrow>Scale ramp</Eyebrow>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {sizes.map((s) => (
            <div key={s} className="flex flex-col items-center gap-1.5">
              <StudyNode
                type="concept"
                size={s}
                title="SN2 mechanism"
                meta={s === "xs" ? undefined : "Ch. 7"}
                numbered={numbered}
                num={3}
              />
              <span className="font-mono text-[10px] uppercase text-muted-foreground">{s}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <Eyebrow>Node types</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {types.map((t, i) => (
            <StudyNode
              key={t}
              type={t}
              size="m"
              numbered={numbered}
              num={i + 1}
              title={
                NODE_TYPE_META[t].label === "Concept" ? "SN2 mechanism" : NODE_TYPE_META[t].label
              }
              meta={
                t === "curriculum" ? "3 / 8 modules" : t === "checkpoint" ? "Quiz · ready" : "Ch. 7"
              }
              {...(t === "curriculum" ? { progress: 38 } : {})}
            />
          ))}
        </div>
      </section>

      <section className="mt-9">
        <Eyebrow>States</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {states.map((st) => (
            <div key={st} className="flex flex-col items-center gap-1.5">
              <StudyNode
                type="concept"
                size="s"
                state={st}
                title="Backside attack"
                numbered={numbered}
                num={5}
              />
              <span className="font-mono text-[10px] uppercase text-muted-foreground">{st}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <Eyebrow>Sample canvas</Eyebrow>
        <div className="mt-3 overflow-hidden rounded-[var(--radius)] border border-border bg-surface/50">
          <GraphCanvas
            numbered={numbered}
            height={360}
            nodes={[
              {
                id: "c",
                x: 40,
                y: 40,
                type: "curriculum",
                size: "l",
                title: "Ch. 7 · Substitution",
                meta: "3 / 8 modules",
                progress: 38,
                num: 1,
              },
              {
                id: "p",
                x: 60,
                y: 210,
                type: "plan",
                size: "m",
                title: "Substitution plan",
                meta: "Obj 2 of 3",
                num: 2,
              },
              {
                id: "s",
                x: 340,
                y: 70,
                type: "concept",
                size: "m",
                state: "selected",
                title: "SN2 mechanism",
                meta: "needs practice",
                num: 3,
              },
              {
                id: "o",
                x: 360,
                y: 220,
                type: "objective",
                size: "s",
                state: "active",
                title: "Backside attack",
                num: 4,
              },
              {
                id: "k",
                x: 600,
                y: 110,
                type: "checkpoint",
                size: "s",
                title: "SN2 rate",
                meta: "quiz",
                num: 5,
              },
              { id: "a", x: 600, y: 230, type: "artifact", size: "xs", title: "Ch.7 deck", num: 6 },
            ]}
            edges={[
              { from: [150, 90], to: [340, 110] },
              { from: [400, 140], to: [400, 220], active: true },
              { from: [150, 250], to: [360, 245] },
              { from: [470, 110], to: [600, 135] },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
