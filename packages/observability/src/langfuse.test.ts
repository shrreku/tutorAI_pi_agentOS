import { describe, expect, it } from "vitest";
import {
  DurableEventSummaryCollector,
  observeAgenticSpan,
  resolveManagedTextPrompt,
  startAgenticObservation,
  syncManagedTextPrompts,
} from "./index.js";

describe("Langfuse observability facade", () => {
  it("falls back to local managed prompts when Langfuse credentials are absent", async () => {
    const resolved = await resolveManagedTextPrompt({
      env: {},
      name: "studyagent-tutor-system",
      label: "production",
      fallback: "Local prompt for Notebook A",
      variables: { notebookContext: "Notebook: A" },
    });

    expect(resolved.prompt).toBe("Local prompt for Notebook A");
    expect(resolved.metadata).toEqual({
      name: "studyagent-tutor-system",
      type: "text",
      label: "production",
      isFallback: true,
      source: "local_fallback",
    });
    expect(resolved.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("requires Langfuse credentials for explicit prompt sync", async () => {
    await expect(
      syncManagedTextPrompts({
        env: {},
        prompts: [{ name: "studyagent-tutor-system", prompt: "Prompt", labels: ["production"] }],
      }),
    ).rejects.toThrow("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY");
  });

  it("keeps agentic observations no-op safe without initialized tracing", () => {
    const observation = startAgenticObservation("tool.call", {
      input: { toolName: "wiki.search" },
    });
    observation.update({ output: { status: "ok" } });
    observation.updateTrace?.({ tags: ["test"] });
    observation.end();
  });

  it("flushes durable event summaries safely without initialized tracing", async () => {
    const collector = new DurableEventSummaryCollector();
    collector.recordSuccess("notebook.created");
    collector.recordError("agent.run.failed");

    await expect(
      collector.flush({
        traceId: "trace_1",
        sessionId: "sess_1",
        runId: "run_1",
      }),
    ).resolves.toBeUndefined();
  });
});
