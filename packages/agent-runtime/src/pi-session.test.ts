import { describe, expect, it, vi } from "vitest";
import { createRuntimeRun, createRuntimeToolRegistry } from "./index.js";
import {
  followUpStudyAgentTutorSession,
  getStudyAgentTutorRuntimeBinding,
  replaceStudyAgentTutorRuntime,
  runStudyAgentTutorSession,
  steerStudyAgentTutorSession,
} from "./pi-session.js";

describe("pi session runtime", () => {
  it("uses governed write tools for quiz requests", async () => {
    const run = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "practice",
      selectedNodeRefs: [
        { refType: "concept", refId: "concept_vectors" },
        { refType: "source", refId: "src_vectors" },
      ],
    });
    const toolRegistry = createRuntimeToolRegistry();
    const onToolLifecycleEvent = vi.fn();

    const events = [];
    for await (const event of runStudyAgentTutorSession({
      run,
      toolRegistry,
      onToolLifecycleEvent,
      config: { useMock: true },
      userMessage: "Create a quiz on vectors",
      promptContext: {
        notebookTitle: "Linear Algebra",
        activeMode: "practice",
        selectedNodeRefs: run.selectedNodeRefs,
      },
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "tool_call_start" && event.data.toolName === "artifact.create_quiz")).toBe(true);
    expect(events.some((event) => event.type === "tool_call_complete" && event.data.toolName === "artifact.create_quiz")).toBe(true);
    expect(events.some((event) => event.type === "message_complete" && event.data.text.includes("quiz draft"))).toBe(true);
    expect(onToolLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "completed",
        toolName: "artifact.create_quiz",
      }),
    );
  });

  it("supports steer and follow-up queue semantics in the runtime adapter", async () => {
    const run = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_steer",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });
    const toolRegistry = createRuntimeToolRegistry();

    const steerEvents = [];
    for await (const event of steerStudyAgentTutorSession({
      run,
      toolRegistry,
      config: { useMock: true },
      userMessage: "focus on the example",
      promptContext: {
        notebookTitle: "Linear Algebra",
        activeMode: "learn",
        selectedNodeRefs: [],
      },
    })) {
      steerEvents.push(event);
    }

    const followUpEvents = [];
    for await (const event of followUpStudyAgentTutorSession({
      run,
      toolRegistry,
      config: { useMock: true },
      userMessage: "after this, quiz me",
      promptContext: {
        notebookTitle: "Linear Algebra",
        activeMode: "learn",
        selectedNodeRefs: [],
      },
    })) {
      followUpEvents.push(event);
    }

    expect(steerEvents.some((event) => event.type === "message_delta" && event.data.text.includes("[steered]"))).toBe(true);
    expect(followUpEvents.some((event) => event.type === "message_delta" && event.data.text.includes("[follow-up]"))).toBe(true);
  });

  it("makes hosted runtime replacement explicit for material context changes", async () => {
    const toolRegistry = createRuntimeToolRegistry();
    const firstRun = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_replace",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });

    for await (const _event of runStudyAgentTutorSession({
      run: firstRun,
      toolRegistry,
      config: { useMock: true },
      userMessage: "teach me",
      promptContext: { notebookTitle: "Notebook 1", activeMode: "learn", selectedNodeRefs: [] },
    })) {
      // drain
    }

    expect(getStudyAgentTutorRuntimeBinding("sess_replace")).toEqual(
      expect.objectContaining({ notebookId: "nb_1", sessionId: "sess_replace", reason: "created" }),
    );

    const nextRun = createRuntimeRun({
      notebookId: "nb_2",
      sessionId: "sess_replace",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });
    const replacement = await replaceStudyAgentTutorRuntime({ nextRun, reason: "notebook_changed" });

    expect(replacement).toEqual(
      expect.objectContaining({ replaced: true, disposedSessionId: "sess_replace" }),
    );
    expect(replacement.binding).toEqual(expect.objectContaining({ notebookId: "nb_2", reason: "notebook_changed" }));
    expect(getStudyAgentTutorRuntimeBinding("sess_replace")).toBeNull();
  });

  it("uses governed write tools for flashcard requests", async () => {
    const run = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "revise",
      selectedNodeRefs: [{ refType: "concept", refId: "concept_vectors" }],
    });
    const toolRegistry = createRuntimeToolRegistry();

    const events = [];
    for await (const event of runStudyAgentTutorSession({
      run,
      toolRegistry,
      config: { useMock: true },
      userMessage: "Make a flashcard deck for vectors",
      promptContext: {
        notebookTitle: "Linear Algebra",
        activeMode: "revise",
        selectedNodeRefs: run.selectedNodeRefs,
      },
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "tool_call_start" && event.data.toolName === "artifact.create_flashcards")).toBe(true);
    expect(events.some((event) => event.type === "tool_call_complete" && event.data.toolName === "artifact.create_flashcards")).toBe(true);
  });
});
