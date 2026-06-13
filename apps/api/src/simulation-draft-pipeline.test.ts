import { describe, expect, it } from "vitest";
import { evaluateSimulationDraftForPromotion, validateSimulationDraft } from "./simulation-draft-pipeline.js";

describe("simulation draft pipeline", () => {
  it("rejects drafts that fail safety checklist items", () => {
    const draft = validateSimulationDraft({
      draftId: "draft_1",
      conceptNeed: "plot quadratics",
      checklist: { sandboxSafety: false },
    });
    const result = evaluateSimulationDraftForPromotion(draft);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("checklist.sandboxSafety");
  });

  it("promotes drafts that pass the full checklist", () => {
    const draft = validateSimulationDraft({
      draftId: "draft_2",
      conceptNeed: "plot quadratics",
      promotedTemplateId: "function-plotter",
      checklist: {
        conceptCorrectness: true,
        parameterBounds: true,
        accessibility: true,
        responsiveness: true,
        sandboxSafety: true,
        externalNetworkBlocked: true,
        learnerInstructions: true,
        eventSchema: true,
        evidenceRequirements: true,
      },
    });
    const result = evaluateSimulationDraftForPromotion(draft);
    expect(result.passed).toBe(true);
    expect(result.promotedTemplate?.templateId).toBe("function-plotter");
  });
});
