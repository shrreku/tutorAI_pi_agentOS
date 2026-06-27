import type { ReactNode } from "react";
import { learnerFacingNodeTypeLabel, learnerFacingPipelineStatus } from "@studyagent/schemas";

export type StudyNodeSize = "xl" | "l" | "m" | "s" | "xs";

const TYPE_CLASS: Record<string, string> = {
  curriculum: "curriculum",
  curriculum_module: "curriculum",
  study_plan: "plan",
  session_plan: "plan",
  concept: "concept",
  wiki_page: "concept",
  objective: "objective",
  objective_list: "objective",
  coverage_item: "objective",
  topic: "concept",
  source: "objective",
  artifact: "concept",
};

const SIZE_BY_TYPE: Record<string, StudyNodeSize> = {
  curriculum: "xl",
  study_plan: "xl",
  curriculum_module: "l",
  session_plan: "l",
  concept: "m",
  wiki_page: "m",
  objective: "m",
  objective_list: "l",
  coverage_item: "s",
  artifact: "s",
  claim: "xs",
  weak_concept: "xs",
  source_section: "xs",
  topic: "s",
};

const DISPLAY_TYPE: Record<string, string> = {
  study_plan: "Live Plan",
  session_plan: "Lesson plan",
  tutor_session: "Session",
};

export function studyNodeSize(nodeType: string): StudyNodeSize {
  return SIZE_BY_TYPE[nodeType] ?? "m";
}

export function studyNodeTypeClass(nodeType: string): string {
  return TYPE_CLASS[nodeType] ?? "objective";
}

export function studyNodeTypeLabel(nodeType: string): string {
  return DISPLAY_TYPE[nodeType] ?? learnerFacingNodeTypeLabel(nodeType);
}

export function StudyNode({
  nodeType,
  title,
  meta,
  summary,
  status,
  pageReadiness,
  selected = false,
  size,
  badges,
  progress,
  onClick,
  className,
  style,
  as: Tag = "div",
}: {
  nodeType: string;
  title: string;
  meta?: string | null;
  summary?: string | null;
  status?: string | null;
  pageReadiness?: string | null;
  selected?: boolean;
  size?: StudyNodeSize;
  badges?: ReactNode;
  progress?: number;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  as?: "div" | "button" | "a";
}) {
  const resolvedSize = size ?? studyNodeSize(nodeType);
  const typeClass = studyNodeTypeClass(nodeType);
  const classes = [
    "node",
    resolvedSize !== "m" ? resolvedSize : "",
    selected ? "selected" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag
      type={Tag === "button" ? "button" : undefined}
      className={classes}
      style={style}
      onClick={onClick}
      title={title}
    >
      <div className={`type ${typeClass}`}>{studyNodeTypeLabel(nodeType)}</div>
      <div className="title">{title}</div>
      {summary ? <div className="meta">{summary}</div> : null}
      {progress != null ? (
        <div className="progress" style={{ margin: "8px 0" }}>
          <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      ) : null}
      {badges ? <div className="pill-row">{badges}</div> : null}
      {pageReadiness ? (
        <div className="pill-row">
          <span className="badge purple">{pageReadiness}</span>
        </div>
      ) : status ? (
        <div className="pill-row">
          <span className="badge gray">{learnerFacingPipelineStatus(status)}</span>
        </div>
      ) : null}
      {meta ? <div className="meta">{meta}</div> : null}
    </Tag>
  );
}
