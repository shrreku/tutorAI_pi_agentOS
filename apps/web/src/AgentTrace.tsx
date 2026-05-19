import React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChatTraceRun, ChatTraceStateChange, ChatTraceToolCall, ChatTraceTurn, TraceUsage } from "@studyagent/schemas";

export type LiveTraceTool = {
  id: string;
  toolName: string;
  status: "started" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
  startedAt: number;
  completedAt?: number;
};

export type LiveTraceRun = {
  id: string;
  status: "running" | "completed" | "failed";
  runType: string;
  model?: string | undefined;
  startedAt: number;
  completedAt?: number | undefined;
  tools: LiveTraceTool[];
  rawEvents?: ChatTraceStateChange[] | undefined;
};

export type TraceRunView = {
  id: string;
  status: string;
  runType: string;
  model?: string | undefined;
  promptVersion?: string | undefined;
  traceId?: string | null | undefined;
  startedAt: string | number;
  completedAt?: string | number | null | undefined;
  durationMs?: number | null | undefined;
  usage?: TraceUsage | undefined;
  thinking: ChatTraceStateChange[];
  tools: TraceToolView[];
  stateChanges: ChatTraceStateChange[];
  rawEvents: ChatTraceStateChange[];
  isLive?: boolean;
};

export type TraceToolView = {
  id: string;
  toolName: string;
  sideEffectClass?: string | undefined;
  status: string;
  latencyMs?: number | null | undefined;
  input?: unknown;
  output?: unknown;
  reducerResult?: unknown;
  nodeRefs: Array<{ refType: string; refId: string }>;
  createdAt?: string | number | undefined;
  isLive?: boolean | undefined;
};

export type TraceSummary = {
  hasTrace: boolean;
  status: string;
  runLabel: string;
  model?: string | undefined;
  elapsed?: string | undefined;
  runCount: number;
  toolCount: number;
  failedToolCount: number;
  updateCount: number;
  latestToolLabel?: string | undefined;
};

type AgentTraceProps = {
  traceTurn: ChatTraceTurn | null;
  liveRun: LiveTraceRun | null;
  runStatus: "idle" | "running" | "completed" | "failed";
};

