import { z } from "zod";
import { idSchema } from "./ids.js";

export const learnerTraitPacePreferenceSchema = z.enum(["slow", "balanced", "fast"]);
export const learnerTraitDepthPreferenceSchema = z.enum(["intuitive", "balanced", "formal"]);
export const learnerTraitHelpSeekingStyleSchema = z.enum(["asks_early", "tries_first", "avoids_help"]);
export const learnerTraitConfidenceStyleSchema = z.enum(["underconfident", "calibrated", "overconfident"]);
export const learnerTraitMetacognitiveAccuracySchema = z.enum(["low", "medium", "high"]);
export const learnerTraitPersistenceStyleSchema = z.enum(["gives_up_fast", "steady", "stubborn"]);
export const learnerTraitSourceFamiliaritySchema = z.enum(["unfamiliar", "somewhat_familiar", "familiar"]);
export const learnerTraitAssessmentPreferenceSchema = z.enum(["checkpoint", "quiz", "worked_problem", "self_explain"]);
export const learnerTraitExamplePreferenceSchema = z.enum(["concrete", "visual", "symbolic", "applied"]);
export const learnerTraitUrgencyContextSchema = z.enum(["exploratory", "exam_prep", "deadline_pressure"]);

export const learnerTraitValuesSchema = z.object({
  pacePreference: learnerTraitPacePreferenceSchema,
  depthPreference: learnerTraitDepthPreferenceSchema,
  helpSeekingStyle: learnerTraitHelpSeekingStyleSchema,
  confidenceStyle: learnerTraitConfidenceStyleSchema,
  metacognitiveAccuracy: learnerTraitMetacognitiveAccuracySchema,
  persistenceStyle: learnerTraitPersistenceStyleSchema,
  sourceFamiliarity: learnerTraitSourceFamiliaritySchema,
  assessmentPreference: learnerTraitAssessmentPreferenceSchema,
  examplePreference: learnerTraitExamplePreferenceSchema,
  urgencyContext: learnerTraitUrgencyContextSchema,
});

export const learnerTraitKeySchema = z.enum([
  "pacePreference",
  "depthPreference",
  "helpSeekingStyle",
  "confidenceStyle",
  "metacognitiveAccuracy",
  "persistenceStyle",
  "sourceFamiliarity",
  "assessmentPreference",
  "examplePreference",
  "urgencyContext",
]);

export const learnerTraitValueByKeySchema = z.discriminatedUnion("trait", [
  z.object({ trait: z.literal("pacePreference"), value: learnerTraitPacePreferenceSchema }),
  z.object({ trait: z.literal("depthPreference"), value: learnerTraitDepthPreferenceSchema }),
  z.object({ trait: z.literal("helpSeekingStyle"), value: learnerTraitHelpSeekingStyleSchema }),
  z.object({ trait: z.literal("confidenceStyle"), value: learnerTraitConfidenceStyleSchema }),
  z.object({ trait: z.literal("metacognitiveAccuracy"), value: learnerTraitMetacognitiveAccuracySchema }),
  z.object({ trait: z.literal("persistenceStyle"), value: learnerTraitPersistenceStyleSchema }),
  z.object({ trait: z.literal("sourceFamiliarity"), value: learnerTraitSourceFamiliaritySchema }),
  z.object({ trait: z.literal("assessmentPreference"), value: learnerTraitAssessmentPreferenceSchema }),
  z.object({ trait: z.literal("examplePreference"), value: learnerTraitExamplePreferenceSchema }),
  z.object({ trait: z.literal("urgencyContext"), value: learnerTraitUrgencyContextSchema }),
]);

export const learnerTraitEvidenceRefSchema = z.object({
  refType: z.enum([
    "self_report",
    "behavior_observation",
    "mastery_evidence",
    "student_profile",
    "onboarding_profile",
    "tutor_observation",
    "session_trace",
    "tool_call",
    "trait_signal",
    "trait_estimate",
  ]),
  refId: idSchema,
  summary: z.string().min(1).optional(),
});

export const learnerTraitSignalSourceSchema = z.enum([
  "explicit_self_report",
  "tutor_recorded_preference",
  "behavior_extraction",
  "mastery_evidence_pattern",
  "tutor_observation",
  "onboarding_profile",
  "session_trace",
]);

export const learnerTraitEstimateLaneSchema = z.enum(["explicit", "inferred"]);

export const learnerTraitDecayMetadataSchema = z.object({
  decayAppliedAt: z.string().datetime().nullable().default(null),
  decayHalfLifeDays: z.number().positive().nullable().default(null),
  staleAfter: z.string().datetime().nullable().default(null),
});

