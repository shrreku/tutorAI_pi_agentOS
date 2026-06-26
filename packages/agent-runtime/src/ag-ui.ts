import type { PiAgentSessionEvent } from "./pi-tutor-runner.js";
import type { StudyAgentRuntimeRun } from "./index.js";
import { createRuntimeId } from "./index.js";

export type AgUiEvent = Record<string, unknown>;

export function createAgUiEventMapper(run: StudyAgentRuntimeRun) {
  const messageId = createRuntimeId("msg");
  let thinkingId = createRuntimeId("thinking");
  let narrationId = createRuntimeId("narration");
  let messageStarted = false;
  let thinkingStarted = false;
  let narrationStarted = false;

  return {
    map(event: PiAgentSessionEvent): AgUiEvent[] {
      const timestamp = Date.now();
      const model =
        event.data && "model" in event.data && typeof event.data.model === "string"
          ? event.data.model
          : run.modelConfig.model;

      switch (event.type) {
        case "message_start":
          return [
            {
              type: "RUN_STARTED",
              runId: run.runId,
              threadId: run.sessionId,
              model,
              timestamp,
            },
          ];
        case "thinking_start":
          if (thinkingStarted) return [];
          thinkingStarted = true;
          return [
            {
              type: "THINKING_START",
              thinkingId,
              runId: run.runId,
              model,
              timestamp,
            },
          ];
        case "thinking_delta":
          if (!thinkingStarted) {
            thinkingStarted = true;
            return [
              {
                type: "THINKING_START",
                thinkingId,
                runId: run.runId,
                model,
                timestamp,
              },
              {
                type: "THINKING_CONTENT",
                thinkingId,
                delta: event.data.text,
                content: event.data.text,
                model,
                timestamp,
              },
            ];
          }
          return [
            {
              type: "THINKING_CONTENT",
              thinkingId,
              delta: event.data.text,
              content: event.data.text,
              model,
              timestamp,
            },
          ];
        case "thinking_complete": {
          const events = [
            ...(thinkingStarted
              ? [
                  {
                    type: "THINKING_END",
                    thinkingId,
                    content: event.data.text,
                    ...(typeof event.data.durationMs === "number"
                      ? { durationMs: event.data.durationMs }
                      : {}),
                    model,
                    timestamp,
                  },
                ]
              : []),
          ];
          thinkingStarted = false;
          thinkingId = createRuntimeId("thinking");
          return events;
        }
        case "narration_delta":
          if (!narrationStarted) {
            narrationStarted = true;
            return [
              {
                type: "RUNTIME_NARRATION_START",
                narrationId,
                runId: run.runId,
                model,
                timestamp,
              },
              {
                type: "RUNTIME_NARRATION_CONTENT",
                narrationId,
                delta: event.data.text,
                content: event.data.text,
                messageIndex: event.data.messageIndex,
                model,
                timestamp,
              },
            ];
          }
          return [
            {
              type: "RUNTIME_NARRATION_CONTENT",
              narrationId,
              delta: event.data.text,
              content: event.data.text,
              messageIndex: event.data.messageIndex,
              model,
              timestamp,
            },
          ];
        case "narration_complete": {
          const events = [
            ...(narrationStarted
              ? []
              : [
                  {
                    type: "RUNTIME_NARRATION_START",
                    narrationId,
                    runId: run.runId,
                    model,
                    timestamp,
                  },
                ]),
            {
              type: "RUNTIME_NARRATION_CONTENT",
              narrationId,
              delta: event.data.text,
              content: event.data.text,
              messageIndex: event.data.messageIndex,
              model,
              timestamp,
            },
            {
              type: "RUNTIME_NARRATION_END",
              narrationId,
              content: event.data.text,
              messageIndex: event.data.messageIndex,
              ...(typeof event.data.durationMs === "number"
                ? { durationMs: event.data.durationMs }
                : {}),
              model,
              timestamp,
            },
          ];
          narrationStarted = false;
          narrationId = createRuntimeId("narration");
          return events;
        }
        case "message_delta":
          if (!messageStarted) {
            messageStarted = true;
            return [
              {
                type: "TEXT_MESSAGE_START",
                messageId,
                role: "assistant",
                model,
                timestamp,
              },
              {
                type: "TEXT_MESSAGE_CONTENT",
                messageId,
                delta: event.data.text,
                content: event.data.text,
                model,
                timestamp,
              },
            ];
          }
          return [
            {
              type: "TEXT_MESSAGE_CONTENT",
              messageId,
              delta: event.data.text,
              content: event.data.text,
              model,
              timestamp,
            },
          ];
        case "tool_call_start":
          return [
            {
              type: "TOOL_CALL_START",
              toolCallId: event.data.toolCallId,
              toolName: event.data.toolName,
              model,
              timestamp,
            },
            {
              type: "TOOL_CALL_ARGS",
              toolCallId: event.data.toolCallId,
              delta: safeJson(event.data.args),
              args: safeJson(event.data.args),
              model,
              timestamp,
            },
          ];
        case "tool_call_complete":
          return [
            {
              type: "TOOL_CALL_END",
              toolCallId: event.data.toolCallId,
              toolName: event.data.toolName,
              input: event.data.args,
              result: safeJson(event.data.result),
              model,
              timestamp,
            },
          ];
        case "message_complete":
          return [
            ...(messageStarted
              ? [
                  {
                    type: "TEXT_MESSAGE_END",
                    messageId,
                    model,
                    timestamp,
                  },
                ]
              : []),
          ];
        case "run_complete":
          return [
            {
              type: "RUN_FINISHED",
              runId: run.runId,
              finishReason: "stop",
              model,
              ...(typeof event.data.provider === "string" ? { provider: event.data.provider } : {}),
              timestamp,
            },
          ];
        case "run_error":
          return [
            {
              type: "RUN_ERROR",
              runId: run.runId,
              model,
              timestamp,
              error: {
                message: event.data.error,
                code: event.data.code,
                ...(event.data.retryable ? { retryable: true } : {}),
              },
            },
          ];
        default:
          return [];
      }
    },
  };
}

export function serializeAgUiEventToSse(event: AgUiEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function safeJson(value: unknown): string {
  if (value === undefined) return "{}";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ value: String(value) });
  }
}
