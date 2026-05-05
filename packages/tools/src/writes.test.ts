import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@studyagent/schemas";
import {
  buildReducerResult,
  createNoopRuntimeWriteToolProvider,
  createArtifactReducerResult,
  createNoopRuntimeReadToolProvider,
  executeTool,
  proposeClaimReducerResult,
  registerReadToolsV1,
  registerWriteToolsV1,
  ToolRegistry,
} from "./index.js";

describe("write tools", () => {
  const baseContext: ToolContext = {
    userId: "user_1",
    notebookId: "nb_1",
    runId: "run_1",
    traceId: "trace_1",
    permissions: {},
    selectedNodeRefs: [],
  };

  it("registers candidate write tools", () => {
    const registry = new ToolRegistry();
    registerReadToolsV1(registry, createNoopRuntimeReadToolProvider());
    registerWriteToolsV1(registry, createNoopRuntimeWriteToolProvider());

    expect(registry.get("wiki.propose_claim")).toBeDefined();
    expect(registry.get("artifact.create_note")).toBeDefined();
    expect(registry.get("artifact.create_quiz")).toBeDefined();
    expect(registry.get("artifact.create_flashcards")).toBeDefined();
    expect(registry.get("artifact.create_worked_example")).toBeDefined();
    expect(registry.get("artifact.create_formula_sheet")).toBeDefined();
    expect(registry.get("artifact.create_comparison_page")).toBeDefined();
    expect(registry.get("coverage.mark_introduced")).toBeDefined();
    expect(registry.get("coverage.mark_checked")).toBeDefined();
    expect(registry.get("coverage.get_gaps")).toBeDefined();
    expect(registry.get("session_plan.update")).toBeDefined();
    expect(registry.get("artifact.update_session_plan")).toBeDefined();
    expect(registry.get("student_profile.update_preferences")).toBeDefined();
  });

  it("executes a claim proposal with reducer metadata", async () => {
    const registry = new ToolRegistry();
    registerWriteToolsV1(registry, createNoopRuntimeWriteToolProvider());
    const events: string[] = [];

    const result = await executeTool(
      registry,
      "wiki.propose_claim",
      {
        claimText: "A basis spans the whole vector space.",
        claimType: "definition",
        conceptIds: ["concept_basis"],
        sourceRefs: [{ refType: "source", refId: "src_1" }],
      },
      baseContext,
      {
        onEvent(event) {
          events.push(event.eventType);
        },
      },
    );

    expect((result as { status: string }).status).toBe("candidate");
    expect(events).toEqual(["agent.tool.started", "agent.tool.completed"]);
  });

  it("builds reducer results for accepted writes", () => {
    const reducer = buildReducerResult("artifact.created", { title: "Notes" });
    expect(reducer.accepted).toBe(true);
    expect(proposeClaimReducerResult({
      candidateClaimId: "claim_1",
      notebookId: "nb_1",
      claimText: "x",
      claimType: "definition",
      sourceRefs: [{ refType: "source", refId: "src_1" }],
      conceptIds: [],
    }).mutationType).toBe("wiki.claim.proposed");
    expect(createArtifactReducerResult({
      artifactId: "artifact_1",
      notebookId: "nb_1",
      artifactType: "note",
      title: "Note",
      sourceNodeRefs: [],
    }).accepted).toBe(true);
    expect(createArtifactReducerResult({
      artifactId: "artifact_2",
      notebookId: "nb_1",
      artifactType: "worked_example",
      title: "Worked example",
      sourceNodeRefs: [],
    }).accepted).toBe(true);
  });

  it("emits a failed event for invalid write inputs", async () => {
    const registry = new ToolRegistry();
    registerWriteToolsV1(registry, createNoopRuntimeWriteToolProvider());
    const onEvent = vi.fn();

    await expect(
      executeTool(registry, "artifact.create_quiz", { title: "Quiz" }, baseContext, { onEvent }),
    ).rejects.toThrow("Invalid input for tool artifact.create_quiz");

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1]?.[0]?.eventType).toBe("agent.tool.failed");
  });
});