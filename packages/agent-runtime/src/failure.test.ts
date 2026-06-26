import { describe, expect, it } from "vitest";
import { buildAgentRunFailedEnvelope, classifyRuntimeError } from "./failure.js";
import { ToolTimeoutError, ToolValidationError } from "@studyagent/tools";

describe("runtime failures", () => {
  it("classifies tool timeouts and validation errors", () => {
    expect(classifyRuntimeError(new ToolTimeoutError("wiki.search", 1000)).kind).toBe(
      "tool_timeout",
    );
    expect(classifyRuntimeError(new ToolValidationError("wiki.search", {})).kind).toBe(
      "invalid_tool_args",
    );
  });

  it("classifies stale session compaction crashes as retryable", () => {
    const failure = classifyRuntimeError(
      new Error("Cannot read properties of undefined (reading 'totalTokens')"),
    );
    expect(failure.code).toBe("session_rehydration_error");
    expect(failure.retryable).toBe(true);
  });

  it("classifies model dispatch timeout with actionable code", () => {
    const failure = classifyRuntimeError(new Error("model dispatch timed out"));
    expect(failure.kind).toBe("model_timeout");
    expect(failure.code).toBe("model_dispatch_timeout");
    expect(failure.retryable).toBe(true);
  });

  it("classifies tool budget exhaustion", () => {
    const failure = classifyRuntimeError(
      new Error("Runtime tool budget exceeded: attempted more than 12 tool calls"),
    );
    expect(failure.code).toBe("tool_budget_exceeded");
    expect(failure.safeMessage).toContain("tool-call budget");
  });

  it("builds a safe agent.run.failed envelope", () => {
    const envelope = buildAgentRunFailedEnvelope({
      notebookId: "nb_1",
      sessionId: "sess_1",
      runId: "run_1",
      sequenceNo: 4,
      traceId: "trace_1",
      failure: {
        kind: "context_overflow",
        code: "runtime_error",
        safeMessage: "Too much context",
        retryable: true,
      },
    });

    expect(envelope.eventType).toBe("agent.run.failed");
    expect(envelope.payload.safeMessage).toBe("Too much context");
  });
});