export const learnerTraitGuardrailMetadataSchema = z.object({
  decisionId: idSchema.optional(),
  status: z.enum(["accepted", "capped", "rejected"]),
  reasons: z.array(z.string().min(1)).default([]),
  confidenceCap: z.number().min(0).max(1).nullable().default(null),
  checkedAt: z.string().datetime().optional(),
});

const learnerTraitSignalBaseSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  userId: idSchema,
  source: learnerTraitSignalSourceSchema,
  trait: learnerTraitKeySchema,
  strength: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(learnerTraitEvidenceRefSchema).min(1),
  sessionId: idSchema.optional(),
  turnId: idSchema.optional(),
  runId: idSchema.optional(),
  internalVisibility: z.literal(true).default(true),
  observedAt: z.string().datetime(),
  notes: z.string().min(1).optional(),
});

export const learnerTraitSignalSchema = z.discriminatedUnion("trait", [
  learnerTraitSignalBaseSchema.extend({ trait: z.literal("pacePreference"), suggestedValue: learnerTraitPacePreferenceSchema.optional() }),
  learnerTraitSignalBaseSchema.extend({ trait: z.literal("depthPreference"), suggestedValue: learnerTraitDepthPreferenceSchema.optional() }),
  learnerTraitSignalBaseSchema.extend({ trait: z.literal("helpSeekingStyle"), suggestedValue: learnerTraitHelpSeekingStyleSchema.optional() }),
  learnerTraitSignalBaseSchema.extend({ trait: z.literal("confidenceStyle"), suggestedValue: learnerTraitConfidenceStyleSchema.optional() }),
  learnerTraitSignalBaseSchema.extend({ trait: z.literal("metacognitiveAccuracy"), suggestedValue: learnerTraitMetacognitiveAccuracySchema.optional() }),
  learnerTraitSignalBaseSchema.extend({ trait: z.literal("persistenceStyle"), suggestedValue: learnerTraitPersistenceStyleSchema.optional() }),
  learnerTraitSignalBaseSchema.extend({ trait: z.literal("sourceFamiliarity"), suggestedValue: learnerTraitSourceFamiliaritySchema.optional() }),
  learnerTraitSignalBaseSchema.extend({ trait: z.literal("assessmentPreference"), suggestedValue: learnerTraitAssessmentPreferenceSchema.optional() }),
  learnerTraitSignalBaseSchema.extend({ trait: z.literal("examplePreference"), suggestedValue: learnerTraitExamplePreferenceSchema.optional() }),
  learnerTraitSignalBaseSchema.extend({ trait: z.literal("urgencyContext"), suggestedValue: learnerTraitUrgencyContextSchema.optional() }),
]);

export const learnerTraitEstimateSchema = learnerTraitValueByKeySchema.and(z.object({
  id: idSchema.optional(),
  notebookId: idSchema.optional(),
  userId: idSchema.optional(),
  targetRef: learnerTraitEvidenceRefSchema.nullable().optional(),
  confidence: z.number().min(0).max(1),
  lane: learnerTraitEstimateLaneSchema.default("inferred"),
  evidenceRefs: z.array(learnerTraitEvidenceRefSchema).default([]),
  contradictionRefs: z.array(learnerTraitEvidenceRefSchema).default([]),
  decay: learnerTraitDecayMetadataSchema.default({
    decayAppliedAt: null,
    decayHalfLifeDays: null,
    staleAfter: null,
  }),
  lastUpdatedReason: z.string().min(1),
  guardrail: learnerTraitGuardrailMetadataSchema.optional(),
  updatedAt: z.string().datetime().optional(),
}));

export const learnerTraitProposalSchema = learnerTraitValueByKeySchema.and(z.object({
  proposalId: idSchema,
  notebookId: idSchema,
  userId: idSchema,
  confidence: z.number().min(0).max(1),
  lane: learnerTraitEstimateLaneSchema,
  evidenceRefs: z.array(learnerTraitEvidenceRefSchema).min(1),
  contradictionRefs: z.array(learnerTraitEvidenceRefSchema).default([]),
  updateReason: z.string().min(1),
  recommendationText: z.string().min(1),
  safetyNotes: z.array(z.string().min(1)).default([]),
}));

export const learnerTraitGuardrailDecisionSchema = z.object({
  decisionId: idSchema,
  proposalId: idSchema,
  notebookId: idSchema,
  userId: idSchema,
  status: z.enum(["accepted", "capped", "rejected"]),
  reasons: z.array(z.string().min(1)).min(1),
  acceptedEstimate: learnerTraitEstimateSchema.optional(),
  confidenceCap: z.number().min(0).max(1).optional(),
  contradictionRefs: z.array(learnerTraitEvidenceRefSchema).default([]),
  checkedAt: z.string().datetime(),
});

