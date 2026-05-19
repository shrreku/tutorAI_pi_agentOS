import { describe, expect, it } from "vitest";
import type { UIMessage } from "@tanstack/ai-client";
import type { ChatTraceResponse } from "@studyagent/schemas";
import {
  buildTutorSelectedNodeRefs,
  buildTutorSessionInsights,
  buildHistorySessions,
  latestAssistantMessageIndex,
  latestUserMessageIndex,
  mergePersistedAndLiveMessages,
  messagesFromTraceData,
  normalizeAssistantMessageText,
  parseTutorTextBlocks,
  traceDataForSession,
  traceDataForTurn,
  traceTurnForAssistantMessage,
} from "./TutorPanel.js";

describe("buildTutorSelectedNodeRefs", () => {
  it("adds open artifact as tutor context ref", () => {
    const refs = buildTutorSelectedNodeRefs([{ refType: "source", refId: "src_1" }], "artifact_1");
    expect(refs).toEqual([
      { refType: "source", refId: "src_1" },
      { refType: "artifact", refId: "artifact_1" },
    ]);
  });

  it("deduplicates refs when artifact is already present", () => {
    const refs = buildTutorSelectedNodeRefs(
      [
        { refType: "artifact", refId: "artifact_1" },
        { refType: "source", refId: "src_1" },
      ],
      "artifact_1",
    );
    expect(refs).toEqual([
      { refType: "artifact", refId: "artifact_1" },
      { refType: "source", refId: "src_1" },
    ]);
  });
});

describe("buildTutorSessionInsights", () => {
  it("summarizes taught points, doubts, and next steps from trace data", () => {
    const insights = buildTutorSessionInsights({
      notebookId: "nb_1",
      generatedAt: new Date().toISOString(),
      turns: [
        {
          id: "turn_1",
          sessionId: "sess_1",
          turnIndex: 0,
          userMessage: "I'm confused about conduction.",
          assistantMessage: "Conduction moves heat by direct contact.",
          createdAt: new Date().toISOString(),
          runs: [],
        },
        {
          id: "turn_2",
          sessionId: "sess_1",
          turnIndex: 1,
          userMessage: "What is the formula?",
          assistantMessage: "Next, review Fourier's law.",
          createdAt: new Date().toISOString(),
          runs: [],
        },
      ],
    } as ChatTraceResponse);

    expect(insights.turnCount).toBe(2);
    expect(insights.taughtPoints[0]).toContain("Conduction moves heat");
    expect(insights.doubts[0]).toContain("confused about conduction");
    expect(insights.nextSteps[0]).toContain("Fourier's law");
  });
});

