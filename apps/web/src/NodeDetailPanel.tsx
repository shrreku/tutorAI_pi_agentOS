import React from "react";
import type { GraphCanvasNode } from "@studyagent/schemas";

interface NodeDetailPanelProps {
  node: GraphCanvasNode | null;
  onClose: () => void;
  onLaunchTutor?: (node: GraphCanvasNode) => void;
  onShowProvenance?: (node: GraphCanvasNode) => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 2,
};

const valueStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#1f2937",
};

const badgeColors: Record<string, { bg: string; text: string }> = {
  concept: { bg: "#dbeafe", text: "#1d4ed8" },
  source: { bg: "#d1fae5", text: "#065f46" },
  source_section: { bg: "#d1fae5", text: "#065f46" },
  topic: { bg: "#e0f2fe", text: "#0369a1" },
  curriculum: { bg: "#fef3c7", text: "#92400e" },
  curriculum_module: { bg: "#ffedd5", text: "#9a3412" },
  objective: { bg: "#fef3c7", text: "#92400e" },
  objective_list: { bg: "#fef3c7", text: "#9a3412" },
  study_plan: { bg: "#ede9fe", text: "#5b21b6" },
  session_plan: { bg: "#ddd6fe", text: "#5b21b6" },
  wiki_page: { bg: "#e0f2fe", text: "#0369a1" },
  artifact: { bg: "#fce7f3", text: "#9d174d" },
  tutor_session: { bg: "#f3f4f6", text: "#374151" },
  weak_concept: { bg: "#fee2e2", text: "#991b1b" },
  claim: { bg: "#f5f3ff", text: "#6d28d9" },
  coverage_item: { bg: "#ccfbf1", text: "#0f766e" },
  coverage_record: { bg: "#99f6e4", text: "#115e59" },
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value > 0.8 ? "#10b981" : value > 0.5 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{pct}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string | undefined }) {
  if (!status) return null;
  const colors: Record<string, { bg: string; text: string }> = {
    active: { bg: "#d1fae5", text: "#065f46" },
    completed: { bg: "#dbeafe", text: "#1d4ed8" },
    draft: { bg: "#f3f4f6", text: "#374151" },
    not_started: { bg: "#f3f4f6", text: "#374151" },
    published: { bg: "#d1fae5", text: "#065f46" },
    failed: { bg: "#fee2e2", text: "#991b1b" },
    candidate: { bg: "#fef3c7", text: "#92400e" },
    accepted: { bg: "#d1fae5", text: "#065f46" },
    rejected: { bg: "#fee2e2", text: "#991b1b" },
  };
  const c = colors[status] ?? { bg: "#f3f4f6", text: "#374151" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 9999,
        background: c.bg,
        color: c.text,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function NodeTypePanel({ node }: { node: GraphCanvasNode }) {
  const p = node.properties;
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : undefined);

  switch (node.nodeType) {
    case "source":
      return (
        <>
          <Field label="Title" value={str("title")} />
          <Field label="Source Type" value={str("sourceType") ?? str("source_type")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          {str("description") && <Field label="Description" value={str("description")} />}
        </>
      );

    case "source_section":
    case "topic":
      return (
        <>
          <Field label={node.nodeType === "topic" ? "Topic" : "Heading"} value={str("title") ?? str("heading")} />
          {node.nodeType === "source_section" && <Field label="Page" value={str("pageStart") ?? str("page_start")} />}
          {str("text") && (
            <Field
              label="Preview"
              value={
                <div style={{ fontSize: 12, color: "#4b5563", fontStyle: "italic", lineHeight: 1.5 }}>
                  {(str("text") ?? "").slice(0, 200)}
                  {(str("text") ?? "").length > 200 ? "…" : ""}
                </div>
              }
            />
          )}
        </>
      );

    case "curriculum":
      return (
        <>
          <Field label="Title" value={str("title")} />
          <Field label="Type" value={str("curriculumType") ?? str("curriculum_type")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          {num("confidence") !== undefined && (
            <Field label="Confidence" value={<ConfidenceBar value={num("confidence")!} />} />
          )}
        </>
      );

    case "objective":
      return (
        <>
          <Field label="Title" value={str("title")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          <Field label="Order" value={num("orderIndex") ?? num("order_index")} />
          <Field label="Suggested Mode" value={str("suggestedMode") ?? str("suggested_mode")} />
          {num("readinessScore") !== undefined && (
            <Field label="Readiness" value={<ConfidenceBar value={num("readinessScore")!} />} />
          )}
        </>
      );

    case "study_plan":
      return (
        <>
          <Field label="Live Plan" value={str("title")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          <Field label="Current Objective" value={str("currentObjectiveId") ?? str("current_objective_id")} />
        </>
      );

    case "curriculum_module":
      return (
        <>
          <Field label="Title" value={str("title")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          <Field label="Summary" value={str("summary")} />
          <Field label="Order" value={num("orderIndex") ?? num("order_index")} />
        </>
      );

    case "objective_list":
      return (
        <>
          <Field label="Title" value={str("title")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          <Field label="Current Objective" value={str("currentObjectiveId") ?? str("current_objective_id")} />
        </>
      );

    case "session_plan":
      return (
        <>
          <Field label="Title" value={str("title")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          <Field label="Session Goal" value={str("sessionGoal") ?? str("session_goal")} />
        </>
      );

    case "coverage_item":
      return (
        <>
          <Field label="Title" value={str("title")} />
          <Field label="Family" value={str("itemFamily") ?? str("item_family")} />
          <Field label="Description" value={str("description")} />
        </>
      );

    case "coverage_record":
      return (
        <>
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          <Field label="Coverage Item" value={str("coverageItemId") ?? str("coverage_item_id")} />
        </>
      );

    case "concept":
      return (
        <>
          <Field label="Name" value={str("canonicalName") ?? str("canonical_name") ?? str("title")} />
          <Field label="Type" value={str("conceptType") ?? str("concept_type")} />
          {str("description") && <Field label="Description" value={str("description")} />}
          {num("confidence") !== undefined && (
            <Field label="Confidence" value={<ConfidenceBar value={num("confidence")!} />} />
          )}
        </>
      );

    case "wiki_page":
      return (
        <>
          <Field label="Title" value={str("title")} />
          <Field label="Page Type" value={str("pageType") ?? str("page_type")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          {num("qualityScore") !== undefined && (
            <Field label="Quality" value={<ConfidenceBar value={num("qualityScore")!} />} />
          )}
          {str("markdown") && (
            <Field
              label="Content Preview"
              value={
                <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.5 }}>
                  {(str("markdown") ?? "").slice(0, 300)}
                  {(str("markdown") ?? "").length > 300 ? "…" : ""}
                </div>
              }
            />
          )}
        </>
      );

    case "artifact":
      return (
        <>
          <Field label="Title" value={str("title")} />
          <Field label="Type" value={str("artifactType") ?? str("artifact_type")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
        </>
      );

    case "tutor_session":
      return (
        <>
          <Field label="Mode" value={str("mode")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          <Field label="Started" value={str("startedAt") ?? str("started_at")} />
        </>
      );

    case "weak_concept":
      return (
        <>
          <Field label="Concept" value={str("conceptId") ?? str("concept_id") ?? str("title")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          {num("masteryScore") !== undefined && (
            <Field label="Mastery" value={<ConfidenceBar value={num("masteryScore")!} />} />
          )}
        </>
      );

    case "claim":
      return (
        <>
          <Field label="Claim" value={str("claimText") ?? str("claim_text") ?? str("title")} />
          <Field label="Type" value={str("claimType") ?? str("claim_type")} />
          <Field label="Status" value={<StatusBadge status={str("status")} />} />
          {num("confidence") !== undefined && (
            <Field label="Confidence" value={<ConfidenceBar value={num("confidence")!} />} />
          )}
        </>
      );

    default:
      return (
        <Field
          label="Properties"
          value={
            <pre style={{ fontSize: 11, background: "#f3f4f6", padding: 8, borderRadius: 4, overflow: "auto", margin: 0 }}>
              {JSON.stringify(p, null, 2)}
            </pre>
          }
        />
      );
  }
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  node,
  onClose,
  onLaunchTutor,
  onShowProvenance,
}) => {
  if (!node) return null;

  const badge = badgeColors[node.nodeType] ?? { bg: "#f3f4f6", text: "#374151" };
  
  // GF-1 (NEW): Detect if we're in a full-panel context by checking for absolute positioning support
  // In full-panel mode, parent will NOT have "position: relative" and we'll render without absolute positioning
  const isFullPanel = false; // This will be determined by parent context in future

  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        width: 320,
        maxHeight: "60%",
        background: "white",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        border: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        zIndex: 20,
        overflow: "hidden",
      }}
    >
      {/* Header - simplified for overlay mode */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f9fafb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 4,
              background: badge.bg,
              color: badge.text,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "capitalize",
            }}
          >
            {node.nodeType.replace(/_/g, " ")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
            {(node.properties.title as string) ??
              (node.properties.canonicalName as string) ??
              (node.properties.canonical_name as string) ??
              node.id.slice(0, 12)}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", padding: "0 4px" }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        <NodeTypePanel node={node} />
      </div>

      {/* Actions */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8 }}>
        {onLaunchTutor && (
          <button
            onClick={() => onLaunchTutor(node)}
            style={{
              flex: 1,
              padding: "6px 10px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Teach this
          </button>
        )}
        {onShowProvenance && (
          <button
            onClick={() => onShowProvenance(node)}
            style={{
              flex: 1,
              padding: "6px 10px",
              background: "#f3f4f6",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Evidence
          </button>
        )}
      </div>
    </div>
  );
};
