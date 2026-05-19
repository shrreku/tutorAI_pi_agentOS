import { describe, expect, it } from "vitest";
import { adaptTeachingArcForRuntime, composeTeachingArc } from "./teaching-arc.js";

describe("composeTeachingArc", () => {
  it("builds a structured professor-style teaching arc from objective and coverage metadata", () => {
    const arc = composeTeachingArc({
      objectiveId: "obj_derivatives",
      objectiveTitle: "Differentiate polynomial functions",
      targetConceptNames: ["derivative", "power rule"],
      mustCoverItems: [
        { id: "cov_def", title: "Derivative as instantaneous rate", itemFamily: "definition", sourceRefs: [{ sourceId: "src_1" }] },
        { id: "cov_formula", title: "Power rule d/dx x^n = n x^(n-1)", itemFamily: "formula", sourceRefs: [{ sourceId: "src_1" }] },
        { id: "cov_trap", title: "Do not subtract one from coefficients", itemFamily: "misconception", sourceRefs: [{ sourceId: "src_1" }] },
      ],
      studentProfile: {
        pacePreference: "slow",
        depthPreference: "formal",
        examplePreferencesJson: { style: "engineering" },
      },
    });

    expect(arc.objectiveId).toBe("obj_derivatives");
    expect(arc.learnerFit).toEqual({ pace: "slow", depth: "formal", exampleStyle: "engineering" });
    expect(arc.coverageItemIds).toEqual(["cov_def", "cov_formula", "cov_trap"]);
    expect(arc.blocks.map((block) => block.type)).toEqual(
      expect.arrayContaining([
        "hook",
        "prior_knowledge_probe",
        "intuition",
        "formal_definition",
        "notation_formula",
        "everyday_example",
        "industrial_example",
        "analogy",
        "misconception_warning",
        "checkpoint",
        "transfer_prompt",
        "summary",
      ]),
    );
  });

  it("falls back to contrast block when no misconception coverage items exist", () => {
    const arc = composeTeachingArc({
      objectiveId: "obj_vectors",
      objectiveTitle: "Understand vectors",
      mustCoverItems: [{ id: "cov_def", title: "Vector definition", itemFamily: "definition" }],
    });

    expect(arc.blocks.some((block) => block.type === "misconception_warning")).toBe(false);
    expect(arc.blocks.some((block) => block.type === "contrast_case")).toBe(true);
  });

  it("produces stable arc and block ids for equivalent inputs", () => {
    const input = {
      objectiveId: "obj_same",
      objectiveTitle: "Same objective",
      targetConceptNames: ["a", "b"],
    };

    const first = composeTeachingArc(input);
    const second = composeTeachingArc(input);

    expect(first.id).toBe(second.id);
    expect(first.blocks.map((block) => block.id)).toEqual(second.blocks.map((block) => block.id));
  });

  it("adds mechanism and analogy blocks for procedure/application-heavy objectives", () => {
    const arc = composeTeachingArc({
      objectiveId: "obj_chain",
      objectiveTitle: "Apply chain rule in context",
      mustCoverItems: [
        { id: "cov_proc", title: "Differentiate outer then inner", itemFamily: "procedure", sourceRefs: [{ sourceId: "src_1" }] },
        { id: "cov_app", title: "Rate-of-change application", itemFamily: "application", sourceRefs: [{ sourceId: "src_1" }] },
      ],
    });
    expect(arc.blocks.some((block) => block.type === "derivation_mechanism")).toBe(true);
    expect(arc.blocks.some((block) => block.type === "analogy")).toBe(true);
  });

  it("adapts runtime block order toward misconception repair without changing ids", () => {
    const arc = composeTeachingArc({
      objectiveId: "obj_limits",
      objectiveTitle: "Reason about limits",
      mustCoverItems: [{ id: "cov_trap", title: "Limit value is not always function value", itemFamily: "misconception" }],
    });
    const adapted = adaptTeachingArcForRuntime(arc, { recentMistakeConceptIds: ["concept_limit"] });

    expect(adapted.adaptationReason).toBe("misconception_or_weak_coverage_repair");
    expect(adapted.activeBlock?.type).toBe("misconception_warning");
    expect(adapted.id).toBe(arc.id);
  });

  it("advances active block past completed blocks", () => {
    const arc = composeTeachingArc({ objectiveId: "obj_rates", objectiveTitle: "Rates of change" });
    const adapted = adaptTeachingArcForRuntime(arc, { completedBlockIds: [arc.blocks[0]!.id] });

    expect(adapted.activeBlock?.id).toBe(arc.blocks[1]!.id);
    expect(adapted.nextBlocks.some((block) => block.id === arc.blocks[0]!.id)).toBe(false);
  });
});
