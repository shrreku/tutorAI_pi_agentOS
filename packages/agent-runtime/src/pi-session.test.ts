import { describe, expect, it, vi } from "vitest";
import { TOOL_CONTRACT_CATALOG } from "@studyagent/tools";
import { createRuntimeRun, createRuntimeToolRegistry } from "./index.js";
import {
  disposeStudyAgentTutorSession,
  followUpStudyAgentTutorSession,
  getPiToolMetadata,
  getPiToolParameters,
  getStudyAgentTutorRuntimeBinding,
  mapPiSessionEventToAppendInput,
  replaceStudyAgentTutorRuntime,
  runStudyAgentTutorSession,
  steerStudyAgentTutorSession,
} from "./pi-session.js";
import { createAgUiEventMapper } from "./ag-ui.js";

describe("pi session runtime", () => {
  it("derives representative read tool Pi metadata from the tool contract catalog", () => {
    const contract = TOOL_CONTRACT_CATALOG.find((candidate) => candidate.name === "wiki.search");
    const jsonSchema = contract?.inputSchema.toJSONSchema?.() as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    const metadata = getPiToolMetadata("wiki.search");
    const parameters = getPiToolParameters("wiki.search") as {
      properties?: Record<string, unknown>;
      required?: string[];
    };

    expect(contract).toBeDefined();
    expect(metadata).toMatchObject({
      name: "wiki.search",
      label: "wiki.search",
      description: contract?.description,
    });
    expect(Object.keys(parameters.properties ?? {})).toEqual(Object.keys(jsonSchema.properties ?? {}));
    expect(parameters.properties?.query).toEqual({ type: "string" });
    expect(parameters.properties?.selectedNodeRefs).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: {
          refType: { type: "string" },
          refId: { type: "string" },
        },
        required: ["refType", "refId"],
      },
    });
    expect(parameters.required).toEqual(["query"]);
  });

  it("derives representative write tool Pi metadata from the tool contract catalog", () => {
    const contract = TOOL_CONTRACT_CATALOG.find((candidate) => candidate.name === "artifact.create_quiz");
    const jsonSchema = contract?.inputSchema.toJSONSchema?.() as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    const metadata = getPiToolMetadata("artifact.create_quiz");
    const parameters = getPiToolParameters("artifact.create_quiz") as {
      properties?: Record<string, unknown>;
      required?: string[];
    };

    expect(contract).toBeDefined();
    expect(metadata).toMatchObject({
      name: "artifact.create_quiz",
      label: "artifact.create_quiz",
      description: "Creates a draft quiz artifact from notebook concepts and sources.",
    });
    expect(Object.keys(parameters.properties ?? {})).toEqual(Object.keys(jsonSchema.properties ?? {}));
    expect(parameters.properties?.title).toEqual({ type: "string" });
    expect(parameters.properties?.questionCount).toEqual({ type: "number" });
    expect(parameters.properties?.sourceNodeRefs).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: {
          refType: { type: "string" },
          refId: { type: "string" },
        },
        required: ["refType", "refId"],
      },
    });
    expect(parameters.required).toEqual(["title", "prompt"]);
  });

  it("snapshots Pi adapter metadata derived from tool contracts", () => {
    expect(getPiToolMetadata("wiki.search")).toMatchSnapshot();
    expect(getPiToolMetadata("artifact.create_quiz")).toMatchSnapshot();
  });

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
      turnId: "turn_quiz",
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

  it("uses governed write tools for concept card requests", async () => {
    const run = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_card",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [{ refType: "concept", refId: "concept_conduction" }],
    });
    const toolRegistry = createRuntimeToolRegistry();

    const events = [];
    for await (const event of runStudyAgentTutorSession({
      run,
      turnId: "turn_card",
      toolRegistry,
      config: { useMock: true },
      userMessage: "Create a concept card for conduction",
      promptContext: {
        notebookTitle: "Heat Transfer",
        activeMode: "learn",
        selectedNodeRefs: run.selectedNodeRefs,
      },
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "tool_call_start" && event.data.toolName === "artifact.create_concept_card")).toBe(true);
    expect(events.some((event) => event.type === "tool_call_complete" && event.data.toolName === "artifact.create_concept_card")).toBe(true);
  });

  it("saves a resumable quiz draft when runtime tool budget is exhausted", async () => {
    const run = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_budget",
      userId: "user_1",
      activeMode: "practice",
      selectedNodeRefs: [{ refType: "concept", refId: "concept_vectors" }],
      budgets: { maxToolCalls: 0 },
    });
    const toolRegistry = createRuntimeToolRegistry();
    const onToolLifecycleEvent = vi.fn();

    const events = [];
    for await (const event of runStudyAgentTutorSession({
      run,
      turnId: "turn_budget",
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
    expect(events.some((event) => event.type === "run_error" && event.data.code === "tool_budget_exceeded")).toBe(false);
    expect(events.some((event) => event.type === "message_complete" && event.data.text.includes("resumable quiz draft"))).toBe(true);
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

  it("replaces runtime when user changes", async () => {
    const toolRegistry = createRuntimeToolRegistry();
    const initialRun = createRuntimeRun({
      notebookId: "nb_matrix",
      sessionId: "sess_matrix",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });
    for await (const _event of runStudyAgentTutorSession({
      run: initialRun,
      toolRegistry,
      config: { useMock: true },
      userMessage: "teach me",
      promptContext: { notebookTitle: "N", activeMode: "learn", selectedNodeRefs: [] },
    })) {
      // drain
    }

    const userChanged = createRuntimeRun({
      notebookId: "nb_matrix",
      sessionId: "sess_matrix",
      userId: "user_2",
      activeMode: "learn",
      selectedNodeRefs: [],
    });
    const byUser = await replaceStudyAgentTutorRuntime({ previousSessionId: "sess_matrix", nextRun: userChanged });
    expect(byUser.replaced).toBe(true);

  });

  it("replaces runtime when selected refs materially change", async () => {
    const toolRegistry = createRuntimeToolRegistry();
    const initialRun = createRuntimeRun({
      notebookId: "nb_matrix",
      sessionId: "sess_refs",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [{ refType: "concept", refId: "c_1" }],
    });
    for await (const _event of runStudyAgentTutorSession({
      run: initialRun,
      toolRegistry,
      config: { useMock: true },
      userMessage: "teach me",
      promptContext: { notebookTitle: "N", activeMode: "learn", selectedNodeRefs: initialRun.selectedNodeRefs },
    })) {
      // drain
    }

    const refsChangedRun = createRuntimeRun({
      notebookId: "nb_matrix",
      sessionId: "sess_refs",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [{ refType: "concept", refId: "c_2" }],
    });
    const replacement = await replaceStudyAgentTutorRuntime({ previousSessionId: "sess_refs", nextRun: refsChangedRun });
    expect(replacement.replaced).toBe(true);
    expect(replacement.binding?.reason).toBe("selected_refs_changed");
  });

  it("replaces runtime when StudyAgent host state changes with the same selected refs", async () => {
    const toolRegistry = createRuntimeToolRegistry();
    const selectedNodeRefs = [{ refType: "source" as const, refId: "src_same" }];
    const initialRun = createRuntimeRun({
      notebookId: "nb_host_state",
      sessionId: "sess_host_state",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs,
      hostStateSignature: "host_state_current_objective_a",
    });
    for await (const _event of runStudyAgentTutorSession({
      run: initialRun,
      toolRegistry,
      config: { useMock: true },
      userMessage: "teach me",
      promptContext: { notebookTitle: "N", activeMode: "learn", selectedNodeRefs, currentObjective: "Objective A" },
    })) {
      // drain
    }

    const hostStateChangedRun = createRuntimeRun({
      notebookId: "nb_host_state",
      sessionId: "sess_host_state",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs,
      hostStateSignature: "host_state_current_objective_b",
    });
    const replacement = await replaceStudyAgentTutorRuntime({
      previousSessionId: "sess_host_state",
      nextRun: hostStateChangedRun,
    });

    expect(replacement.replaced).toBe(true);
    expect(replacement.binding).toEqual(
      expect.objectContaining({
        hostStateSignature: "host_state_current_objective_b",
        reason: "host_state_changed",
      }),
    );
  });

  it("passes tutor turn identity to Pi-executed write tools", async () => {
    const run = createRuntimeRun({
      notebookId: "nb_tool_turn",
      sessionId: "sess_tool_turn",
      userId: "user_1",
      activeMode: "practice",
      selectedNodeRefs: [{ refType: "concept", refId: "concept_vectors" }],
    });
    const writeProvider = {
      createQuiz: vi.fn(async (_input, ctx) => ({
        artifactId: "artifact_turn_bound",
        status: "draft",
        warnings: [],
        reducerResult: {
          accepted: true,
          mutationType: "artifact.created",
          appliedChanges: { turnId: ctx.turnId },
          emittedEventIds: [],
        },
      })),
    };
    const toolRegistry = createRuntimeToolRegistry({ writeProvider: writeProvider as never });

    for await (const _event of runStudyAgentTutorSession({
      run,
      turnId: "turn_runtime_1",
      toolRegistry,
      config: { useMock: true },
      userMessage: "Create a quiz on vectors",
      promptContext: {
        notebookTitle: "Linear Algebra",
        activeMode: "practice",
        selectedNodeRefs: run.selectedNodeRefs,
      },
    })) {
      // drain
    }

    expect(writeProvider.createQuiz).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: run.runId,
      turnId: "turn_runtime_1",
      sessionId: "sess_tool_turn",
    }));
  });

  it("replaces runtime when session id changes", async () => {
    const toolRegistry = createRuntimeToolRegistry();
    const initialRun = createRuntimeRun({
      notebookId: "nb_matrix",
      sessionId: "sess_old",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });
    for await (const _event of runStudyAgentTutorSession({
      run: initialRun,
      toolRegistry,
      config: { useMock: true },
      userMessage: "teach me",
      promptContext: { notebookTitle: "N", activeMode: "learn", selectedNodeRefs: [] },
    })) {
      // drain
    }

    const newSessionRun = createRuntimeRun({
      notebookId: "nb_matrix",
      sessionId: "sess_new",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });
    const replacement = await replaceStudyAgentTutorRuntime({ previousSessionId: "sess_old", nextRun: newSessionRun });
    expect(replacement.replaced).toBe(true);
    expect(replacement.binding?.reason).toBe("session_changed");
  });

  it("replaces runtime when prompt template version changes", async () => {
    const toolRegistry = createRuntimeToolRegistry();
    const initialRun = createRuntimeRun({
      notebookId: "nb_matrix",
      sessionId: "sess_prompt",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });
    for await (const _event of runStudyAgentTutorSession({
      run: initialRun,
      toolRegistry,
      config: { useMock: true },
      userMessage: "teach me",
      promptContext: { notebookTitle: "N", activeMode: "learn", selectedNodeRefs: [] },
    })) {
      // drain
    }

    const promptChangedRun = {
      ...initialRun,
      modelConfig: {
        ...initialRun.modelConfig,
        promptTemplateVersion: "studyagent-tutor-vNEXT",
      },
    } as any;
    const replacement = await replaceStudyAgentTutorRuntime({
      previousSessionId: "sess_prompt",
      nextRun: promptChangedRun,
    });
    expect(replacement.replaced).toBe(true);
    expect(replacement.binding?.reason).toBe("prompt_changed");
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
      turnId: "turn_flashcards",
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

  it("keeps multi-turn sessions active across runs and disposes on lifecycle end", async () => {
    const toolRegistry = createRuntimeToolRegistry();
    const runA = createRuntimeRun({
      notebookId: "nb_chain",
      sessionId: "sess_chain",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });

    for await (const _event of runStudyAgentTutorSession({
      run: runA,
      toolRegistry,
      config: { useMock: true },
      userMessage: "teach me derivatives",
      promptContext: { notebookTitle: "Calculus", activeMode: "learn", selectedNodeRefs: [] },
    })) {
      // drain
    }

    const afterFirstTurn = getStudyAgentTutorRuntimeBinding("sess_chain");
    expect(afterFirstTurn).toEqual(expect.objectContaining({ sessionId: "sess_chain", reason: "created" }));

    const runB = createRuntimeRun({
      notebookId: "nb_chain",
      sessionId: "sess_chain",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });
    const replacement = await replaceStudyAgentTutorRuntime({ previousSessionId: "sess_chain", nextRun: runB });
    expect(replacement.replaced).toBe(false);
    expect(getStudyAgentTutorRuntimeBinding("sess_chain")).toEqual(
      expect.objectContaining({ notebookId: "nb_chain", sessionId: "sess_chain" }),
    );

    await disposeStudyAgentTutorSession("sess_chain");
    expect(getStudyAgentTutorRuntimeBinding("sess_chain")).toBeNull();
  });

  it("maps runtime events to durable append payload contracts", () => {
    const run = createRuntimeRun({
      notebookId: "nb_events",
      sessionId: "sess_events",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });

    const started = mapPiSessionEventToAppendInput({ type: "message_start", data: { runId: run.runId } }, run);
    const delta = mapPiSessionEventToAppendInput({ type: "message_delta", data: { text: "hello" } }, run);
    const completed = mapPiSessionEventToAppendInput(
      { type: "message_complete", data: { text: "done", stopReason: "end_turn" } },
      run,
    );
    const toolStarted = mapPiSessionEventToAppendInput(
      { type: "tool_call_start", data: { toolName: "artifact.create_note", toolCallId: "tool_1", args: { title: "Note" } } },
      run,
    );
    const toolCompleted = mapPiSessionEventToAppendInput(
      {
        type: "tool_call_complete",
        data: {
          toolName: "artifact.create_note",
          toolCallId: "tool_1",
          args: { title: "Note" },
          result: {
            artifactId: "artifact_1",
            reducerResult: {
              accepted: true,
              mutationType: "artifact.created",
              appliedChanges: { artifactId: "artifact_1" },
              emittedEventIds: [],
            },
          },
        },
      },
      run,
    );
    const failed = mapPiSessionEventToAppendInput(
      { type: "run_error", data: { error: "boom", code: "runtime_error" } },
      run,
    );

    expect(started).toEqual(
      expect.objectContaining({
        notebookId: "nb_events",
        sessionId: "sess_events",
        runId: run.runId,
        eventType: "agent.run.started",
      }),
    );
    expect(delta?.eventType).toBe("tutor.message.delta");
    expect(completed).toEqual(
      expect.objectContaining({
        eventType: "tutor.message.completed",
        payload: expect.objectContaining({
          text: "done",
          stopReason: "end_turn",
          model: run.modelConfig.model,
          provider: run.modelConfig.provider,
          promptTemplateVersion: run.modelConfig.promptTemplateVersion,
        }),
      }),
    );
    expect(toolStarted).toEqual(
      expect.objectContaining({
        eventType: "agent.tool.started",
        payload: expect.objectContaining({ toolName: "artifact.create_note", toolCallId: "tool_1", args: { title: "Note" } }),
      }),
    );
    expect(toolCompleted).toEqual(
      expect.objectContaining({
        eventType: "agent.tool.completed",
        payload: expect.objectContaining({
          toolName: "artifact.create_note",
          toolCallId: "tool_1",
          args: { title: "Note" },
          result: expect.objectContaining({ artifactId: "artifact_1" }),
          reducerResult: expect.objectContaining({
            accepted: true,
            mutationType: "artifact.created",
          }),
        }),
      }),
    );
    expect(failed).toEqual(
      expect.objectContaining({
        eventType: "agent.run.failed",
        payload: expect.objectContaining({ failureKind: "runtime_error", safeMessage: "boom" }),
      }),
    );
  });

  it("maps empty model responses to run errors in AG-UI contracts", () => {
    const run = createRuntimeRun({
      notebookId: "nb_empty",
      sessionId: "sess_empty",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
    });
    const appendInput = mapPiSessionEventToAppendInput(
      { type: "run_error", data: { error: "Model completed without assistant text or tool calls", code: "empty_model_response" } },
      run,
    );
    const agui = createAgUiEventMapper(run).map({
      type: "run_error",
      data: { error: "Model completed without assistant text or tool calls", code: "empty_model_response" },
    });

    expect(appendInput).toEqual(
      expect.objectContaining({
        eventType: "agent.run.failed",
        payload: expect.objectContaining({ failureKind: "empty_model_response" }),
      }),
    );
    expect(agui).toEqual([
      expect.objectContaining({
        type: "RUN_ERROR",
        error: expect.objectContaining({ code: "empty_model_response" }),
      }),
    ]);
  });

  it("emits AG-UI content as deltas instead of accumulated text", () => {
    const run = createRuntimeRun({
      notebookId: "nb_stream",
      sessionId: "sess_stream",
      userId: "user_1",
      activeMode: "learn",
      selectedNodeRefs: [],
      modelConfig: { model: "deepseek/deepseek-v4-flash" },
    });
    const mapper = createAgUiEventMapper(run);

    const first = mapper.map({ type: "message_delta", data: { text: "Hello " } });
    const second = mapper.map({ type: "message_delta", data: { text: "there" } });

    expect(first.find((event) => event.type === "TEXT_MESSAGE_CONTENT")).toMatchObject({
      delta: "Hello ",
      content: "Hello ",
    });
    expect(second).toEqual([
      expect.objectContaining({
        type: "TEXT_MESSAGE_CONTENT",
        delta: "there",
        content: "there",
      }),
    ]);
  });
});
