import { describe, expect, it } from "vitest";
import {
  generationModeSchema,
  generationTargetSchema,
  generationTriggerSchema,
  interactiveLearningBlockPlanSchema,
  pageBlockPlanSchema,
  pageGenerationOutputSchema,
  pageQualityIssueSchema,
  pageReadinessLabel,
  pageReadinessSchema,
  requiresMaterialPathChangeConfirmation,
  validateInteractiveLearningBlockPlan,
} from "./page-generation.js";

describe("page readiness", () => {
  it("accepts all readiness values", () => {
    for (const value of [
      "still_improving",
      "ready_to_study",
      "needs_more_source_support",
      "needs_refresh",
    ] as const) {
      expect(pageReadinessSchema.parse(value)).toBe(value);
    }
  });

  it("maps readiness to learner labels", () => {
    expect(pageReadinessLabel("still_improving")).toBe("Still improving");
    expect(pageReadinessLabel("ready_to_study")).toBe("Ready to study");
    expect(pageReadinessLabel("needs_more_source_support")).toBe("Needs more source support");
    expect(pageReadinessLabel("needs_refresh")).toBe("Needs refresh");
  });

  it("rejects unknown readiness values", () => {
    expect(() => pageReadinessSchema.parse("mastered")).toThrow();
  });
});

describe("generation mode and trigger", () => {
  it("accepts generation modes", () => {
    expect(generationModeSchema.parse("heuristic")).toBe("heuristic");
    expect(generationModeSchema.parse("llm_polished")).toBe("llm_polished");
    expect(generationModeSchema.parse("tutor_touch")).toBe("tutor_touch");
  });

  it("accepts generation triggers", () => {
    expect(generationTriggerSchema.parse("post_ingest")).toBe("post_ingest");
    expect(generationTriggerSchema.parse("topic_touch")).toBe("topic_touch");
  });
});

describe("generation target", () => {
  const validTarget = {
    notebookId: "nb_1",
    targetType: "concept_page" as const,
    pageKey: "concept:cpt_1",
    conceptIds: ["cpt_1"],
    generationMode: "heuristic" as const,
    trigger: "post_ingest" as const,
    idempotencyKey: "nb_1|concept_page|concept:cpt_1|heuristic",
  };

  it("accepts a valid generation target", () => {
    const parsed = generationTargetSchema.parse(validTarget);
    expect(parsed.timeoutMs).toBe(120_000);
    expect(parsed.priority).toBe(0.5);
  });

  it("accepts optional run and turn refs", () => {
    const parsed = generationTargetSchema.parse({
      ...validTarget,
      createdByRunId: "run_1",
      createdByTurnId: "turn_1",
    });
    expect(parsed.createdByRunId).toBe("run_1");
  });

  it("rejects targets without idempotency key", () => {
    expect(() =>
      generationTargetSchema.parse({
        ...validTarget,
        idempotencyKey: "",
      }),
    ).toThrow();
  });
});

describe("page block plans", () => {
  const evidenceRef = {
    id: "ev_1",
    kind: "chunk" as const,
    visibility: "learner" as const,
    label: "Source excerpt",
    text: "Entropy increases in isolated systems.",
  };

  it("accepts static and source-backed block plans", () => {
    expect(
      pageBlockPlanSchema.parse({
        kind: "static_reference",
        markdown: "## Overview\nStill improving.",
      }).kind,
    ).toBe("static_reference");

    expect(
      pageBlockPlanSchema.parse({
        kind: "source_backed_note",
        markdown: "- Entropy increases in isolated systems.",
        evidenceRefs: [evidenceRef],
      }).kind,
    ).toBe("source_backed_note");
  });

  it("requires evidence refs for source-backed notes", () => {
    expect(() =>
      pageBlockPlanSchema.parse({
        kind: "source_backed_note",
        markdown: "- Unsupported note.",
        evidenceRefs: [],
      }),
    ).toThrow();
  });

  it("accepts interactive learning block plans", () => {
    const plan = interactiveLearningBlockPlanSchema.parse({
      kind: "interactive_learning_block",
      blockKind: "evidence_explorer",
      title: "Inspect Evidence",
      learningPurpose: "Review source excerpts for this topic.",
      content: {},
      allowedActions: ["evidence.source_span_opened", "tutor.help_requested"],
      evidenceRefs: [evidenceRef],
      sourceBacked: true,
    });
    expect(validateInteractiveLearningBlockPlan(plan).ok).toBe(true);
  });

  it("rejects artifact-backed interactive plans without artifact refs", () => {
    const plan = interactiveLearningBlockPlanSchema.parse({
      kind: "interactive_learning_block",
      blockKind: "quiz",
      title: "Quiz",
      learningPurpose: "Practice",
      content: { questions: [] },
      allowedActions: ["quiz.answer_submitted"],
    });
    expect(validateInteractiveLearningBlockPlan(plan)).toEqual({
      ok: false,
      error: 'Block kind "quiz" requires an artifactRef.',
    });
  });
});

describe("material path change confirmation", () => {
  it("requires confirmation for material path changes unless learner confirmed", () => {
    expect(requiresMaterialPathChangeConfirmation({ kind: "skip_module" })).toBe(true);
    expect(
      requiresMaterialPathChangeConfirmation({ kind: "skip_module", learnerConfirmed: true }),
    ).toBe(false);
    expect(requiresMaterialPathChangeConfirmation({ kind: "module_milestone" })).toBe(false);
  });
});

describe("page generation output", () => {
  it("accepts a complete generation output payload", () => {
    const output = pageGenerationOutputSchema.parse({
      title: "Entropy",
      pageKey: "concept:cpt_entropy",
      readiness: "still_improving",
      generationMode: "heuristic",
      blocks: [
        {
          kind: "static_reference",
          markdown: "## Definition\nStill improving.",
        },
      ],
      qualityIssues: [],
    });
    expect(output.readiness).toBe("still_improving");
  });

  it("accepts quality issue payloads", () => {
    const issue = pageQualityIssueSchema.parse({
      code: "missing_citations",
      message: "Source-backed section lacks Evidence refs.",
      severity: "error",
      section: "source_backed_notes",
    });
    expect(issue.code).toBe("missing_citations");
  });
});
