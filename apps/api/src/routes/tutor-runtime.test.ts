import { describe, expect, it } from "vitest";
import { shouldCompactTutorContext, shouldEmitDigestDraftUpdate } from "../tutor-turn-helpers.js";
import { mergeSelectedNodeRefs } from "./tutor.js";

describe("digest draft update emission", () => {
  it("emits when there is no previous draft", () => {
    expect(
      shouldEmitDigestDraftUpdate(null, {
        summary: "A",
        currentObjective: "Obj",
        studyPlanSummary: "Plan",
        learnerStateSummary: "State",
        citationIds: ["c1"],
        sourceIds: ["s1"],
        artifactProposalIds: ["a1"],
      }),
    ).toBe(true);
  });

  it("does not emit when digest draft payload is unchanged", () => {
    const draft = {
      summary: "A",
      currentObjective: "Obj",
      studyPlanSummary: "Plan",
      learnerStateSummary: "State",
      citationIds: ["c1"],
      sourceIds: ["s1"],
      artifactProposalIds: ["a1"],
    };
    expect(shouldEmitDigestDraftUpdate(draft, draft)).toBe(false);
  });

  it("emits when any draft field changes", () => {
    const previous = {
      summary: "A",
      currentObjective: "Obj",
      studyPlanSummary: "Plan",
      learnerStateSummary: "State",
      citationIds: ["c1"],
      sourceIds: ["s1"],
      artifactProposalIds: ["a1"],
    };
    const next = {
      ...previous,
      summary: "B",
    };
    expect(shouldEmitDigestDraftUpdate(previous, next)).toBe(true);
  });

  it("does not emit when provenance arrays only differ by order or duplicates", () => {
    const previous = {
      summary: "A",
      currentObjective: "Obj",
      studyPlanSummary: "Plan",
      learnerStateSummary: "State",
      citationIds: ["c1", "c2"],
      sourceIds: ["s1", "s2"],
      artifactProposalIds: ["a1"],
    };
    const next = {
      ...previous,
      citationIds: ["c2", "c1", "c1"],
      sourceIds: ["s2", "s1", "s1"],
      artifactProposalIds: ["a1", "a1"],
    };
    expect(shouldEmitDigestDraftUpdate(previous, next)).toBe(false);
  });
});

describe("context selection selected-ref merge", () => {
  it("adds selected chunks and sources without duplicating existing refs", () => {
    const merged = mergeSelectedNodeRefs(
      [{ refType: "source", refId: "src_1" }],
      {
        strategy: "selected-nodes-current-objective-weak-concepts-notebook",
        query: "q",
        retrievalMode: "hybrid",
        maxChunks: 6,
        selectedNodeRefs: [{ refType: "concept", refId: "c_1" }],
        selectedChunkIds: ["ch_1"],
        selectedSourceIds: ["src_1", "src_2"],
        objectiveTitle: null,
        objectivePathConceptIds: [],
        weakConceptNames: [],
        recentMistakeConceptIds: [],
        sourceScopePolicy: "soft_source_scope",
        usedSourceScopeFallback: false,
        sourceCoverageGap: false,
        reason: "r",
      },
    );
    expect(merged).toEqual(
      expect.arrayContaining([
        { refType: "source", refId: "src_1" },
        { refType: "source", refId: "src_2" },
        { refType: "concept", refId: "c_1" },
        { refType: "chunk", refId: "ch_1" },
      ]),
    );
    expect(merged.filter((r) => r.refType === "source" && r.refId === "src_1")).toHaveLength(1);
  });
});

describe("tutor compaction policy", () => {
  const baseInput = {
    turnIndex: 2,
    previousRuntimeContext: {
      compressedContext: "previous compact context",
      currentObjective: "Fourier's law",
      activeSessionPlanId: "plan_1",
      openArtifact: null,
      sourceIds: ["src_1"],
      citationIds: ["claim_1"],
      artifactProposalIds: [],
      lastCompaction: {
        turnIndex: 1,
        estimatedChars: 600,
      },
    },
    message: "Can you explain an example?",
    assistantMessage: "Here is a worked example.",
    currentObjective: "Fourier's law",
    studyPlanSummary: "Continue heat transfer.",
    learnerStateSummary: "Learner is ready for worked examples.",
    selectedNodeRefs: [{ refType: "source", refId: "src_1" }],
    sourceIds: ["src_1"],
    citationIds: ["claim_1"],
    artifactProposalIds: [],
    activeSessionPlanId: "plan_1",
    openArtifact: null,
    contextSelection: null,
    toolSummary: [],
  };

  it("does not compact only because a runtime context is missing", () => {
    const decision = shouldCompactTutorContext({
      ...baseInput,
      previousRuntimeContext: {},
    });
    expect(decision.shouldCompact).toBe(false);
    expect(decision.reasons).toEqual([]);
  });

  it("does not compact an ordinary adjacent turn with unchanged durable state", () => {
    const decision = shouldCompactTutorContext(baseInput);
    expect(decision.shouldCompact).toBe(false);
    expect(decision.reasons).toEqual([]);
  });

  it("compacts after the configured turn interval", () => {
    const decision = shouldCompactTutorContext({
      ...baseInput,
      turnIndex: 5,
    });
    expect(decision.shouldCompact).toBe(true);
    expect(decision.reasons).toContain("turn_interval");
  });

  it("compacts when the current objective changes", () => {
    const decision = shouldCompactTutorContext({
      ...baseInput,
      currentObjective: "Thermal conductivity",
    });
    expect(decision.shouldCompact).toBe(true);
    expect(decision.reasons).toContain("objective_changed");
  });

  it("compacts when durable tutor tools write state", () => {
    const decision = shouldCompactTutorContext({
      ...baseInput,
      turnIndex: 3,
      toolSummary: [{ toolCallId: "tool_1", toolName: "artifact.create", status: "completed" }],
    });
    expect(decision.shouldCompact).toBe(true);
    expect(decision.reasons).toContain("durable_tool_change");
  });

  it("compacts on learner progression signals", () => {
    const decision = shouldCompactTutorContext({
      ...baseInput,
      turnIndex: 3,
      message: "Got it, continue.",
    });
    expect(decision.shouldCompact).toBe(true);
    expect(decision.reasons).toContain("learner_progression");
  });

  it("compacts when estimated context pressure is high", () => {
    const decision = shouldCompactTutorContext({
      ...baseInput,
      assistantMessage: "x".repeat(8100),
    });
    expect(decision.shouldCompact).toBe(true);
    expect(decision.reasons).toContain("context_size");
  });
});
