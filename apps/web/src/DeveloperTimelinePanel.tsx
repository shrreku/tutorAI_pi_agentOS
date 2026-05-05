import React from "react";
import { useQuery } from "@tanstack/react-query";
import type { DeveloperTimelineResponse } from "@studyagent/schemas";

type NodeRef = { refType: string; refId: string };

interface DeveloperTimelinePanelProps {
  notebookId: string;
  onSelectNodeRefs?: (refs: NodeRef[]) => void;
}

const KIND_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  agent_run: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  tool_call: { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
  wiki_change: { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" },
  artifact_change: { bg: "#ecfeff", text: "#155e75", border: "#a5f3fc" },
  ingestion_job: { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0" },
  event: { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" },
};

export function DeveloperTimelinePanel({ notebookId, onSelectNodeRefs }: DeveloperTimelinePanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["developer-timeline", notebookId],
    queryFn: async (): Promise<DeveloperTimelineResponse> => {
      const response = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/developer/timeline?limit=120`);
      if (!response.ok) {
        throw new Error(`Failed to load timeline (${response.status})`);
      }
      return (await response.json()) as DeveloperTimelineResponse;
    },
  });

  const items = data?.items ?? [];
  const traceUsage = data?.traceSummary.usage;

  return (
    <section
      style={{
        borderTop: "1px solid #e5e7eb",
        borderBottom: "1px solid #e5e7eb",
        background: "#fcfcfd",
        padding: "8px 12px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Developer timeline</div>
        {data && (
          <div style={{ display: "flex", gap: 8, color: "#6b7280", fontSize: 11, flexWrap: "wrap" }}>
            <span>{data.traceSummary.eventCount} events</span>
            <span>{data.traceSummary.toolCallCount} tool calls</span>
            <span>{data.traceSummary.runCount} runs</span>
            {traceUsage && <span>{formatUsage(traceUsage)}</span>}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {isLoading && <span style={{ fontSize: 11, color: "#9ca3af" }}>Loading…</span>}
        {error instanceof Error && <span style={{ fontSize: 11, color: "#b91c1c" }}>{error.message}</span>}
      </div>

      {!isLoading && items.length === 0 && !error && (
        <div style={{ fontSize: 12, color: "#6b7280", padding: "4px 0" }}>No developer activity found yet.</div>
      )}

      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflow: "auto" }}>
          {items.map((item) => {
            const kindKey = (item.kind && item.kind in KIND_STYLES ? item.kind : "event") as keyof typeof KIND_STYLES;
            const kind = KIND_STYLES[kindKey] ?? { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" };
            return (
              <article
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "8px 10px",
                  border: `1px solid ${kind.border}`,
                  borderRadius: 8,
                  background: "white",
                }}
              >
                <div style={{ minWidth: 110, fontSize: 11, color: "#6b7280", paddingTop: 1 }}>
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        background: kind.bg,
                        color: kind.text,
                        border: `1px solid ${kind.border}`,
                        padding: "1px 7px",
                        borderRadius: 9999,
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {item.kind.replace(/_/g, " ")}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{item.title}</span>
                    {item.status && (
                      <span style={{ fontSize: 11, color: "#6b7280" }}>status {item.status.replace(/_/g, " ")}</span>
                    )}
                  </div>
                  {item.summary && <div style={{ fontSize: 12, color: "#4b5563", marginTop: 3, lineHeight: 1.4 }}>{item.summary}</div>}
                  {(item.model || item.promptVersion || item.traceId || item.usage) && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                      {[item.model ? `model ${item.model}` : null, item.promptVersion ? `prompt ${item.promptVersion}` : null, item.traceId ? `trace ${item.traceId.slice(0, 8)}` : null, item.usage ? formatUsage(item.usage) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  {item.nodeRefs.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {item.nodeRefs.map((ref) => (
                        <button
                          key={`${item.id}:${ref.refType}:${ref.refId}`}
                          type="button"
                          onClick={() => onSelectNodeRefs?.([ref])}
                          style={{
                            border: "1px solid #d1d5db",
                            background: "#f9fafb",
                            borderRadius: 9999,
                            padding: "2px 8px",
                            fontSize: 11,
                            color: "#374151",
                            cursor: onSelectNodeRefs ? "pointer" : "default",
                          }}
                        >
                          {ref.refType}:{ref.refId.slice(0, 10)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatUsage(usage: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; cost: { total: number } }): string {
  const parts = [`↑${usage.input}`, `↓${usage.output}`];
  if (usage.cacheRead > 0) parts.push(`R${usage.cacheRead}`);
  if (usage.cacheWrite > 0) parts.push(`W${usage.cacheWrite}`);
  if (usage.totalTokens > 0) parts.push(`ctx:${usage.totalTokens}`);
  if (usage.cost.total > 0) parts.push(`$${usage.cost.total.toFixed(4)}`);
  return parts.join(" ");
}
