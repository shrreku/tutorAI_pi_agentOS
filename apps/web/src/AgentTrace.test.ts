import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { AgentTrace, buildTraceSummary, updateLiveTraceRun, type TraceRunView } from "./AgentTrace.js";

describe("agent trace helpers", () => {
  it("summarizes persisted runs with visible counts and latest tool", () => {
    const runs: TraceRunView[] = [
      {
        id: "run_1",
        status: "completed",
        runType: "tutor_turn",
        model: "deepseek/deepseek-v4-flash",
        startedAt: "2026-05-13T00:00:00.000Z",
        completedAt: "2026-05-13T00:00:02.500Z",
        thinking: [],
        tools: [
          {
            id: "tool_1",
            toolName: "artifact.create_note",
            status: "completed",
            latencyMs: 250,
            input: { title: "Note" },
            output: { artifactId: "artifact_1" },
            nodeRefs: [],
          },
          {
            id: "tool_2",
            toolName: "wiki.update_page",
            status: "failed",
            input: {},
            output: { error: "denied" },
            nodeRefs: [],
          },
        ],
        stateChanges: [
          {
            id: "event_1",
            kind: "artifact_change",
            title: "artifact ready",
            summary: "",
            nodeRefs: [],
            payload: {},
            timestamp: "2026-05-13T00:00:02.000Z",
          },
        ],
        rawEvents: [],
      },
    ];

    expect(buildTraceSummary(runs, "completed")).toMatchObject({
      hasTrace: true,
      status: "completed",
      runLabel: "Tutor agent",
      model: "deepseek/deepseek-v4-flash",
      elapsed: "3s",
      runCount: 1,
      toolCount: 2,
      failedToolCount: 1,
      updateCount: 1,
      latestToolLabel: "Update Page · failed",
    });
  });

  it("merges live run, tool args, and tool result chunks", () => {
    let run = updateLiveTraceRun(null, { type: "SESSION_STARTED", runId: "run_1", timestamp: 1000 });
    run = updateLiveTraceRun(run, { type: "RUN_STARTED", runId: "run_1", model: "deepseek/deepseek-v4-flash", timestamp: 1100 });
    run = updateLiveTraceRun(run, { type: "TEXT_MESSAGE_CONTENT", delta: "I'm checking the active study plan first. ", timestamp: 1150 });
    run = updateLiveTraceRun(run, { type: "TOOL_CALL_START", toolCallId: "tool_1", toolName: "artifact.create_quiz", timestamp: 1200 });
    run = updateLiveTraceRun(run, { type: "TOOL_CALL_ARGS", toolCallId: "tool_1", args: "{\"questionCount\":3}", timestamp: 1250 });
    run = updateLiveTraceRun(run, { type: "TOOL_CALL_END", toolCallId: "tool_1", toolName: "artifact.create_quiz", result: "{\"status\":\"ready\"}", timestamp: 1500 });

    expect(run).toMatchObject({
      id: "run_1",
      status: "running",
      model: "deepseek/deepseek-v4-flash",
      tools: [
        {
          id: "tool_1",
          toolName: "artifact.create_quiz",
          status: "completed",
          input: { questionCount: 3 },
          output: { status: "ready" },
          startedAt: 1200,
          completedAt: 1500,
        },
      ],
      rawEvents: [
        {
          eventType: "tutor.message.delta",
          payload: { text: "I'm checking the active study plan first. " },
          status: "thinking",
        },
      ],
    });
  });

  it("keeps failed live runs visible until persisted trace replaces them", () => {
    let run = updateLiveTraceRun(null, { type: "RUN_STARTED", runId: "run_1", timestamp: 1000 });
    run = updateLiveTraceRun(run, { type: "RUN_ERROR", runId: "run_1", timestamp: 1800 });

    expect(run?.status).toBe("failed");
    expect(run?.completedAt).toBe(1800);
    expect(buildTraceSummary([], "failed")).toMatchObject({
      hasTrace: true,
      status: "failed",
      runLabel: "Tutor agent",
    });
  });

  it("shows the live trace body expanded by default", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const markup = renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        {
          client,
          children: React.createElement(AgentTrace, {
            traceTurn: null,
            liveRun: {
              id: "run_1",
              status: "running",
              runType: "tutor_turn",
              model: "deepseek/deepseek-v4-flash",
              startedAt: 1000,
              tools: [
                {
                  id: "tool_1",
                  toolName: "artifact.create_quiz",
                  status: "started",
                  input: { questionCount: 3 },
                  startedAt: 1200,
                },
              ],
            },
            runStatus: "running",
          }),
        },
      ),
    );

    expect(markup).toContain("Agent trace");
    expect(markup).toContain("Input");
  });

  it("renders live process narration inside the trace", () => {
    let liveRun = updateLiveTraceRun(null, { type: "RUN_STARTED", runId: "run_1", timestamp: 1000 });
    liveRun = updateLiveTraceRun(liveRun, { type: "TEXT_MESSAGE_CONTENT", delta: "I'm checking the active study plan first. ", timestamp: 1050 });
    liveRun = updateLiveTraceRun(liveRun, { type: "TEXT_MESSAGE_CONTENT", delta: "Here is the final answer.", timestamp: 1300 });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const markup = renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        {
          client,
          children: React.createElement(AgentTrace, {
            traceTurn: null,
            liveRun,
            runStatus: "running",
          }),
        },
      ),
    );

    expect(markup).toContain("Tutor reasoning");
    expect(markup).toContain("I&#x27;m checking the active study plan first.");
  });
});
