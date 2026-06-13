import { extractValidatedReducerResult } from "@studyagent/tools";
import type { StudyAgentRuntimeRun } from "./index.js";
import type { PiAgentSessionEvent } from "./pi-tutor-runner.js";

/** Payload fragment persisted on tutor/agent events (GF-0501 / observability). */
export function runTelemetryPayload(run: StudyAgentRuntimeRun): Record<string, unknown> {
  return {
    runId: run.runId,
    traceId: run.traceId,
    ...(run.requestId ? { requestId: run.requestId } : {}),
    ...(run.traceparent ? { traceparent: run.traceparent } : {}),
    ...(run.managedPrompt ? { managedPrompt: run.managedPrompt } : {}),
    model: run.modelConfig.model,
    provider: run.modelConfig.provider,
    promptTemplateVersion: run.modelConfig.promptTemplateVersion,
  };
}

function eventTelemetryPayload(event: PiAgentSessionEvent, run: StudyAgentRuntimeRun): Record<string, unknown> {
  const payload = runTelemetryPayload(run);
  if (event.data && "model" in event.data && typeof event.data.model === "string") {
    payload.model = event.data.model;
  }
  if (event.data && "provider" in event.data && typeof event.data.provider === "string") {
    payload.provider = event.data.provider;
  }
  return payload;
}

export type TutorAppendEventInput = {
  notebookId: string;
  sessionId?: string;
  runId?: string;
  eventType: string;
  payload: Record<string, unknown>;
};

function appendEventBase(run: StudyAgentRuntimeRun): { notebookId: string; runId: string; sessionId?: string } {
  const base: { notebookId: string; runId: string; sessionId?: string } = {
    notebookId: run.notebookId,
    runId: run.runId,
  };
  if (run.sessionId !== undefined) {
    base.sessionId = run.sessionId;
  }
  return base;
}

/** Maps streaming session events to durable event rows (use with `appendEvent`). */
export function mapPiSessionEventToAppendInput(
  event: PiAgentSessionEvent,
  run: StudyAgentRuntimeRun,
): TutorAppendEventInput | null {
  const t = eventTelemetryPayload(event, run);
  const base = appendEventBase(run);

  switch (event.type) {
    case "message_start":
      return {
        ...base,
        eventType: "agent.run.started",
        payload: { phase: "started", rawRuntimeEventType: event.type, ...t },
      };
    case "thinking_start":
      return null;
    case "thinking_delta":
      return null;
    case "thinking_complete":
      return {
        ...base,
        eventType: "agent.thinking.completed",
        payload: {
          text: event.data.text,
          ...(typeof event.data.durationMs === "number" ? { durationMs: event.data.durationMs } : {}),
          rawRuntimeEventType: event.type,
          ...t,
        },
      };
    case "narration_delta":
      return null;
    case "narration_complete":
      return {
        ...base,
        eventType: "agent.narration.completed",
        payload: {
          text: event.data.text,
          messageIndex: event.data.messageIndex,
          ...(typeof event.data.durationMs === "number" ? { durationMs: event.data.durationMs } : {}),
          rawRuntimeEventType: event.type,
          ...t,
        },
      };
    case "message_delta":
      return null;
    case "message_complete":
      return {
        ...base,
        eventType: "tutor.message.completed",
        payload: { text: event.data.text, stopReason: event.data.stopReason, rawRuntimeEventType: event.type, ...t },
      };
    case "tool_call_start":
      return {
        ...base,
        eventType: "agent.tool.started",
        payload: {
          toolName: event.data.toolName,
          toolCallId: event.data.toolCallId,
          args: event.data.args,
          rawRuntimeEventType: event.type,
          ...t,
        },
      };
    case "tool_call_complete": {
      const reducerResult = extractValidatedReducerResult(event.data.result);
      return {
        ...base,
        eventType: "agent.tool.completed",
        payload: {
          toolName: event.data.toolName,
          toolCallId: event.data.toolCallId,
          args: event.data.args,
          result: event.data.result,
          ...(reducerResult ? { reducerResult } : {}),
          rawRuntimeEventType: event.type,
          ...t,
        },
      };
    }
    case "run_complete":
      return {
        ...base,
        eventType: "agent.run.completed",
        payload: { phase: "completed", rawRuntimeEventType: event.type, ...t },
      };
    case "run_error":
      return {
        ...base,
        eventType: "agent.run.failed",
        payload: {
          failureKind: event.data.code,
          code: event.data.code,
          safeMessage: event.data.error,
          ...(event.data.details ?? {}),
          rawRuntimeEventType: event.type,
          ...t,
        },
      };
    default:
      return null;
  }
}
