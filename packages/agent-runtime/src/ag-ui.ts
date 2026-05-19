import type { PiAgentSessionEvent } from "./pi-session.js";
import type { StudyAgentRuntimeRun } from "./index.js";
import { createRuntimeId } from "./index.js";

export type AgUiEvent = Record<string, unknown>;

export function createAgUiEventMapper(run: StudyAgentRuntimeRun) {
  const messageId = createRuntimeId("msg");
  let messageStarted = false;
  let thinkingStarted = false;

  return {
    map(event: PiAgentSessionEvent): AgUiEvent[] {
      const timestamp = Date.now();
      const model = run.modelConfig.model;

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