export function AgentTrace({ traceTurn, liveRun, runStatus }: AgentTraceProps) {
  const traceView = useQuery({
    queryKey: ["agent-trace-view", traceTurn, liveRun, runStatus],
    queryFn: async () => buildTraceView(traceTurn, liveRun, runStatus),
    initialData: () => buildTraceView(traceTurn, liveRun, runStatus),
    staleTime: Infinity,
  });
  const runs = traceView.data?.runs ?? [];
  const summary = traceView.data?.summary ?? buildTraceSummary(runs, runStatus);
  const [open, setOpen] = React.useState(true);
  const [showRaw, setShowRaw] = React.useState(false);

  if (!summary.hasTrace) return null;

  const statusTone = getStatusTone(summary.status);
  const detailParts = traceView.data?.detailParts ?? [];

  return (
    <div style={styles.shell}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={styles.header}>
        <span aria-hidden="true" style={{ ...styles.chevron, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          &gt;
        </span>
        <span style={styles.title}>Agent trace</span>
        <span style={{ ...styles.statusPill, color: statusTone.text, background: statusTone.bg, borderColor: statusTone.border }}>
          {summary.status}
        </span>
        <span style={styles.headerDetails}>{detailParts.join(" · ")}</span>
        {summary.latestToolLabel && <span style={styles.latestTool}>{summary.latestToolLabel}</span>}
        {summary.elapsed && <span style={styles.elapsed}>{summary.elapsed}</span>}
      </button>

      {open && (
        <div style={styles.body}>
          <TraceActivityList runs={runs} showRaw={showRaw} />
          {runs.some((run) => run.rawEvents.length > 0) && (
            <button type="button" onClick={() => setShowRaw((value) => !value)} style={styles.rawToggle}>
              {showRaw ? "Hide raw events" : "Show raw events"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type TraceView = {
  runs: TraceRunView[];
  summary: TraceSummary;
  detailParts: string[];
};

function buildTraceView(traceTurn: ChatTraceTurn | null, liveRun: LiveTraceRun | null, runStatus: "idle" | "running" | "completed" | "failed"): TraceView {
  const runs = buildTraceRuns(traceTurn, liveRun);
  const summary = buildTraceSummary(runs, runStatus);
  const detailParts: string[] = [
    summary.runLabel,
    summary.model,
    summary.runCount ? formatCount(summary.runCount, "run") : null,
    summary.toolCount ? formatCount(summary.toolCount, "tool") : null,
    summary.failedToolCount ? `${summary.failedToolCount} failed` : null,
    summary.updateCount ? `${summary.updateCount} updates` : null,
  ].filter((p): p is string => Boolean(p && typeof p === "string"));

  return { runs, summary, detailParts };
}

export function updateLiveTraceRun(
  current: LiveTraceRun | null,
  chunk: Record<string, unknown>,
  fallbackRunType = "tutor_turn",
): LiveTraceRun | null {
  const type = chunk.type;
  if (type === "SESSION_STARTED") {
    const runId = typeof chunk.runId === "string" ? chunk.runId : current?.id;
    if (!runId) return current;
    return current ?? { id: runId, status: "running", runType: fallbackRunType, startedAt: timestampFromChunk(chunk), tools: [] };
  }

  if (type === "RUN_STARTED") {
    const runId = typeof chunk.runId === "string" ? chunk.runId : current?.id ?? `live_${timestampFromChunk(chunk)}`;
    return {
      id: runId,
      status: "running",
      runType: fallbackRunType,
      model: typeof chunk.model === "string" ? chunk.model : current?.model,
      startedAt: current?.startedAt ?? timestampFromChunk(chunk),
      tools: current?.tools ?? [],
    };
  }

  if (!current) return current;

  if (type === "TOOL_CALL_START") {
    const toolCallId = typeof chunk.toolCallId === "string" ? chunk.toolCallId : null;
    const toolName = typeof chunk.toolName === "string" ? chunk.toolName : null;
    if (!toolCallId || !toolName) return current;
    return upsertLiveTool(current, {
      id: toolCallId,
      toolName,
      status: "started",
      startedAt: timestampFromChunk(chunk),
    });
  }

  if (type === "TEXT_MESSAGE_CONTENT") {
    const text = typeof chunk.delta === "string" ? chunk.delta : typeof chunk.content === "string" ? chunk.content : "";
    if (!text.trim()) return current;
    const timestamp = timestampFromChunk(chunk);
    const rawEvents = current.rawEvents ?? [];
    return {
      ...current,
      rawEvents: [
        ...rawEvents,
        {
          id: `live_message_${rawEvents.length}_${timestamp}`,
          kind: "event",
          title: "Tutor message",
          summary: compactText(text, 160),
          eventType: "tutor.message.delta",
          status: "thinking",
          nodeRefs: [],
          payload: { text },
          timestamp: new Date(timestamp).toISOString(),
        },
      ],
    };
  }

  if (type === "TOOL_CALL_ARGS") {
    const toolCallId = typeof chunk.toolCallId === "string" ? chunk.toolCallId : null;
    if (!toolCallId) return current;
    return mapLiveTools(current, toolCallId, (tool) => ({
      ...tool,
      input: normalizeJsonish(chunk.args ?? chunk.delta),
    }));
  }

  if (type === "TOOL_CALL_END") {
    const toolCallId = typeof chunk.toolCallId === "string" ? chunk.toolCallId : null;
    const toolName = typeof chunk.toolName === "string" ? chunk.toolName : null;
    if (!toolCallId) return current;
    return upsertLiveTool(current, {
      id: toolCallId,
      toolName: toolName ?? "Tool call",
      status: "completed",
      input: normalizeJsonish(chunk.input),
      output: normalizeJsonish(chunk.result),
      startedAt: current.tools.find((tool) => tool.id === toolCallId)?.startedAt ?? timestampFromChunk(chunk),
      completedAt: timestampFromChunk(chunk),
    });
  }

  if (type === "RUN_FINISHED") {
    return { ...current, status: "completed", completedAt: timestampFromChunk(chunk) };
  }

  if (type === "RUN_ERROR") {
    return { ...current, status: "failed", completedAt: timestampFromChunk(chunk) };
  }

  return current;
}

export function buildTraceSummary(runs: TraceRunView[], runStatus: "idle" | "running" | "completed" | "failed"): TraceSummary {
  const toolCount = runs.reduce((sum, run) => sum + run.tools.length, 0);
  const failedToolCount = runs.reduce((sum, run) => sum + run.tools.filter((tool) => isFailureStatus(tool.status)).length, 0);
  const updateCount = runs.reduce((sum, run) => sum + run.stateChanges.length, 0);
  const latestRun = runs[runs.length - 1];
  const latestTool = findLatestTool(runs);
  const activeStatus = latestRun?.status ?? (runStatus === "idle" ? "idle" : runStatus);

  return {
    hasTrace: runs.length > 0 || runStatus === "running" || runStatus === "failed",
    status: activeStatus,
    runLabel: latestRun ? labelFromRunType(latestRun.runType) : "Tutor agent",
    model: latestRun?.model,
    elapsed: latestRun ? formatDuration(resolveDurationMs(latestRun)) : undefined,
    runCount: runs.length,
    toolCount,
    failedToolCount,
    updateCount,
    latestToolLabel: latestTool ? `${displayToolName(latestTool.toolName)} · ${latestTool.status}` : undefined,
  };
}

function buildTraceRuns(traceTurn: ChatTraceTurn | null, liveRun: LiveTraceRun | null): TraceRunView[] {
  const persisted = (traceTurn?.runs ?? []).map(mapPersistedRun);
  if (!liveRun) return persisted;
  const persistedHasLiveRun = persisted.some((run) => run.id === liveRun.id);
  if (persistedHasLiveRun && liveRun.status !== "running") return persisted;
  return [...persisted.filter((run) => run.id !== liveRun.id), mapLiveRun(liveRun)];
}

function mapPersistedRun(run: ChatTraceRun): TraceRunView {
  return {
    id: run.id,
    status: run.status,
    runType: run.runType,
    model: run.model,
    promptVersion: run.promptVersion,
    traceId: run.traceId,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    usage: run.usage,
    thinking: run.thinking,
    tools: run.tools.map(mapPersistedTool),
    stateChanges: run.stateChanges,
    rawEvents: run.rawEvents,
  };
}

function mapPersistedTool(tool: ChatTraceToolCall): TraceToolView {
  return {
    id: tool.id,
    toolName: tool.toolName,
    sideEffectClass: tool.sideEffectClass,
    status: tool.status,
    latencyMs: tool.latencyMs,
    input: tool.input,
    output: tool.output,
    reducerResult: tool.reducerResult,
    nodeRefs: tool.nodeRefs,
    createdAt: tool.createdAt,
  };
}

function mapLiveRun(run: LiveTraceRun): TraceRunView {
  const rawEvents = run.rawEvents ?? [];
  return {
    id: run.id,
    status: run.status,
    runType: run.runType,
    model: run.model,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.completedAt ? Math.max(0, run.completedAt - run.startedAt) : Date.now() - run.startedAt,
    thinking: [],
    tools: run.tools.map((tool) => ({
      id: tool.id,
      toolName: tool.toolName,
      status: tool.status,
      input: tool.input,
      output: tool.output,
      nodeRefs: [],
      createdAt: tool.startedAt,
      latencyMs: tool.completedAt ? Math.max(0, tool.completedAt - tool.startedAt) : null,
      isLive: true,
    })),
    stateChanges: [],
    rawEvents,
    isLive: true,
  };
}

type TraceActivity = {
  id: string;
  timestamp: string | number;
  type: "run" | "tool" | "event";
  title: string;
  status?: string;
  summary?: string;
  payload?: unknown;
  refs?: Array<{ refType: string; refId: string }>;
  tool?: TraceToolView;
};

function TraceActivityList({ runs, showRaw }: { runs: TraceRunView[]; showRaw: boolean }) {
  const activities = runs.flatMap((run) => buildRunActivities(run, showRaw)).sort((a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp));
  if (!activities.length) return <TraceEmpty>No trace activity recorded.</TraceEmpty>;
  return (
    <ol style={styles.timelineList}>
      {activities.map((activity) => (
        <TraceActivityRow key={activity.id} activity={activity} />
      ))}
    </ol>
  );
}

function buildRunActivities(run: TraceRunView, showRaw: boolean): TraceActivity[] {
  const runDetails = [
    run.model,
    run.promptVersion ? `prompt ${run.promptVersion}` : null,
    run.traceId ? `trace ${run.traceId.slice(0, 10)}` : null,
    run.usage ? formatUsage(run.usage) : null,
    resolveDurationMs(run) != null ? formatDuration(resolveDurationMs(run)) : null,
  ].filter(Boolean).join(" · ");
  const reasoningActivities = showRaw ? [] : buildReasoningActivities(run);
  const eventActivities = (showRaw ? run.rawEvents : [...run.thinking, ...run.stateChanges])
    .filter((event) => showRaw || event.eventType !== "tutor.message.delta")
    .map((event): TraceActivity => {
      const activity: TraceActivity = {
        id: `${run.id}:${event.id}`,
        timestamp: event.timestamp,
        type: "event",
        title: displayEventTitle(event),
        summary: event.summary,
        payload: event.payload,
        refs: event.nodeRefs,
      };
      if (event.status) activity.status = event.status;
      return activity;
    });
  return [
    {
      id: `${run.id}:run`,
      timestamp: run.startedAt,
      type: "run",
      title: `${labelFromRunType(run.runType)} ${run.status}`,
      status: run.status,
      summary: runDetails,
    },
    ...reasoningActivities,
    ...eventActivities,
    ...run.tools.map((tool): TraceActivity => ({
      id: `${run.id}:tool:${tool.id}`,
      timestamp: tool.createdAt ?? run.startedAt,
      type: "tool",
      title: displayToolName(tool.toolName),
      status: tool.status,
      summary: previewTool(tool),
      tool,
      refs: tool.nodeRefs,
    })),
  ];
}

function buildReasoningActivities(run: TraceRunView): TraceActivity[] {
  const activities: TraceActivity[] = [];
  for (const event of run.rawEvents) {
    if (event.eventType !== "tutor.message.delta") continue;
    const text = extractEventText(event.payload);
    const processText = extractProcessNarration(text);
    if (!processText) continue;
    activities.push({
        id: `${run.id}:${event.id}:reasoning`,
        timestamp: event.timestamp,
        type: "event",
        title: "Tutor reasoning",
        status: "thinking",
        summary: processText,
        payload: event.payload,
        refs: event.nodeRefs,
    });
  }
  return activities;
}

function extractEventText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  for (const key of ["text", "delta", "content", "message", "summary"]) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function extractProcessNarration(text: string): string | null {
  const compact = compactText(text, 260);
  const match = compact.match(/\b(?:Now\s+)?(?:Let me|I(?:'m| am)|I(?:'ll| will)|We(?:'re| are)|We(?:'ll| will))\s+(?:check|checking|explore|exploring|read|reading|pull(?: in| up)?|search|searching|dig|look up|see|inspect|inspecting|mark|save|create|build|open|trace|tracing|load|loading|verify|verifying|examine|examining)[\s\S]{0,240}/i);
  return match ? compactText(match[0], 220) : null;
}

function TraceActivityRow({ activity }: { activity: TraceActivity }) {
  const statusTone = getStatusTone(activity.status ?? activity.type);
  return (
    <li style={styles.timelineItem}>
      <span style={styles.timelineMarker}>{activity.type === "tool" ? "T" : activity.type === "run" ? "#" : "E"}</span>
      <div style={styles.timelineContent}>
        <div style={styles.timelineHeader}>
          <span style={styles.timelineTitle}>{activity.title}</span>
          {activity.status && <span style={{ ...styles.inlineStatus, color: statusTone.text }}>{activity.status}</span>}
          <span style={styles.toolMeta}>{formatTraceTime(activity.timestamp)}</span>
          {activity.summary && <span style={styles.toolPreview}>{activity.summary}</span>}
        </div>
        {activity.tool && <TraceToolDetails tool={activity.tool} />}
        {!activity.tool && activity.refs && activity.refs.length > 0 && <TraceRefs refs={activity.refs} />}
        {!activity.tool && hasVisiblePayload(activity.payload) && (
          <TraceJson title="Details" value={activity.payload} />
        )}
      </div>
    </li>
  );
}

function TraceToolDetails({ tool }: { tool: TraceToolView }) {
  const statusTone = getStatusTone(tool.status);
  const refs = tool.nodeRefs ?? [];

  return (
    <details open={tool.isLive && tool.status === "started"} style={styles.inlineDetails}>
      <summary style={styles.inlineDetailsSummary}>
        {tool.latencyMs != null && <span style={styles.toolMeta}>{formatDuration(tool.latencyMs)}</span>}
        {tool.sideEffectClass && <span style={styles.toolMeta}>{tool.sideEffectClass}</span>}
        <span style={{ ...styles.inlineStatus, color: statusTone.text }}>{tool.status}</span>
      </summary>
      <div style={styles.toolBody}>
        {tool.sideEffectClass && <TraceMeta label="Class" value={tool.sideEffectClass} />}
        {displayToolName(tool.toolName) !== tool.toolName && <TraceMeta label="Tool id" value={tool.toolName} />}
        {refs.length > 0 && <TraceRefs refs={refs} />}
        {tool.input !== undefined && <TraceJson title="Input" value={tool.input} />}
        {tool.output !== undefined && tool.output !== null && <TraceJson title="Output" value={tool.output} />}
        {tool.reducerResult !== undefined && tool.reducerResult !== null && <TraceJson title="Reducer result" value={tool.reducerResult} />}
      </div>
    </details>
  );
}

function TraceJson({ title, value }: { title: string; value: unknown }) {
  return (
    <details>
      <summary style={styles.jsonSummary}>{title}</summary>
      <pre style={styles.jsonBlock}>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function TraceRefs({ refs }: { refs: Array<{ refType: string; refId: string }> }) {
  return (
    <div style={styles.refs}>
      {refs.map((ref) => (
        <span key={`${ref.refType}:${ref.refId}`} style={styles.refPill}>
          {ref.refType}:{ref.refId.slice(0, 10)}
        </span>
      ))}
    </div>
  );
}

function TraceMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metaLine}>
      {label}: {value}
    </div>
  );
}

function TraceEmpty({ children }: { children: React.ReactNode }) {
  return <div style={styles.empty}>{children}</div>;
}

function ToolIcon({ toolName }: { toolName: string }) {
  const icon = toolName.includes("search") || toolName.includes("context") ? "S" : toolName.includes("artifact") || toolName.includes("wiki") ? "F" : "T";
  return <span style={styles.toolIcon}>{icon}</span>;
}

function timestampValue(timestamp: string | number): number {
  if (typeof timestamp === "number") return timestamp;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTraceTime(timestamp: string | number): string {
  const value = timestampValue(timestamp);
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function displayEventTitle(event: ChatTraceStateChange): string {
  const base = event.title?.trim() || event.summary?.trim() || event.eventType || event.kind;
  return compactText(base.replace(/^tutor\./, "").replace(/^agent\./, "").replace(/[._]/g, " "), 72);
}

function hasVisiblePayload(payload: unknown): boolean {
  if (payload === undefined || payload === null) return false;
  if (typeof payload !== "object") return true;
  if (Array.isArray(payload)) return payload.length > 0;
  return Object.keys(payload as Record<string, unknown>).length > 0;
}

function upsertLiveTool(run: LiveTraceRun, next: LiveTraceTool): LiveTraceRun {
  const idx = run.tools.findIndex((tool) => tool.id === next.id);
  if (idx === -1) return { ...run, tools: [...run.tools, next] };
  return {
    ...run,
    tools: run.tools.map((tool, index) =>
      index === idx
        ? {
            ...tool,
            ...next,
            input: next.input !== undefined ? next.input : tool.input,
            output: next.output !== undefined ? next.output : tool.output,
            startedAt: tool.startedAt,
          }
        : tool,
    ),
  };
}

function mapLiveTools(run: LiveTraceRun, toolCallId: string, mapper: (tool: LiveTraceTool) => LiveTraceTool): LiveTraceRun {
  return {
    ...run,
    tools: run.tools.map((tool) => (tool.id === toolCallId ? mapper(tool) : tool)),
  };
}

function timestampFromChunk(chunk: Record<string, unknown>): number {
  return typeof chunk.timestamp === "number" ? chunk.timestamp : Date.now();
}

function normalizeJsonish(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function findLatestTool(runs: TraceRunView[]): TraceToolView | undefined {
  for (let runIndex = runs.length - 1; runIndex >= 0; runIndex -= 1) {
    const tools = runs[runIndex]?.tools ?? [];
    if (tools.length > 0) return tools[tools.length - 1];
  }
  return undefined;
}

function previewTool(tool: TraceToolView): string {
  const target = tool.output ?? tool.input;
  if (target === undefined || target === null) return "";
  if (typeof target === "string") return compactText(target, 82);
  if (typeof target !== "object") return compactText(String(target), 82);
  const record = target as Record<string, unknown>;
  const preferredKeys = ["title", "summary", "status", "artifactId", "pageKey", "objectiveId", "message", "error"];
  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return `${key}: ${compactText(value, 64)}`;
  }
  const keys = Object.keys(record).slice(0, 4);
  return keys.length ? keys.join(", ") : "";
}

function compactText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

function labelFromRunType(runType: string): string {
  if (runType === "tutor_turn") return "Tutor agent";
  if (runType === "session_activity") return "Session activity";
  return runType.replace(/_/g, " ");
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

function formatCount(value: number, label: string): string {
  return `${value} ${value === 1 ? label : `${label}s`}`;
}

function resolveDurationMs(run: TraceRunView): number | null {
  if (run.durationMs != null) return run.durationMs;
  const started = typeof run.startedAt === "number" ? run.startedAt : Date.parse(run.startedAt);
  if (!Number.isFinite(started)) return null;
  if (run.completedAt) {
    const completed = typeof run.completedAt === "number" ? run.completedAt : Date.parse(run.completedAt);
    return Number.isFinite(completed) ? Math.max(0, completed - started) : null;
  }
  return run.status === "running" ? Math.max(0, Date.now() - started) : null;
}

function formatDuration(ms: number | null | undefined): string | undefined {
  if (ms == null) return undefined;
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function formatUsage(usage: TraceUsage): string {
  const parts = [`in ${usage.input}`, `out ${usage.output}`];
  if (usage.cacheRead > 0) parts.push(`read ${usage.cacheRead}`);
  if (usage.cacheWrite > 0) parts.push(`write ${usage.cacheWrite}`);
  if (usage.totalTokens > 0) parts.push(`${usage.totalTokens} tokens`);
  if (usage.cost.total > 0) parts.push(`$${usage.cost.total.toFixed(4)}`);
  return parts.join(" ");
}

function isFailureStatus(status: string): boolean {
  return status === "failed" || status === "error";
}

function getStatusTone(status: string): { text: string; bg: string; border: string } {
  if (isFailureStatus(status)) {
    return { text: "var(--danger)", bg: "color-mix(in oklch, var(--danger) 9%, var(--panel))", border: "color-mix(in oklch, var(--danger) 28%, var(--line))" };
  }
  if (status === "completed") {
    return { text: "var(--success)", bg: "color-mix(in oklch, var(--success) 9%, var(--panel))", border: "color-mix(in oklch, var(--success) 28%, var(--line))" };
  }
  if (status === "running" || status === "started") {
    return { text: "var(--accent)", bg: "var(--accent-soft)", border: "color-mix(in oklch, var(--accent) 26%, var(--line))" };
  }
  return { text: "var(--text-muted)", bg: "var(--panel-muted)", border: "var(--line)" };
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    margin: "6px 0 10px",
    borderTop: "1px solid var(--line)",
    borderBottom: "1px solid var(--line)",
    background: "transparent",
  },
  header: {
    width: "100%",
    minHeight: 36,
    border: "none",
    background: "transparent",
    padding: "7px 0",
    display: "flex",
    alignItems: "center",
    gap: 7,
    cursor: "pointer",
    textAlign: "left",
  },
  chevron: {
    color: "var(--text-muted)",
    fontSize: 12,
    transition: "transform 160ms var(--ease-out)",
  },
  title: {
    fontSize: 12,
    fontWeight: 850,
    color: "var(--text-strong)",
    whiteSpace: "nowrap",
  },
  statusPill: {
    border: "1px solid",
    borderRadius: 999,
    padding: "1px 7px",
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1.6,
    whiteSpace: "nowrap",
  },
  headerDetails: {
    minWidth: 0,
    flex: "1 1 auto",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 11,
    color: "var(--text-muted)",
  },
  latestTool: {
    maxWidth: 170,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 11,
    color: "var(--text)",
  },
  elapsed: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  body: {
    padding: "3px 0 9px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  timelineList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: 4,
  },
  timelineItem: {
    display: "grid",
    gridTemplateColumns: "22px minmax(0, 1fr)",
    columnGap: 7,
    alignItems: "start",
  },
  timelineMarker: {
    width: 18,
    height: 18,
    borderRadius: 999,
    display: "inline-grid",
    placeItems: "center",
    background: "var(--panel-muted)",
    color: "var(--text-muted)",
    fontSize: 9,
    fontWeight: 900,
    marginTop: 2,
  },
  timelineContent: {
    minWidth: 0,
    padding: "2px 0 7px",
    borderBottom: "1px solid color-mix(in oklch, var(--line) 72%, transparent)",
  },
  timelineHeader: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
    fontSize: 12,
    lineHeight: 1.5,
  },
  timelineTitle: {
    color: "var(--text-strong)",
    fontWeight: 820,
    whiteSpace: "nowrap",
  },
  inlineDetails: {
    marginTop: 3,
  },
  inlineDetailsSummary: {
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 700,
  },
  runShell: {
    border: "1px solid var(--line)",
    borderRadius: 8,
    background: "var(--panel)",
    overflow: "hidden",
  },
  runSummary: {
    cursor: "pointer",
    padding: "8px 9px",
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    color: "var(--text-strong)",
  },
  runIcon: {
    width: 20,
    height: 20,
    borderRadius: 999,
    display: "inline-grid",
    placeItems: "center",
    background: "var(--panel-muted)",
    color: "var(--text-muted)",
    fontSize: 10,
    fontWeight: 900,
  },
  runTitle: {
    fontWeight: 850,
    whiteSpace: "nowrap",
  },
  inlineStatus: {
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  runDetails: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-muted)",
    fontWeight: 600,
  },
  runBody: {
    padding: 9,
    borderTop: "1px solid var(--line)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sectionShell: {
    border: "1px solid var(--line)",
    borderRadius: 7,
    background: "color-mix(in oklch, var(--panel-strong) 66%, var(--panel))",
  },
  sectionSummary: {
    cursor: "pointer",
    padding: "6px 8px",
    fontSize: 12,
    fontWeight: 800,
    color: "var(--text-strong)",
  },
  sectionCount: {
    color: "var(--text-muted)",
    fontWeight: 650,
  },
  sectionBody: {
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  toolShell: {
    border: "1px solid var(--line)",
    borderRadius: 6,
    background: "var(--panel)",
    overflow: "hidden",
  },
  toolSummary: {
    cursor: "pointer",
    padding: "6px 8px",
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    minWidth: 0,
  },
  toolIcon: {
    width: 18,
    height: 18,
    borderRadius: 5,
    display: "inline-grid",
    placeItems: "center",
    background: "var(--panel-muted)",
    color: "var(--text-muted)",
    fontSize: 10,
    fontWeight: 900,
    flexShrink: 0,
  },
  toolName: {
    color: "var(--text-strong)",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  toolMeta: {
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 650,
    whiteSpace: "nowrap",
  },
  toolPreview: {
    flexBasis: "100%",
    minWidth: 0,
    overflowWrap: "anywhere",
    whiteSpace: "normal",
    color: "var(--text-muted)",
    fontSize: 11,
  },
  toolBody: {
    padding: "6px 0 0",
    display: "grid",
    gap: 7,
  },
  stateShell: {
    border: "1px solid var(--line)",
    borderRadius: 6,
    background: "var(--panel)",
  },
  stateSummary: {
    cursor: "pointer",
    padding: "6px 8px",
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    fontWeight: 750,
    color: "var(--text-strong)",
  },
  statePreview: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 500,
  },
  stateBody: {
    padding: 8,
    display: "grid",
    gap: 6,
  },
  jsonSummary: {
    cursor: "pointer",
    fontSize: 11,
    color: "var(--text-muted)",
    fontWeight: 800,
  },
  jsonBlock: {
    maxHeight: 220,
    overflow: "auto",
    margin: "5px 0 0",
    padding: 8,
    borderRadius: 6,
    background: "oklch(20% 0.026 255)",
    color: "oklch(96% 0.008 255)",
    fontSize: 11,
    lineHeight: 1.45,
  },
  refs: {
    display: "flex",
    gap: 5,
    flexWrap: "wrap",
  },
  refPill: {
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "2px 7px",
    fontSize: 11,
    color: "var(--text-muted)",
    background: "var(--panel-strong)",
  },
  metaLine: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
  empty: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
  rawToggle: {
    alignSelf: "flex-start",
    border: "none",
    background: "transparent",
    borderRadius: 999,
    padding: "2px 0",
    fontSize: 11,
    color: "var(--text-muted)",
    cursor: "pointer",
  },
};
