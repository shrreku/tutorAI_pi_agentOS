import type { EventEnvelope } from "@studyagent/schemas";
import { z } from "zod";
import { ToolTimeoutError, ToolValidationError, ToolError } from "@studyagent/tools";

export const runtimeFailureKindSchema = z.enum([
  "tool_timeout",
  "model_timeout",
  "invalid_tool_args",
  "context_overflow",
  "reducer_rejection",
  "unknown",
]);

export type RuntimeFailureKind = z.infer<typeof runtimeFailureKindSchema>;

export type RuntimeFailure = {
  kind: RuntimeFailureKind;
  code: string;
  safeMessage: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type RuntimeErrorClassification = RuntimeFailure & {
  originalMessage?: string;
};

export function classifyRuntimeError(error: unknown): RuntimeErrorClassification {
  if (error instanceof ToolTimeoutError) {
    return {
      kind: "tool_timeout",
      code: error.code,
      safeMessage: "A tool timed out while preparing the tutor response.",
      retryable: true,
      originalMessage: error.message,
    };
  }

  if (error instanceof ToolValidationError) {
    return {
      kind: "invalid_tool_args",
      code: error.code,
      safeMessage: "The agent generated invalid tool arguments.",
      retryable: false,
      originalMessage: error.message,
    };
  }

  if (error instanceof ToolError) {
    return {
      kind: "unknown",
      code: error.code,
      safeMessage: error.message.startsWith("Mastery evaluation failed:")
        ? error.message
        : "A tool failed while preparing the tutor response.",
      retryable: error.code === "mastery_evaluation_failed",
      originalMessage: error.message,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("totaltokens") || lower.includes("calculatecontexttokens")) {
    return {
      kind: "unknown",
      code: "session_rehydration_error",
      safeMessage: "The tutor session could not resume after being idle. Retry the turn.",
      retryable: true,
      originalMessage: message,
    };
  }
  if (message === "model dispatch timed out") {
    return {
      kind: "model_timeout",
      code: "model_dispatch_timeout",
      safeMessage:
        "The tutor model run exceeded its time budget while calling tools or generating a response. Retry the turn.",
      retryable: true,
      originalMessage: message,
    };
  }
  return {
    kind: inferFailureKind(message),
    code: inferFailureCode(message),
    safeMessage: inferSafeMessage(message),
    retryable:
      inferFailureKind(message) === "model_timeout"
      || (lower.includes("langfuse") && lower.includes("timeout")),
    originalMessage: message,
  };
}

function inferFailureCode(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("tool budget exceeded")) return "tool_budget_exceeded";
  if (lower.includes("timeout")) return "model_dispatch_timeout";
  return "runtime_error";
}

function inferSafeMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("tool budget exceeded")) {
    return "The tutor exceeded its tool-call budget for this turn. Retry with a narrower question or increase TUTOR_MAX_TOOL_CALLS.";
  }
  if (lower.includes("timeout")) {
    return "The tutor runtime timed out while preparing the response.";
  }
  return "The tutor runtime encountered an error.";
}

export function buildAgentRunFailedEnvelope(input: {
  notebookId: string;
  sessionId?: string;
  runId?: string;
  sequenceNo: number;
  failure: RuntimeFailure;
  traceId: string;
  createdAt?: string;
}): EventEnvelope {
  return {
    id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    runId: input.runId,
    eventType: "agent.run.failed",
    sequenceNo: input.sequenceNo,
    createdAt: input.createdAt ?? new Date().toISOString(),
    payload: {
      traceId: input.traceId,
      failureKind: input.failure.kind,
      code: input.failure.code,
      retryable: input.failure.retryable,
      safeMessage: input.failure.safeMessage,
      ...(input.failure.details ?? {}),
    },
  };
}

function inferFailureKind(message: string): RuntimeFailureKind {
  const lower = message.toLowerCase();
  if (lower.includes("context") && lower.includes("overflow")) return "context_overflow";
  if (lower.includes("reducer") && lower.includes("reject")) return "reducer_rejection";
  if (lower.includes("timeout")) return "model_timeout";
  return "unknown";
}