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
  assertToolCatalogMatchesRegistry,
  TOOL_CONTRACT_CATALOG,
  WRITE_TOOL_CONTRACTS,
} from "./index.js";
import { createQuizInputSchema, evaluateLearnerResponseInputSchema } from "./writes.js";

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
    expect(registry.get("artifact.create_concept_card")).toBeDefined();
    expect(registry.get("coverage.mark_introduced")).toBeDefined();
    expect(registry.get("coverage.mark_checked")).toBeDefined();
    expect(registry.get("coverage.get_gaps")).toBeDefined();
    expect(registry.get("session_plan.update")).toBeDefined();
    expect(registry.get("artifact.update_session_plan")).toBeDefined();
    expect(registry.get("curriculum.activate")).toBeDefined();
    expect(registry.get("module.update")).toBeDefined();
    expect(registry.get("objective_list.update")).toBeDefined();
    expect(registry.get("objective.update")).toBeDefined();
    expect(registry.get("objective_list.reorder")).toBeDefined();
    expect(registry.get("objective_list.split_objective")).toBeDefined();
    expect(registry.get("objective_list.merge_objectives")).toBeDefined();
    expect(registry.get("student_profile.update_preferences")).toBeDefined();
    expect(registry.get("learning.evaluate_response")).toBeDefined();
  });

  it("keeps read and write registrations covered by the tool contract catalog", () => {
    const registry = new ToolRegistry();
    registerReadToolsV1(registry, createNoopRuntimeReadToolProvider());
    registerWriteToolsV1(registry, createNoopRuntimeWriteToolProvider());

    assertToolCatalogMatchesRegistry(registry);
    const catalogNames = TOOL_CONTRACT_CATALOG.map((contract) => contract.name).sort();
    expect(new Set(catalogNames).size).toBe(catalogNames.length);

    for (const contract of TOOL_CONTRACT_CATALOG) {
      const tool = registry.get(contract.name);
      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toBe(contract.inputSchema);
      expect(tool?.outputSchema).toBe(contract.outputSchema);
      expect(tool?.sideEffectClass).toBe(contract.sideEffectClass);
      expect(tool?.timeoutMs).toBe(contract.timeoutMs);
      expect(contract.runtimeExposure).toBe("tutor_runtime_v1");
    }
  });

  it("keeps write contracts covered by provider methods and reducer expectations", () => {
    const provider = createNoopRuntimeWriteToolProvider();

    for (const contract of WRITE_TOOL_CONTRACTS) {
      expect(typeof provider[contract.providerMethod]).toBe("function");
      if (contract.sideEffectClass === "read_only") {
        expect(contract.operationKind).toBe("read");
        expect(contract.reducerExpectation.required).toBe(false);
      } else {
        expect(contract.operationKind).toBe("write");
        expect(contract.reducerExpectation.required).toBe(true);
        expect(contract.reducerExpectation.mutationTypes?.length).toBeGreaterThan(0);
      }
    }
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

    const lifecycleBacked = createArtifactReducerResult({
      artifactId: "artifact_3",
      notebookId: "nb_1",
      artifactType: "quiz",
      title: "Quiz",
      sourceNodeRefs: [{ refType: "chunk", refId: "chk_1" }],
      status: "proposed",
      visibility: "learner",
      approvalRequired: true,
      lifecycle: { status: "proposed", visibility: "learner" },
      quality: { needsReview: true, canBecomeReady: false, issues: ["Needs source support."] },
    });
    expect(lifecycleBacked.appliedChanges).toMatchObject({
      status: "proposed",
      visibility: "learner",
      approvalRequired: true,
    });
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

  it("normalizes common mastery evaluator tool argument variants", async () => {
    const registry = new ToolRegistry();
    registerWriteToolsV1(registry, createNoopRuntimeWriteToolProvider());

    const result = await executeTool(
      registry,
      "learning.evaluate_response",
      {
        tutorQuestion: "Quick check: explain conduction.",
        learnerAnswer: "Conduction transfers heat by direct contact.",
        conceptRoles: [{ conceptId: "concept_conduction", role: "core" }],
        masterySnapshot: { concept_conduction: "developing" },
        sourceRefs: [],
        contextRefs: [],
        evidenceType: "mastery-check",
        triggerSource: "tool",
      },
      baseContext,
    );

    expect((result as { conceptIds: string[] }).conceptIds).toEqual(["concept_conduction"]);
  });

  it("normalizes mastery snapshot labels to numeric scores", () => {
    const parsed = evaluateLearnerResponseInputSchema.parse({
      tutorQuestion: "Quick check: explain conduction.",
      learnerAnswer: "Conduction transfers heat by direct contact.",
      conceptRoles: [{ conceptId: "concept_conduction", role: "primary" }],
      masterySnapshot: {
        concept_conduction: "developing",
        concept_fourier: "proficient",
        concept_numeric: "0.9",
      },
    });

    expect(parsed.masterySnapshot).toEqual({
      concept_conduction: 0.45,
      concept_fourier: 0.7,
      concept_numeric: 0.9,
    });
  });

  it("accepts quiz resume artifact ids in the write schema", () => {
    const parsed = createQuizInputSchema.parse({
      title: "Quiz",
      prompt: "Quiz on conduction",
      resumeArtifactId: "artifact_1",
    });

    expect(parsed.resumeArtifactId).toBe("artifact_1");
  });

  it("exposes mastery evaluator flexible fields as strings in runtime JSON schema", () => {
    const registry = new ToolRegistry();
    registerWriteToolsV1(registry, createNoopRuntimeWriteToolProvider());
    const schema = registry.get("learning.evaluate_response")?.inputSchema.toJSONSchema() as {
      properties?: Record<string, { type?: string; enum?: string[]; items?: { properties?: Record<string, { enum?: string[] }> } }>;
    };

    expect(schema.properties?.evidenceType).toMatchObject({ type: "string" });
    expect(schema.properties?.evidenceType?.enum).toBeUndefined();
    expect(schema.properties?.conceptRoles?.items?.properties?.role?.enum).toBeUndefined();
    expect(schema.properties?.masterySnapshot?.type).toBe("object");
  });

  it("executes objective planning edit tools", async () => {
    const registry = new ToolRegistry();
    registerWriteToolsV1(registry, createNoopRuntimeWriteToolProvider());

    const objectiveResult = await executeTool(
      registry,
      "objective.update",
      {
        objectiveId: "objective_1",
        title: "Rewritten objective title",
        status: "in_progress",
      },
      baseContext,
    );
    expect((objectiveResult as { reducerResult: { mutationType: string } }).reducerResult.mutationType).toBe("objective.updated");

    const reorderResult = await executeTool(
      registry,
      "objective_list.reorder",
      {
        objectiveListId: "olist_1",
        objectiveIdsOrdered: ["objective_2", "objective_1"],
      },
      baseContext,
    );
    expect((reorderResult as { reducerResult: { mutationType: string } }).reducerResult.mutationType).toBe("objective_list.reordered");

    const splitResult = await executeTool(
      registry,
      "objective_list.split_objective",
      {
        objectiveListId: "olist_1",
        objectiveId: "objective_1",
        splitObjectives: [{ title: "Part A" }, { title: "Part B" }],
      },
      baseContext,
    );
    expect((splitResult as { createdObjectiveIds: string[] }).createdObjectiveIds).toHaveLength(2);

    const mergeResult = await executeTool(
      registry,
      "objective_list.merge_objectives",
      {
        objectiveListId: "olist_1",
        objectiveIds: ["objective_1", "objective_2"],
        mergedObjectiveTitle: "Merged objective",
      },
      baseContext,
    );
    expect((mergeResult as { mergedObjectiveId?: string }).mergedObjectiveId).toBeTruthy();
  });

  it("executes pedagogical artifact write tools with reducer-backed outputs", async () => {
    const registry = new ToolRegistry();
    registerWriteToolsV1(registry, createNoopRuntimeWriteToolProvider());

    const workedExample = await executeTool(
      registry,
      "artifact.create_worked_example",
      {
        title: "Chain rule worked example",
        prompt: "Show a worked example",
        problemStatement: "Differentiate f(x)=sin(x^2)",
        solutionSteps: ["Identify outer/inner functions", "Apply chain rule"],
        commonMistakes: ["Missing inner derivative"],
        finalTakeaway: "Always multiply by inner derivative",
        conceptIds: ["concept_chain_rule"],
        sourceNodeRefs: [],
      },
      baseContext,
    );
    expect((workedExample as { status: string }).status).toBe("ready");
    expect((workedExample as { reducerResult: { mutationType: string } }).reducerResult.mutationType).toBe("artifact.created");

    const formulaSheet = await executeTool(
      registry,
      "artifact.create_formula_sheet",
      {
        title: "Derivative formulas",
        prompt: "Create a compact sheet",
        formulas: [
          {
            symbol: "d/dx(x^n)",
            expression: "n x^(n-1)",
            meaning: "Power rule",
          },
        ],
        conceptIds: ["concept_derivative"],
        sourceNodeRefs: [],
      },
      baseContext,
    );
    expect((formulaSheet as { status: string }).status).toBe("ready");

    const comparison = await executeTool(
      registry,
      "artifact.create_comparison_page",
      {
        title: "Derivative vs integral",
        prompt: "Compare concepts",
        leftTitle: "Derivative",
        rightTitle: "Integral",
        comparisonRows: [
          { dimension: "Meaning", left: "rate of change", right: "accumulation" },
        ],
        conceptIds: ["concept_derivative", "concept_integral"],
        sourceNodeRefs: [],
      },
      baseContext,
    );
    expect((comparison as { status: string }).status).toBe("ready");

    const conceptCard = await executeTool(
      registry,
      "artifact.create_concept_card",
      {
        title: "Derivative card",
        prompt: "Create a concept card",
        definition: "A derivative measures instantaneous rate of change.",
        whenToUse: "Use it when modeling local change.",
        commonConfusion: "Do not confuse derivative value with average rate over an interval.",
        examples: ["Velocity is the derivative of position."],
        conceptIds: ["concept_derivative"],
        sourceNodeRefs: [],
      },
      baseContext,
    );
    expect((conceptCard as { status: string }).status).toBe("ready");
  });

  it("supports artifact-context insertion and coverage mark/get gaps tools", async () => {
    const registry = new ToolRegistry();
    registerWriteToolsV1(registry, createNoopRuntimeWriteToolProvider());

    const insertion = await executeTool(
      registry,
      "artifact.insert_into_tutor_context",
      {
        artifactId: "artifact_1",
        insertionPoint: "after_definition",
        tutorMessage: "Use this artifact after the definition block",
        coverageItemRefsJson: [{ id: "cov_1" }],
      },
      baseContext,
    );
    expect((insertion as { success: boolean }).success).toBe(true);
    expect((insertion as { reducerResult: { mutationType: string } }).reducerResult.mutationType).toBe(
      "artifact.insert_into_tutor_context",
    );

    const marked = await executeTool(
      registry,
      "coverage.mark_checked",
      {
        coverageItemId: "cov_1",
        curriculumId: "cur_1",
        evidenceJson: { source: "quiz" },
      },
      baseContext,
    );
    expect((marked as { coverageRecord: { status: string } }).coverageRecord.status).toBe("checked");

    const gaps = await executeTool(
      registry,
      "coverage.get_gaps",
      {
        statuses: ["planned", "needs_review"],
        limit: 10,
      },
      baseContext,
    );
    expect((gaps as { gaps: unknown[] }).gaps).toEqual([]);
  });
});
