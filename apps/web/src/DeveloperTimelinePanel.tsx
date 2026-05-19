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
  mastery_evaluator: { bg: "#fff7ed", text: "#9a3412", border: "#fed7aa" },
  event: { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" },
};

export function DeveloperTimelinePanel({ notebookId, onSelectNodeRefs }: DeveloperTimelinePanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["developer-timeline", notebookId],
    queryFn: async (): Promise<DeveloperTimelineResponse> => {
      const response = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/developer/timeline?limit=250`);
      if (!response.ok) {
        throw new Error(`Failed to load timeline (${response.status})`);
      }
      return (await response.json()) as DeveloperTimelineResponse;
    },
  });

  const items = data?.items ?? [];
  const [showRawEvents, setShowRawEvents] = React.useState(false);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());
  const visibleItems = showRawEvents ? items : items.filter((item) => item.eventType !== "tutor.message.delta");
  const groups = groupTimelineItems(visibleItems);
  const traceUsage = data?.traceSummary.usage;
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

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
        <div style={{ fontSize: 12, fontWeight: 800, color: "#111827" }}>Harness dashboard</div>
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
        <button
          type="button"
          onClick={() => setShowRawEvents((value) => !value)}
          style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 11, color: "#374151", cursor: "pointer" }}
        >
          {showRawEvents ? "Hide raw deltas" : "Raw events"}
        </button>
      </div>

      {!isLoading && items.length === 0 && !error && (
        <div style={{ fontSize: 12, color: "#6b7280", padding: "4px 0" }}>No developer activity found yet.</div>
      )}

      {groups.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 360, overflow: "auto" }}>
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.id);
            const summary = summarizeTimelineGroup(group.items);
            return (
              <section key={group.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "white", overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  style={{ width: "100%", border: "none", background: "#f9fafb", padding: "8px 10px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#111827" }}>{isCollapsed ? "▸" : "▾"} {summary.agentLabel}</span>
                      {summary.status && <StatusPill status={summary.status} />}
                      {summary.model && <span style={{ fontSize: 11, color: "#6b7280" }}>{summary.model}</span>}
                      {summary.duration && <span style={{ fontSize: 11, color: "#6b7280" }}>{summary.duration}</span>}
                    </span>
                    <span style={{ marginTop: 3, display: "block", fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {summary.visibleLine || group.title}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
                    {summary.toolCount} tools · {summary.updateCount} updates · {group.items.length} events
                  </span>
                </button>
                {!isCollapsed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: 8 }}>
                    {summary.tools.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 3 }}>
                        {summary.tools.map((tool) => (
                          <span key={tool.id} style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                            {tool.name}{tool.status ? ` · ${tool.status}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {group.items.map((item) => (
                      <TimelineItem
                        key={item.id}
                        item={item}
                        {...(onSelectNodeRefs ? { onSelectNodeRefs } : {})}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TimelineItem({ item, onSelectNodeRefs }: { item: DeveloperTimelineResponse["items"][number]; onSelectNodeRefs?: (refs: NodeRef[]) => void }) {
  const kindKey = (item.kind && item.kind in KIND_STYLES ? item.kind : "event") as keyof typeof KIND_STYLES;
  const kind = KIND_STYLES[kindKey] ?? { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" };
  return (
    <article style={{ display: "grid", gridTemplateColumns: "82px minmax(0, 1fr)", gap: 8, padding: "7px 8px", border: `1px solid ${kind.border}`, borderRadius: 7, background: "#fff" }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>
        {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ background: kind.bg, color: kind.text, border: `1px solid ${kind.border}`, padding: "1px 7px", borderRadius: 9999, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{item.kind.replace(/_/g, " ")}</span>
          <span style={{ fontSize: 12, fontWeight: 650, color: "#111827" }}>{item.title}</span>
          {item.status && <span style={{ fontSize: 11, color: "#6b7280" }}>status {item.status.replace(/_/g, " ")}</span>}
        </div>
        {item.summary && <div style={{ fontSize: 12, color: "#4b5563", marginTop: 3, lineHeight: 1.4 }}>{item.summary}</div>}
        {(item.model || item.promptVersion || item.traceId || item.usage) && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
            {[item.model ? `model ${item.model}` : null, item.promptVersion ? `prompt ${item.promptVersion}` : null, item.traceId ? `trace ${item.traceId.slice(0, 8)}` : null, item.usage ? formatUsage(item.usage) : null].filter(Boolean).join(" · ")}
          </div>
        )}
        {item.nodeRefs.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {item.nodeRefs.map((ref) => (
              <button key={`${item.id}:${ref.refType}:${ref.refId}`} type="button" onClick={() => onSelectNodeRefs?.([ref])} style={{ border: "1px solid #d1d5db", background: "#f9fafb", borderRadius: 9999, padding: "2px 8px", fontSize: 11, color: "#374151", cursor: onSelectNodeRefs ? "pointer" : "default" }}>
                {ref.refType}:{ref.refId.slice(0, 10)}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function groupTimelineItems(items: DeveloperTimelineResponse["items"]) {
  const groups = new Map<string, { id: string; title: string; items: DeveloperTimelineResponse["items"] }>();
  for (const item of items) {
    const key = item.runId ? `run:${item.runId}` : item.sessionId ? `session:${item.sessionId}` : "activity";
    const title = item.runId ? `Run ${item.runId.slice(0, 10)}` : item.sessionId ? `Session ${item.sessionId.slice(0, 10)}` : "Notebook activity";
    const group = groups.get(key) ?? { id: key, title, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function summarizeTimelineGroup(items: DeveloperTimelineResponse["items"]) {
  const run = items.find((item) => item.kind === "agent_run" && item.runId) ?? items.find((item) => item.runId);
  const tools = items
    .filter((item) => item.kind === "tool_call" && item.toolName)
    .map((item) => ({
      id: item.toolCallId ?? item.id,
      name: displayToolName(item.toolName ?? "tool"),
      status: item.status,
    }));
  const stateUpdates = items.filter((item) => item.kind === "artifact_change" || item.kind === "wiki_change" || item.kind === "ingestion_job");
  const failedToolCount = tools.filter((tool) => tool.status === "failed" || tool.status === "error").length;
  const status = run?.status ?? (failedToolCount > 0 ? "failed" : undefined);
  const agentLabel = run?.title ? displayRunTitle(run.title) : run?.runId ? `Run ${run.runId.slice(0, 10)}` : "Notebook activity";
  const visibleLine = [
    tools.length ? `Tools: ${tools.slice(0, 4).map((tool) => tool.name).join(", ")}` : null,
    failedToolCount ? `${failedToolCount} failed` : null,
    stateUpdates.length ? `Updates: ${stateUpdates.slice(0, 3).map((item) => item.title).join(", ")}` : null,
  ].filter(Boolean).join(" · ");

  return {
    agentLabel,
    status,
    model: run?.model,
    duration: durationFromItems(items),
    toolCount: tools.length,
    updateCount: stateUpdates.length,
    visibleLine,
    tools,
  };
}

function StatusPill({ status }: { status: string }) {
  const isFailed = status === "failed" || status === "error";
  const isCompleted = status === "completed";
  return (
    <span
      style={{
        border: `1px solid ${isFailed ? "#fecaca" : isCompleted ? "#bbf7d0" : "#bfdbfe"}`,
        background: isFailed ? "#fef2f2" : isCompleted ? "#f0fdf4" : "#eff6ff",
        color: isFailed ? "#991b1b" : isCompleted ? "#166534" : "#1d4ed8",
        borderRadius: 999,
        padding: "1px 7px",
        fontSize: 10,
        fontWeight: 800,
      }}
    >
      {status}
    </span>
  );
}

function displayRunTitle(title: string): string {
  return title.replace(/^tutor turn\b/i, "Tutor agent").replace(/_/g, " ");
}

function displayToolName(toolName: string): string {
  const lastPart = toolName.split(".").filter(Boolean).pop() ?? toolName;
  return lastPart
    .replace(/^create_/, "Create ")
    .replace(/^update_/, "Update ")
    .replace(/^read_/, "Read ")
    .replace(/^search_/, "Search ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function durationFromItems(items: DeveloperTimelineResponse["items"]): string | undefined {
  const timestamps = items.map((item) => Date.parse(item.timestamp)).filter(Number.isFinite);
  if (timestamps.length < 2) return undefined;
  const ms = Math.max(...timestamps) - Math.min(...timestamps);
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function formatUsage(usage: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; cost: { total: number } }): string {
  const parts = [`↑${usage.input}`, `↓${usage.output}`];
  if (usage.cacheRead > 0) parts.push(`R${usage.cacheRead}`);
  if (usage.cacheWrite > 0) parts.push(`W${usage.cacheWrite}`);
  if (usage.totalTokens > 0) parts.push(`ctx:${usage.totalTokens}`);
  if (usage.cost.total > 0) parts.push(`$${usage.cost.total.toFixed(4)}`);
  return parts.join(" ");
}
