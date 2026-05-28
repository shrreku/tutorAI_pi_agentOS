import { describe, expect, it } from "vitest";
import {
  deriveLearnerTraitArchetypeBuckets,
  learnerTraitArchetypeFixtures,
  learnerTraitArchetypeSchema,
  learnerTraitEstimateSchema,
  learnerTraitGuardrailDecisionSchema,
  learnerTraitProposalSchema,
  learnerTraitSignalSchema,
  learnerTraitValuesSchema,
  personalizationRecommendationSchema,
} from "./learner-traits.js";

describe("learner trait model", () => {
  it("validates the first archetype matrix as typed fixtures", () => {
    const parsed = learnerTraitArchetypeSchema.array().parse(learnerTraitArchetypeFixtures);

    expect(parsed).toHaveLength(7);
    expect(parsed.map((archetype) => archetype.id)).toEqual([
      "beginner_misconception",
      "overconfident_skimmer",
      "anxious_exam_prep",
      "careful_self_explainer",
      "help_avoidant_stuck",
      "fast_advanced",
      "low_confidence_high_mastery",
    ]);
    expect(parsed[0]?.traitValues).toMatchObject({
      pacePreference: "slow",
      confidenceStyle: "underconfident",
      sourceFamiliarity: "unfamiliar",
    });
  });

  it("rejects trait values outside the shared vocabulary", () => {
    expect(() => learnerTraitValuesSchema.parse({
      pacePreference: "reckless",
      depthPreference: "balanced",
      helpSeekingStyle: "asks_early",
      confidenceStyle: "calibrated",
      metacognitiveAccuracy: "medium",
      persistenceStyle: "steady",
      sourceFamiliarity: "familiar",
      assessmentPreference: "quiz",
      examplePreference: "concrete",
      urgencyContext: "exam_prep",
    })).toThrow();
  });

  it("keeps real learner trait estimates evidence-backed", () => {
    const estimate = learnerTraitEstimateSchema.parse({
      id: "lte_confidence",
      notebookId: "nb_1",
      userId: "user_1",
      trait: "confidenceStyle",
      value: "overconfident",
      confidence: 0.72,
      lane: "inferred",
      evidenceRefs: [{ refType: "mastery_evidence", refId: "mev_confidence_mismatch" }],
      contradictionRefs: [{ refType: "self_report", refId: "turn_claimed_ready" }],
      lastUpdatedReason: "repeated overconfident self-report with partial answers",
      guardrail: { status: "capped", reasons: ["inferred confidence capped"], confidenceCap: 0.72 },
    });

    expect(estimate.evidenceRefs).toHaveLength(1);
    expect(estimate.confidence).toBe(0.72);
    expect(estimate.lane).toBe("inferred");
  });

  it("validates explicit and inferred learner trait signals", () => {
    const explicit = learnerTraitSignalSchema.parse({
      id: "lts_pace",
      notebookId: "nb_1",
      userId: "user_1",
      source: "explicit_self_report",
      trait: "pacePreference",
      suggestedValue: "slow",
      strength: 0.9,
      confidence: 0.95,
      evidenceRefs: [{ refType: "self_report", refId: "turn_1" }],
      sessionId: "sess_1",
      turnId: "turn_1",
      internalVisibility: true,
      observedAt: "2026-05-25T08:00:00.000Z",
    });
    const inferred = learnerTraitSignalSchema.parse({
      id: "lts_help",
      notebookId: "nb_1",
      userId: "user_1",
      source: "tutor_observation",
      trait: "helpSeekingStyle",
      suggestedValue: "avoids_help",
      strength: 0.66,
      confidence: 0.6,
      evidenceRefs: [{ refType: "tutor_observation", refId: "turn_2" }],
      observedAt: "2026-05-25T08:05:00.000Z",
    });

    expect(explicit.suggestedValue).toBe("slow");
    expect(inferred.internalVisibility).toBe(true);
  });

  it("keeps LLM trait proposals separate from canonical estimates", () => {
    const proposal = learnerTraitProposalSchema.parse({
      proposalId: "ltp_1",
      notebookId: "nb_1",
      userId: "user_1",
      trait: "assessmentPreference",
      value: "quiz",
      confidence: 0.7,
      lane: "explicit",
      evidenceRefs: [{ refType: "trait_signal", refId: "lts_quiz" }],
      updateReason: "learner repeatedly asked for quizzes",
      recommendationText: "Offer short quizzes after explanations.",
    });

    expect(proposal.proposalId).toBe("ltp_1");
    expect("lastUpdatedReason" in proposal).toBe(false);
  });

  it("validates accepted and rejected guardrail decisions", () => {
    const accepted = learnerTraitGuardrailDecisionSchema.parse({
      decisionId: "ltgd_1",
      proposalId: "ltp_1",
      notebookId: "nb_1",
      userId: "user_1",
      status: "accepted",
      reasons: ["explicit preference with evidence"],
      acceptedEstimate: {
        trait: "examplePreference",
        value: "visual",
        confidence: 0.9,
        lane: "explicit",
        evidenceRefs: [{ refType: "trait_signal", refId: "lts_examples" }],
        lastUpdatedReason: "explicit preference",
      },
      checkedAt: "2026-05-25T08:10:00.000Z",
    });
    const rejected = learnerTraitGuardrailDecisionSchema.parse({
      decisionId: "ltgd_2",
      proposalId: "ltp_2",
      notebookId: "nb_1",
      userId: "user_1",
      status: "rejected",
      reasons: ["missing stable evidence"],
      checkedAt: "2026-05-25T08:11:00.000Z",
    });

    expect(accepted.acceptedEstimate?.lane).toBe("explicit");
    expect(rejected.acceptedEstimate).toBeUndefined();
  });

  it("validates recommendation-only tutor personalization copy", () => {
    const recommendation = personalizationRecommendationSchema.parse({
      id: "ltr_1",
      notebookId: "nb_1",
      userId: "user_1",
      trait: "pacePreference",
      lane: "explicit",
      recommendation: "Use shorter steps and pause for checkpoints.",
      adaptationType: "pace",
      learnerFacingSafe: true,
      includeRawLabel: false,
      evidenceRefs: [{ refType: "trait_estimate", refId: "lte_pace" }],
    });

    expect(recommendation.includeRawLabel).toBe(false);
  });

  it("derives recommendation-only archetype buckets from confident matching estimates", () => {
    const buckets = deriveLearnerTraitArchetypeBuckets({
      estimates: [
        { trait: "pacePreference", value: "fast", confidence: 0.8, evidenceRefs: [], lastUpdatedReason: "repeated skips" },
        { trait: "depthPreference", value: "intuitive", confidence: 0.8, evidenceRefs: [], lastUpdatedReason: "asks for gist" },
        { trait: "helpSeekingStyle", value: "avoids_help", confidence: 0.8, evidenceRefs: [], lastUpdatedReason: "does not ask for hints" },
        { trait: "confidenceStyle", value: "overconfident", confidence: 0.8, evidenceRefs: [], lastUpdatedReason: "claims mastery" },
        { trait: "metacognitiveAccuracy", value: "low", confidence: 0.8, evidenceRefs: [], lastUpdatedReason: "mismatch with mastery" },
        { trait: "persistenceStyle", value: "stubborn", confidence: 0.8, evidenceRefs: [], lastUpdatedReason: "persists through errors" },
      ],
    });

    expect(buckets[0]).toMatchObject({
      archetypeId: "overconfident_skimmer",
      recommendationOnly: true,
    });
    expect(buckets[0]?.matchedTraits).toContain("confidenceStyle");
  });
});
