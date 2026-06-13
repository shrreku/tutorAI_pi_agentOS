import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  AgentTrace,
  buildRuntimeWorkView,
  buildRuntimeWorkViewForDisplay,
  buildRuntimeWorkViewFromLiveRun,
  buildTraceSummary,
  buildTutorActivityPhases,
  groupRuntimeSteps,
  resolveStreamingWorkFocus,
  updateLiveTraceRun,
  type TraceRunView,
} from "./AgentTrace.js";

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

  it("merges live run, thinking, narration, and tool chunks in chronological order", () => {
    let run = updateLiveTraceRun(null, { type: "SESSION_STARTED", runId: "run_1", timestamp: 1000 });
    run = updateLiveTraceRun(run, { type: "RUN_STARTED", runId: "run_1", model: "deepseek/deepseek-v4-flash", timestamp: 1100 });
    run = updateLiveTraceRun(run, { type: "THINKING_START", thinkingId: "think_1", timestamp: 1120 });
    run = updateLiveTraceRun(run, { type: "THINKING_CONTENT", thinkingId: "think_1", delta: "Need to inspect the study plan.", timestamp: 1130 });
    run = updateLiveTraceRun(run, { type: "THINKING_END", thinkingId: "think_1", content: "Need to inspect the study plan.", durationMs: 80, timestamp: 1140 });
    run = updateLiveTraceRun(run, { type: "RUNTIME_NARRATION_START", narrationId: "narr_1", timestamp: 1145 });
    run = updateLiveTraceRun(run, { type: "RUNTIME_NARRATION_CONTENT", narrationId: "narr_1", delta: "Checking the active study plan first.", timestamp: 1150 });
    run = updateLiveTraceRun(run, { type: "RUNTIME_NARRATION_END", narrationId: "narr_1", content: "Checking the active study plan first.", durationMs: 20, timestamp: 1160 });
    run = updateLiveTraceRun(run, { type: "TOOL_CALL_START", toolCallId: "tool_1", toolName: "artifact.create_quiz", timestamp: 1200 });
    run = updateLiveTraceRun(run, { type: "TOOL_CALL_ARGS", toolCallId: "tool_1", args: "{\"questionCount\":3}", timestamp: 1250 });
    run = updateLiveTraceRun(run, { type: "TOOL_CALL_END", toolCallId: "tool_1", toolName: "artifact.create_quiz", result: "{\"status\":\"ready\"}", timestamp: 1500 });

    expect(run).toMatchObject({
      id: "run_1",
      status: "running",
      model: "deepseek/deepseek-v4-flash",
      thinking: [
        {
          id: "think_1",
          content: "Need to inspect the study plan.",
          status: "completed",
          durationMs: 80,
          sequence: 0,
        },
      ],
      narration: [
        {
          id: "narr_1",
          content: "Checking the active study plan first.",
          status: "completed",
          durationMs: 20,
          sequence: 1,
        },
      ],
      tools: [
        {
          id: "tool_1",
          toolName: "artifact.create_quiz",
          status: "completed",
          input: { questionCount: 3 },
          output: { status: "ready" },
          startedAt: 1200,
          completedAt: 1500,
          sequence: 2,
        },
      ],
    });

    const workView = buildRuntimeWorkViewFromLiveRun(run!);
    expect(workView.steps.map((step) => step.kind)).toEqual(["thought", "narration", "tool"]);
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
              nextSequence: 1,
              tools: [
                {
                  id: "tool_1",
                  toolName: "artifact.create_quiz",
                  status: "started",
                  input: { questionCount: 3 },
                  startedAt: 1200,
                  sequence: 0,
                },
              ],
              thinking: [],
              narration: [],
            },
            runStatus: "running",
            showDiagnostics: true,
          }),
        },
      ),
    );

    expect(markup).toContain("Agent trace");
    expect(markup).toContain("Input");
  });

  it("renders per-tool collapsible details for learner view", () => {
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
              startedAt: 1000,
              nextSequence: 1,
              tools: [
                {
                  id: "tool_1",
                  toolName: "source.get_span",
                  status: "started",
                  input: { sourceId: "src_1" },
                  startedAt: 1200,
                  sequence: 0,
                },
              ],
              thinking: [],
              narration: [],
            },
            runStatus: "running",
          }),
        },
      ),
    );

    expect(markup).toContain("tutor-runtime-work-shell");
    expect(markup).toContain("tutor-runtime-tool-line");
    expect(markup).toContain("src_1");
    expect(markup).not.toContain("Tutor activity");
    expect(markup).not.toContain("Input");
  });

  it("maps tool activity phases from concrete tool summaries", () => {
    const phases = buildTutorActivityPhases([
      {
        id: "run_1",
        status: "completed",
        runType: "tutor_turn",
        startedAt: 1000,
        completedAt: 2400,
        thinking: [],
        stateChanges: [],
        rawEvents: [],
        tools: [
          {
            id: "tool_1",
            toolName: "source.get_span",
            status: "completed",
            latencyMs: 40,
            input: { sourceId: "src_1" },
            output: { text: "Heat flows from hot to cold.", citation: { sourceTitle: "Thermo.pdf" } },
            nodeRefs: [],
          },
          {
            id: "tool_2",
            toolName: "artifact.create_quiz",
            status: "completed",
            latencyMs: 90,
            output: { title: "Heat transfer quiz" },
            nodeRefs: [],
          },
        ],
      },
    ]);

    expect(phases.map((phase) => phase.label)).toEqual([
      "Read span · Thermo.pdf · 40ms",
      "Generated quiz · Heat transfer quiz · 90ms",
    ]);
    expect(phases.find((phase) => phase.label.startsWith("Read span"))?.detail).toContain("Heat flows");
  });

  it("renders cursor-style thought, narration, and tool sections in learner view", () => {
    let liveRun = updateLiveTraceRun(null, { type: "RUN_STARTED", runId: "run_1", timestamp: 1000 });
    liveRun = updateLiveTraceRun(liveRun, { type: "THINKING_START", thinkingId: "think_1", timestamp: 1010 });
    liveRun = updateLiveTraceRun(liveRun, { type: "THINKING_CONTENT", thinkingId: "think_1", delta: "Need to inspect the study plan.", timestamp: 1020 });
    liveRun = updateLiveTraceRun(liveRun, { type: "THINKING_END", thinkingId: "think_1", content: "Need to inspect the study plan.", durationMs: 1200, timestamp: 1030 });
    liveRun = updateLiveTraceRun(liveRun, { type: "RUNTIME_NARRATION_START", narrationId: "narr_1", timestamp: 1040 });
    liveRun = updateLiveTraceRun(liveRun, { type: "RUNTIME_NARRATION_CONTENT", narrationId: "narr_1", delta: "Checking the active study plan first.", timestamp: 1050 });
    liveRun = updateLiveTraceRun(liveRun, { type: "RUNTIME_NARRATION_END", narrationId: "narr_1", content: "Checking the active study plan first.", timestamp: 1060 });
    liveRun = updateLiveTraceRun(liveRun, { type: "TOOL_CALL_START", toolCallId: "tool_1", toolName: "wiki.search", timestamp: 1070 });
    liveRun = updateLiveTraceRun(liveRun, { type: "TOOL_CALL_ARGS", toolCallId: "tool_1", args: "{\"query\":\"entropy\"}", timestamp: 1080 });
    liveRun = updateLiveTraceRun(liveRun, { type: "TOOL_CALL_END", toolCallId: "tool_1", toolName: "wiki.search", result: "{}", timestamp: 1090 });

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

    expect(markup).toContain("tutor-runtime-thought");
    expect(markup).toContain("Thought · 1s");
    expect(markup).toContain("tutor-runtime-narration");
    expect(markup).toContain("Checking the active study plan first.");
    expect(markup).toContain("Searched");
    expect(markup).toContain("tutor-runtime-work-beat");
    expect(markup).not.toContain("tutor-runtime-work-segment-summary");
  });

  it("renders a lone thought inside a flat work beat", () => {
    let liveRun = updateLiveTraceRun(null, { type: "RUN_STARTED", runId: "run_1", timestamp: 1000 });
    liveRun = updateLiveTraceRun(liveRun, { type: "RUNTIME_NARRATION_END", narrationId: "narr_1", content: "Let me check that.", timestamp: 1010 });
    liveRun = updateLiveTraceRun(liveRun, { type: "THINKING_START", thinkingId: "think_1", timestamp: 1020 });
    liveRun = updateLiveTraceRun(liveRun, { type: "THINKING_END", thinkingId: "think_1", content: "Need the concept id.", durationMs: 400, timestamp: 1030 });
    liveRun = updateLiveTraceRun(liveRun, { type: "RUNTIME_NARRATION_END", narrationId: "narr_2", content: "Here is the answer.", timestamp: 1040 });

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

    expect(markup).toContain("tutor-runtime-thought");
    expect(markup).toContain("Thought · 400ms");
    expect(markup).toContain("tutor-runtime-work-beat");
    expect(markup).not.toContain("tutor-runtime-work-segment-summary");
  });

  it("builds runtime work view with thinking, narration, and tool summaries in chronological order", () => {
    const model = buildRuntimeWorkView([
      {
        id: "run_1",
        status: "completed",
        runType: "tutor_turn",
        startedAt: 1000,
        completedAt: 2400,
        thinking: [
          {
            id: "think_1",
            kind: "event",
            title: "Thinking",
            summary: "Need to inspect the study plan.",
            eventType: "agent.thinking.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Need to inspect the study plan.", durationMs: 900 },
            timestamp: "2026-05-13T00:00:01.000Z",
          },
        ],
        stateChanges: [
          {
            id: "narr_1",
            kind: "event",
            title: "Narration",
            summary: "Checking the active study plan first.",
            eventType: "agent.narration.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Checking the active study plan first." },
            timestamp: "2026-05-13T00:00:02.000Z",
          },
        ],
        rawEvents: [],
        tools: [
          {
            id: "tool_1",
            toolName: "wiki.search",
            status: "completed",
            input: { query: "entropy" },
            createdAt: "2026-05-13T00:00:03.000Z",
            nodeRefs: [],
          },
        ],
      },
    ]);

    expect(model.steps.map((step) => step.kind)).toEqual(["thought", "narration", "tool"]);
    expect(model.steps.find((step) => step.kind === "narration")?.content).toContain("Checking the active study plan");
    expect(model.steps.find((step) => step.kind === "tool")?.summary).toContain("Searched");
  });

  it("keeps narration out of thought after legacy misclassification in persisted runs", () => {
    const runs: TraceRunView[] = [
      {
        id: "run_1",
        status: "completed",
        runType: "tutor_turn",
        startedAt: 1000,
        completedAt: 2400,
        thinking: [
          {
            id: "think_1",
            kind: "event",
            title: "Thinking",
            summary: "Need to inspect the study plan.",
            eventType: "agent.thinking.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Need to inspect the study plan.", durationMs: 900 },
            timestamp: "2026-05-13T00:00:01.000Z",
          },
          {
            id: "narr_legacy",
            kind: "event",
            title: "Narration",
            summary: "Let me look up the specific objectives and the source material.",
            eventType: "agent.narration.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Let me look up the specific objectives and the source material." },
            timestamp: "2026-05-13T00:00:02.000Z",
          },
        ],
        stateChanges: [],
        rawEvents: [],
        tools: [
          {
            id: "tool_1",
            toolName: "source.get_span",
            status: "completed",
            input: { sourceId: "src_1" },
            output: { text: "Sample span text.", citation: { sourceTitle: "Chapter 2.pdf" } },
            createdAt: "2026-05-13T00:00:03.000Z",
            nodeRefs: [],
          },
          {
            id: "tool_2",
            toolName: "source.get_span",
            status: "completed",
            input: { sourceId: "src_1" },
            output: { text: "Another span.", citation: { sourceTitle: "Chapter 2.pdf" } },
            createdAt: "2026-05-13T00:00:04.000Z",
            nodeRefs: [],
          },
        ],
      },
    ];

    const model = buildRuntimeWorkViewForDisplay(null, runs);
    expect(model.steps.map((step) => step.kind)).toEqual(["thought", "narration", "tool", "tool"]);
    const narration = model.steps.find((step) => step.kind === "narration");
    expect(narration?.content).toBe("Let me look up the specific objectives and the source material.");
    expect(model.steps.filter((step) => step.kind === "thought")).toHaveLength(1);
  });

  it("dedupes repeated narration text from overlapping trace sources", () => {
    const model = buildRuntimeWorkView([
      {
        id: "run_1",
        status: "completed",
        runType: "tutor_turn",
        startedAt: 1000,
        completedAt: 5000,
        thinking: [
          {
            id: "narr_legacy",
            kind: "event",
            title: "Narration",
            summary: "Let me look up the relevant wiki content.",
            eventType: "agent.narration.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Let me look up the relevant wiki content." },
            timestamp: "2026-05-13T00:00:01.000Z",
          },
        ],
        stateChanges: [
          {
            id: "narr_1",
            kind: "event",
            title: "Narration",
            summary: "Let me look up the relevant wiki content.",
            eventType: "agent.narration.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Let me look up the relevant wiki content." },
            timestamp: "2026-05-13T00:00:02.000Z",
          },
          {
            id: "narr_1",
            kind: "event",
            title: "Narration",
            summary: "Let me look up the relevant wiki content.",
            eventType: "agent.narration.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Let me look up the relevant wiki content." },
            timestamp: "2026-05-13T00:00:02.000Z",
          },
        ],
        rawEvents: [],
        tools: [],
      },
    ]);

    expect(model.steps.filter((step) => step.kind === "narration")).toHaveLength(1);
  });

  it("groups thoughts and tools together between narration blocks", () => {
    const grouped = groupRuntimeSteps([
      {
        kind: "thought",
        id: "think_1",
        content: "Need to inspect the study plan.",
        status: "completed",
        durationMs: 120,
        order: 0,
      },
      {
        kind: "tool",
        id: "tool_0",
        toolName: "study_plan.get_current",
        status: "completed",
        summary: "Checked study plan",
        lineTitle: "Study plan",
        order: 1,
      },
      {
        kind: "narration",
        id: "narr_1",
        content: "Let me inspect the source first.",
        status: "completed",
        order: 2,
      },
      {
        kind: "thought",
        id: "think_2",
        content: "Check the objective details next.",
        status: "completed",
        durationMs: 180,
        order: 3,
      },
      {
        kind: "tool",
        id: "tool_1",
        toolName: "source.get_span",
        status: "completed",
        summary: "Read span",
        lineTitle: "Chapter 2.pdf · pdf",
        order: 4,
      },
      {
        kind: "tool",
        id: "tool_2",
        toolName: "source.get_span",
        status: "completed",
        summary: "Read span",
        lineTitle: "Chapter 2.pdf · pdf · p. 3",
        order: 5,
      },
      {
        kind: "narration",
        id: "narr_2",
        content: "Now I can explain the objective.",
        status: "completed",
        order: 6,
      },
    ]);

    expect(grouped.map((step) => step.kind)).toEqual(["work-segment", "narration", "work-segment", "narration"]);
    expect(grouped[0]?.kind === "work-segment" ? grouped[0].items.length : 0).toBe(2);
    expect(grouped[2]?.kind === "work-segment" ? grouped[2].items.map((item) => item.kind) : []).toEqual([
      "thought",
      "tool",
      "tool",
    ]);
  });

  it("interleaves persisted thoughts, tools, and narrations by timestamp", () => {
    const runs: TraceRunView[] = [
      {
        id: "run_1",
        status: "completed",
        runType: "tutor_turn",
        startedAt: "2026-05-13T00:00:00.000Z",
        completedAt: "2026-05-13T00:01:11.000Z",
        thinking: [
          {
            id: "think_1",
            kind: "event",
            title: "Thinking",
            summary: "First thought",
            eventType: "agent.thinking.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "First thought" },
            timestamp: "2026-05-13T00:00:01.000Z",
          },
          {
            id: "think_2",
            kind: "event",
            title: "Thinking",
            summary: "Second thought",
            eventType: "agent.thinking.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Second thought" },
            timestamp: "2026-05-13T00:00:08.000Z",
          },
        ],
        stateChanges: [
          {
            id: "narr_1",
            kind: "event",
            title: "Narration",
            summary: "Teaching beat one.",
            eventType: "agent.narration.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Teaching beat one." },
            timestamp: "2026-05-13T00:00:05.000Z",
          },
        ],
        rawEvents: [],
        tools: [
          {
            id: "tool_1",
            toolName: "wiki.search",
            status: "completed",
            latencyMs: 120,
            nodeRefs: [],
            createdAt: "2026-05-13T00:00:03.000Z",
          },
          {
            id: "tool_2",
            toolName: "learning.get_state",
            status: "completed",
            latencyMs: 80,
            nodeRefs: [],
            createdAt: "2026-05-13T00:00:06.000Z",
          },
        ],
      },
    ];

    expect(buildRuntimeWorkView(runs).steps.map((step) => step.kind)).toEqual([
      "thought",
      "tool",
      "narration",
      "tool",
      "thought",
    ]);
  });

  it("prefers the richer live run when persisted trace is still sparse", () => {
    const runStart = Date.parse("2026-05-13T00:00:00.000Z");
    const liveRun = {
      id: "run_live",
      status: "completed" as const,
      runType: "tutor_turn",
      startedAt: runStart,
      completedAt: runStart + 71_000,
      nextSequence: 4,
      thinking: [
        { id: "think_1", content: "Plan the turn.", status: "completed" as const, startedAt: runStart + 1_000, sequence: 0, durationMs: 400 },
      ],
      narration: [
        { id: "narr_1", content: "Let me check the study plan.", status: "completed" as const, startedAt: runStart + 1_500, sequence: 2 },
      ],
      tools: [
        {
          id: "tool_1",
          toolName: "study_plan.get_current",
          status: "completed" as const,
          startedAt: runStart + 1_200,
          completedAt: runStart + 1_320,
          sequence: 1,
        },
      ],
    };
    const persistedRuns: TraceRunView[] = [
      {
        id: "run_live",
        status: "completed",
        runType: "tutor_turn",
        startedAt: "2026-05-13T00:00:00.000Z",
        thinking: [
          {
            id: "think_1",
            kind: "event",
            title: "Thinking",
            summary: "Plan the turn.",
            eventType: "agent.thinking.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Plan the turn." },
            timestamp: "2026-05-13T00:00:01.000Z",
          },
        ],
        stateChanges: [],
        rawEvents: [],
        tools: [],
      },
    ];

    const model = buildRuntimeWorkViewForDisplay(liveRun, persistedRuns);
    expect(model.steps.map((step) => step.kind)).toEqual(["thought", "tool", "narration"]);
  });

  it("merges live tools and narrations even when persisted trace has more thoughts", () => {
    const runStart = Date.parse("2026-05-13T00:00:00.000Z");
    const liveRun = {
      id: "run_live",
      status: "completed" as const,
      runType: "tutor_turn",
      startedAt: runStart,
      completedAt: runStart + 71_000,
      nextSequence: 5,
      thinking: [
        { id: "think_1", content: "Plan the turn.", status: "completed" as const, startedAt: runStart + 1_000, sequence: 0, durationMs: 400 },
      ],
      narration: [
        { id: "narr_1", content: "Let me check the study plan.", status: "completed" as const, startedAt: runStart + 1_500, sequence: 2 },
        { id: "narr_2", content: "Here is what we should focus on next.", status: "completed" as const, startedAt: runStart + 5_000, sequence: 4 },
      ],
      tools: [
        {
          id: "tool_1",
          toolName: "study_plan.get_current",
          status: "completed" as const,
          startedAt: runStart + 1_200,
          completedAt: runStart + 1_320,
          sequence: 1,
        },
        {
          id: "tool_2",
          toolName: "learning.get_state",
          status: "completed" as const,
          startedAt: runStart + 2_000,
          completedAt: runStart + 2_120,
          sequence: 3,
        },
      ],
    };
    const persistedRuns: TraceRunView[] = [
      {
        id: "run_live",
        status: "completed",
        runType: "tutor_turn",
        startedAt: "2026-05-13T00:00:00.000Z",
        thinking: [
          {
            id: "think_1",
            kind: "event",
            title: "Thinking",
            summary: "Plan the turn.",
            eventType: "agent.thinking.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Plan the turn." },
            timestamp: "2026-05-13T00:00:01.000Z",
          },
          {
            id: "think_2",
            kind: "event",
            title: "Thinking",
            summary: "Second pass.",
            eventType: "agent.thinking.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Second pass." },
            timestamp: "2026-05-13T00:00:02.000Z",
          },
          {
            id: "think_3",
            kind: "event",
            title: "Thinking",
            summary: "Third pass.",
            eventType: "agent.thinking.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Third pass." },
            timestamp: "2026-05-13T00:00:03.000Z",
          },
        ],
        stateChanges: [],
        rawEvents: [],
        tools: [],
      },
    ];

    const model = buildRuntimeWorkViewForDisplay(liveRun, persistedRuns);
    expect(model.steps.filter((step) => step.kind === "tool")).toHaveLength(2);
    expect(model.steps.filter((step) => step.kind === "narration")).toHaveLength(2);
    expect(model.steps.filter((step) => step.kind === "thought")).toHaveLength(3);
    expect(model.steps.map((step) => step.kind)).toEqual([
      "thought",
      "tool",
      "narration",
      "thought",
      "tool",
      "thought",
      "narration",
    ]);
    expect(groupRuntimeSteps(model.steps).filter((step) => step.kind === "narration")).toHaveLength(2);
  });

  it("keeps only the active thought or tool expanded while streaming", () => {
    const steps = [
      {
        kind: "thought" as const,
        id: "think_1",
        content: "First thought",
        status: "completed",
        order: 1,
        durationMs: 400,
      },
      {
        kind: "tool" as const,
        id: "tool_1",
        toolName: "wiki.search",
        status: "started",
        summary: "Searching",
        lineTitle: "Searching",
        order: 2,
      },
    ];
    const displaySteps = groupRuntimeSteps(steps);
    const focus = resolveStreamingWorkFocus(displaySteps, {
      activeRun: true,
      workSteps: steps,
    });

    expect(focus.activeItemId).toBe("tool_1");
    expect(focus.settledBeatIds.size).toBe(0);
  });

  it("collapses a work beat once narration follows it", () => {
    const steps = [
      {
        kind: "thought" as const,
        id: "think_1",
        content: "Plan the turn",
        status: "completed",
        order: 1,
        durationMs: 300,
      },
      {
        kind: "narration" as const,
        id: "narr_1",
        content: "Let me check the study plan.",
        status: "running",
        order: 2,
      },
    ];
    const displaySteps = groupRuntimeSteps(steps);
    const focus = resolveStreamingWorkFocus(displaySteps, {
      activeRun: true,
      workSteps: steps,
    });

    expect(focus.activeItemId).toBeNull();
    expect(focus.settledBeatIds.has(displaySteps[0]?.kind === "work-segment" ? displaySteps[0].id : "")).toBe(true);
  });

  it("collapses work once the final assistant response starts streaming", () => {
    const steps = [
      {
        kind: "thought" as const,
        id: "think_1",
        content: "Done thinking",
        status: "completed",
        order: 1,
        durationMs: 500,
      },
      {
        kind: "tool" as const,
        id: "tool_1",
        toolName: "learning.get_state",
        status: "completed",
        summary: "Checked state",
        lineTitle: "Checked state",
        order: 2,
      },
    ];
    const displaySteps = groupRuntimeSteps(steps);
    const focus = resolveStreamingWorkFocus(displaySteps, {
      activeRun: true,
      assistantMessage: "Here is the final teaching response.",
      workSteps: steps,
    });

    expect(focus.activeItemId).toBeNull();
    expect(focus.settledBeatIds.size).toBe(1);
  });

  it("keeps tool summaries visible after a beat is settled by narration", () => {
    let liveRun = updateLiveTraceRun(null, { type: "RUN_STARTED", runId: "run_1", timestamp: Date.parse("2026-05-13T00:00:00.000Z") });
    liveRun = updateLiveTraceRun(liveRun, { type: "THINKING_END", thinkingId: "think_1", content: "Plan the turn.", durationMs: 300, timestamp: Date.parse("2026-05-13T00:00:01.000Z") });
    liveRun = updateLiveTraceRun(liveRun, { type: "TOOL_CALL_START", toolCallId: "tool_1", toolName: "study_plan.get_current", timestamp: Date.parse("2026-05-13T00:00:02.000Z") });
    liveRun = updateLiveTraceRun(liveRun, { type: "TOOL_CALL_END", toolCallId: "tool_1", toolName: "study_plan.get_current", result: "{}", timestamp: Date.parse("2026-05-13T00:00:03.000Z") });
    liveRun = updateLiveTraceRun(liveRun, { type: "TOOL_CALL_START", toolCallId: "tool_2", toolName: "learning.get_state", timestamp: Date.parse("2026-05-13T00:00:04.000Z") });
    liveRun = updateLiveTraceRun(liveRun, { type: "TOOL_CALL_END", toolCallId: "tool_2", toolName: "learning.get_state", result: "{}", timestamp: Date.parse("2026-05-13T00:00:05.000Z") });
    liveRun = updateLiveTraceRun(liveRun, { type: "RUNTIME_NARRATION_END", narrationId: "narr_1", content: "Checked the study plan and learning state.", timestamp: Date.parse("2026-05-13T00:00:06.000Z") });

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

    expect(markup).toContain("tutor-runtime-tool-line-summary");
    expect(markup).toContain("Study plan");
    expect(markup).toContain("Learning state");
    expect(markup).not.toContain("tutor-runtime-work-segment-summary");
  });

  it("keeps the final assistant response out of the work view", () => {
    const runs: TraceRunView[] = [
      {
        id: "run_1",
        status: "completed",
        runType: "tutor_turn",
        startedAt: "2026-05-13T00:00:00.000Z",
        thinking: [],
        stateChanges: [
          {
            id: "narr_1",
            kind: "event",
            title: "Narration",
            summary: "Let me check the study plan.",
            eventType: "agent.narration.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Let me check the study plan." },
            timestamp: "2026-05-13T00:00:02.000Z",
          },
          {
            id: "narr_2",
            kind: "event",
            title: "Narration",
            summary: "Here is the full final teaching response.",
            eventType: "agent.narration.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Here is the full final teaching response." },
            timestamp: "2026-05-13T00:00:10.000Z",
          },
        ],
        rawEvents: [],
        tools: [],
      },
    ];

    const model = buildRuntimeWorkViewForDisplay(null, runs, {
      assistantMessage: "Here is the full final teaching response.",
      stripFinalDuplicate: true,
    });
    expect(model.steps.map((step) => step.kind)).toEqual(["narration"]);
    expect(model.steps[0]?.kind === "narration" ? model.steps[0].content : "").toBe("Let me check the study plan.");
  });

  it("describes study plan and learning state tools with useful detail", () => {
    const model = buildRuntimeWorkView([
      {
        id: "run_1",
        status: "completed",
        runType: "tutor_turn",
        startedAt: 1000,
        completedAt: 5000,
        thinking: [],
        stateChanges: [],
        rawEvents: [],
        tools: [
          {
            id: "tool_1",
            toolName: "study_plan.get_current",
            status: "completed",
            latencyMs: 30,
            output: {
              module: { title: "Understand Fourier's law" },
              sessionPlan: { sessionGoal: "Repair misconceptions and stabilize the concept." },
              studyPlan: { currentObjectiveId: "obj_heat_flux" },
            },
            nodeRefs: [],
            createdAt: "2026-05-13T00:00:01.000Z",
          },
          {
            id: "tool_2",
            toolName: "learning.get_state",
            status: "completed",
            latencyMs: 18,
            output: {
              conceptStates: [{ conceptId: "cnc_heat_flux", masteryScore: 0.42, confidence: 0.61 }],
            },
            nodeRefs: [],
            createdAt: "2026-05-13T00:00:02.000Z",
          },
        ],
      },
    ]);

    const studyPlanTool = model.steps.find((step) => step.kind === "tool" && step.toolName === "study_plan.get_current");
    const learningTool = model.steps.find((step) => step.kind === "tool" && step.toolName === "learning.get_state");
    expect(studyPlanTool?.kind === "tool" ? studyPlanTool.detail : "").toContain("Understand Fourier's law");
    expect(learningTool?.kind === "tool" ? learningTool.detail : "").toContain("mastery 0.42");
    expect(model.durationMs).toBe(4000);
  });

  it("orders runtime work phases chronologically without placeholder labels", () => {
    const phases = buildTutorActivityPhases([
      {
        id: "run_1",
        status: "running",
        runType: "tutor_turn",
        startedAt: 1000,
        thinking: [
          {
            id: "think_1",
            kind: "event",
            title: "Thinking",
            summary: "Need to inspect the study plan.",
            eventType: "agent.thinking.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Need to inspect the study plan." },
            timestamp: "2026-05-13T00:00:01.000Z",
          },
        ],
        stateChanges: [
          {
            id: "narr_1",
            kind: "event",
            title: "Narration",
            summary: "Checking the active study plan first.",
            eventType: "agent.narration.completed",
            status: "completed",
            nodeRefs: [],
            payload: { text: "Checking the active study plan first." },
            timestamp: "2026-05-13T00:00:02.000Z",
          },
        ],
        rawEvents: [],
        tools: [
          {
            id: "tool_1",
            toolName: "wiki.search",
            status: "started",
            input: { query: "entropy" },
            createdAt: "2026-05-13T00:00:03.000Z",
            nodeRefs: [],
          },
        ],
      },
    ]);

    expect(phases.map((phase) => phase.label)).toEqual([
      "Thinking",
      "Checking the active study plan first.",
      "Searching · \"entropy\"",
    ]);
  });
});
