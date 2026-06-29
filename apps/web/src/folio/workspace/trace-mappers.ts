import type { ChatTraceRun, ChatTraceTurn } from "@studyagent/schemas";
import type { TraceStep } from "../ui/workspace.js";

export function traceStepsFromRun(run: ChatTraceRun | undefined, working = false): TraceStep[] {
  if (!run) return [];
  const steps: TraceStep[] = [];

  for (const change of run.stateChanges ?? []) {
    steps.push({
      kind: "state",
      label: change.title,
      ...(change.summary ? { detail: change.summary } : {}),
      status: "done",
    });
  }

  for (const tool of run.tools ?? []) {
    steps.push({
      kind: "tool",
      label: "Tool call",
      tool: tool.toolName,
      meta: tool.status,
      ...(typeof tool.output === "string"
        ? { detail: tool.output }
        : tool.output
          ? { detail: JSON.stringify(tool.output).slice(0, 240) }
          : {}),
      status: "done",
    });
  }

  for (const think of run.thinking ?? []) {
    const detail = think.summary || think.title;
    if (!detail.trim()) continue;
    steps.push({ kind: "think", label: "Reasoning", detail, status: "done" });
  }

  if (working) {
    steps.push({ kind: "write", label: "Composing answer", status: "running" });
  }

  return steps;
}

export function traceStepsFromTurn(turn: ChatTraceTurn | undefined, working = false): TraceStep[] {
  if (!turn) return [];
  const latestRun = turn.runs[turn.runs.length - 1];
  return traceStepsFromRun(latestRun, working);
}

export type LiveTraceChunk = Record<string, unknown>;

export type LiveTraceState = {
  tools: Array<{ name: string; status: string; detail?: string }>;
  thinking: string;
  status: "idle" | "running" | "failed" | "completed";
};

export function reduceLiveTrace(
  current: LiveTraceState,
  chunk: LiveTraceChunk,
): LiveTraceState {
  const type = chunk.type;
  if (type === "RUN_STARTED") return { ...current, status: "running" };
  if (type === "RUN_FINISHED") return { ...current, status: "completed" };
  if (type === "RUN_ERROR") return { ...current, status: "failed" };
  if (type === "TOOL_CALL_START" && typeof chunk.toolName === "string") {
    return {
      ...current,
      tools: [...current.tools, { name: chunk.toolName, status: "running" }],
    };
  }
  if (type === "TOOL_CALL_END" && typeof chunk.toolName === "string") {
    return {
      ...current,
      tools: current.tools.map((t) =>
        t.name === chunk.toolName ? { ...t, status: "done" } : t,
      ),
    };
  }
  if (type === "THINKING_CONTENT") {
    const delta =
      typeof chunk.delta === "string"
        ? chunk.delta
        : typeof chunk.content === "string"
          ? chunk.content
          : "";
    return { ...current, thinking: current.thinking + delta };
  }
  return current;
}

export function traceStepsFromLive(state: LiveTraceState): TraceStep[] {
  const steps: TraceStep[] = [];
  for (const tool of state.tools) {
    steps.push({
      kind: "tool",
      label: "Tool call",
      tool: tool.name,
      meta: tool.status,
      status: tool.status === "running" ? "running" : "done",
    });
  }
  if (state.thinking.trim()) {
    steps.push({ kind: "think", label: "Reasoning", detail: state.thinking, status: "done" });
  }
  if (state.status === "running") {
    steps.push({ kind: "write", label: "Composing answer", status: "running" });
  }
  return steps;
}