export const learnerTraitTriggerSummarySchema = z.object({
  shouldEstimate: z.boolean(),
  reasons: z.array(z.enum([
    "explicit_preference_change",
    "repeated_trait_family_signals",
    "mastery_self_report_contradiction",
    "repeated_tutor_observed_friction",
    "goal_or_urgency_change",
    "strong_estimate_contradiction",
    "explicit_agent_decision",
  ])).default([]),
  evidenceRefs: z.array(learnerTraitEvidenceRefSchema).default([]),
  traitFamilies: z.array(learnerTraitKeySchema).default([]),
});

export const learnerTraitEvidencePacketSchema = z.object({
  packetId: idSchema,
  notebookId: idSchema,
  userId: idSchema,
  trigger: learnerTraitTriggerSummarySchema,
  signals: z.array(learnerTraitSignalSchema).default([]),
  currentEstimates: z.array(learnerTraitEstimateSchema).default([]),
  masteryEvidenceSummaries: z.array(z.object({
    evidenceRef: learnerTraitEvidenceRefSchema,
    summary: z.string().min(1),
  })).default([]),
  profileSummary: z.string().min(1).optional(),
  sessionSummaries: z.array(z.object({
    evidenceRef: learnerTraitEvidenceRefSchema,
    summary: z.string().min(1),
  })).default([]),
  contradictionRefs: z.array(learnerTraitEvidenceRefSchema).default([]),
  builtAt: z.string().datetime(),
});

export const personalizationRecommendationSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  userId: idSchema,
  trait: learnerTraitKeySchema.optional(),
  lane: learnerTraitEstimateLaneSchema.optional(),
  recommendation: z.string().min(1),
  adaptationType: z.enum(["pace", "depth", "examples", "assessment", "confidence_support", "help_seeking", "source_grounding", "urgency"]),
  learnerFacingSafe: z.literal(true).default(true),
  includeRawLabel: z.literal(false).default(false),
  evidenceRefs: z.array(learnerTraitEvidenceRefSchema).default([]),
});

export const learnerTraitArchetypeSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  traitValues: learnerTraitValuesSchema,
  tutoringRecommendations: z.array(z.string().min(1)).default([]),
  syntheticPersonaSeed: z.object({
    backgroundSummary: z.string().min(1),
    goalSummary: z.string().min(1),
    behaviors: z.array(z.string().min(1)).min(1),
    misconceptions: z.array(z.string().min(1)).default([]),
    studyHabits: z.array(z.string().min(1)).min(1),
  }),
});

export const learnerTraitArchetypeBucketSchema = z.object({
  archetypeId: idSchema,
  label: z.string().min(1),
  score: z.number().min(0).max(1),
  matchedTraits: z.array(learnerTraitKeySchema).default([]),
  missingTraits: z.array(learnerTraitKeySchema).default([]),
  recommendationOnly: z.literal(true),
});

export type LearnerTraitValues = z.infer<typeof learnerTraitValuesSchema>;
export type LearnerTraitKey = z.infer<typeof learnerTraitKeySchema>;
export type LearnerTraitEstimate = z.input<typeof learnerTraitEstimateSchema>;
export type LearnerTraitEvidenceRef = z.infer<typeof learnerTraitEvidenceRefSchema>;
export type LearnerTraitSignal = z.infer<typeof learnerTraitSignalSchema>;
export type LearnerTraitProposal = z.infer<typeof learnerTraitProposalSchema>;
export type LearnerTraitGuardrailDecision = z.infer<typeof learnerTraitGuardrailDecisionSchema>;
export type LearnerTraitTriggerSummary = z.infer<typeof learnerTraitTriggerSummarySchema>;
export type LearnerTraitEvidencePacket = z.infer<typeof learnerTraitEvidencePacketSchema>;
export type PersonalizationRecommendation = z.infer<typeof personalizationRecommendationSchema>;
export type LearnerTraitArchetype = z.infer<typeof learnerTraitArchetypeSchema>;
export type LearnerTraitArchetypeBucket = z.infer<typeof learnerTraitArchetypeBucketSchema>;

