import { describe, expect, it } from "vitest";
import { buildAgentRunFailedEnvelope, classifyRuntimeError } from "./failure.js";
import { ToolTimeoutError, ToolValidationError } from "@studyagent/tools";

describe("runtime failures", () => {
  it("classifies tool timeouts and validation errors", () => {
    expect(classifyRuntimeError(new ToolTimeoutError("wiki.search", 1000)).kind).toBe("tool_timeout");
    expect(classifyRuntimeError(new ToolValidationError("wiki.search", {})).kind).toBe("invalid_tool_args");
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