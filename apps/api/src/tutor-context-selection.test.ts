import { describe, expect, it } from "vitest";
import {
  buildTutorContextSelectionPlan,
  buildTutorContextSelectionReason,
  filterRowsBySelectedSources,
  resolveScopedRetrievalRows,
} from "./tutor-tool-provider.js";

describe("tutor context selection ladder", () => {
  it("builds a query that prioritizes message, objective, weak concepts, and selected refs", () => {
    const plan = buildTutorContextSelectionPlan({
      message: "teach me derivatives",
      selectedNodeRefs: [
        { refType: "source", refId: "src_1" },
        { refType: "concept", refId: "concept_chain_rule" },
      ],
      studyState: {
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: null,
        sessionPlan: null,
        studyPlan: {
          id: "plan_1",
          title: "Calculus I",
          status: "active",
          currentObjective: { id: "obj_1", title: "Differentiate polynomial functions", status: "not_started" },
          upcomingObjectives: [],
          completedObjectives: [],
          weakConcepts: [{ id: "concept_chain_rule", name: "chain rule" }],
        },
        coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
        sourceLevels: [],
        learnerReadiness: [],
        learnerProgressSummary: { strengths: [], weakConcepts: [], needsReview: [], readyToAdvance: [] },
      },
    });

    expect(plan.strategy).toBe("selected-nodes-current-objective-weak-concepts-notebook");
    expect(plan.selectedSourceIds).toEqual(["src_1"]);
    expect(plan.objectivePathConceptIds).toEqual([]);
    expect(plan.query).toContain("teach me derivatives");
    expect(plan.query).toContain("objective: Differentiate polynomial functions");
    expect(plan.query).toContain("weak concepts: chain rule");
    expect(plan.query).toContain("selected refs: source:src_1, concept:concept_chain_rule");
  });

  it("falls back notebook-wide only under soft source scope", () => {
    const rows = [
      { id: "c1", sourceId: "src_1" },
      { id: "c2", sourceId: "src_2" },
    ];
    expect(resolveScopedRetrievalRows(rows, ["src_missing"], "soft_source_scope")).toMatchObject({
      effectiveRows: rows,
      usedSourceScopeFallback: true,
      sourceCoverageGap: false,
    });
    expect(resolveScopedRetrievalRows(rows, ["src_missing"], "strict_source_scope")).toMatchObject({
      effectiveRows: [],
      usedSourceScopeFallback: false,
      sourceCoverageGap: true,
    });
  });

  it("scopes rows to selected sources when provided", () => {
    const rows = [
      { id: "c1", sourceId: "src_1" },
      { id: "c2", sourceId: "src_2" },
      { id: "c3", sourceId: "src_1" },
    ];
    expect(filterRowsBySelectedSources(rows, ["src_1"]).map((row) => row.id)).toEqual(["c1", "c3"]);
    expect(filterRowsBySelectedSources(rows, []).map((row) => row.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("does not fall back under strict source scope when selected sources return no rows", () => {
    const plan = buildTutorContextSelectionPlan({
      message: "continue",
      selectedNodeRefs: [{ refType: "source", refId: "src_selected" }],
      studyState: null,
    });

    const reason = buildTutorContextSelectionReason({
      plan,
      maxChunks: 6,
      selectedChunkCount: 0,
      usedSourceScopeFallback: false,
      sourceCoverageGap: true,
      sourceScopePolicy: "strict_source_scope",
      sourceIds: [],
    });

    expect(reason).toContain("Strict source scope blocked notebook-wide fallback");
    expect(reason).not.toContain("fell back to notebook-wide retrieval");
  });

  it("explains fallback when source-scoped retrieval returns no rows", () => {
    const plan = buildTutorContextSelectionPlan({
      message: "continue",
      selectedNodeRefs: [{ refType: "source", refId: "src_selected" }],
      studyState: null,
    });

    const reason = buildTutorContextSelectionReason({
      plan,
      maxChunks: 6,
      selectedChunkCount: 4,
      usedSourceScopeFallback: true,
      sourceScopePolicy: "soft_source_scope",
      sourceIds: ["src_2"],
    });

    expect(reason).toContain("Applied selected source scope (soft_source_scope): src_selected");
    expect(reason).toContain("fell back to notebook-wide retrieval");
    expect(reason).toContain("Retrieved 4 chunks");
  });

  it("includes objective-path concept bounding cues in plan and reasoning", () => {
    const plan = buildTutorContextSelectionPlan({
      message: "continue",
      selectedNodeRefs: [],
      studyState: null,
      objectivePathConceptIds: ["concept_chain_rule", "concept_product_rule"],
    });
    expect(plan.query).toContain("objective path concepts: concept_chain_rule, concept_product_rule");

    const reason = buildTutorContextSelectionReason({
      plan,
      maxChunks: 6,
      selectedChunkCount: 2,
      usedSourceScopeFallback: false,
      sourceIds: ["src_1"],
    });
    expect(reason).toContain("Bounded retrieval by objective-path concepts: concept_chain_rule, concept_product_rule");
  });

  it("preserves recent mistake concepts separately from objective-path concepts", () => {
    const plan = buildTutorContextSelectionPlan({
      message: "resume",
      selectedNodeRefs: [],
      studyState: null,
      objectivePathConceptIds: ["concept_chain_rule"],
      previousRuntimeContext: {
        recentMistakeConceptIds: ["concept_sign_error", "concept_chain_rule"],
      },
    });

    expect(plan.objectivePathConceptIds).toEqual(["concept_chain_rule"]);
    expect(plan.recentMistakeConceptIds).toEqual(["concept_sign_error", "concept_chain_rule"]);
    expect(plan.query).toContain("recent mistakes: concept_sign_error, concept_chain_rule");
    expect(plan.query).toContain("objective path concepts: concept_chain_rule");
  });
});