export const learnerTraitArchetypeFixtures = learnerTraitArchetypeSchema.array().parse([
  {
    id: "beginner_misconception",
    label: "Beginner with misconception",
    description: "Surfaces partial answers and misconception repair.",
    traitValues: {
      pacePreference: "slow",
      depthPreference: "intuitive",
      helpSeekingStyle: "asks_early",
      confidenceStyle: "underconfident",
      metacognitiveAccuracy: "medium",
      persistenceStyle: "steady",
      sourceFamiliarity: "unfamiliar",
      assessmentPreference: "checkpoint",
      examplePreference: "concrete",
      urgencyContext: "exploratory",
    },
    tutoringRecommendations: [
      "Use concrete examples and small checkpoints.",
      "Avoid advancing from fragile partial answers.",
    ],
    syntheticPersonaSeed: {
      backgroundSummary: "Confuses the target concept and needs guided remediation.",
      goalSummary: "Understand the lesson and correct the misconception.",
      behaviors: ["asks for step-by-step help", "needs concrete checkpoints"],
      misconceptions: ["Believes derivatives are only about slope formulas."],
      studyHabits: ["reviews with examples", "checks understanding after each step"],
    },
  },
  {
    id: "overconfident_skimmer",
    label: "Overconfident skimmer",
    description: "Claims prior knowledge and tries to skip verification.",
    traitValues: {
      pacePreference: "fast",
      depthPreference: "intuitive",
      helpSeekingStyle: "avoids_help",
      confidenceStyle: "overconfident",
      metacognitiveAccuracy: "low",
      persistenceStyle: "stubborn",
      sourceFamiliarity: "somewhat_familiar",
      assessmentPreference: "checkpoint",
      examplePreference: "applied",
      urgencyContext: "exploratory",
    },
    tutoringRecommendations: [
      "Keep explanations concise.",
      "Verify mastery before advancing from self-reported confidence.",
    ],
    syntheticPersonaSeed: {
      backgroundSummary: "Claims prior knowledge and tries to skip basics.",
      goalSummary: "Move quickly without losing mastery safeguards.",
      behaviors: ["rushes answers", "requests shorter explanations"],
      misconceptions: ["Assumes the first answer is always sufficient."],
      studyHabits: ["prefers summaries", "skips rereading unless prompted"],
    },
  },
  {
    id: "anxious_exam_prep",
    label: "Anxious exam-prep learner",
    description: "Wants source-grounded revision and reassurance before an exam.",
    traitValues: {
      pacePreference: "balanced",
      depthPreference: "balanced",
      helpSeekingStyle: "asks_early",
      confidenceStyle: "underconfident",
      metacognitiveAccuracy: "medium",
      persistenceStyle: "steady",
      sourceFamiliarity: "familiar",
      assessmentPreference: "quiz",
      examplePreference: "concrete",
      urgencyContext: "exam_prep",
    },
    tutoringRecommendations: [
      "Offer focused practice and clear next actions.",
      "Do not inflate mastery from anxiety or reassurance-seeking.",
    ],
    syntheticPersonaSeed: {
      backgroundSummary: "Wants revision help and reassurance before an exam.",
      goalSummary: "Get source-grounded study help and a clear next step.",
      behaviors: ["asks for quizzes", "wants a concrete artifact"],
      misconceptions: ["Mistakes confidence for mastery."],
      studyHabits: ["reviews by practice", "seeks reassurance before moving on"],
    },
  },
  {
    id: "careful_self_explainer",
    label: "Careful self-explainer",
    description: "Learns by explaining reasoning and checking precise gaps.",
    traitValues: {
      pacePreference: "balanced",
      depthPreference: "formal",
      helpSeekingStyle: "tries_first",
      confidenceStyle: "calibrated",
      metacognitiveAccuracy: "high",
      persistenceStyle: "steady",
      sourceFamiliarity: "somewhat_familiar",
      assessmentPreference: "self_explain",
      examplePreference: "symbolic",
      urgencyContext: "exploratory",
    },
    tutoringRecommendations: [
      "Invite self-explanation before giving the full answer.",
      "Check formal reasoning gaps precisely.",
    ],
    syntheticPersonaSeed: {
      backgroundSummary: "Tries to reason carefully and explain each step.",
      goalSummary: "Build a precise understanding without skipping details.",
      behaviors: ["attempts an explanation before asking", "asks for precise correction"],
      misconceptions: [],
      studyHabits: ["self-explains", "compares reasoning against source definitions"],
    },
  },
  {
    id: "help_avoidant_stuck",
    label: "Help-avoidant stuck learner",
    description: "Struggles quietly and may disengage before asking for help.",
    traitValues: {
      pacePreference: "slow",
      depthPreference: "intuitive",
      helpSeekingStyle: "avoids_help",
      confidenceStyle: "underconfident",
      metacognitiveAccuracy: "low",
      persistenceStyle: "gives_up_fast",
      sourceFamiliarity: "unfamiliar",
      assessmentPreference: "worked_problem",
      examplePreference: "concrete",
      urgencyContext: "exploratory",
    },
    tutoringRecommendations: [
      "Offer low-friction worked steps.",
      "Check understanding without waiting for the learner to ask.",
    ],
    syntheticPersonaSeed: {
      backgroundSummary: "Gets stuck but does not readily ask for clarification.",
      goalSummary: "Make progress without feeling exposed by mistakes.",
      behaviors: ["gives short uncertain answers", "avoids admitting confusion"],
      misconceptions: ["Confuses procedure with concept."],
      studyHabits: ["tries alone first", "benefits from worked examples"],
    },
  },
  {
    id: "fast_advanced",
    label: "Fast advanced learner",
    description: "Can move quickly when evidence supports acceleration.",
    traitValues: {
      pacePreference: "fast",
      depthPreference: "formal",
      helpSeekingStyle: "tries_first",
      confidenceStyle: "calibrated",
      metacognitiveAccuracy: "high",
      persistenceStyle: "stubborn",
      sourceFamiliarity: "familiar",
      assessmentPreference: "worked_problem",
      examplePreference: "symbolic",
      urgencyContext: "exploratory",
    },
    tutoringRecommendations: [
      "Use harder worked problems and formal language.",
      "Accelerate only when evidence supports it.",
    ],
    syntheticPersonaSeed: {
      backgroundSummary: "Understands prerequisites and wants efficient depth.",
      goalSummary: "Move quickly into harder applications.",
      behaviors: ["asks for harder problems", "prefers concise formal explanations"],
      misconceptions: [],
      studyHabits: ["tests edge cases", "works from definitions"],
    },
  },
  {
    id: "low_confidence_high_mastery",
    label: "Low-confidence high-mastery learner",
    description: "Understates ability despite strong evidence.",
    traitValues: {
      pacePreference: "balanced",
      depthPreference: "balanced",
      helpSeekingStyle: "asks_early",
      confidenceStyle: "underconfident",
      metacognitiveAccuracy: "high",
      persistenceStyle: "steady",
      sourceFamiliarity: "familiar",
      assessmentPreference: "self_explain",
      examplePreference: "applied",
      urgencyContext: "exam_prep",
    },
    tutoringRecommendations: [
      "Use evidence-backed encouragement.",
      "Avoid unnecessary remediation when mastery evidence is strong.",
    ],
    syntheticPersonaSeed: {
      backgroundSummary: "Performs well but doubts readiness.",
      goalSummary: "Confirm understanding and know what to practice next.",
      behaviors: ["asks for reassurance", "can explain accurately when prompted"],
      misconceptions: [],
      studyHabits: ["reviews worked applications", "uses self-explanation to build confidence"],
    },
  },
]);

