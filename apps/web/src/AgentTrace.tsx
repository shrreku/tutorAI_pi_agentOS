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
  sequence: number;
};

export type LiveTraceStep = {
  id: string;
  content: string;
  status: "running" | "completed";
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  sequence: number;
};

export type LiveTraceRun = {
  id: string;
  status: "running" | "completed" | "failed";
  runType: string;
  model?: string | undefined;
  startedAt: number;
  completedAt?: number | undefined;
  nextSequence: number;
  tools: LiveTraceTool[];
  thinking: LiveTraceStep[];
  narration: LiveTraceStep[];
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

export type TutorActivityPhase = {
  id: string;
  label: string;
  status: string;
  duration?: string | undefined;
  detail?: string | undefined;
};

export type RuntimeWorkThinkingStep = {
  id: string;
  content: string;
  status: string;
  durationMs?: number;
};

export type RuntimeWorkNarrationStep = {
  id: string;
  content: string;
  status: string;
};

export type RuntimeWorkToolStep = {
  id: string;
  toolName: string;
  status: string;
  summary: string;
  lineTitle: string;
  detail?: string;
  latencyMs?: number | null;
};

export type RuntimeWorkStep =
  | ({ kind: "thought" } & RuntimeWorkThinkingStep & { order: number })
  | ({ kind: "narration" } & RuntimeWorkNarrationStep & { order: number })
  | ({ kind: "tool" } & RuntimeWorkToolStep & { order: number });

export type RuntimeWorkSegmentItem =
  | ({ kind: "thought" } & RuntimeWorkThinkingStep)
  | ({ kind: "tool" } & RuntimeWorkToolStep);

export type RuntimeWorkSegmentStep = {
  kind: "work-segment";
  id: string;
  order: number;
  status: string;
  items: RuntimeWorkSegmentItem[];
};

export type RuntimeWorkDisplayStep = RuntimeWorkStep | RuntimeWorkSegmentStep;

export type RuntimeWorkViewModel = {
  steps: RuntimeWorkStep[];
  runStatus: string;
  durationMs?: number | null;
};

type AgentTraceProps = {
  traceTurn: ChatTraceTurn | null;
  liveRun: LiveTraceRun | null;
  runStatus: "idle" | "running" | "completed" | "failed";
  assistantMessage?: string | null;
  showDiagnostics?: boolean;
  retryErrorMessage?: string | null;
  onRetry?: () => void;
};

export function AgentTrace({
  traceTurn,
  liveRun,
  runStatus,
  assistantMessage = null,
  showDiagnostics = false,
  retryErrorMessage = null,
  onRetry,
}: AgentTraceProps) {
  const traceView = useQuery({
    queryKey: ["agent-trace-view", traceTurn, liveRun, runStatus, showDiagnostics],
    queryFn: async () => buildTraceView(traceTurn, liveRun, runStatus, showDiagnostics),
    initialData: () => buildTraceView(traceTurn, liveRun, runStatus, showDiagnostics),
    staleTime: Infinity,
  });
  const runs = traceView.data?.runs ?? [];
  const summary = traceView.data?.summary ?? buildTraceSummary(runs, runStatus);
  const workView = React.useMemo(
    () => buildRuntimeWorkViewForDisplay(liveRun, runs, {
      assistantMessage: assistantMessage ?? traceTurn?.assistantMessage ?? null,
      stripFinalDuplicate: runStatus !== "running",
    }),
    [liveRun, runs, assistantMessage, traceTurn?.assistantMessage, runStatus],
  );
  const [open, setOpen] = React.useState(() => showDiagnostics || summary.status === "running" || summary.status === "failed");
  const [showRaw, setShowRaw] = React.useState(false);

  React.useEffect(() => {
    if (showDiagnostics) {
      setOpen(true);
      return;
    }
    if (summary.status === "running" || summary.status === "failed") {
      setOpen(true);
    } else if (summary.status === "completed") {
      setOpen(false);
    }
  }, [showDiagnostics, summary.status]);

  if (!summary.hasTrace) return null;

  if (!showDiagnostics) {
    if (!hasRuntimeWorkContent(workView) && runStatus !== "running" && runStatus !== "failed") return null;
    return (
      <CursorStyleWorkView
        model={workView}
        runStatus={runStatus}
        assistantMessage={assistantMessage ?? traceTurn?.assistantMessage ?? null}
        {...(retryErrorMessage ? { retryErrorMessage } : {})}
        {...(onRetry ? { onRetry } : {})}
      />
    );
  }

  const statusTone = getStatusTone(summary.status);
  const detailParts = traceView.data?.detailParts ?? [];
  const headerTitle = "Agent trace";
  const statusLabel = summary.status;

  return (
    <div style={styles.shell}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={styles.header}>
        <span aria-hidden="true" style={{ ...styles.chevron, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          &gt;
        </span>
        <span style={styles.title}>{headerTitle}</span>
        <span style={{ ...styles.statusPill, color: statusTone.text, background: statusTone.bg, borderColor: statusTone.border }}>
          {statusLabel}
        </span>
        <span style={styles.headerDetails}>{detailParts.join(" · ")}</span>
        {summary.elapsed && <span style={styles.elapsed}>{summary.elapsed}</span>}
      </button>

      {open && (
        <div style={styles.body}>
          <TraceActivityList runs={runs} showRaw={showRaw} showDiagnostics />
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

function buildTraceView(
  traceTurn: ChatTraceTurn | null,
  liveRun: LiveTraceRun | null,
  runStatus: "idle" | "running" | "completed" | "failed",
  showDiagnostics = false,
): TraceView {
  const runs = buildTraceRuns(traceTurn, liveRun, showDiagnostics);
  const summary = buildTraceSummary(runs, runStatus, showDiagnostics);
  const detailParts: string[] = [
    summary.runLabel,
    showDiagnostics ? summary.model : null,
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
    return current ?? {
      id: runId,
      status: "running",
      runType: fallbackRunType,
      startedAt: timestampFromChunk(chunk),
      nextSequence: 0,
      tools: [],
      thinking: [],
      narration: [],
    };
  }

  if (type === "RUN_STARTED") {
    const runId = typeof chunk.runId === "string" ? chunk.runId : current?.id ?? `live_${timestampFromChunk(chunk)}`;
    return {
      id: runId,
      status: "running",
      runType: fallbackRunType,
      model: typeof chunk.model === "string" ? chunk.model : current?.model,
      startedAt: current?.startedAt ?? timestampFromChunk(chunk),
      nextSequence: current?.nextSequence ?? 0,
      tools: current?.tools ?? [],
      thinking: current?.thinking ?? [],
      narration: current?.narration ?? [],
    };
  }

  if (!current) return current;

  if (type === "TOOL_CALL_START") {
    const toolCallId = typeof chunk.toolCallId === "string" ? chunk.toolCallId : null;
    const toolName = typeof chunk.toolName === "string" ? chunk.toolName : null;
    if (!toolCallId || !toolName) return current;
    const { sequence, nextSequence } = allocateSequence(current);
    return upsertLiveTool(
      { ...current, nextSequence },
      {
        id: toolCallId,
        toolName,
        status: "started",
        startedAt: timestampFromChunk(chunk),
        sequence,
      },
    );
  }

  if (type === "THINKING_START") {
    const thinkingId = typeof chunk.thinkingId === "string" ? chunk.thinkingId : `thinking_${timestampFromChunk(chunk)}`;
    if (current.thinking.some((step) => step.id === thinkingId && step.status === "running")) return current;
    const { sequence, nextSequence } = allocateSequence(current);
    return {
      ...current,
      nextSequence,
      thinking: [
        ...current.thinking,
        { id: thinkingId, content: "", status: "running", startedAt: timestampFromChunk(chunk), sequence },
      ],
    };
  }

  if (type === "THINKING_CONTENT") {
    const thinkingId = typeof chunk.thinkingId === "string"
      ? chunk.thinkingId
      : current.thinking.find((step) => step.status === "running")?.id;
    const delta = typeof chunk.delta === "string" ? chunk.delta : typeof chunk.content === "string" ? chunk.content : "";
    if (!thinkingId || !delta) return current;
    return {
      ...current,
      thinking: appendLiveStepContent(current.thinking, thinkingId, delta, timestampFromChunk(chunk), current.nextSequence),
    };
  }

  if (type === "THINKING_END") {
    const thinkingId = typeof chunk.thinkingId === "string"
      ? chunk.thinkingId
      : current.thinking.find((step) => step.status === "running")?.id;
    if (!thinkingId) return current;
    const content = typeof chunk.content === "string" ? chunk.content : "";
    return {
      ...current,
      thinking: completeLiveStep(
        current.thinking,
        thinkingId,
        content,
        timestampFromChunk(chunk),
        typeof chunk.durationMs === "number" ? chunk.durationMs : undefined,
        current.nextSequence,
      ),
    };
  }

  if (type === "RUNTIME_NARRATION_START") {
    const narrationId = typeof chunk.narrationId === "string" ? chunk.narrationId : `narration_${timestampFromChunk(chunk)}`;
    if (current.narration.some((step) => step.id === narrationId && step.status === "running")) return current;
    const { sequence, nextSequence } = allocateSequence(current);
    return {
      ...current,
      nextSequence,
      narration: [
        ...current.narration,
        { id: narrationId, content: "", status: "running", startedAt: timestampFromChunk(chunk), sequence },
      ],
    };
  }

  if (type === "RUNTIME_NARRATION_CONTENT") {
    const narrationId = typeof chunk.narrationId === "string"
      ? chunk.narrationId
      : current.narration.find((step) => step.status === "running")?.id;
    const delta = typeof chunk.delta === "string" ? chunk.delta : typeof chunk.content === "string" ? chunk.content : "";
    if (!narrationId || !delta) return current;
    return {
      ...current,
      narration: appendLiveStepContent(current.narration, narrationId, delta, timestampFromChunk(chunk), current.nextSequence),
    };
  }

  if (type === "RUNTIME_NARRATION_END") {
    const narrationId = typeof chunk.narrationId === "string"
      ? chunk.narrationId
      : current.narration.find((step) => step.status === "running")?.id;
    if (!narrationId) return current;
    const content = typeof chunk.content === "string" ? chunk.content : "";
    return {
      ...current,
      narration: completeLiveStep(
        current.narration,
        narrationId,
        content,
        timestampFromChunk(chunk),
        typeof chunk.durationMs === "number" ? chunk.durationMs : undefined,
        current.nextSequence,
      ),
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
    const existing = current.tools.find((tool) => tool.id === toolCallId);
    const { sequence, nextSequence } = existing ? { sequence: existing.sequence, nextSequence: current.nextSequence } : allocateSequence(current);
    return upsertLiveTool(
      { ...current, nextSequence },
      {
        id: toolCallId,
        toolName: toolName ?? "Tool call",
        status: "completed",
        input: normalizeJsonish(chunk.input),
        output: normalizeJsonish(chunk.result),
        startedAt: existing?.startedAt ?? timestampFromChunk(chunk),
        completedAt: timestampFromChunk(chunk),
        sequence,
      },
    );
  }

  if (type === "RUN_FINISHED") {
    return { ...current, status: "completed", completedAt: timestampFromChunk(chunk) };
  }

  if (type === "RUN_ERROR") {
    return { ...current, status: "failed", completedAt: timestampFromChunk(chunk) };
  }

  return current;
}

export function buildTraceSummary(
  runs: TraceRunView[],
  runStatus: "idle" | "running" | "completed" | "failed",
  showDiagnostics = false,
): TraceSummary {
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

export function buildTutorActivityPhases(runs: TraceRunView[]): TutorActivityPhase[] {
  const phases: TutorActivityPhase[] = buildRuntimeWorkView(runs).steps.map((step) => {
    if (step.kind === "thought") {
      return {
        id: step.id,
        label: "Thinking",
        status: step.status,
        duration: formatDuration(step.durationMs),
        detail: compactText(step.content, 120) || undefined,
      };
    }
    if (step.kind === "narration") {
      return {
        id: step.id,
        label: step.content,
        status: step.status,
      };
    }
    return {
      id: step.id,
      label: step.summary,
      status: step.status,
      ...(step.detail ? { detail: step.detail } : {}),
    };
  });

  const deduped: TutorActivityPhase[] = [];
  for (const phase of phases) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.label === phase.label && previous.status === phase.status) {
      deduped[deduped.length - 1] = {
        ...previous,
        duration: phase.duration ?? previous.duration,
        detail: mergePhaseDetail(previous.detail, phase.detail),
      };
    } else {
      deduped.push(phase);
    }
  }
  return deduped.slice(-5);
}

function runtimeToolStepKey(step: Extract<RuntimeWorkStep, { kind: "tool" }>): string {
  const prefixed = step.id.match(/:tool:(.+)$/);
  return prefixed?.[1] ?? step.id;
}

export function mergeRuntimeWorkViews(
  liveModel: RuntimeWorkViewModel,
  persistedModel: RuntimeWorkViewModel,
): RuntimeWorkViewModel {
  const merged: RuntimeWorkStep[] = [...persistedModel.steps];
  const toolKeys = new Set(
    persistedModel.steps
      .filter((step): step is Extract<RuntimeWorkStep, { kind: "tool" }> => step.kind === "tool")
      .map((step) => runtimeToolStepKey(step)),
  );
  const narrationKeys = new Set(
    persistedModel.steps
      .filter((step): step is Extract<RuntimeWorkStep, { kind: "narration" }> => step.kind === "narration")
      .map((step) => normalizeWorkText(step.content)),
  );
  const thoughtKeys = new Set(
    persistedModel.steps
      .filter((step): step is Extract<RuntimeWorkStep, { kind: "thought" }> => step.kind === "thought")
      .map((step) => normalizeWorkText(step.content))
      .filter(Boolean),
  );

  for (const step of liveModel.steps) {
    if (step.kind === "tool") {
      const key = runtimeToolStepKey(step);
      if (toolKeys.has(key)) continue;
      toolKeys.add(key);
      merged.push(step);
      continue;
    }
    if (step.kind === "narration") {
      const key = normalizeWorkText(step.content);
      if (!key || narrationKeys.has(key)) continue;
      narrationKeys.add(key);
      merged.push(step);
      continue;
    }
    const key = normalizeWorkText(step.content);
    if (key && thoughtKeys.has(key)) continue;
    if (key) thoughtKeys.add(key);
    merged.push(step);
  }

  const durationMs = liveModel.durationMs ?? persistedModel.durationMs;
  return {
    steps: dedupeRuntimeWorkSteps(sortRuntimeWorkSteps(merged)),
    runStatus: liveModel.runStatus === "running" ? liveModel.runStatus : persistedModel.runStatus,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

export function buildRuntimeWorkViewForDisplay(
  liveRun: LiveTraceRun | null,
  runs: TraceRunView[],
  options?: {
    assistantMessage?: string | null;
    stripFinalDuplicate?: boolean;
  },
): RuntimeWorkViewModel {
  const persistedModel = buildRuntimeWorkView(runs);
  let model: RuntimeWorkViewModel;
  if (!liveRun) {
    model = persistedModel;
  } else if (liveRun.status === "running") {
    model = buildRuntimeWorkViewFromLiveRun(liveRun);
  } else {
    model = mergeRuntimeWorkViews(buildRuntimeWorkViewFromLiveRun(liveRun), persistedModel);
  }
  if (options?.stripFinalDuplicate) {
    model = {
      ...model,
      steps: withoutFinalAssistantNarrations(model.steps, options.assistantMessage),
    };
  }
  return model;
}

export function buildRuntimeWorkViewFromLiveRun(run: LiveTraceRun): RuntimeWorkViewModel {
  const ordered: RuntimeWorkStep[] = [];

  for (const step of run.thinking) {
    const content = normalizeWorkText(step.content);
    if (!content && step.status !== "running") continue;
    ordered.push({
      kind: "thought",
      id: step.id,
      content,
      status: step.status,
      order: resolveLiveWorkOrder(step.sequence, step.startedAt),
      ...(typeof step.durationMs === "number" ? { durationMs: step.durationMs } : {}),
    });
  }

  for (const step of run.narration) {
    const content = normalizeWorkText(step.content);
    if (!content || isPlaceholderNarration(content)) continue;
    ordered.push({
      kind: "narration",
      id: step.id,
      content,
      status: step.status,
      order: resolveLiveWorkOrder(step.sequence, step.startedAt),
    });
  }

  for (const tool of run.tools) {
    ordered.push({
      kind: "tool",
      order: resolveLiveWorkOrder(tool.sequence, tool.startedAt),
      ...buildToolWorkStep({
        id: tool.id,
        toolName: tool.toolName,
        status: tool.status,
        input: tool.input,
        output: tool.output,
        latencyMs: tool.completedAt ? Math.max(0, tool.completedAt - tool.startedAt) : null,
      }),
    });
  }

  return {
    steps: dedupeRuntimeWorkSteps(sortRuntimeWorkSteps(ordered)),
    runStatus: run.status,
    durationMs: computeLiveWorkDurationMs(run),
  };
}

function buildPersistedRunWorkSteps(run: TraceRunView): RuntimeWorkStep[] {
  const steps: RuntimeWorkStep[] = [];
  const narrationIds = new Set<string>();
  let fallbackOrder = 0;

  for (const event of run.thinking) {
    if (isNarrationTraceEvent(event.eventType)) {
      const content = eventTextFromPayload(event.payload, event.summary);
      if (!content || isPlaceholderNarration(content)) continue;
      narrationIds.add(event.id);
      steps.push({
        kind: "narration",
        id: `${run.id}:narration:${event.id}`,
        content,
        status: event.status ?? "completed",
        order: orderFromTraceTimestamp(event.timestamp, fallbackOrder++),
      });
      continue;
    }
    if (event.eventType !== "agent.thinking.completed") continue;
    const payload = isJsonRecord(event.payload) ? event.payload : {};
    const content = eventTextFromPayload(event.payload, event.summary);
    const status = event.status ?? "completed";
    if (!content && status !== "thinking" && status !== "running") continue;
    steps.push({
      kind: "thought",
      id: `${run.id}:thinking:${event.id}`,
      content,
      status,
      order: orderFromTraceTimestamp(event.timestamp, fallbackOrder++),
      ...(typeof payload.durationMs === "number" ? { durationMs: payload.durationMs } : {}),
    });
  }

  for (const event of [...run.stateChanges, ...run.rawEvents]) {
    if (!isNarrationTraceEvent(event.eventType) || narrationIds.has(event.id)) continue;
    const content = eventTextFromPayload(event.payload, event.summary);
    if (!content || isPlaceholderNarration(content)) continue;
    steps.push({
      kind: "narration",
      id: `${run.id}:narration:${event.id}`,
      content,
      status: event.status ?? "completed",
      order: orderFromTraceTimestamp(event.timestamp, fallbackOrder++),
    });
  }

  for (const tool of run.tools) {
    const described = buildToolWorkStep({
      id: `${run.id}:tool:${tool.id}`,
      toolName: tool.toolName,
      status: tool.status,
      input: tool.input,
      output: tool.output,
      ...(tool.latencyMs !== undefined ? { latencyMs: tool.latencyMs } : {}),
    });
    steps.push({
      kind: "tool",
      ...described,
      order: orderFromTraceTimestamp(tool.createdAt ?? run.startedAt, fallbackOrder++),
    });
  }

  return sortRuntimeWorkSteps(steps);
}

export function buildRuntimeWorkView(runs: TraceRunView[]): RuntimeWorkViewModel {
  const steps = runs.flatMap((run) => buildPersistedRunWorkSteps(run));
  const latestRun = runs[runs.length - 1];
  return {
    steps: dedupeRuntimeWorkSteps(steps),
    runStatus: latestRun?.status ?? "idle",
    durationMs: latestRun ? resolveDurationMs(latestRun) : null,
  };
}

function hasRuntimeWorkContent(model: RuntimeWorkViewModel): boolean {
  return model.steps.length > 0;
}

function CursorStyleWorkView({
  model,
  runStatus,
  assistantMessage = null,
  retryErrorMessage,
  onRetry,
}: {
  model: RuntimeWorkViewModel;
  runStatus: AgentTraceProps["runStatus"];
  assistantMessage?: string | null;
  retryErrorMessage?: string | null;
  onRetry?: () => void;
}) {
  const activeRun = runStatus === "running" || model.runStatus === "running";
  const runSucceeded = runStatus === "completed" || (!activeRun && model.runStatus === "completed");
  const runFailed = runStatus === "failed" || (!activeRun && model.runStatus === "failed");
  const displayStatus = activeRun ? "running" : runSucceeded ? "completed" : runFailed ? "failed" : model.runStatus;
  const displaySteps = groupRuntimeSteps(model.steps);
  const focus = resolveStreamingWorkFocus(displaySteps, {
    activeRun,
    assistantMessage,
    workSteps: model.steps,
  });
  // Keep details open when actively running or when run failed (so failed tools remain visible)
  const isOpen = activeRun || runFailed;

  return (
    <details
      className="tutor-runtime-work-shell"
      data-status={displayStatus}
      open={isOpen}
    >
      <summary className="tutor-runtime-work-shell-summary">{formatWorkShellSummary(model, activeRun)}</summary>
      <div className="tutor-runtime-work" data-status={displayStatus}>
        {displaySteps.map((step) => {
          if (step.kind === "narration") {
            return (
              <p key={step.id} className="tutor-runtime-narration" data-status={step.status}>
                {step.content}
              </p>
            );
          }
          if (step.kind !== "work-segment") return null;
          return (
            <div key={step.id} className="tutor-runtime-work-beat" data-status={resolveWorkBeatStatus(step.items, runSucceeded)}>
              {step.items.map((item: RuntimeWorkSegmentItem) => (
                item.kind === "thought"
                  ? (
                    <details
                      key={item.id}
                      className="tutor-runtime-thought"
                      open={shouldWorkItemBeOpen(item.id, activeRun, focus, step.id)}
                    >
                      <summary className="tutor-runtime-thought-summary">{formatThoughtSummary(item)}</summary>
                      {item.content ? <div className="tutor-runtime-thought-body">{item.content}</div> : null}
                    </details>
                  )
                  : (
                    <details
                      key={item.id}
                      className="tutor-runtime-tool-line"
                      data-status={item.status}
                      open={shouldWorkItemBeOpen(item.id, activeRun, focus, step.id)}
                    >
                      <summary className="tutor-runtime-tool-line-summary">{item.lineTitle}</summary>
                      {item.detail ? <div className="tutor-runtime-tool-line-detail">{item.detail}</div> : null}
                    </details>
                  )
              ))}
            </div>
          );
        })}

        {runStatus === "failed" ? (
          <div className="tutor-runtime-error-banner">
            <p className="tutor-runtime-error">
              {retryErrorMessage ?? "The tutor run failed before it could finish."}
            </p>
            {onRetry ? (
              <button type="button" className="tutor-runtime-retry-button" onClick={onRetry}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function resolveWorkBeatStatus(items: RuntimeWorkSegmentItem[], runSucceeded: boolean): string {
  if (items.some((item) => isStreamingWorkItem(item))) return "running";
  if (!runSucceeded && items.some((item) => item.kind === "tool" && isFailureStatus(item.status))) return "failed";
  return "completed";
}

export function groupRuntimeSteps(steps: RuntimeWorkStep[]): RuntimeWorkDisplayStep[] {
  const grouped: RuntimeWorkDisplayStep[] = [];
  let pendingWork: RuntimeWorkSegmentItem[] = [];
  let pendingOrder = 0;

  const flushWork = () => {
    if (!pendingWork.length) return;
    const items = pendingWork;
    pendingWork = [];
    const thoughts = items.filter((item): item is Extract<RuntimeWorkSegmentItem, { kind: "thought" }> => item.kind === "thought");
    const tools = items.filter((item): item is Extract<RuntimeWorkSegmentItem, { kind: "tool" }> => item.kind === "tool");
    grouped.push({
      kind: "work-segment",
      id: `work-segment:${items.map((item) => item.id).join(":")}`,
      order: pendingOrder,
      status: resolveGroupedWorkSegmentStatus(thoughts, tools),
      items,
    });
  };

  for (const step of steps) {
    if (step.kind === "thought") {
      if (!pendingWork.length) pendingOrder = step.order;
      const { order: _order, kind, ...thought } = step;
      pendingWork.push({ kind: "thought", ...thought });
      continue;
    }
    if (step.kind === "tool") {
      if (!pendingWork.length) pendingOrder = step.order;
      const { order: _order, kind, ...tool } = step;
      pendingWork.push({ kind: "tool", ...tool });
      continue;
    }
    flushWork();
    grouped.push(step);
  }
  flushWork();
  return grouped;
}

function resolveGroupedWorkSegmentStatus(
  thoughts: Array<Extract<RuntimeWorkSegmentItem, { kind: "thought" }>>,
  tools: Array<Extract<RuntimeWorkSegmentItem, { kind: "tool" }>>,
): string {
  if (
    thoughts.some((thought) => thought.status === "running" || thought.status === "thinking")
    || tools.some((tool) => tool.status === "started" || tool.status === "running")
  ) {
    return "running";
  }
  return "completed";
}

function dedupeRuntimeWorkSteps(steps: RuntimeWorkStep[]): RuntimeWorkStep[] {
  const seenNarration = new Set<string>();
  const seenThought = new Set<string>();
  const deduped: RuntimeWorkStep[] = [];

  for (const step of steps) {
    if (step.kind === "narration") {
      const key = normalizeWorkText(step.content);
      if (!key || seenNarration.has(key)) continue;
      seenNarration.add(key);
      deduped.push(step);
      continue;
    }
    if (step.kind === "thought") {
      const key = normalizeWorkText(step.content);
      if (key && seenThought.has(key)) continue;
      if (key) seenThought.add(key);
      deduped.push(step);
      continue;
    }
    deduped.push(step);
  }

  return deduped;
}

function dedupeTraceEventsById(events: ChatTraceStateChange[]): ChatTraceStateChange[] {
  const seen = new Set<string>();
  const deduped: ChatTraceStateChange[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    deduped.push(event);
  }
  return deduped;
}

function formatWorkShellSummary(model: RuntimeWorkViewModel, activeRun: boolean): string {
  if (activeRun) return "Working";
  const duration = formatDuration(model.durationMs);
  if (model.runStatus === "failed") {
    return duration ? `Failed · ${duration}` : "Failed";
  }
  return duration ? `Worked · ${duration}` : "Worked";
}

export type StreamingWorkFocus = {
  activeItemId: string | null;
  settledBeatIds: Set<string>;
};

export function resolveStreamingWorkFocus(
  displaySteps: RuntimeWorkDisplayStep[],
  options: {
    activeRun: boolean;
    assistantMessage?: string | null;
    workSteps: RuntimeWorkStep[];
  },
): StreamingWorkFocus {
  const beats = listWorkBeats(displaySteps);
  const settledBeatIds = beats
    .filter(({ index, beat }) => displaySteps.slice(index + 1).some((step) => step.kind === "narration"))
    .map(({ beat }) => beat.id);

  if (!options.activeRun || isFinalResponseStreaming(options.assistantMessage, options.workSteps)) {
    return { activeItemId: null, settledBeatIds: new Set(beats.map(({ beat }) => beat.id)) };
  }

  const settled = new Set(settledBeatIds);
  let activeItemId: string | null = null;

  for (const { beat } of beats) {
    if (settled.has(beat.id)) continue;
    for (const item of beat.items) {
      if (isStreamingWorkItem(item)) activeItemId = item.id;
    }
  }

  if (!activeItemId) {
    for (let index = beats.length - 1; index >= 0; index -= 1) {
      const { beat } = beats[index]!;
      if (settled.has(beat.id)) continue;
      activeItemId = beat.items[beat.items.length - 1]?.id ?? null;
      break;
    }
  }

  return { activeItemId, settledBeatIds: settled };
}

function listWorkBeats(displaySteps: RuntimeWorkDisplayStep[]): Array<{ beat: RuntimeWorkSegmentStep; index: number }> {
  return displaySteps.flatMap((step, index) => (
    step.kind === "work-segment" ? [{ beat: step, index }] : []
  ));
}

function isFinalResponseStreaming(assistantMessage: string | null | undefined, workSteps: RuntimeWorkStep[]): boolean {
  if (!normalizeWorkText(assistantMessage ?? "")) return false;
  return !hasStreamingWorkActivity(workSteps);
}

function hasStreamingWorkActivity(workSteps: RuntimeWorkStep[]): boolean {
  return workSteps.some((step) => {
    if (step.kind === "narration") return step.status === "running";
    if (step.kind === "thought") return step.status === "running" || step.status === "thinking";
    if (step.kind === "tool") return step.status === "started" || step.status === "running";
    return false;
  });
}

function isStreamingWorkItem(item: RuntimeWorkSegmentItem): boolean {
  if (item.kind === "thought") {
    return item.status === "running" || item.status === "thinking";
  }
  return item.status === "started" || item.status === "running";
}

function shouldWorkItemBeOpen(
  itemId: string,
  activeRun: boolean,
  focus: StreamingWorkFocus,
  beatId: string,
): boolean {
  if (!activeRun) return false;
  if (focus.settledBeatIds.has(beatId)) return false;
  return itemId === focus.activeItemId;
}

function computeLiveWorkDurationMs(run: LiveTraceRun): number | null {
  if (run.completedAt) return Math.max(0, run.completedAt - run.startedAt);
  if (run.status === "running") return Math.max(0, Date.now() - run.startedAt);
  return null;
}

function formatThoughtSummary(step: RuntimeWorkThinkingStep): string {
  if (step.status === "running" || step.status === "thinking") return "Thinking";
  const duration = typeof step.durationMs === "number" ? formatDuration(step.durationMs) : undefined;
  return duration ? `Thought · ${duration}` : "Thought";
}

function isPlaceholderNarration(content: string): boolean {
  const normalized = content.trim();
  return normalized === "[steered]" || normalized === "[follow-up]";
}

function allocateSequence(run: LiveTraceRun): { sequence: number; nextSequence: number } {
  const sequence = run.nextSequence;
  return { sequence, nextSequence: sequence + 1 };
}

function resolveLiveWorkOrder(sequence: number | undefined, startedAt: number | undefined): number {
  if (typeof startedAt === "number" && startedAt > 1_000_000_000_000) {
    return startedAt + (typeof sequence === "number" ? sequence * 0.001 : 0);
  }
  if (typeof startedAt === "number" && typeof sequence === "number") {
    return startedAt + sequence;
  }
  if (typeof sequence === "number") return sequence;
  return typeof startedAt === "number" ? startedAt : 0;
}

function sortRuntimeWorkSteps(steps: RuntimeWorkStep[]): RuntimeWorkStep[] {
  return [...steps].sort((left, right) => left.order - right.order);
}

function orderFromTraceTimestamp(timestamp: string | number | undefined, fallback: number): number {
  const value = timestampValue(timestamp ?? 0);
  return value > 0 ? value : fallback;
}

function normalizeWorkText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function eventTextFromPayload(payload: unknown, summary?: string): string {
  if (typeof payload === "string") return normalizeWorkText(payload);
  if (isJsonRecord(payload) && typeof payload.text === "string") return normalizeWorkText(payload.text);
  const extracted = extractEventText(payload);
  return extracted ? normalizeWorkText(extracted) : normalizeWorkText(summary ?? "");
}

function buildToolWorkStep(tool: {
  id: string;
  toolName: string;
  status: string;
  input?: unknown;
  output?: unknown;
  latencyMs?: number | null;
}): RuntimeWorkToolStep {
  const described = describeToolWork(tool);
  return {
    id: tool.id,
    toolName: tool.toolName,
    status: tool.status,
    summary: described.summary,
    lineTitle: described.lineTitle,
    ...(tool.latencyMs !== undefined ? { latencyMs: tool.latencyMs } : {}),
    ...(described.detail ? { detail: described.detail } : {}),
  };
}

function describeToolWork(tool: {
  toolName: string;
  status: string;
  input?: unknown;
  output?: unknown;
  latencyMs?: number | null;
}): { summary: string; lineTitle: string; detail?: string } {
  const raw = tool.toolName.toLowerCase();
  const input = asRecord(tool.input);
  const output = asRecord(tool.output);
  const inProgress = tool.status === "started" || tool.status === "running";
  const latency = tool.latencyMs != null ? formatDuration(tool.latencyMs) : undefined;
  const latencySuffix = latency ? ` · ${latency}` : "";

  if (raw.includes("get_span")) {
    const citation = asRecord(output.citation);
    const sourceTitle =
      typeof citation.sourceTitle === "string"
        ? citation.sourceTitle
        : typeof input.sourceId === "string"
          ? input.sourceId
          : "source";
    const sourceType = formatSourceType(citation.sourceType);
    const pages = formatPageRange(input, output);
    const text = typeof output.text === "string" ? output.text.trim() : "";
    const lineTitle = `${sourceTitle} · ${sourceType}${pages ? ` · ${pages}` : ""}${latencySuffix}`;
    return {
      summary: `${inProgress ? "Reading" : "Read"} span · ${sourceTitle}${latencySuffix}`,
      lineTitle,
      ...(text ? { detail: compactText(text, 900) } : {}),
    };
  }

  if (raw.includes("wiki.search") || (raw.includes("search") && !raw.includes("get_span"))) {
    const query = extractToolQuery(input);
    const results = Array.isArray(output.results) ? output.results : [];
    const retrievalMode = typeof output.retrievalMode === "string" ? output.retrievalMode : undefined;
    const fallbackReason = typeof output.fallbackReason === "string" ? output.fallbackReason : undefined;
    const verb = inProgress ? "Searching" : "Searched";
    const summary = query
      ? `${verb} · "${compactText(query, 72)}"${results.length ? ` · ${results.length} results` : ""}${latencySuffix}`
      : `${verb} notebook${results.length ? ` · ${results.length} results` : ""}${latencySuffix}`;
    const lineTitle = query ? `${verb} · "${compactText(query, 72)}"${latencySuffix}` : `${verb} notebook${latencySuffix}`;
    const lines = results.slice(0, 6).map((row) => {
      const record = asRecord(row);
      const title = typeof record.title === "string" ? record.title : typeof record.refId === "string" ? record.refId : "result";
      const snippet = typeof record.snippet === "string" ? compactText(record.snippet, 120) : "";
      return snippet ? `· ${title} — ${snippet}` : `· ${title}`;
    });
    const meta = [retrievalMode, fallbackReason ? `fallback: ${fallbackReason}` : null].filter(Boolean).join(" · ");
    const detail = [...(meta ? [meta] : []), ...lines].join("\n");
    return detail ? { summary, lineTitle, detail } : { summary, lineTitle };
  }

  if (raw.includes("wiki.get_page") || raw.includes("wiki.get")) {
    const page = asRecord(output.page);
    const title = typeof page.title === "string" ? page.title : typeof input.pageId === "string" ? input.pageId : "wiki page";
    const pageType = typeof page.pageType === "string" ? page.pageType.replace(/_/g, " ") : "wiki";
    const markdown = typeof page.markdown === "string" ? page.markdown.trim() : "";
    const lineTitle = `${title} · ${pageType}${latencySuffix}`;
    return {
      summary: `Read wiki page · ${title}${latencySuffix}`,
      lineTitle,
      ...(markdown ? { detail: compactText(markdown, 900) } : {}),
    };
  }

  if (raw.includes("study_plan.get_current")) {
    const module = asRecord(output.module);
    const sessionPlan = asRecord(output.sessionPlan);
    const studyPlan = asRecord(output.studyPlan);
    const moduleTitle = typeof module.title === "string" ? module.title : undefined;
    const sessionGoal = typeof sessionPlan.sessionGoal === "string" ? sessionPlan.sessionGoal : undefined;
    const currentObjectiveId = typeof studyPlan.currentObjectiveId === "string" ? studyPlan.currentObjectiveId : undefined;
    const lineTitle = `Study plan${moduleTitle ? ` · ${moduleTitle}` : ""}${latencySuffix}`;
    const detail = [
      moduleTitle ? `Module: ${moduleTitle}` : null,
      sessionGoal ? `Session goal: ${compactText(sessionGoal, 180)}` : null,
      currentObjectiveId ? `Current objective: ${currentObjectiveId}` : null,
    ].filter(Boolean).join("\n");
    return {
      summary: `${inProgress ? "Checking" : "Checked"} study plan${latencySuffix}`,
      lineTitle,
      ...(detail ? { detail } : {}),
    };
  }

  if (raw.includes("learning.get_state")) {
    const conceptStates = Array.isArray(output.conceptStates) ? output.conceptStates : [];
    const lineTitle = `Learning state · ${conceptStates.length} concept${conceptStates.length === 1 ? "" : "s"}${latencySuffix}`;
    const detail = conceptStates.slice(0, 6).map((row) => {
      const record = asRecord(row);
      const conceptId = typeof record.conceptId === "string" ? record.conceptId : "concept";
      const mastery = typeof record.masteryScore === "number" ? record.masteryScore.toFixed(2) : "?";
      const confidence = typeof record.confidence === "number" ? record.confidence.toFixed(2) : "?";
      return `· ${conceptId} · mastery ${mastery} · confidence ${confidence}`;
    }).join("\n");
    return {
      summary: `${inProgress ? "Checking" : "Checked"} learning state · ${conceptStates.length} concepts${latencySuffix}`,
      lineTitle,
      ...(detail ? { detail } : {}),
    };
  }

  if (raw.includes("notebook.get_context") || raw.includes("notebook_get")) {
    const notebook = asRecord(output.notebook);
    const title = typeof notebook.title === "string" ? notebook.title : "notebook";
    const goal = typeof notebook.goal === "string" ? notebook.goal : undefined;
    const selectedRefs = Array.isArray(output.selectedNodeRefs) ? output.selectedNodeRefs.length : 0;
    const recentEvents = Array.isArray(output.recentEvents) ? output.recentEvents.length : 0;
    const lineTitle = `${title} · notebook${latencySuffix}`;
    const detail = [
      goal ? `Goal: ${compactText(goal, 180)}` : null,
      selectedRefs ? `Selected refs: ${selectedRefs}` : null,
      recentEvents ? `Recent activity: ${recentEvents} events` : null,
    ].filter(Boolean).join("\n");
    return {
      summary: `Loaded notebook · ${title}${latencySuffix}`,
      lineTitle,
      ...(detail ? { detail } : {}),
    };
  }

  if (raw.includes("curriculum.get")) {
    const curriculum = asRecord(output.curriculum);
    const title = typeof curriculum.title === "string" ? curriculum.title : "curriculum";
    const status = typeof curriculum.status === "string" ? curriculum.status : undefined;
    const objectives = Array.isArray(curriculum.objectiveIds) ? curriculum.objectiveIds.length : undefined;
    const lineTitle = `${title} · curriculum${latencySuffix}`;
    const detail = [
      status ? `Status: ${status}` : null,
      objectives != null ? `Objectives: ${objectives}` : null,
    ].filter(Boolean).join("\n");
    return {
      summary: `Loaded curriculum · ${title}${latencySuffix}`,
      lineTitle,
      ...(detail ? { detail } : {}),
    };
  }

  if (raw.includes("student_profile.get")) {
    const profile = asRecord(output.profile ?? output.studentProfile);
    const goal = typeof profile.goalSummary === "string" ? profile.goalSummary : undefined;
    const pace = typeof profile.pacePreference === "string" ? profile.pacePreference : undefined;
    const lineTitle = `Learner profile${latencySuffix}`;
    const detail = [
      goal ? `Goal: ${compactText(goal, 180)}` : null,
      pace ? `Pace: ${pace}` : null,
    ].filter(Boolean).join("\n");
    return {
      summary: `Loaded learner profile${latencySuffix}`,
      lineTitle,
      ...(detail ? { detail } : {}),
    };
  }

  if (raw.includes("graph.get_study_map") || raw.includes("study_map")) {
    const nodes = Array.isArray(output.nodes) ? output.nodes.length : undefined;
    const lineTitle = `Study map${nodes != null ? ` · ${nodes} nodes` : ""}${latencySuffix}`;
    const detail = formatGraphPreview(output);
    return {
      summary: `Opened study map${nodes != null ? ` · ${nodes} nodes` : ""}${latencySuffix}`,
      lineTitle,
      ...(detail ? { detail } : {}),
    };
  }

  if (raw.includes("graph")) {
    const nodes = Array.isArray(output.nodes) ? output.nodes.length : undefined;
    const edges = Array.isArray(output.edges) ? output.edges.length : undefined;
    const lineTitle = `Graph${nodes != null ? ` · ${nodes} nodes` : ""}${edges != null ? ` · ${edges} edges` : ""}${latencySuffix}`;
    const detail = formatGraphPreview(output);
    return {
      summary: `Checked graph${nodes != null ? ` · ${nodes} nodes` : ""}${edges != null ? ` · ${edges} edges` : ""}${latencySuffix}`,
      lineTitle,
      ...(detail ? { detail } : {}),
    };
  }

  if (raw.includes("session_plan.update")) {
    const title = typeof input.title === "string" ? input.title : typeof output.title === "string" ? output.title : "session plan";
    const goal = typeof input.sessionGoal === "string" ? input.sessionGoal : typeof output.sessionGoal === "string" ? output.sessionGoal : undefined;
    const lineTitle = `Session plan · ${title}${latencySuffix}`;
    return {
      summary: `${inProgress ? "Updating" : "Updated"} session plan · ${title}${latencySuffix}`,
      lineTitle,
      ...(goal ? { detail: compactText(goal, 220) } : {}),
    };
  }

  if (raw.includes("objective.update") || raw.includes("module.update") || raw.includes("objective_list.") || raw.includes(".update")) {
    const label = formatToolLabel(tool.toolName);
    const target =
      typeof input.title === "string"
        ? input.title
        : typeof output.title === "string"
          ? output.title
          : typeof input.objectiveId === "string"
            ? input.objectiveId
            : typeof input.moduleId === "string"
              ? input.moduleId
              : typeof input.sessionGoal === "string"
                ? compactText(input.sessionGoal, 72)
                : undefined;
    const status = typeof input.status === "string" ? input.status : typeof output.status === "string" ? output.status : undefined;
    const lineTitle = `${label}${target ? ` · ${target}` : ""}${latencySuffix}`;
    return {
      summary: `${inProgress ? "Updating" : "Updated"} ${label}${target ? ` · ${target}` : ""}${latencySuffix}`,
      lineTitle,
      ...(status ? { detail: `Status: ${status}` } : {}),
    };
  }

  if (raw.includes("create_quiz")) {
    const title = typeof output.title === "string" ? output.title : typeof input.title === "string" ? input.title : "quiz";
    const artifactId = typeof output.artifactId === "string" ? output.artifactId : undefined;
    const verb = inProgress ? "Generating" : "Generated";
    const lineTitle = `Quiz · ${title}${latencySuffix}`;
    const detail = artifactId ? `artifact: ${artifactId}` : undefined;
    return { summary: `${verb} quiz · ${title}${latencySuffix}`, lineTitle, ...(detail ? { detail } : {}) };
  }

  if (raw.includes("create_flashcard")) {
    const cards = Array.isArray(output.cards) ? output.cards.length : undefined;
    const title = typeof output.title === "string" ? output.title : typeof input.title === "string" ? input.title : "flashcards";
    const artifactId = typeof output.artifactId === "string" ? output.artifactId : undefined;
    const verb = inProgress ? "Generating" : "Generated";
    const lineTitle = `${title}${cards != null ? ` · ${cards} cards` : ""}${latencySuffix}`;
    const detail = artifactId ? `artifact: ${artifactId}` : undefined;
    return { summary: `${verb} flashcards${cards != null ? ` · ${cards} cards` : ""}${latencySuffix}`, lineTitle, ...(detail ? { detail } : {}) };
  }

  if (raw.includes("create_note")) {
    const title = typeof output.title === "string" ? output.title : typeof input.title === "string" ? input.title : "note";
    const markdown = typeof output.markdown === "string" ? output.markdown.trim() : "";
    const artifactId = typeof output.artifactId === "string" ? output.artifactId : undefined;
    const verb = inProgress ? "Generating" : "Generated";
    const lineTitle = `Note · ${title}${latencySuffix}`;
    return {
      summary: `${verb} note · ${title}${latencySuffix}`,
      lineTitle,
      ...(markdown ? { detail: compactText(markdown, 900) } : artifactId ? { detail: `artifact: ${artifactId}` } : {}),
    };
  }

  if (raw.includes("create_worked_example") || raw.includes("create_formula_sheet") || raw.includes("create_comparison_page") || raw.includes("create_concept_card")) {
    const title = typeof output.title === "string" ? output.title : typeof input.title === "string" ? input.title : "artifact";
    const artifactId = typeof output.artifactId === "string" ? output.artifactId : undefined;
    const verb = inProgress ? "Generating" : "Generated";
    const artifactType = raw.includes("worked_example") ? "worked example" : raw.includes("formula_sheet") ? "formula sheet" : raw.includes("comparison_page") ? "comparison" : "concept card";
    const lineTitle = `${verb} ${artifactType} · ${title}${latencySuffix}`;
    return { summary: `${verb} ${artifactType} · ${title}${latencySuffix}`, lineTitle, ...(artifactId ? { detail: `artifact: ${artifactId}` } : {}) };
  }

  if (raw.includes("artifact.insert_into_tutor_context")) {
    const artifactId = typeof input.artifactId === "string" ? input.artifactId : "artifact";
    const verb = inProgress ? "Inserting" : "Inserted";
    const lineTitle = `${verb} artifact into context · ${artifactId}${latencySuffix}`;
    return { summary: `${verb} artifact · ${artifactId}${latencySuffix}`, lineTitle };
  }

  if (raw.includes("artifact")) {
    const title = typeof output.title === "string" ? output.title : typeof input.title === "string" ? input.title : "artifact";
    const artifactId = typeof output.artifactId === "string" ? output.artifactId : undefined;
    const isCreate = raw.includes("create");
    const verb = isCreate ? (inProgress ? "Generating" : "Generated") : (inProgress ? "Updating" : "Updated");
    const lineTitle = `${verb} artifact · ${title}${latencySuffix}`;
    return { summary: `${verb} artifact · ${title}${latencySuffix}`, lineTitle, ...(artifactId ? { detail: `artifact: ${artifactId}` } : {}) };
  }

  if (raw.includes("evaluate_response") || raw.includes("learning.evaluate")) {
    const objectiveId = typeof input.objectiveId === "string" ? input.objectiveId : undefined;
    const correctnessLabel = typeof output.correctnessLabel === "string" ? output.correctnessLabel : undefined;
    const intervention = typeof output.tutoringIntervention === "string" ? output.tutoringIntervention : undefined;
    const lineTitle = `Mastery evaluation${objectiveId ? ` · ${objectiveId}` : ""}${latencySuffix}`;
    const detail = correctnessLabel
      ? [correctnessLabel, intervention].filter(Boolean).join(" → ") + (formatRecordPreview(output) ? `\n${formatRecordPreview(output)}` : "")
      : formatRecordPreview(output);
    return {
      summary: `Evaluated learner response${latencySuffix}`,
      lineTitle,
      ...(detail ? { detail } : {}),
    };
  }

  if (raw.includes("coverage.mark_introduced") || raw.includes("coverage.mark_checked")) {
    const coverageItemId = typeof input.coverageItemId === "string" ? input.coverageItemId : typeof input.itemId === "string" ? input.itemId : undefined;
    const verb = raw.includes("mark_introduced") ? (inProgress ? "Marking" : "Marked") + " introduced" : (inProgress ? "Marking" : "Marked") + " checked";
    const lineTitle = `${verb}${coverageItemId ? ` · ${coverageItemId}` : ""}${latencySuffix}`;
    return { summary: `${verb}${latencySuffix}`, lineTitle };
  }

  if (raw.includes("coverage.get_gaps")) {
    const gaps = Array.isArray(output.gaps) ? output.gaps.length : undefined;
    const lineTitle = `Coverage gaps${gaps != null ? ` · ${gaps} gaps` : ""}${latencySuffix}`;
    return {
      summary: `${inProgress ? "Checking" : "Checked"} coverage gaps${gaps != null ? ` · ${gaps}` : ""}${latencySuffix}`,
      lineTitle,
    };
  }

  if (raw.includes("curriculum.activate")) {
    const curriculumId = typeof input.curriculumId === "string" ? input.curriculumId : undefined;
    const lineTitle = `Activate curriculum${curriculumId ? ` · ${curriculumId}` : ""}${latencySuffix}`;
    return { summary: `${inProgress ? "Activating" : "Activated"} curriculum${latencySuffix}`, lineTitle };
  }

  if (raw.includes("learner_trait.record_signal")) {
    const trait = typeof input.trait === "string" ? input.trait : undefined;
    const value = typeof input.value === "string" || typeof input.value === "number" ? String(input.value) : undefined;
    const lineTitle = `Learner trait${trait ? ` · ${trait}` : ""}${value ? ` = ${value}` : ""}${latencySuffix}`;
    return { summary: `${inProgress ? "Recording" : "Recorded"} learner trait${trait ? ` · ${trait}` : ""}${latencySuffix}`, lineTitle };
  }

  if (raw.includes("student_profile.update_preferences")) {
    const lineTitle = `Update learner preferences${latencySuffix}`;
    return { summary: `${inProgress ? "Updating" : "Updated"} learner preferences${latencySuffix}`, lineTitle };
  }

  const label = displayToolName(tool.toolName);
  const errorInfo = tool.status === "failed" && typeof output.error === "string" ? output.error : undefined;
  const detail = errorInfo ?? formatRecordPreview(output) ?? formatRecordPreview(input);
  const lineTitle = errorInfo ? `${label} · ${compactText(errorInfo, 120)}${latencySuffix}` : `${label}${latencySuffix}`;
  return detail
    ? { summary: `${label}${latencySuffix}`, lineTitle, detail }
    : { summary: `${label}${latencySuffix}`, lineTitle };
}

function formatSourceType(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "source";
  const normalized = value.toLowerCase();
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("wiki")) return "wiki";
  if (normalized.includes("note")) return "note";
  if (normalized.includes("web")) return "web";
  if (normalized.includes("video")) return "video";
  return value.replace(/_/g, " ");
}

function asRecord(value: unknown): Record<string, unknown> {
  return isJsonRecord(value) ? value : {};
}

function extractToolQuery(input: Record<string, unknown>): string | undefined {
  for (const key of ["query", "searchQuery", "message"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function formatPageRange(input: Record<string, unknown>, output: Record<string, unknown>): string | undefined {
  const pageStart = output.pageStart ?? input.pageStart;
  const pageEnd = output.pageEnd ?? input.pageEnd;
  if (typeof pageStart === "number" && typeof pageEnd === "number") return `pp. ${pageStart}-${pageEnd}`;
  if (typeof pageStart === "number") return `p. ${pageStart}`;
  if (typeof pageEnd === "number") return `p. ${pageEnd}`;
  return undefined;
}

function formatGraphPreview(output: Record<string, unknown>): string | undefined {
  const nodes = Array.isArray(output.nodes) ? output.nodes.slice(0, 6) : [];
  if (!nodes.length) return undefined;
  return nodes
    .map((node) => {
      const record = asRecord(node);
      const labels = Array.isArray(record.labels) ? record.labels.filter((label): label is string => typeof label === "string") : [];
      const id = typeof record.id === "string" ? record.id : "node";
      return `· ${labels[0] ?? "node"}:${id}`;
    })
    .join("\n");
}

function formatRecordPreview(value: unknown): string | undefined {
  if (!isJsonRecord(value)) return undefined;
  const parts: string[] = [];
  for (const key of ["title", "summary", "status", "message", "text"]) {
    const item = value[key];
    if (typeof item === "string" && item.trim()) parts.push(compactText(item, 220));
  }
  return parts.length ? parts.join("\n") : undefined;
}

function mergePhaseDetail(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b || a === b) return a;
  return b;
}

function buildTraceRuns(traceTurn: ChatTraceTurn | null, liveRun: LiveTraceRun | null, showDiagnostics = false): TraceRunView[] {
  const persisted = (traceTurn?.runs ?? []).map((run) => mapPersistedRun(run, showDiagnostics));
  if (!liveRun) return persisted;
  const liveMapped = mapLiveRun(liveRun, showDiagnostics);
  const persistedIndex = persisted.findIndex((run) => run.id === liveRun.id);
  if (persistedIndex < 0) {
    return [...persisted, liveMapped];
  }
  if (liveRun.status === "running") {
    return [
      ...persisted.slice(0, persistedIndex),
      liveMapped,
      ...persisted.slice(persistedIndex + 1),
    ];
  }
  return [
    ...persisted.slice(0, persistedIndex),
    mergeTraceRunViews(persisted[persistedIndex]!, liveMapped),
    ...persisted.slice(persistedIndex + 1),
  ];
}

function mergeTraceRunViews(persisted: TraceRunView, live: TraceRunView): TraceRunView {
  const toolById = new Map<string, TraceToolView>();
  for (const tool of persisted.tools) toolById.set(tool.id, tool);
  for (const tool of live.tools) {
    if (!toolById.has(tool.id)) toolById.set(tool.id, tool);
  }
  return {
    ...persisted,
    status: live.status === "running" ? live.status : persisted.status,
    tools: [...toolById.values()].sort(
      (left, right) => timestampValue(left.createdAt ?? persisted.startedAt) - timestampValue(right.createdAt ?? persisted.startedAt),
    ),
    thinking: dedupeTraceEventsById([...persisted.thinking, ...live.thinking]),
    stateChanges: dedupeTraceEventsById([...persisted.stateChanges, ...live.stateChanges]),
    rawEvents: dedupeTraceEventsById([...persisted.rawEvents, ...live.rawEvents]),
    completedAt: persisted.completedAt ?? live.completedAt,
    durationMs: persisted.durationMs ?? live.durationMs,
    ...(live.isLive !== undefined ? { isLive: live.isLive } : {}),
  };
}

function isNarrationTraceEvent(eventType: string | undefined): boolean {
  return eventType === "agent.narration.completed";
}

function withoutFinalAssistantNarrations(
  steps: RuntimeWorkStep[],
  assistantMessage?: string | null,
): RuntimeWorkStep[] {
  const assistantKey = normalizeWorkText(assistantMessage ?? "");
  if (!assistantKey) return steps;
  return steps.filter((step) => {
    if (step.kind !== "narration") return true;
    return normalizeWorkText(step.content) !== assistantKey;
  });
}

function mapPersistedRun(run: ChatTraceRun, showDiagnostics = false): TraceRunView {
  const narrationEvents = dedupeTraceEventsById(
    [...(run.stateChanges ?? []), ...(run.rawEvents ?? []), ...(run.thinking ?? [])].filter(
      (event) => isNarrationTraceEvent(event.eventType),
    ),
  );
  const thinkingEvents = (run.thinking ?? []).filter((event) => event.eventType === "agent.thinking.completed");
  return {
    id: run.id,
    status: run.status,
    runType: run.runType,
    ...(showDiagnostics && run.model !== undefined ? { model: run.model } : {}),
    ...(showDiagnostics && run.promptVersion !== undefined ? { promptVersion: run.promptVersion } : {}),
    ...(showDiagnostics && run.traceId !== undefined ? { traceId: run.traceId } : {}),
    startedAt: run.startedAt,
    ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
    ...(run.durationMs !== undefined ? { durationMs: run.durationMs } : {}),
    ...(showDiagnostics && run.usage !== undefined ? { usage: run.usage } : {}),
    thinking: thinkingEvents,
    tools: run.tools.map((tool) => mapPersistedTool(tool, showDiagnostics)),
    stateChanges: showDiagnostics ? run.stateChanges : narrationEvents,
    rawEvents: showDiagnostics ? run.rawEvents : [],
  };
}

function mapPersistedTool(tool: ChatTraceToolCall, showDiagnostics = false): TraceToolView {
  return {
    id: tool.id,
    toolName: tool.toolName,
    ...(showDiagnostics && tool.sideEffectClass !== undefined ? { sideEffectClass: tool.sideEffectClass } : {}),
    status: tool.status,
    ...(tool.latencyMs !== undefined ? { latencyMs: tool.latencyMs } : {}),
    ...(tool.input !== undefined ? { input: tool.input } : {}),
    ...(tool.output !== undefined ? { output: tool.output } : {}),
    ...(showDiagnostics && tool.reducerResult !== undefined ? { reducerResult: tool.reducerResult } : {}),
    nodeRefs: showDiagnostics ? tool.nodeRefs : [],
    ...(tool.createdAt !== undefined ? { createdAt: tool.createdAt } : {}),
  };
}

function mapLiveRun(run: LiveTraceRun, showDiagnostics = false): TraceRunView {
  const rawEvents = showDiagnostics ? (run.rawEvents ?? []) : [];
  const thinking = run.thinking.map((step) => mapLiveStepToTraceEvent(step, "agent.thinking.completed", "Thinking"));
  const narration = run.narration.map((step) => mapLiveStepToTraceEvent(step, "agent.narration.completed", "Narration"));
  return {
    id: run.id,
    status: run.status,
    runType: run.runType,
    ...(showDiagnostics && run.model !== undefined ? { model: run.model } : {}),
    startedAt: run.startedAt,
    ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
    durationMs: run.completedAt ? Math.max(0, run.completedAt - run.startedAt) : Date.now() - run.startedAt,
    thinking,
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
    stateChanges: narration,
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

function TraceActivityList({ runs, showRaw, showDiagnostics = false }: { runs: TraceRunView[]; showRaw: boolean; showDiagnostics?: boolean }) {
  const activities = runs.flatMap((run) => buildRunActivities(run, showRaw, showDiagnostics)).sort((a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp));
  if (!activities.length) return <TraceEmpty>No trace activity recorded.</TraceEmpty>;
  return (
    <ol style={styles.timelineList}>
      {activities.map((activity) => (
        <TraceActivityRow key={activity.id} activity={activity} showDiagnostics={showDiagnostics} />
      ))}
    </ol>
  );
}

function buildRunActivities(run: TraceRunView, showRaw: boolean, showDiagnostics = false): TraceActivity[] {
  const runDetails = showDiagnostics
    ? [
        run.model,
        run.promptVersion ? `prompt ${run.promptVersion}` : null,
        run.traceId ? `trace ${run.traceId.slice(0, 10)}` : null,
        run.usage ? formatUsage(run.usage) : null,
        resolveDurationMs(run) != null ? formatDuration(resolveDurationMs(run)) : null,
      ].filter(Boolean).join(" · ")
    : resolveDurationMs(run) != null
      ? formatDuration(resolveDurationMs(run)) ?? ""
      : "";
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
  for (const event of run.thinking) {
    if (event.eventType !== "agent.thinking.completed") continue;
    activities.push({
      id: `${run.id}:${event.id}:thinking`,
      timestamp: event.timestamp,
      type: "event",
      title: "Thinking",
      status: event.status ?? "thinking",
      summary: compactText(extractEventText(event.payload), 220) || event.summary,
      payload: event.payload,
      refs: event.nodeRefs,
    });
  }
  for (const event of [...run.stateChanges, ...run.rawEvents]) {
    if (event.eventType !== "agent.narration.completed") continue;
    activities.push({
      id: `${run.id}:${event.id}:narration`,
      timestamp: event.timestamp,
      type: "event",
      title: "Narration",
      status: event.status ?? "completed",
      summary: compactText(extractEventText(event.payload), 220) || event.summary,
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

function mapLiveStepToTraceEvent(
  step: LiveTraceStep,
  eventType: string,
  title: string,
): ChatTraceStateChange {
  const timestamp = step.completedAt ?? step.startedAt;
  return {
    id: step.id,
    kind: "event",
    title,
    summary: compactText(step.content, 160),
    eventType,
    status: step.status === "running" ? "thinking" : "completed",
    nodeRefs: [],
    payload: {
      text: step.content,
      ...(typeof step.durationMs === "number" ? { durationMs: step.durationMs } : {}),
    },
    timestamp: new Date(timestamp).toISOString(),
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendLiveStepContent(
  steps: LiveTraceStep[],
  stepId: string,
  delta: string,
  timestamp: number,
  sequence?: number,
): LiveTraceStep[] {
  const index = steps.findIndex((step) => step.id === stepId);
  if (index === -1) {
    return [
      ...steps,
      {
        id: stepId,
        content: delta,
        status: "running",
        startedAt: timestamp,
        sequence: sequence ?? steps.length,
      },
    ];
  }
  return steps.map((step, currentIndex) =>
    currentIndex === index ? { ...step, content: `${step.content}${delta}` } : step,
  );
}

function completeLiveStep(
  steps: LiveTraceStep[],
  stepId: string,
  content: string,
  timestamp: number,
  durationMs?: number,
  sequence?: number,
): LiveTraceStep[] {
  const index = steps.findIndex((step) => step.id === stepId);
  if (index === -1) {
    return [
      ...steps,
      {
        id: stepId,
        content,
        status: "completed",
        startedAt: timestamp,
        completedAt: timestamp,
        sequence: sequence ?? steps.length,
        ...(durationMs !== undefined ? { durationMs } : {}),
      },
    ];
  }
  return steps.map((step, currentIndex) =>
    currentIndex === index
      ? {
          ...step,
          content: content || step.content,
          status: "completed",
          completedAt: timestamp,
          ...(durationMs !== undefined ? { durationMs } : {}),
        }
      : step,
  );
}

function TraceActivityRow({ activity, showDiagnostics = false }: { activity: TraceActivity; showDiagnostics?: boolean }) {
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
        {activity.tool && <TraceToolDetails tool={activity.tool} showDiagnostics={showDiagnostics} />}
        {!activity.tool && showDiagnostics && activity.refs && activity.refs.length > 0 && <TraceRefs refs={activity.refs} />}
        {!activity.tool && showDiagnostics && hasVisiblePayload(activity.payload) && (
          <TraceJson title="Details" value={activity.payload} />
        )}
      </div>
    </li>
  );
}

function TraceToolDetails({ tool, showDiagnostics = false }: { tool: TraceToolView; showDiagnostics?: boolean }) {
  const statusTone = getStatusTone(tool.status);
  const refs = tool.nodeRefs ?? [];

  return (
    <details open={tool.isLive && tool.status === "started"} style={styles.inlineDetails}>
      <summary style={styles.inlineDetailsSummary}>
        {tool.latencyMs != null && <span style={styles.toolMeta}>{formatDuration(tool.latencyMs)}</span>}
        {showDiagnostics && tool.sideEffectClass && <span style={styles.toolMeta}>{tool.sideEffectClass}</span>}
        <span style={{ ...styles.inlineStatus, color: statusTone.text }}>{tool.status}</span>
      </summary>
      {showDiagnostics && (
        <div style={styles.toolBody}>
          {tool.sideEffectClass && <TraceMeta label="Class" value={tool.sideEffectClass} />}
          {displayToolName(tool.toolName) !== tool.toolName && <TraceMeta label="Tool id" value={tool.toolName} />}
          {refs.length > 0 && <TraceRefs refs={refs} />}
          {tool.input !== undefined && <TraceJson title="Input" value={tool.input} />}
          {tool.output !== undefined && tool.output !== null && <TraceJson title="Output" value={tool.output} />}
          {tool.reducerResult !== undefined && tool.reducerResult !== null && <TraceJson title="Reducer result" value={tool.reducerResult} />}
        </div>
      )}
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

function formatToolLabel(toolName: string): string {
  const parts = toolName.split(".").filter(Boolean);
  if (parts.length >= 2) {
    const action = parts[parts.length - 1] ?? "";
    const subject = parts[parts.length - 2] ?? "";
    const actionLabel = action
      .replace(/^create_?/, "Create ")
      .replace(/^update_?/, "Update ")
      .replace(/^get_?/, "Get ")
      .replace(/^search_?/, "Search ")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
    const subjectLabel = subject.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    return `${actionLabel} ${subjectLabel}`.trim();
  }
  return displayToolName(toolName);
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
  activityList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: 3,
  },
  activityItem: {
    minHeight: 24,
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    lineHeight: 1.35,
    color: "var(--text)",
  },
  activityLabel: {
    minWidth: 0,
    color: "var(--text-strong)",
    fontWeight: 820,
    whiteSpace: "nowrap",
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
