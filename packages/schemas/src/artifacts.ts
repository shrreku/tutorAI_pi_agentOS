import { z } from "zod";
import { idSchema, nodeRefSchema, provenanceRefSchema } from "./ids.js";

export const artifactTypeSchema = z.enum([
  "note",
  "quiz",
  "flashcards",
  "worked_example",
  "formula_sheet",
  "comparison_page",
  "diagram",
  "revision_plan",
  "teaching_arc",
  "session_digest",
  "concept_card",
]);

export { noteArtifactPayloadSchema, notePersonalizationMetadataSchema, notePersonalizationSectionSchema } from "./note-personalization.js";

const quizGenerationStateSchema = z.object({
  status: z.enum(["draft", "resuming", "complete"]).default("draft"),
  prompt: z.string().min(1),
  requestedQuestionCount: z.number().int().positive(),
  generatedQuestionCount: z.number().int().nonnegative().default(0),
  conceptIds: z.array(idSchema).default([]),
  sourceNodeRefs: z.array(nodeRefSchema).default([]),
  resumeArtifactId: idSchema.nullable().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const quizArtifactPayloadSchema = z.object({
  questions: z.array(z.object({
    prompt: z.string().min(1),
    answer: z.string().min(1).optional(),
    referenceAnswer: z.string().min(1).optional(),
    explanation: z.string().min(1).optional(),
    choices: z.array(z.string().min(1)).optional(),
    difficulty: z.string().min(1).optional(),
    conceptIds: z.array(idSchema).default([]),
  }).refine((question) => Boolean(question.answer ?? question.referenceAnswer), {
    message: "Quiz questions require answer or referenceAnswer.",
  })).default([]),
  generationState: quizGenerationStateSchema.optional(),
});

export const flashcardsArtifactPayloadSchema = z.object({
  cards: z.array(z.object({
    front: z.string().min(1),
    back: z.string().min(1),
    conceptIds: z.array(idSchema).default([]),
    ambiguityWarning: z.string().min(1).optional(),
  })).min(1),
});

export const workedExampleArtifactPayloadSchema = z.object({
  problemStatement: z.string().min(1),
  solutionSteps: z.array(z.string().min(1)).min(1),
  commonMistakes: z.array(z.string().min(1)).default([]),
  finalTakeaway: z.string().min(1),
});

export const formulaSheetArtifactPayloadSchema = z.object({
  formulas: z.array(z.object({
    symbol: z.string().min(1).optional(),
    expression: z.string().min(1),
    meaning: z.string().min(1),
    assumptions: z.string().min(1).optional(),
    units: z.string().min(1).optional(),
    exampleUsage: z.string().min(1).optional(),
  })).min(1),
});

export const comparisonPageArtifactPayloadSchema = z.object({
  leftTitle: z.string().min(1),
  rightTitle: z.string().min(1),
  comparisonRows: z.array(z.object({
    dimension: z.string().min(1),
    left: z.string().min(1),
    right: z.string().min(1),
    takeaway: z.string().min(1).optional(),
  })).min(1),
  checkpointQuestion: z.string().min(1).optional(),
});

export const sessionDigestArtifactPayloadSchema = z.object({
  summary: z.string().min(1),
  taught: z.array(z.string().min(1)).default([]),
  checked: z.array(z.string().min(1)).default([]),
  stillWeak: z.array(z.string().min(1)).default([]),
  nextActions: z.array(z.string().min(1)).default([]),
  artifactRefs: z.array(nodeRefSchema).default([]),
});

export const artifactSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  artifactType: artifactTypeSchema,
  title: z.string().min(1),
  status: z.enum(["draft", "proposed", "ready", "rejected", "failed", "archived"]),
  payload: z.record(z.string(), z.unknown()),
  sourceNodeRefs: z.array(nodeRefSchema).default([]),
  provenance: z.array(provenanceRefSchema).default([]),
  createdByRunId: idSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const learningArtifactSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum([
    "markdown",
    "summary",
    "key_points",
    "steps",
    "table",
    "questions",
    "flashcards",
    "formulae",
    "comparison",
    "timeline",
    "metadata",
    "empty",
  ]),
  content: z.unknown(),
  sourceRefs: z.array(nodeRefSchema).default([]),
  emptyMessage: z.string().optional(),
});

export const learningArtifactActionSchema = z.object({
  id: z.enum(["study", "practice", "revise", "ask_tutor", "approve", "edit", "archive", "open_source", "review"]),
  label: z.string().min(1),
  intent: z.enum(["primary", "secondary", "danger"]).default("secondary"),
});

export const learningArtifactQualitySchema = z.object({
  sourceBacked: z.boolean(),
  needsReview: z.boolean(),
  issues: z.array(z.string()).default([]),
});

export const learningArtifactViewSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  title: z.string().min(1),
  type: z.string().min(1),
  purpose: z.string().min(1),
  studentAction: z.string().min(1),
  status: z.string().min(1),
  sourceRefs: z.array(nodeRefSchema).default([]),
  claimRefs: z.array(nodeRefSchema).default([]),
  coverageRefs: z.array(nodeRefSchema).default([]),
  objectiveRefs: z.array(nodeRefSchema).default([]),
  confidence: z.number().nullable(),
  lastUpdatedReason: z.string().nullable(),
  sections: z.array(learningArtifactSectionSchema).default([]),
  actions: z.array(learningArtifactActionSchema).default([]),
  quality: learningArtifactQualitySchema,
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type LearningArtifactSection = z.infer<typeof learningArtifactSectionSchema>;
export type LearningArtifactAction = z.infer<typeof learningArtifactActionSchema>;
export type LearningArtifactView = z.infer<typeof learningArtifactViewSchema>;
