import { describe, expect, it } from "vitest";
import type { ToolContext } from "@studyagent/schemas";
import { z } from "zod";
import {
  assertReadToolProviderCoverage,
  assertToolCatalogMatchesRegistry,
  assertWriteToolProviderCoverage,
  createNoopRuntimeReadToolProvider,
  createNoopRuntimeWriteToolProvider,
  executeTool,
  getToolContract,
  READ_TOOL_CONTRACTS,
  registerReadToolsV1,
  registerRuntimeToolsV1,
  registerWriteToolsV1,
  TOOL_CONTRACT_CATALOG,
  ToolCatalogCoverageError,
  ToolRegistry,
  ToolValidationError,
  WRITE_TOOL_CONTRACTS,
} from "./index.js";
import { reducerResultSchema } from "@studyagent/schemas";

describe("tool contract catalog", () => {
  const baseContext: ToolContext = {
    userId: "user_1",
    notebookId: "nb_1",
    sessionId: "sess_1",
    runId: "run_1",
    turnId: "turn_1",
    traceId: "trace_1",
    permissions: {},
    selectedNodeRefs: [],
  };

  it("catalogs every tutor runtime read and write tool", () => {
    const names = TOOL_CONTRACT_CATALOG.map((contract) => contract.name).sort();
    expect(names).toEqual([
      "artifact.create_comparison_page",
      "artifact.create_concept_card",
      "artifact.create_flashcards",
      "artifact.create_formula_sheet",
      "artifact.create_note",
      "artifact.create_quiz",
      "artifact.create_worked_example",
      "artifact.insert_into_tutor_context",
      "artifact.update_session_plan",
      "coverage.get_gaps",
      "coverage.mark_checked",
      "coverage.mark_introduced",
      "curriculum.activate",
      "curriculum.get",
      "graph.get_source_wiki_map",
      "graph.get_study_map",
      "graph.get_subgraph",
      "interactive_surface.launch",
      "learner_trait.record_signal",
      "learning.evaluate_response",
      "learning.get_state",
      "module.update",
      "notebook.get_context",
      "objective.update",
      "objective_list.merge_objectives",
      "objective_list.reorder",
      "objective_list.split_objective",
      "objective_list.update",
      "session_plan.update",
      "source.get_span",
      "student_profile.get",
      "student_profile.update_preferences",
      "study_plan.get_current",
      "wiki.ensure_concept_page",
      "wiki.ensure_topic_page",
      "wiki.get_page",
      "wiki.propose_claim",
      "wiki.search",
      "wiki.touch_concept",
      "wiki.touch_topic",
    ]);
  });

  it("distinguishes read-only and write reducer contracts", () => {
    const readContract = getToolContract("wiki.search");
    const writeContract = getToolContract("artifact.create_quiz");

    expect(readContract?.operationKind).toBe("read");
    expect(readContract?.reducerExpectation.required).toBe(false);
    expect(writeContract?.operationKind).toBe("write");
    expect(writeContract?.reducerExpectation.required).toBe(true);
    const writeExpectation = writeContract?.reducerExpectation;
    expect(writeExpectation && "mutationTypes" in writeExpectation ? writeExpectation.mutationTypes : []).toContain(
      "artifact.created",
    );
  });

  it("exposes semantic handles in study plan output", () => {
    const contract = getToolContract("study_plan.get_current");
    const parsed = contract?.outputSchema.parse({
      studyPlan: {
        id: "plan_1",
        ref: { refType: "study_plan", refId: "plan_1", handle: "Heat transfer plan", title: "Heat transfer plan" },
        handle: "Heat transfer plan",
        notebookId: "nb_1",
        userId: "user_1",
        title: "Heat transfer plan",
        status: "active",
        currentObjectiveId: "obj_1",
        upcomingObjectiveIds: [],
        completedObjectiveIds: [],
        weakConceptIds: ["concept_1"],
        currentObjective: {
          id: "obj_1",
          ref: { refType: "objective", refId: "obj_1", handle: "current_objective", title: "Connect Fourier's law with heat flux" },
          handle: "current_objective",
          title: "Connect Fourier's law with heat flux",
          status: "in_progress",
          targetConcepts: [],
          prerequisiteConcepts: [],
        },
        upcomingObjectives: [],
        completedObjectives: [],
        weakConcepts: [
          {
            id: "concept_1",
            ref: { refType: "concept", refId: "concept_1", handle: "Heat flux", title: "Heat flux" },
            handle: "Heat flux",
            title: "Heat flux",
            name: "Heat flux",
          },
        ],
      },
      studentProfile: null,
      curriculum: null,
      module: null,
      objectiveList: null,
      sessionPlan: null,
      boundarySignals: [
        {
          type: "session_plan_boundary",
          strength: "likely",
          scopeRef: { refType: "session_plan", refId: "sessplan_1" },
          summary: "The active session plan has no remaining current objective.",
          evidenceRefs: [{ refType: "session_plan", refId: "sessplan_1" }],
        },
      ],
    }) as { studyPlan?: { currentObjective?: { title: string } | null; weakConcepts: Array<{ name?: string }> } | null };

    expect(parsed?.studyPlan?.currentObjective?.title).toBe("Connect Fourier's law with heat flux");
    expect(parsed?.studyPlan?.weakConcepts[0]?.name).toBe("Heat flux");
  });

  it("fails when a registered tool is missing from the catalog", () => {
    const registry = new ToolRegistry();
    registerReadToolsV1(registry, createNoopRuntimeReadToolProvider());
    registry.register({
      name: "orphan.tool",
      description: "orphan",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      sideEffectClass: "read_only",
      timeoutMs: 1000,
      async execute() {
        return {};
      },
    });

    expect(() => assertToolCatalogMatchesRegistry(registry)).toThrow(ToolCatalogCoverageError);
    expect(() => assertToolCatalogMatchesRegistry(registry)).toThrow(/missing from TOOL_CONTRACT_CATALOG/);
  });

  it("fails when a catalog entry is missing from the registry", () => {
    const registry = new ToolRegistry();
    registerReadToolsV1(registry, createNoopRuntimeReadToolProvider());

    expect(() => assertToolCatalogMatchesRegistry(registry)).toThrow(ToolCatalogCoverageError);
    expect(() => assertToolCatalogMatchesRegistry(registry)).toThrow(/missing from registry/);
  });

  it("fails when a write provider is missing a catalog implementation", () => {
    const provider = createNoopRuntimeWriteToolProvider();
    const incomplete = { ...provider, createQuiz: undefined } as unknown as ReturnType<typeof createNoopRuntimeWriteToolProvider>;

    expect(() => assertWriteToolProviderCoverage(incomplete)).toThrow(ToolCatalogCoverageError);
    expect(() => assertWriteToolProviderCoverage(incomplete)).toThrow(/artifact.create_quiz/);
  });

  it("keeps noop read and write providers fully covered by the catalog", () => {
    assertReadToolProviderCoverage(createNoopRuntimeReadToolProvider());
    assertWriteToolProviderCoverage(createNoopRuntimeWriteToolProvider());

    const registry = new ToolRegistry();
    registerRuntimeToolsV1(registry, {
      read: createNoopRuntimeReadToolProvider(),
      write: createNoopRuntimeWriteToolProvider(),
    });
    assertToolCatalogMatchesRegistry(registry);
  });

  it("rejects write outputs with invalid reducer shape", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "test.bad_reducer",
      description: "bad reducer",
      inputSchema: z.object({}),
      outputSchema: z.object({
        reducerResult: reducerResultSchema,
      }),
      sideEffectClass: "candidate_write",
      timeoutMs: 1000,
      async execute() {
        return {
          reducerResult: {
            accepted: true,
            mutationType: "artifact.created",
            appliedChanges: undefined,
            emittedEventIds: [],
          },
        } as never;
      },
    });

    await expect(executeTool(registry, "test.bad_reducer", {}, baseContext)).rejects.toThrow(ToolValidationError);
  });

  it("rejects write outputs whose reducer mutation type does not match the contract", async () => {
    const registry = new ToolRegistry();
    registerWriteToolsV1(registry, {
      ...createNoopRuntimeWriteToolProvider(),
      async createQuiz(input, ctx) {
        return {
          artifactId: "artifact_test",
          status: "draft" as const,
          warnings: [],
          reducerResult: {
            accepted: true,
            mutationType: "wiki.claim.proposed",
            appliedChanges: { notebookId: ctx.notebookId, title: input.title },
            emittedEventIds: [],
          },
        };
      },
    });

    await expect(
      executeTool(
        registry,
        "artifact.create_quiz",
        {
          title: "Quiz",
          prompt: "Quiz me",
          conceptIds: [],
          sourceNodeRefs: [],
        },
        baseContext,
      ),
    ).rejects.toThrow(/Invalid input for tool artifact.create_quiz/);
  });

  it("documents reducer expectations for every write contract", () => {
    for (const contract of WRITE_TOOL_CONTRACTS) {
      if (contract.operationKind === "write") {
        expect(contract.reducerExpectation.required).toBe(true);
        expect(contract.reducerExpectation.mutationTypes?.length).toBeGreaterThan(0);
      }
    }

    for (const contract of READ_TOOL_CONTRACTS) {
      expect(contract.operationKind).toBe("read");
      expect(contract.reducerExpectation.required).toBe(false);
    }
  });
});