export function getLearnerTraitArchetype(id: string): LearnerTraitArchetype | undefined {
  return learnerTraitArchetypeFixtures.find((archetype) => archetype.id === id);
}

export function deriveLearnerTraitArchetypeBuckets(input: {
  estimates: Array<z.input<typeof learnerTraitEstimateSchema>>;
  archetypes?: LearnerTraitArchetype[];
  confidenceThreshold?: number;
  minimumMatchedTraits?: number;
}): LearnerTraitArchetypeBucket[] {
  const archetypes = input.archetypes ?? learnerTraitArchetypeFixtures;
  const confidenceThreshold = input.confidenceThreshold ?? 0.6;
  const minimumMatchedTraits = input.minimumMatchedTraits ?? 4;
  const confidentEstimates = new Map<LearnerTraitKey, LearnerTraitEstimate>();

  for (const estimate of input.estimates) {
    if (estimate.confidence >= confidenceThreshold) {
      confidentEstimates.set(estimate.trait, estimate);
    }
  }

  return archetypes
    .map((archetype) => {
      const matchedTraits: LearnerTraitKey[] = [];
      const missingTraits: LearnerTraitKey[] = [];
      const entries = Object.entries(archetype.traitValues) as Array<[LearnerTraitKey, string]>;

      for (const [trait, value] of entries) {
        const estimate = confidentEstimates.get(trait);
        if (estimate?.value === value) {
          matchedTraits.push(trait);
        } else {
          missingTraits.push(trait);
        }
      }

      return learnerTraitArchetypeBucketSchema.parse({
        archetypeId: archetype.id,
        label: archetype.label,
        score: matchedTraits.length / entries.length,
        matchedTraits,
        missingTraits,
        recommendationOnly: true,
      });
    })
    .filter((bucket) => bucket.matchedTraits.length >= minimumMatchedTraits)
    .sort((left, right) => right.score - left.score);
}
