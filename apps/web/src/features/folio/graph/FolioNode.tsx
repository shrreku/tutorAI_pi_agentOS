import type { CSSProperties, ReactNode } from "react";
import { cn } from "../lib/utils.js";

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

export function mapGraphNodeType(nodeType: string): FolioNodeType {
  switch (nodeType) {
    case "curriculum":
      return "curriculum";
    case "curriculum_module":
    case "study_plan":
    case "session_plan":
      return "plan";
    case "concept":
    case "weak_concept":
      return "concept";
    case "objective":
    case "objective_list":
      return "objective";
    case "artifact":
      return "artifact";
    case "source":
    case "source_section":
    case "wiki_page":
      return "source";
    default:
      return "checkpoint";
  }
}

export function mapGraphNodeSize(nodeType: string): keyof typeof SIZE_BOX {
  switch (nodeType) {
    case "curriculum":
      return "l";
    case "curriculum_module":
    case "study_plan":
      return "m";
    case "concept":
    case "objective":
      return "m";
    case "artifact":
    case "source":
      return "s";
    default:
      return "xs";
  }
}

export function FolioNode({
  type,
  size = "m",
  state = "default",
  title,
  meta,
  roman,
  progress,
  className,
  style,
  onClick,
}: {
  type: FolioNodeType;
  size?: keyof typeof SIZE_BOX;
  state?: FolioNodeState;
  title: ReactNode;
  meta?: ReactNode;
  roman?: string;
  progress?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const tm = FOLIO_TYPE[type];
  const numeral = roman ?? tm.roman;
  const titleSize =
    size === "xs" ? "text-[12px]" : size === "xl" || size === "l" ? "text-[17px]" : "text-[15px]";

  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius)] border text-left shadow-soft transition-all duration-150",
        SIZE_BOX[size],
        state === "selected"
          ? "border-accent ring-2 ring-accent/25"
          : state === "active"
            ? "border-accent/60"
            : "border-border/80",
        state === "locked" && "opacity-50",
        onClick && "cursor-pointer hover:border-accent/50",
        className,
      )}
      style={{ background: tm.wash, ...style }}
    >
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-display text-[13px] font-semibold tabular-nums"
          style={{ color: tm.ink }}
        >
          {numeral}.
        </span>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tm.ink }}
        >
          {tm.label}
        </span>
        {state === "completed" && (
          <span className="ml-auto text-[11px] font-medium text-success">✓</span>
        )}
        {state === "locked" && (
          <span className="ml-auto text-[11px] text-muted-foreground">🔒</span>
        )}
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
      {meta && progress == null && (
        <div className="mt-1.5 text-[11px] text-muted-foreground">{meta}</div>
      )}
    </Component>
  );
}
