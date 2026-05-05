import { describe, expect, it } from "vitest";
import {
  buildStudyAgentSystemPrompt,
  createRuntimeRun,
  createRuntimeToolRegistry,
  resolveModelConfig,
} from "./index.js";

describe("agent-runtime", () => {
  it("builds a sectioned prompt with core tutoring constraints", () => {
    const prompt = buildStudyAgentSystemPrompt({
      notebookTitle: "Linear Algebra",
      activeMode: "learn",
      selectedNodeRefs: [
        { refType: "concept", refId: "concept_vectors" },
        { refType: "source", refId: "src_linalg" },
      ],
      currentObjective: "Understand linear combinations",
      completedObjectivesCount: 2,
      nextObjectives: ["Basis and span", "Dimension intuition"],
      learnerStateSummary: "Weak on geometric interpretation of span.",
    });

    expect(prompt).toContain("[Role]");
    expect(prompt).toContain("[Tool Rules]");
    expect(prompt).toContain("Do not invent citations.");
    expect(prompt).toContain("Selected graph refs: concept:concept_vectors, source:src_linalg");
    expect(prompt).toMatchSnapshot();
  });

  it("creates runtime run with ids, model config, and budgets", () => {
    const run = createRuntimeRun({
      notebookId: "nb_1",
      sessionId: "sess_1",
      userId: "user_1",
      activeMode: "practice",
    });

    expect(run.runId.startsWith("run_")).toBe(true);
    expect(run.traceId.startsWith("trace_")).toBe(true);
    expect(run.modelConfig.model).toBe("openrouter/auto");
    expect(run.budgets.maxToolCalls).toBe(12);
  });

  it("resolves model overrides safely", () => {
    const cfg = resolveModelConfig({ model: "openrouter/gpt-4o-mini", temperature: 0.4 });
    expect(cfg.model).toBe("openrouter/gpt-4o-mini");
    expect(cfg.temperature).toBe(0.4);
    expect(cfg.topP).toBe(0.95);
  });

  it("registers runtime read tools by default", () => {
    const registry = createRuntimeToolRegistry();
    expect(registry.get("wiki.search")).toBeDefined();
    expect(registry.get("study_plan.get_current")).toBeDefined();
    expect(registry.get("wiki.propose_claim")).toBeDefined();
    expect(registry.get("artifact.create_note")).toBeDefined();
  });
});
