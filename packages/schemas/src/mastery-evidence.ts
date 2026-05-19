import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";
import { learnerReadinessLevelSchema } from "./learning-levels.js";

export const masteryCorrectnessLabelSchema = z.enum([
  "correct",
  "partial",
  "incorrect",
  "needs_more_evidence",
]);

export type MasteryCorrectnessLabel = z.infer<typeof masteryCorrectnessLabelSchema>;

export const tutoringInterventionSchema = z.enum([
  "clarify",
  "reteach",
  "worked_example",
  "guided_practice",
  "quick_check",
  "advance",
]);

export type TutoringIntervention = z.infer<typeof tutoringInterventionSchema>;

export const masteryEvidenceTypeSchema = z.enum([
  "mastery_check",
  "quiz_artifact",
  "repeated_mistake",
  "open_explanation",
  "self_report",
  "tutor_observation",
]);

export type MasteryEvidenceType = z.infer<typeof masteryEvidenceTypeSchema>;

export const masteryEvidenceTriggerSourceSchema = z.enum([
  "runtime_auto",
  "tutor_tool",
  "quiz_attempt",
  "flashcard_review",
]);

export type MasteryEvidenceTriggerSource = z.infer<typeof masteryEvidenceTriggerSourceSchema>;

export const conceptRoleSchema = z.enum(["primary", "secondary", "prerequisite"]);

export const conceptScoreSchema = z.object({
  conceptId: idSchema,
  score: z.number().min(0).max(1),
  delta: z.number().min(-1).max(1),
  role: conceptRoleSchema,
});

export const misconceptionEvidenceSchema = z.object({
  conceptId: idSchema,
  description: z.string().min(1),
});

export const evaluatorProvenanceSchema = z.object({
  mode: z.enum(["deterministic", "llm", "fallback"]),
  model: z.string().nullable().default(null),
  fallbackUsed: z.boolean().default(false),
  notes: z.string().min(1),
});

export const masteryEvidenceSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  userId: idSchema,
  correctnessLabel: masteryCorrectnessLabelSchema,
  overallScore: z.number().min(0).max(1),
  conceptScores: z.array(conceptScoreSchema).default([]),
  misconceptions: z.array(misconceptionEvidenceSchema).default([]),
  readiness: learnerReadinessLevelSchema,
  tutoringIntervention: tutoringInterventionSchema,
  uncertainty: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidenceType: masteryEvidenceTypeSchema,
  triggerSource: masteryEvidenceTriggerSourceSchema,
  sourceRefs: z.array(nodeRefSchema).default([]),
  contextRefs: z.array(nodeRefSchema).default([]),
  sessionId: idSchema.optional(),
  turnId: idSchema.optional(),
  runId: idSchema.optional(),
  objectiveId: idSchema.optional(),
  evaluatorProvenance: evaluatorProvenanceSchema,
  tutorQuestionSummary: z.string().min(1).optional(),
  learnerAnswerSummary: z.string().min(1).optional(),
  referenceAnswerSummary: z.string().min(1).optional(),
  createdAt: z.string().datetime().optional(),
});

export type MasteryEvidence = z.infer<typeof masteryEvidenceSchema>;

export const masteryEvidenceInputSchema = z.object({
  tutorQuestion: z.string().min(1),
  learnerAnswer: z.string().min(1),
  objectiveId: idSchema.optional(),
  conceptRoles: z
    .array(
      z.object({
        conceptId: idSchema,
        role: conceptRoleSchema.default("primary"),
      }),
    )
    .min(1),
  masterySnapshot: z.record(z.string(), z.number().min(0).max(1)).default({}),
  sourceRefs: z.array(nodeRefSchema).default([]),
  contextRefs: z.array(nodeRefSchema).default([]),
  referenceAnswer: z.string().min(1).optional(),
  evidenceType: masteryEvidenceTypeSchema.optional(),
  triggerSource: masteryEvidenceTriggerSourceSchema.optional(),
});

export type MasteryEvidenceInput = z.infer<typeof masteryEvidenceInputSchema>;

export function buildMasteryEvidenceId(): string {
  return `mev_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function parseMasteryEvidence(value: unknown): MasteryEvidence | undefined {
  const parsed = masteryEvidenceSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export const MASTERY_EVIDENCE_UNCERTAINTY_THRESHOLD = 0.72;
export const MASTERY_EVIDENCE_LOW_CONFIDENCE_THRESHOLD = 0.45;
