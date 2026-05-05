import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@studyagent/schemas";
import { createNoopRuntimeReadToolProvider, executeTool, registerReadToolsV1, ToolRegistry } from "./index.js";

describe("tools runtime registry", () => {
  const baseContext: ToolContext = {
    userId: "user_1",
    notebookId: "nb_1",
    runId: "run_1",
    traceId: "trace_1",
    permissions: {},
    selectedNodeRefs: [],
  };

  it("registers v1 runtime read tools", () => {
    const registry = new ToolRegistry();
    registerReadToolsV1(registry, createNoopRuntimeReadToolProvider());

    const names = registry.list().map((t) => t.name).sort();
    expect(names).toEqual([
      "curriculum.get",
      "graph.get_source_wiki_map",
      "graph.get_study_map",
      "graph.get_subgraph",
      "learning.get_state",
      "notebook.get_context",
      "source.get_span",
      "student_profile.get",
      "study_plan.get_current",
      "wiki.get_page",
      "wiki.search",
    ]);
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
  });
});
