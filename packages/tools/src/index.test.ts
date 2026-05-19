import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@studyagent/schemas";
import { reducerResultSchema } from "@studyagent/schemas";
import { z } from "zod";
import {
  assertToolCatalogMatchesRegistry,
  createNoopRuntimeReadToolProvider,
  createNoopRuntimeWriteToolProvider,
  executeTool,
  getToolContract,
  normalizeToolInputAliases,
  READ_TOOL_CONTRACTS,
  registerReadToolsV1,
  registerRuntimeToolsV1,
  TOOL_CONTRACT_CATALOG,
  ToolRegistry,
} from "./index.js";

describe("tools runtime registry", () => {
  const baseContext: ToolContext = {
    userId: "user_1",
    notebookId: "nb_1",
    runId: "run_1",
    traceId: "trace_1",
    permissions: {},
    selectedNodeRefs: [],
  };

  it("registers v1 runtime tools from the contract catalog", () => {
    const registry = new ToolRegistry();
    registerRuntimeToolsV1(registry, {
      read: createNoopRuntimeReadToolProvider(),
      write: createNoopRuntimeWriteToolProvider(),
    });
    assertToolCatalogMatchesRegistry(registry);

    const names = registry.list().map((t) => t.name).sort();
    expect(names).toEqual(
      TOOL_CONTRACT_CATALOG.map((contract) => contract.name).sort(),
    );
  });

  it("looks up tool contracts from the shared catalog", () => {
    const contract = getToolContract("artifact.create_quiz");
    expect(contract).toBeDefined();
    expect(contract?.name).toBe("artifact.create_quiz");
    expect(contract?.description).toContain("quiz artifact");
  });

  it("keeps read tool registrations covered by catalog contracts", () => {
    const registry = new ToolRegistry();
    const provider = createNoopRuntimeReadToolProvider();
    registerReadToolsV1(registry, provider);

    expect(READ_TOOL_CONTRACTS.map((contract) => contract.name).sort()).toEqual(
      registry.list().map((tool) => tool.name).sort(),
    );

    for (const contract of READ_TOOL_CONTRACTS) {
      const tool = registry.get(contract.name);
      expect(tool).toBeDefined();
      expect(typeof provider[contract.providerMethod]).toBe("function");
      expect(tool?.inputSchema).toBe(contract.inputSchema);
      expect(tool?.outputSchema).toBe(contract.outputSchema);
      expect(tool?.sideEffectClass).toBe(contract.sideEffectClass);
      expect(contract.operationKind).toBe("read");
      expect(contract.reducerExpectation.required).toBe(false);
    }
  });

  it("executes a tool with start and completion events", async () => {
    const registry = new ToolRegistry();
    registerReadToolsV1(registry, createNoopRuntimeReadToolProvider());
    const events: string[] = [];

    const result = await executeTool(registry, "wiki.search", { query: "vectors" }, baseContext, {
      onEvent(event) {
        events.push(event.eventType);
      },
    });

    expect(result).toEqual({ results: [] });
    expect(events).toEqual(["agent.tool.started", "agent.tool.completed"]);
  });

  it("emits a failed event on validation errors", async () => {
    const registry = new ToolRegistry();
    registerReadToolsV1(registry, createNoopRuntimeReadToolProvider());
    const onEvent = vi.fn();

    await expect(
      executeTool(registry, "wiki.search", { maxResults: 3 }, baseContext, { onEvent }),
    ).rejects.toThrow("Invalid input for tool wiki.search");

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1]?.[0]?.eventType).toBe("agent.tool.failed");
    expect(onEvent.mock.calls[1]?.[0]?.payload).toEqual(
      expect.objectContaining({
        code: "tool_validation_error",
        details: expect.objectContaining({
          fieldErrors: expect.objectContaining({ query: expect.any(Array) }),
        }),
      }),
    );
  });

  it("rejects write outputs with malformed reducer results", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "test.bad_reducer",
      description: "Malformed reducer output",
      inputSchema: z.object({}),
      outputSchema: z.object({ reducerResult: reducerResultSchema }),
      sideEffectClass: "candidate_write",
      timeoutMs: 1000,
      async execute() {
        return {
          reducerResult: {
            accepted: true,
            mutationType: "artifact.created",
            appliedChanges: undefined,
            emittedEventIds: [],
            rejectedReason: "should not be accepted",
          },
        } as never;
      },
    });

    await expect(executeTool(registry, "test.bad_reducer", {}, baseContext)).rejects.toThrow(
      "Invalid input for tool test.bad_reducer",
    );
  });

  it("normalizes snake_case LLM tool args before schema validation", async () => {
    expect(
      normalizeToolInputAliases({
        source_node_refs: [{ ref_type: "chunk", ref_id: "chk_1" }],
        question_count: 2,
      }),
    ).toEqual({
      sourceNodeRefs: [{ refType: "chunk", refId: "chk_1" }],
      questionCount: 2,
    });
  });

  it("canonicalizes common source span aliases before executing", async () => {
    const registry = new ToolRegistry();
    const seen: unknown[] = [];
    registerReadToolsV1(registry, {
      ...createNoopRuntimeReadToolProvider(),
      async sourceGetSpan(input) {
        seen.push(input);
        return {
          text: "",
          sourceId: input.sourceId ?? "src_1",
          sourceVersionId: input.sourceVersionId,
          pageStart: input.pageStart,
          pageEnd: input.pageEnd,
          headingPath: [],
          citation: { sourceTitle: "Source", sourceType: "pdf" },
        };
      },
    });

    await executeTool(registry, "source.get_span", { ref: "chunk:chk_1" }, baseContext);
    await executeTool(registry, "source.get_span", { source_id: "chk_2" }, baseContext);
    await executeTool(registry, "source.get_span", { source_node_ref: { ref_type: "source", ref_id: "src_1" } }, baseContext);

    expect(seen).toEqual([
      expect.objectContaining({ chunkId: "chk_1" }),
      expect.objectContaining({ chunkId: "chk_2" }),
      expect.objectContaining({ sourceId: "src_1" }),
    ]);
  });

  it("canonicalizes learning state requestedConceptIds", async () => {
    const registry = new ToolRegistry();
    const seen: unknown[] = [];
    registerReadToolsV1(registry, {
      ...createNoopRuntimeReadToolProvider(),
      async learningGetState(input) {
        seen.push(input);
        return { conceptStates: [] };
      },
    });

    await executeTool(registry, "learning.get_state", { requested_concept_ids: ["cnc_1"] }, baseContext);

    expect(seen).toEqual([expect.objectContaining({ conceptIds: ["cnc_1"] })]);
  });
});
