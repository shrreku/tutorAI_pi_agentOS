import { describe, expect, it } from "vitest";
import { createRuntimeRun } from "./index.js";
import { mapPiSessionEventToAppendInput, runTelemetryPayload } from "./pi-event-mapper.js";

describe("pi event mapper telemetry", () => {
  it("does not persist message deltas durably", () => {
    const run = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
    });

    expect(
      mapPiSessionEventToAppendInput({ type: "message_delta", data: { text: "partial" } }, run),
    ).toBeNull();
  });

  it("maps thinking and narration completion into bounded durable events", () => {
    const run = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
    });

    expect(
      mapPiSessionEventToAppendInput(
        { type: "thinking_complete", data: { text: "reasoned", durationMs: 120 } },
        run,
      ),
    ).toEqual(
      expect.objectContaining({
        eventType: "agent.thinking.completed",
        payload: expect.objectContaining({ text: "reasoned", durationMs: 120 }),
      }),
    );

    expect(
      mapPiSessionEventToAppendInput(
        {
          type: "narration_complete",
          data: { text: "Checking the notebook", messageIndex: 0, durationMs: 25 },
        },
        run,
      ),
    ).toEqual(
      expect.objectContaining({
        eventType: "agent.narration.completed",
        payload: expect.objectContaining({
          text: "Checking the notebook",
          messageIndex: 0,
          durationMs: 25,
        }),
      }),
    );
  });

  it("includes runtime correlation fields in durable event payloads", () => {
    const run = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      requestId: "request_1",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      managedPrompt: {
        name: "studyagent-tutor-system",
        type: "text",
        version: 3,
        label: "production",
        isFallback: false,
        source: "langfuse",
      },
      modelConfig: { model: "openrouter/test-model" },
    });

    expect(runTelemetryPayload(run)).toMatchObject({
      runId: run.runId,
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      requestId: "request_1",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      managedPrompt: {
        name: "studyagent-tutor-system",
        type: "text",
        version: 3,
        label: "production",
        isFallback: false,
        source: "langfuse",
      },
      model: "openrouter/test-model",
      provider: "openrouter",
      promptTemplateVersion: "v1",
    });
  });

  it("marks local fallback runtime events distinctly from OpenRouter events", () => {
    const run = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "learn",
      modelConfig: { model: "deepseek/deepseek-v4-flash" },
    });

    const mapped = mapPiSessionEventToAppendInput(
      {
        type: "message_complete",
        data: {
          text: "fallback answer",
          stopReason: "end_turn",
          model: "studyagent/local-fallback",
          provider: "local_fallback",
        },
      },
      run,
    );

    expect(mapped?.payload).toMatchObject({
      model: "studyagent/local-fallback",
      provider: "local_fallback",
    });

    const toolMapped = mapPiSessionEventToAppendInput(
      {
        type: "tool_call_complete",
        data: {
          toolName: "wiki.search",
          toolCallId: "toolcall_1",
          args: { query: "fourier" },
          result: { results: [] },
          model: "studyagent/local-fallback",
          provider: "local_fallback",
        },
      },
      run,
    );

    expect(toolMapped?.payload).toMatchObject({
      model: "studyagent/local-fallback",
      provider: "local_fallback",
      toolName: "wiki.search",
    });
  });
});
