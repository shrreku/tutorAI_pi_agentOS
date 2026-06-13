import {
  simulationDraftSchema,
  simulationTemplateSchema,
  type SimulationDraft,
  type SimulationTemplate,
} from "@studyagent/schemas";

export type SimulationDraftEvaluationResult = {
  draft: SimulationDraft;
  passed: boolean;
  failures: string[];
  promotedTemplate?: SimulationTemplate;
};

const PROMOTION_CHECKLIST_KEYS = [
  "conceptCorrectness",
  "parameterBounds",
  "accessibility",
  "responsiveness",
  "sandboxSafety",
  "externalNetworkBlocked",
  "learnerInstructions",
  "eventSchema",
  "evidenceRequirements",
] as const;

export function validateSimulationDraft(input: unknown): SimulationDraft {
  return simulationDraftSchema.parse(input);
}

export function evaluateSimulationDraftForPromotion(draft: SimulationDraft): SimulationDraftEvaluationResult {
  const failures: string[] = [];
  for (const key of PROMOTION_CHECKLIST_KEYS) {
    if (draft.checklist[key] !== true) {
      failures.push(`checklist.${key}`);
    }
  }
  if (draft.promotionDecision === "rejected") {
    failures.push("promotionDecision.rejected");
  }

  const passed = failures.length === 0;
  if (!passed) {
    return {
      draft: {
        ...draft,
        evaluationStatus: "evaluation_failed",
      },
      passed: false,
      failures,
    };
  }

  const promotedTemplate = simulationTemplateSchema.parse({
    templateId: draft.promotedTemplateId ?? "function-plotter",
    version: "v1",
    title: "Promoted simulation template",
    description: draft.conceptNeed,
    bundleResourceUri: `ui://studyagent/simulation/${draft.promotedTemplateId ?? "function-plotter"}/v1`,
    parameterSchema: {
      expression: { type: "string", default: "x^2" },
      xMin: { type: "number", default: -5 },
      xMax: { type: "number", default: 5 },
    },
    supportedConceptFamilies: ["mathematics", "functions"],
    promptSlots: ["observation_prompt"],
    expectedObservationSchema: { observation: { type: "string", minLength: 1 } },
    actionSchema: ["simulation.observation_submitted"],
    evidenceRequired: false,
  });

  return {
    draft: {
      ...draft,
      evaluationStatus: "promoted",
      promotionDecision: "approved",
    },
    passed: true,
    failures: [],
    promotedTemplate,
  };
}