describe("chat trace helpers", () => {
  const messages = [
    { id: "m1", role: "user", parts: [{ type: "text", content: "hi" }] },
    { id: "m2", role: "assistant", parts: [{ type: "text", content: "hello" }] },
    { id: "m3", role: "user", parts: [{ type: "text", content: "continue" }] },
    { id: "m4", role: "assistant", parts: [{ type: "text", content: "next" }] },
  ] as UIMessage[];

  const trace = {
    notebookId: "nb_1",
    generatedAt: new Date().toISOString(),
    turns: [
      { id: "turn_1", sessionId: "sess_1", turnIndex: 0, createdAt: new Date().toISOString(), runs: [] },
      { id: "turn_2", sessionId: "sess_1", turnIndex: 1, createdAt: new Date().toISOString(), runs: [] },
    ],
  } as ChatTraceResponse;

  it("finds the latest assistant message without requiring ES2023 array helpers", () => {
    expect(latestAssistantMessageIndex(messages)).toBe(3);
  });

  it("finds the latest user message for active trace placement", () => {
    expect(latestUserMessageIndex(messages)).toBe(2);
  });

  it("attaches chronological trace turns to assistant messages only", () => {
    expect(traceTurnForAssistantMessage(messages, 0, trace)).toBeNull();
    expect(traceTurnForAssistantMessage(messages, 1, trace)?.id).toBe("turn_1");
    expect(traceTurnForAssistantMessage(messages, 3, trace)?.id).toBe("turn_2");
  });

  it("matches trace turns by the preceding user message when history is not fully loaded", () => {
    const visibleMessages = [
      { id: "m5", role: "user", parts: [{ type: "text", content: "current prompt" }] },
      { id: "m6", role: "assistant", parts: [{ type: "text", content: "current answer" }] },
    ] as UIMessage[];
    const historicalTrace = {
      notebookId: "nb_1",
      generatedAt: new Date().toISOString(),
      turns: [
        { id: "old_turn", sessionId: "sess_1", turnIndex: 0, userMessage: "old prompt", createdAt: new Date().toISOString(), runs: [] },
        { id: "current_turn", sessionId: "sess_1", turnIndex: 1, userMessage: "current prompt", createdAt: new Date().toISOString(), runs: [] },
      ],
    } as ChatTraceResponse;

    expect(traceTurnForAssistantMessage(visibleMessages, 1, historicalTrace)?.id).toBe("current_turn");
  });

  it("hydrates visible chat messages from persisted tutor trace data", () => {
    const hydrated = messagesFromTraceData({
      notebookId: "nb_1",
      generatedAt: new Date().toISOString(),
      turns: [
        {
          id: "turn_1",
          sessionId: "sess_1",
          turnIndex: 0,
          userMessage: "What is Fourier's law?",
          assistantMessage: "It relates heat flux to the temperature gradient.",
          createdAt: new Date().toISOString(),
          runs: [],
        },
      ],
    } as ChatTraceResponse);

    expect(hydrated.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(hydrated.map((message) => message.parts[0]?.type === "text" ? message.parts[0].content : "")).toEqual([
      "What is Fourier's law?",
      "It relates heat flux to the temperature gradient.",
    ]);
  });

  it("keeps persisted history visible while appending a live post-reload turn", () => {
    const persisted = messagesFromTraceData({
      ...trace,
      turns: [
        { ...trace.turns[0]!, userMessage: "hi", assistantMessage: "hello" },
        { ...trace.turns[1]!, userMessage: "continue", assistantMessage: "next" },
      ],
    });
    const live = [
      { id: "live_user", role: "user", parts: [{ type: "text", content: "new question" }] },
      { id: "live_assistant", role: "assistant", parts: [{ type: "text", content: "new answer" }] },
    ] as UIMessage[];

    expect(mergePersistedAndLiveMessages(persisted, live).map((message) => message.id)).toEqual([
      "turn_1:user",
      "turn_1:assistant",
      "turn_2:user",
      "turn_2:assistant",
      "live_user",
      "live_assistant",
    ]);
  });

  it("prefers persisted history when a live turn has already been saved", () => {
    const persisted = messagesFromTraceData({
      ...trace,
      turns: [
        { ...trace.turns[0]!, userMessage: "new question", assistantMessage: "saved answer" },
      ],
    });
    const live = [
      { id: "live_user", role: "user", parts: [{ type: "text", content: "new question" }] },
      { id: "live_assistant", role: "assistant", parts: [{ type: "text", content: "streamed answer" }] },
    ] as UIMessage[];

    expect(mergePersistedAndLiveMessages(persisted, live).map((message) => message.id)).toEqual([
      "turn_1:user",
      "turn_1:assistant",
    ]);
  });

  it("selects a single history turn for previous-chat viewing", () => {
    const selected = traceDataForTurn(
      {
        ...trace,
        turns: [
          { ...trace.turns[0]!, userMessage: "first", assistantMessage: "one" },
          { ...trace.turns[1]!, userMessage: "second", assistantMessage: "two" },
        ],
      },
      "turn_2",
    );

    expect(messagesFromTraceData(selected).map((message) => message.parts[0]?.type === "text" ? message.parts[0].content : "")).toEqual([
      "second",
      "two",
    ]);
  });

  it("groups chat history by tutoring session", () => {
    const sessions = buildHistorySessions({
      ...trace,
      turns: [
        { ...trace.turns[0]!, sessionId: "sess_a", userMessage: "first question", assistantMessage: "first answer" },
        { ...trace.turns[1]!, sessionId: "sess_a", userMessage: "follow up", assistantMessage: "second answer" },
        { id: "turn_3", sessionId: "sess_b", turnIndex: 0, createdAt: new Date(Date.now() + 1000).toISOString(), userMessage: "new session", assistantMessage: "new answer", runs: [] },
      ],
    } as ChatTraceResponse);

    expect(sessions.map((session) => [session.sessionId, session.turnCount])).toEqual([
      ["sess_a", 2],
      ["sess_b", 1],
    ]);
  });

  it("selects all turns in a previous session", () => {
    const selected = traceDataForSession(
      {
        ...trace,
        turns: [
          { ...trace.turns[0]!, sessionId: "sess_a", userMessage: "first", assistantMessage: "one" },
          { ...trace.turns[1]!, sessionId: "sess_a", userMessage: "second", assistantMessage: "two" },
          { id: "turn_3", sessionId: "sess_b", turnIndex: 0, createdAt: new Date().toISOString(), userMessage: "third", assistantMessage: "three", runs: [] },
        ],
      } as ChatTraceResponse,
      "sess_a",
    );

    expect(messagesFromTraceData(selected).map((message) => message.parts[0]?.type === "text" ? message.parts[0].content : "")).toEqual([
      "first",
      "one",
      "second",
      "two",
    ]);
  });
});

describe("assistant message normalization", () => {
  it("removes duplicated streaming prefixes from persisted assistant text", () => {
    expect(
      normalizeAssistantMessageText(
        "Absolutely! Let's move forward along the curriculum path. We've covered Fourier's Law thoroughly. Absolutely! Let's move forward along the curriculum path. We've covered Fourier's Law thoroughly. Next topic.",
      ),
    ).toBe("Absolutely! Let's move forward along the curriculum path. We've covered Fourier's Law thoroughly. Next topic.");
  });

  it("keeps tool-process narration in persisted assistant text", () => {
    expect(
      normalizeAssistantMessageText(
        "Let me pull up the selected source chunks to build a clean worked example grounded in your notebook. Now let me save this as a worked-example artifact so you can reference it anytimeHere's a clean worked example saved to your notebook!",
      ),
    ).toBe(
      "Let me pull up the selected source chunks to build a clean worked example grounded in your notebook. Now let me save this as a worked-example artifact so you can reference it anytime Here's a clean worked example saved to your notebook!",
    );
  });

  it("keeps search narration before final content", () => {
    expect(
      normalizeAssistantMessageText(
        "Let me search and expand the graph around thermal conductivity to find connections grounded in your notebook sources. Let me dig into the concept page for context. Here's a concise map.",
      ),
    ).toBe("Let me search and expand the graph around thermal conductivity to find connections grounded in your notebook sources. Let me dig into the concept page for context. Here's a concise map.");
  });

  it("keeps embedded harness narration from persisted assistant text", () => {
    expect(
      normalizeAssistantMessageText(
        "Great start. Let me check the curriculum state. Let me explore what other objectives exist. Here's your next lesson.",
      ),
    ).toBe("Great start. Let me check the curriculum state. Let me explore what other objectives exist. Here's your next lesson.");
  });

  it("preserves block structure instead of flattening tutor markdown into one paragraph", () => {
    const normalized = normalizeAssistantMessageText(
      "Here's a map. --- ## Concept Map ### Directly Connected Concepts | Connected Concept | Evidence | |---|---| | **Fourier's Law** | `cnc_e117f847826344fdbe1f637b1354f9ce` linked in graph | --- 1. **Source evidence** pulled from chunks (`chk_123`, `chk_456`).",
    );
    const blocks = parseTutorTextBlocks(normalized);
    expect(blocks.some((block) => block.type === "heading" && block.text === "Concept Map")).toBe(true);
    expect(blocks.some((block) => block.type === "table")).toBe(true);
    expect(blocks.some((block) => block.type === "numbered-list")).toBe(true);
    expect(JSON.stringify(blocks)).not.toContain("cnc_e117f847826344fdbe1f637b1354f9ce");
    expect(JSON.stringify(blocks)).not.toContain("chk_123");
  });

  it("keeps compact equations and dense tables readable", () => {
    const normalized = normalizeAssistantMessageText(
      "### Values | Quantity | Value | |---|---| | Conductivity | $$k = 400 \\\\text{ W/m·K}$$ | | Gradient | $$\\\\frac{60 - 100}{0.1} = -400 \\\\text{ K/m}$$ |",
    );
    const blocks = parseTutorTextBlocks(normalized);
    expect(blocks.some((block) => block.type === "table")).toBe(true);
  });
});
