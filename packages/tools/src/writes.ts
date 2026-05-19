import type { NodeRef, ReducerResult, ToolContext } from "@studyagent/schemas";
import {
  idSchema,
  masteryCorrectnessLabelSchema,
  masteryEvidenceInputSchema,
  nodeRefSchema,
  reducerResultSchema,
  tutoringInterventionSchema,
  type MasteryEvidenceTriggerSource,
  type MasteryEvidenceType,
} from "@studyagent/schemas";
import { z } from "zod";
import type { ToolContract, ToolRegistry } from "./index.js";

const positiveIntSchema = z.number().int().positive();

const generatedQuizQuestionSchema = z.object({
  prompt: z.string().min(1),
  answer: z.string().min(1).optional(),
  referenceAnswer: z.string().min(1).optional(),
  explanation: z.string().min(1).optional(),
  choices: z.array(z.string().min(1)).optional(),
  difficulty: z.string().min(1).optional(),
  conceptIds: z.array(idSchema).default([]),
}).refine((question) => Boolean(question.answer ?? question.referenceAnswer), {
  message: "Quiz questions require answer or referenceAnswer.",
});

const generatedFlashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  conceptIds: z.array(idSchema).default([]),
  ambiguityWarning: z.string().min(1).optional(),
});

const candidateWriteWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

function normalizeEnumToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeConceptRole(value: unknown): "primary" | "secondary" | "prerequisite" {
  if (typeof value !== "string") return "primary";
  const normalized = normalizeEnumToken(value);
  if (normalized === "core" || normalized === "main" || normalized === "target") return "primary";
  if (normalized === "supporting" || normalized === "related") return "secondary";
  if (normalized === "prereq") return "prerequisite";
  if (normalized === "primary" || normalized === "secondary" || normalized === "prerequisite") return normalized;
  return "secondary";
}

export function normalizeMasteryEvidenceType(value: unknown): MasteryEvidenceType {
  if (typeof value !== "string") return "open_explanation";
  const normalized = normalizeEnumToken(value);
  if (normalized === "mastery" || normalized === "check" || normalized === "mastery_check_response") return "mastery_check";
  if (normalized === "quiz" || normalized === "quiz_response") return "quiz_artifact";
  if (normalized === "repeated_error" || normalized === "mistake" || normalized === "recurring_mistake") {
    return "repeated_mistake";
  }
  if (normalized === "explanation" || normalized === "open_response") return "open_explanation";
  if (normalized === "self_reported" || normalized === "self_reported_confusion") return "self_report";
  if (normalized === "observation") return "tutor_observation";
  if (
    normalized === "mastery_check" ||
    normalized === "quiz_artifact" ||
    normalized === "repeated_mistake" ||
    normalized === "open_explanation" ||
    normalized === "self_report" ||
    normalized === "tutor_observation"
  ) {
    return normalized;
  }
  return "open_explanation";
}

export function normalizeMasteryTriggerSource(value: unknown): MasteryEvidenceTriggerSource {
  if (typeof value !== "string") return "tutor_tool";
  const normalized = normalizeEnumToken(value);
  if (normalized === "runtime" || normalized === "automatic" || normalized === "auto") return "runtime_auto";
  if (normalized === "tool" || normalized === "tutor") return "tutor_tool";
  if (normalized === "quiz") return "quiz_attempt";
  if (normalized === "flashcard") return "flashcard_review";
  if (
    normalized === "runtime_auto" ||
    normalized === "tutor_tool" ||
    normalized === "quiz_attempt" ||
    normalized === "flashcard_review"
  ) {
    return normalized;
  }
  return "tutor_tool";
}

export function normalizeMasterySnapshotScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  if (typeof value !== "string") return null;
  const normalized = normalizeEnumToken(value);
  if (normalized === "foundational" || normalized === "beginner" || normalized === "not_started") return 0.2;
  if (normalized === "developing" || normalized === "partial" || normalized === "in_progress") return 0.45;
  if (normalized === "proficient" || normalized === "ready" || normalized === "good") return 0.7;
  if (normalized === "advanced" || normalized === "mastered" || normalized === "strong") return 0.88;
  if (normalized === "unknown" || normalized === "none") return 0.35;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : null;
}

const flexibleConceptRoleSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return { conceptId: value, role: "primary" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return {
    ...record,
    role: normalizeConceptRole(record.role),
  };
}, z.object({ conceptId: idSchema, role: z.string().min(1).default("primary") }));

const flexibleMasteryEvidenceTypeSchema = z.preprocess((value) => {
  if (value === undefined) return value;
  return normalizeMasteryEvidenceType(value);
}, z.string().min(1));

const flexibleMasteryTriggerSourceSchema = z.preprocess((value) => {
  if (value === undefined) return value;
  return normalizeMasteryTriggerSource(value);
}, z.string().min(1));

const flexibleMasterySnapshotSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([conceptId, rawScore]) => [conceptId, normalizeMasterySnapshotScore(rawScore)] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] !== null),
  );
}, z.record(z.string(), z.number().min(0).max(1)).default({}));

const reducerResultInputSchema = z.object({
  mutationType: z.string().min(1),
  appliedChanges: z.record(z.string(), z.unknown()),
  emittedEventIds: z.array(idSchema).default([]),
  rejectedReason: z.string().optional(),
});

export const studentProfileUpdatePreferencesInputSchema = z.object({
  userId: z.string().min(1).optional(),
  goalSummary: z.string().min(1).nullable().optional(),
  backgroundSummary: z.string().min(1).nullable().optional(),
  pacePreference: z.string().min(1).nullable().optional(),
  depthPreference: z.string().min(1).nullable().optional(),
  examplePreferencesJson: z.record(z.string(), z.unknown()).optional(),
  assessmentPreferenceJson: z.record(z.string(), z.unknown()).optional(),
  constraintsJson: z.record(z.string(), z.unknown()).optional(),
});

const studentProfileUpdatePreferencesOutputSchema = z.object({
  studentProfile: z
    .object({
      id: idSchema,
      notebookId: idSchema,
      userId: idSchema,
      goalSummary: z.string().nullable(),
      backgroundSummary: z.string().nullable(),
      pacePreference: z.string().nullable(),
      depthPreference: z.string().nullable(),
      examplePreferencesJson: z.record(z.string(), z.unknown()).default({}),
      assessmentPreferenceJson: z.record(z.string(), z.unknown()).default({}),
      constraintsJson: z.record(z.string(), z.unknown()).default({}),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const proposeClaimInputSchema = z.object({
  claimText: z.string().min(1),
  claimType: z.string().min(1),
  conceptIds: z.array(idSchema).default([]),
  sourceRefs: z.array(nodeRefSchema).min(1),
  confidenceHint: z.number().min(0).max(1).optional(),
});

export const proposeClaimOutputSchema = z.object({
  candidateClaimId: idSchema,
  status: z.enum(["candidate", "admitted"]),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const createNoteInputSchema = z.object({
  title: z.string().min(1),
  noteMarkdown: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).default([]),
  examples: z.array(z.string().min(1)).default([]),
  misconceptions: z.array(z.string().min(1)).default([]),
  sourceNodeRefs: z.array(nodeRefSchema).default([]),
  blockOwnerType: z.enum(["agent", "human", "pinned_agent"]).default("agent"),
});

export const createNoteOutputSchema = z.object({
  artifactId: idSchema,
  status: z.enum(["draft", "proposed", "ready"]),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const createQuizInputSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  conceptIds: z.array(idSchema).default([]),
  sourceNodeRefs: z.array(nodeRefSchema).default([]),
  questionCount: positiveIntSchema.max(20).default(5),
  questions: z.array(generatedQuizQuestionSchema).optional(),
  resumeArtifactId: idSchema.optional(),
  deferGeneration: z.boolean().optional().default(false),
});

export const createQuizOutputSchema = z.object({
  artifactId: idSchema,
  status: z.enum(["draft", "proposed", "ready"]),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const createFlashcardsInputSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  conceptIds: z.array(idSchema).default([]),
  sourceNodeRefs: z.array(nodeRefSchema).default([]),
  cardCount: positiveIntSchema.max(30).default(10),
  cards: z.array(generatedFlashcardSchema).optional(),
});

export const createFlashcardsOutputSchema = z.object({
  artifactId: idSchema,
  status: z.enum(["draft", "proposed", "ready"]),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const createWorkedExampleInputSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  problemStatement: z.string().min(1),
  solutionSteps: z.array(z.string().min(1)).min(1),
  commonMistakes: z.array(z.string().min(1)).default([]),
  finalTakeaway: z.string().min(1),
  conceptIds: z.array(idSchema).default([]),
  sourceNodeRefs: z.array(nodeRefSchema).default([]),
});

export const createFormulaSheetInputSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  formulas: z.array(
    z.object({
      symbol: z.string().min(1),
      expression: z.string().min(1),
      meaning: z.string().min(1),
      assumptions: z.string().min(1).optional(),
      units: z.string().min(1).optional(),
      exampleUsage: z.string().min(1).optional(),
    }),
  ).min(1),
  conceptIds: z.array(idSchema).default([]),
  sourceNodeRefs: z.array(nodeRefSchema).default([]),
});

export const createComparisonPageInputSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  leftTitle: z.string().min(1),
  rightTitle: z.string().min(1),
  comparisonRows: z.array(
    z.object({
      dimension: z.string().min(1),
      left: z.string().min(1),
      right: z.string().min(1),
      takeaway: z.string().min(1).optional(),
    }),
  ).min(1),
  conceptIds: z.array(idSchema).default([]),
  sourceNodeRefs: z.array(nodeRefSchema).default([]),
});

export const createConceptCardInputSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  definition: z.string().min(1),
  whenToUse: z.string().min(1).optional(),
  commonConfusion: z.string().min(1).optional(),
  examples: z.array(z.string().min(1)).default([]),
  conceptIds: z.array(idSchema).default([]),
  sourceNodeRefs: z.array(nodeRefSchema).default([]),
});

export const createWorkedExampleOutputSchema = createQuizOutputSchema;
export const createFormulaSheetOutputSchema = createQuizOutputSchema;
export const createComparisonPageOutputSchema = createQuizOutputSchema;
export const createConceptCardOutputSchema = createQuizOutputSchema;

export const artifactInsertIntoTutorContextInputSchema = z.object({
  artifactId: idSchema,
  insertionPoint: z.enum(["after_definition", "after_formula", "after_procedure", "after_misconception", "on_demand"]),
  tutorMessage: z.string().min(1),
  coverageItemRefsJson: z.array(z.unknown()).default([]),
});

export const artifactInsertIntoTutorContextOutputSchema = z.object({
  success: z.boolean(),
  insertedArtifactId: idSchema.optional(),
  tutorAnnotation: z.object({
    artifactId: idSchema,
    insertionPoint: z.string().min(1),
    context: z.string().min(1),
    timestamp: z.string().datetime(),
  }).optional(),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

const coverageStatusSchema = z.enum(["planned", "introduced", "checked", "mastered", "needs_review"]);

export const coverageMarkInputSchema = z.object({
  coverageItemId: idSchema,
  status: coverageStatusSchema.optional(),
  curriculumId: idSchema.optional(),
  moduleId: idSchema.optional(),
  objectiveListId: idSchema.optional(),
  sessionPlanId: idSchema.optional(),
  evidenceJson: z.record(z.string(), z.unknown()).default({}),
});

export const coverageMarkOutputSchema = z.object({
  coverageRecord: z
    .object({
      id: idSchema,
      notebookId: idSchema,
      coverageItemId: idSchema,
      curriculumId: idSchema.nullable().optional(),
      moduleId: idSchema.nullable().optional(),
      objectiveListId: idSchema.nullable().optional(),
      sessionPlanId: idSchema.nullable().optional(),
      status: coverageStatusSchema,
      evidenceJson: z.record(z.string(), z.unknown()),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const coverageGetGapsInputSchema = z.object({
  curriculumId: idSchema.optional(),
  moduleId: idSchema.optional(),
  objectiveListId: idSchema.optional(),
  sessionPlanId: idSchema.optional(),
  statuses: z.array(coverageStatusSchema).default(["planned", "needs_review"]),
  limit: positiveIntSchema.max(100).default(25),
});

export const coverageGetGapsOutputSchema = z.object({
  gaps: z.array(
    z.object({
      coverageItemId: idSchema,
      title: z.string().min(1),
      itemFamily: z.string().min(1),
      description: z.string().nullable().optional(),
      status: coverageStatusSchema,
      curriculumId: idSchema.nullable().optional(),
      moduleId: idSchema.nullable().optional(),
      objectiveListId: idSchema.nullable().optional(),
      sessionPlanId: idSchema.nullable().optional(),
    }),
  ),
});

export const sessionPlanUpdateInputSchema = z.object({
  sessionPlanId: idSchema,
  title: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  sessionGoal: z.string().min(1).nullable().optional(),
  plannedObjectiveIds: z.array(idSchema).optional(),
  openerJson: z.record(z.string(), z.unknown()).optional(),
  diagnosticQuestionIds: z.array(idSchema).optional(),
  teachingArcIds: z.array(idSchema).optional(),
  artifactRefsJson: z.array(z.unknown()).optional(),
  exitCriteriaJson: z.record(z.string(), z.unknown()).optional(),
  recommendationReasonJson: z.record(z.string(), z.unknown()).optional(),
});

export const sessionPlanUpdateOutputSchema = z.object({
  sessionPlan: z
    .object({
      id: idSchema,
      notebookId: idSchema,
      curriculumId: idSchema,
      moduleId: idSchema,
      objectiveListId: idSchema,
      title: z.string().min(1),
      status: z.string().min(1),
      sessionGoal: z.string().nullable(),
      plannedObjectiveIds: z.array(idSchema),
      openerJson: z.record(z.string(), z.unknown()),
      diagnosticQuestionIds: z.array(idSchema),
      teachingArcIds: z.array(idSchema),
      artifactRefsJson: z.array(z.unknown()),
      exitCriteriaJson: z.record(z.string(), z.unknown()),
      recommendationReasonJson: z.record(z.string(), z.unknown()),
      createdByRunId: idSchema.nullable().optional(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const curriculumActivateInputSchema = z.object({
  curriculumId: idSchema,
  activeModuleId: idSchema.optional(),
  reasonJson: z.record(z.string(), z.unknown()).default({}),
});

export const curriculumActivateOutputSchema = z.object({
  curriculum: z.object({ id: idSchema, notebookId: idSchema, title: z.string(), status: z.string(), activeModuleId: idSchema.nullable() }).nullable(),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const moduleUpdateInputSchema = z.object({
  moduleId: idSchema,
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  status: z.string().min(1).optional(),
  orderIndex: z.number().int().min(0).optional(),
  targetConceptIds: z.array(idSchema).optional(),
  prerequisiteModuleIds: z.array(idSchema).optional(),
  estimatedSessionCount: z.number().int().positive().optional(),
  coverageRequirementsJson: z.record(z.string(), z.unknown()).optional(),
  masteryGateJson: z.record(z.string(), z.unknown()).optional(),
});

export const moduleUpdateOutputSchema = z.object({
  module: z.object({ id: idSchema, notebookId: idSchema, curriculumId: idSchema, title: z.string(), summary: z.string().nullable(), status: z.string(), orderIndex: z.number().int() }).nullable(),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const objectiveListUpdateInputSchema = z.object({
  objectiveListId: idSchema,
  title: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  currentObjectiveId: idSchema.nullable().optional(),
  objectiveIdsOrdered: z.array(idSchema).optional(),
  coverageSnapshotJson: z.record(z.string(), z.unknown()).optional(),
});

export const objectiveListUpdateOutputSchema = z.object({
  objectiveList: z.object({ id: idSchema, notebookId: idSchema, curriculumId: idSchema, moduleId: idSchema, title: z.string(), status: z.string(), currentObjectiveId: idSchema.nullable(), objectiveIdsOrdered: z.array(idSchema) }).nullable(),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const objectiveUpdateInputSchema = z.object({
  objectiveId: idSchema,
  title: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  targetConceptIds: z.array(idSchema).optional(),
  prerequisiteConceptIds: z.array(idSchema).optional(),
  successCriteriaJson: z.record(z.string(), z.unknown()).optional(),
  sourceRefsJson: z.array(z.unknown()).optional(),
  suggestedMode: z.string().min(1).nullable().optional(),
  readinessScore: z.number().min(0).max(1).nullable().optional(),
});

export const objectiveUpdateOutputSchema = z.object({
  objective: z
    .object({
      id: idSchema,
      notebookId: idSchema,
      curriculumId: idSchema,
      title: z.string(),
      status: z.string(),
      orderIndex: z.number().int(),
    })
    .nullable(),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const objectiveListReorderInputSchema = z.object({
  objectiveListId: idSchema,
  objectiveIdsOrdered: z.array(idSchema).min(1),
  currentObjectiveId: idSchema.nullable().optional(),
});

export const objectiveListReorderOutputSchema = objectiveListUpdateOutputSchema;

export const objectiveListSplitObjectiveInputSchema = z.object({
  objectiveListId: idSchema,
  objectiveId: idSchema,
  splitObjectives: z
    .array(
      z.object({
        title: z.string().min(1),
        targetConceptIds: z.array(idSchema).optional(),
        prerequisiteConceptIds: z.array(idSchema).optional(),
      }),
    )
    .min(2),
});

export const objectiveListSplitObjectiveOutputSchema = z.object({
  objectiveList: z.object({
    id: idSchema,
    notebookId: idSchema,
    curriculumId: idSchema,
    moduleId: idSchema,
    title: z.string(),
    status: z.string(),
    currentObjectiveId: idSchema.nullable(),
    objectiveIdsOrdered: z.array(idSchema),
  }).nullable(),
  createdObjectiveIds: z.array(idSchema).default([]),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export const objectiveListMergeObjectivesInputSchema = z.object({
  objectiveListId: idSchema,
  objectiveIds: z.array(idSchema).min(2),
  mergedObjectiveTitle: z.string().min(1),
  targetConceptIds: z.array(idSchema).optional(),
  prerequisiteConceptIds: z.array(idSchema).optional(),
});

export const objectiveListMergeObjectivesOutputSchema = z.object({
  objectiveList: z.object({
    id: idSchema,
    notebookId: idSchema,
    curriculumId: idSchema,
    moduleId: idSchema,
    title: z.string(),
    status: z.string(),
    currentObjectiveId: idSchema.nullable(),
    objectiveIdsOrdered: z.array(idSchema),
  }).nullable(),
  mergedObjectiveId: idSchema.optional(),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export type ProposeClaimInput = z.infer<typeof proposeClaimInputSchema>;
export type ProposeClaimOutput = z.infer<typeof proposeClaimOutputSchema>;
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;
export type CreateNoteOutput = z.infer<typeof createNoteOutputSchema>;
export type CreateQuizInput = z.infer<typeof createQuizInputSchema>;
export type CreateQuizOutput = z.infer<typeof createQuizOutputSchema>;
export type CreateFlashcardsInput = z.infer<typeof createFlashcardsInputSchema>;
export type CreateFlashcardsOutput = z.infer<typeof createFlashcardsOutputSchema>;
export type CreateWorkedExampleInput = z.infer<typeof createWorkedExampleInputSchema>;
export type CreateWorkedExampleOutput = z.infer<typeof createWorkedExampleOutputSchema>;
export type CreateFormulaSheetInput = z.infer<typeof createFormulaSheetInputSchema>;
export type CreateFormulaSheetOutput = z.infer<typeof createFormulaSheetOutputSchema>;
export type CreateComparisonPageInput = z.infer<typeof createComparisonPageInputSchema>;
export type CreateComparisonPageOutput = z.infer<typeof createComparisonPageOutputSchema>;
export type CreateConceptCardInput = z.infer<typeof createConceptCardInputSchema>;
export type CreateConceptCardOutput = z.infer<typeof createConceptCardOutputSchema>;
export type ArtifactInsertIntoTutorContextInput = z.infer<typeof artifactInsertIntoTutorContextInputSchema>;
export type ArtifactInsertIntoTutorContextOutput = z.infer<typeof artifactInsertIntoTutorContextOutputSchema>;
export type CoverageMarkInput = z.infer<typeof coverageMarkInputSchema>;
export type CoverageMarkOutput = z.infer<typeof coverageMarkOutputSchema>;
export type CoverageGetGapsInput = z.infer<typeof coverageGetGapsInputSchema>;
export type CoverageGetGapsOutput = z.infer<typeof coverageGetGapsOutputSchema>;
export type SessionPlanUpdateInput = z.infer<typeof sessionPlanUpdateInputSchema>;
export type SessionPlanUpdateOutput = z.infer<typeof sessionPlanUpdateOutputSchema>;
export type CurriculumActivateInput = z.infer<typeof curriculumActivateInputSchema>;
export type CurriculumActivateOutput = z.infer<typeof curriculumActivateOutputSchema>;
export type ModuleUpdateInput = z.infer<typeof moduleUpdateInputSchema>;
export type ModuleUpdateOutput = z.infer<typeof moduleUpdateOutputSchema>;
export type ObjectiveListUpdateInput = z.infer<typeof objectiveListUpdateInputSchema>;
export type ObjectiveListUpdateOutput = z.infer<typeof objectiveListUpdateOutputSchema>;
export type ObjectiveUpdateInput = z.infer<typeof objectiveUpdateInputSchema>;
export type ObjectiveUpdateOutput = z.infer<typeof objectiveUpdateOutputSchema>;
export type ObjectiveListReorderInput = z.infer<typeof objectiveListReorderInputSchema>;
export type ObjectiveListReorderOutput = z.infer<typeof objectiveListReorderOutputSchema>;
export type ObjectiveListSplitObjectiveInput = z.infer<typeof objectiveListSplitObjectiveInputSchema>;
export type ObjectiveListSplitObjectiveOutput = z.infer<typeof objectiveListSplitObjectiveOutputSchema>;
export type ObjectiveListMergeObjectivesInput = z.infer<typeof objectiveListMergeObjectivesInputSchema>;
export type ObjectiveListMergeObjectivesOutput = z.infer<typeof objectiveListMergeObjectivesOutputSchema>;
export type StudentProfileUpdatePreferencesInput = z.infer<typeof studentProfileUpdatePreferencesInputSchema>;
export type StudentProfileUpdatePreferencesOutput = z.infer<typeof studentProfileUpdatePreferencesOutputSchema>;

export const evaluateLearnerResponseInputSchema = masteryEvidenceInputSchema
  .omit({ conceptRoles: true, evidenceType: true, triggerSource: true, masterySnapshot: true })
  .extend({
    conceptRoles: z.array(flexibleConceptRoleSchema).min(1),
    masterySnapshot: flexibleMasterySnapshotSchema,
    evidenceType: flexibleMasteryEvidenceTypeSchema.optional(),
    triggerSource: flexibleMasteryTriggerSourceSchema.optional(),
  });

export const evaluateLearnerResponseOutputSchema = z.object({
  masteryEvidenceId: idSchema,
  correctnessLabel: masteryCorrectnessLabelSchema,
  tutoringIntervention: tutoringInterventionSchema,
  readiness: z.string().min(1),
  conceptIds: z.array(idSchema).default([]),
  warnings: z.array(candidateWriteWarningSchema).default([]),
  reducerResult: reducerResultSchema,
});

export type EvaluateLearnerResponseInput = z.infer<typeof evaluateLearnerResponseInputSchema>;
export type EvaluateLearnerResponseOutput = z.infer<typeof evaluateLearnerResponseOutputSchema>;

export type RuntimeWriteToolProvider = {
  proposeClaim(input: ProposeClaimInput, ctx: ToolContext): Promise<ProposeClaimOutput>;
  createNote(input: CreateNoteInput, ctx: ToolContext): Promise<CreateNoteOutput>;
  createQuiz(input: CreateQuizInput, ctx: ToolContext): Promise<CreateQuizOutput>;
  createFlashcards(input: CreateFlashcardsInput, ctx: ToolContext): Promise<CreateFlashcardsOutput>;
  createWorkedExample(input: CreateWorkedExampleInput, ctx: ToolContext): Promise<CreateWorkedExampleOutput>;
  createFormulaSheet(input: CreateFormulaSheetInput, ctx: ToolContext): Promise<CreateFormulaSheetOutput>;
  createComparisonPage(input: CreateComparisonPageInput, ctx: ToolContext): Promise<CreateComparisonPageOutput>;
  createConceptCard(input: CreateConceptCardInput, ctx: ToolContext): Promise<CreateConceptCardOutput>;
  artifactInsertIntoTutorContext(input: ArtifactInsertIntoTutorContextInput, ctx: ToolContext): Promise<ArtifactInsertIntoTutorContextOutput>;
  markCoverage(input: CoverageMarkInput, ctx: ToolContext): Promise<CoverageMarkOutput>;
  getCoverageGaps(input: CoverageGetGapsInput, ctx: ToolContext): Promise<CoverageGetGapsOutput>;
  updateSessionPlan(input: SessionPlanUpdateInput, ctx: ToolContext): Promise<SessionPlanUpdateOutput>;
  activateCurriculum(input: CurriculumActivateInput, ctx: ToolContext): Promise<CurriculumActivateOutput>;
  updateModule(input: ModuleUpdateInput, ctx: ToolContext): Promise<ModuleUpdateOutput>;
  updateObjectiveList(input: ObjectiveListUpdateInput, ctx: ToolContext): Promise<ObjectiveListUpdateOutput>;
  updateObjective(input: ObjectiveUpdateInput, ctx: ToolContext): Promise<ObjectiveUpdateOutput>;
  reorderObjectiveList(input: ObjectiveListReorderInput, ctx: ToolContext): Promise<ObjectiveListReorderOutput>;
  splitObjective(input: ObjectiveListSplitObjectiveInput, ctx: ToolContext): Promise<ObjectiveListSplitObjectiveOutput>;
  mergeObjectives(input: ObjectiveListMergeObjectivesInput, ctx: ToolContext): Promise<ObjectiveListMergeObjectivesOutput>;
  updateStudentProfilePreferences(
    input: StudentProfileUpdatePreferencesInput,
    ctx: ToolContext,
  ): Promise<StudentProfileUpdatePreferencesOutput>;
  evaluateLearnerResponse(
    input: EvaluateLearnerResponseInput,
    ctx: ToolContext,
  ): Promise<EvaluateLearnerResponseOutput>;
};

export const WRITE_TOOL_CONTRACTS = [
  {
    name: "wiki.propose_claim",
    description: "Proposes a provenance-backed candidate claim for reducer validation.",
    inputSchema: proposeClaimInputSchema,
    outputSchema: proposeClaimOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "proposeClaim",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["wiki.claim.proposed"] },
    timeoutMs: 5000,
  },
  {
    name: "artifact.create_note",
    description: "Creates a draft note artifact from grounded notebook context.",
    inputSchema: createNoteInputSchema,
    outputSchema: createNoteOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "createNote",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["artifact.created"] },
    timeoutMs: 5000,
  },
  {
    name: "artifact.create_quiz",
    description: "Creates a draft quiz artifact from notebook concepts and sources.",
    inputSchema: createQuizInputSchema,
    outputSchema: createQuizOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "createQuiz",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["artifact.created"] },
    timeoutMs: 5000,
  },
  {
    name: "artifact.create_flashcards",
    description: "Creates a flashcard artifact from notebook concepts and sources.",
    inputSchema: createFlashcardsInputSchema,
    outputSchema: createFlashcardsOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "createFlashcards",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["artifact.created"] },
    timeoutMs: 5000,
  },
  {
    name: "artifact.create_worked_example",
    description: "Creates a worked-example artifact from notebook concepts and sources.",
    inputSchema: createWorkedExampleInputSchema,
    outputSchema: createWorkedExampleOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "createWorkedExample",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["artifact.created"] },
    timeoutMs: 5000,
  },
  {
    name: "artifact.create_formula_sheet",
    description: "Creates a formula-sheet artifact from notebook concepts and sources.",
    inputSchema: createFormulaSheetInputSchema,
    outputSchema: createFormulaSheetOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "createFormulaSheet",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["artifact.created"] },
    timeoutMs: 5000,
  },
  {
    name: "artifact.create_comparison_page",
    description: "Creates a comparison-page artifact from notebook concepts and sources.",
    inputSchema: createComparisonPageInputSchema,
    outputSchema: createComparisonPageOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "createComparisonPage",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["artifact.created"] },
    timeoutMs: 5000,
  },
  {
    name: "artifact.create_concept_card",
    description: "Creates a compact source-backed concept card artifact.",
    inputSchema: createConceptCardInputSchema,
    outputSchema: createConceptCardOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "createConceptCard",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["artifact.created"] },
    timeoutMs: 5000,
  },
  {
    name: "artifact.insert_into_tutor_context",
    description: "Inserts an existing artifact into the current tutor context with annotation and insertion point.",
    inputSchema: artifactInsertIntoTutorContextInputSchema,
    outputSchema: artifactInsertIntoTutorContextOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "artifactInsertIntoTutorContext",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["artifact.insert_into_tutor_context"] },
    timeoutMs: 5000,
  },
  {
    name: "coverage.mark_introduced",
    description: "Marks a coverage item as introduced in the current notebook context.",
    inputSchema: coverageMarkInputSchema,
    outputSchema: coverageMarkOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "markCoverage",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["coverage.record.updated"] },
    timeoutMs: 5000,
  },
  {
    name: "coverage.mark_checked",
    description: "Marks a coverage item as checked in the current notebook context.",
    inputSchema: coverageMarkInputSchema,
    outputSchema: coverageMarkOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "markCoverage",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["coverage.record.updated"] },
    timeoutMs: 5000,
  },
  {
    name: "coverage.get_gaps",
    description: "Returns coverage gaps for the current notebook context.",
    inputSchema: coverageGetGapsInputSchema,
    outputSchema: coverageGetGapsOutputSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "getCoverageGaps",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 5000,
  },
  {
    name: "session_plan.update",
    description: "Updates the active session plan artifact in the notebook.",
    inputSchema: sessionPlanUpdateInputSchema,
    outputSchema: sessionPlanUpdateOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "updateSessionPlan",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["session_plan.updated"] },
    timeoutMs: 5000,
  },
  {
    name: "artifact.update_session_plan",
    description: "Updates the active session plan artifact in the notebook.",
    inputSchema: sessionPlanUpdateInputSchema,
    outputSchema: sessionPlanUpdateOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "updateSessionPlan",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["session_plan.updated"] },
    timeoutMs: 5000,
  },
  {
    name: "curriculum.activate",
    description: "Activates a curriculum and optionally its current module for the notebook.",
    inputSchema: curriculumActivateInputSchema,
    outputSchema: curriculumActivateOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "activateCurriculum",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["curriculum.activated"] },
    timeoutMs: 5000,
  },
  {
    name: "module.update",
    description: "Updates a curriculum module through reducer-governed planning state.",
    inputSchema: moduleUpdateInputSchema,
    outputSchema: moduleUpdateOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "updateModule",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["module.updated"] },
    timeoutMs: 5000,
  },
  {
    name: "objective_list.update",
    description: "Updates a module-scoped objective list, including current objective and ordering.",
    inputSchema: objectiveListUpdateInputSchema,
    outputSchema: objectiveListUpdateOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "updateObjectiveList",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["objective_list.updated"] },
    timeoutMs: 5000,
  },
  {
    name: "objective.update",
    description: "Rewrites an objective's canonical fields in planning state.",
    inputSchema: objectiveUpdateInputSchema,
    outputSchema: objectiveUpdateOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "updateObjective",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["objective.updated"] },
    timeoutMs: 5000,
  },
  {
    name: "objective_list.reorder",
    description: "Reorders objectives in a module-scoped objective list.",
    inputSchema: objectiveListReorderInputSchema,
    outputSchema: objectiveListReorderOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "reorderObjectiveList",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["objective_list.reordered"] },
    timeoutMs: 5000,
  },
  {
    name: "objective_list.split_objective",
    description: "Splits one objective into multiple objectives in the current list.",
    inputSchema: objectiveListSplitObjectiveInputSchema,
    outputSchema: objectiveListSplitObjectiveOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "splitObjective",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["objective_list.objective_split"] },
    timeoutMs: 5000,
  },
  {
    name: "objective_list.merge_objectives",
    description: "Merges multiple objectives into one objective in the current list.",
    inputSchema: objectiveListMergeObjectivesInputSchema,
    outputSchema: objectiveListMergeObjectivesOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "mergeObjectives",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["objective_list.objectives_merged"] },
    timeoutMs: 5000,
  },
  {
    name: "student_profile.update_preferences",
    description: "Updates learner preferences in the student profile.",
    inputSchema: studentProfileUpdatePreferencesInputSchema,
    outputSchema: studentProfileUpdatePreferencesOutputSchema,
    sideEffectClass: "candidate_write",
    operationKind: "write",
    providerMethod: "updateStudentProfilePreferences",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["student_profile.updated"] },
    timeoutMs: 5000,
  },
  {
    name: "learning.evaluate_response",
    description:
      "Evaluates a learner response, persists Mastery Evidence, and applies reducer-governed mastery updates.",
    inputSchema: evaluateLearnerResponseInputSchema,
    outputSchema: evaluateLearnerResponseOutputSchema,
    sideEffectClass: "state_update",
    operationKind: "write",
    providerMethod: "evaluateLearnerResponse",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: true, mutationTypes: ["learning.mastery.updated"] },
    timeoutMs: 8000,
  },
] as const satisfies readonly ToolContract<keyof RuntimeWriteToolProvider & string>[];

export function registerWriteToolsV1(registry: ToolRegistry, provider: RuntimeWriteToolProvider): void {
  for (const contract of WRITE_TOOL_CONTRACTS) {
    const execute = provider[contract.providerMethod] as (
      input: unknown,
      ctx: ToolContext,
    ) => Promise<unknown>;
    registry.register<unknown, unknown>({
      ...contract,
      execute: (input, ctx) => {
        if (contract.name === "coverage.mark_introduced") {
          return provider.markCoverage({ ...(input as unknown as CoverageMarkInput), status: "introduced" }, ctx);
        }
        if (contract.name === "coverage.mark_checked") {
          return provider.markCoverage({ ...(input as unknown as CoverageMarkInput), status: "checked" }, ctx);
        }
        return execute(input, ctx);
      },
    });
  }
}

export function createNoopRuntimeWriteToolProvider(): RuntimeWriteToolProvider {
  return {
    async proposeClaim(input, ctx) {
      return {
        candidateClaimId: createRuntimeWriteId("claim"),
        status: "candidate",
        warnings: [],
        reducerResult: buildReducerResult("wiki.claim.proposed", {
          notebookId: ctx.notebookId,
          claimText: input.claimText,
          claimType: input.claimType,
          conceptIds: input.conceptIds,
          sourceRefs: input.sourceRefs,
          candidateClaimId: createRuntimeWriteId("claim"),
        }),
      };
    },
    async createNote(input, ctx) {
      return {
        artifactId: createRuntimeWriteId("artifact"),
        status: "draft",
        warnings: [],
        reducerResult: buildReducerResult("artifact.created", {
          notebookId: ctx.notebookId,
          title: input.title,
          blockOwnerType: input.blockOwnerType,
          sourceNodeRefs: input.sourceNodeRefs,
        }),
      };
    },
    async createQuiz(input, ctx) {
      return {
        artifactId: createRuntimeWriteId("artifact"),
        status: "draft",
        warnings: input.deferGeneration
          ? [{ code: "quiz_generation_deferred", message: "Saved a resumable quiz draft; resume from this artifact to finish generation." }]
          : [],
        reducerResult: buildReducerResult("artifact.created", {
          notebookId: ctx.notebookId,
          title: input.title,
          prompt: input.prompt,
          conceptIds: input.conceptIds,
          questionCount: input.questionCount,
          sourceNodeRefs: input.sourceNodeRefs,
          resumable: input.deferGeneration,
        }),
      };
    },
    async createFlashcards(input, ctx) {
      return {
        artifactId: createRuntimeWriteId("artifact"),
        status: "draft",
        warnings: [],
        reducerResult: buildReducerResult("artifact.created", {
          notebookId: ctx.notebookId,
          title: input.title,
          prompt: input.prompt,
          conceptIds: input.conceptIds,
          cardCount: input.cardCount,
          sourceNodeRefs: input.sourceNodeRefs,
        }),
      };
    },
    async createWorkedExample(input, ctx) {
      return {
        artifactId: createRuntimeWriteId("artifact"),
        status: "ready",
        warnings: [],
        reducerResult: buildReducerResult("artifact.created", {
          notebookId: ctx.notebookId,
          artifactType: "worked_example",
          title: input.title,
          prompt: input.prompt,
          problemStatement: input.problemStatement,
          solutionSteps: input.solutionSteps,
          commonMistakes: input.commonMistakes,
          finalTakeaway: input.finalTakeaway,
          conceptIds: input.conceptIds,
          sourceNodeRefs: input.sourceNodeRefs,
        }),
      };
    },
    async createFormulaSheet(input, ctx) {
      return {
        artifactId: createRuntimeWriteId("artifact"),
        status: "ready",
        warnings: [],
        reducerResult: buildReducerResult("artifact.created", {
          notebookId: ctx.notebookId,
          artifactType: "formula_sheet",
          title: input.title,
          prompt: input.prompt,
          formulas: input.formulas,
          conceptIds: input.conceptIds,
          sourceNodeRefs: input.sourceNodeRefs,
        }),
      };
    },
    async createComparisonPage(input, ctx) {
      return {
        artifactId: createRuntimeWriteId("artifact"),
        status: "ready",
        warnings: [],
        reducerResult: buildReducerResult("artifact.created", {
          notebookId: ctx.notebookId,
          artifactType: "comparison_page",
          title: input.title,
          prompt: input.prompt,
          leftTitle: input.leftTitle,
          rightTitle: input.rightTitle,
          comparisonRows: input.comparisonRows,
          conceptIds: input.conceptIds,
          sourceNodeRefs: input.sourceNodeRefs,
        }),
      };
    },
    async createConceptCard(input, ctx) {
      return {
        artifactId: createRuntimeWriteId("artifact"),
        status: "ready",
        warnings: [],
        reducerResult: buildReducerResult("artifact.created", {
          notebookId: ctx.notebookId,
          artifactType: "concept_card",
          title: input.title,
          prompt: input.prompt,
          definition: input.definition,
          whenToUse: input.whenToUse,
          commonConfusion: input.commonConfusion,
          examples: input.examples,
          conceptIds: input.conceptIds,
          sourceNodeRefs: input.sourceNodeRefs,
        }),
      };
    },
    async artifactInsertIntoTutorContext(input) {
      return {
        success: true,
        insertedArtifactId: input.artifactId,
        tutorAnnotation: {
          artifactId: input.artifactId,
          insertionPoint: input.insertionPoint,
          context: input.tutorMessage,
          timestamp: new Date().toISOString(),
        },
        warnings: [],
        reducerResult: buildReducerResult("artifact.insert_into_tutor_context", {
          artifactId: input.artifactId,
          insertionPoint: input.insertionPoint,
          tutorMessage: input.tutorMessage,
          coverageItemRefsJson: input.coverageItemRefsJson ?? [],
        }),
      };
    },
    async markCoverage(input, ctx) {
      return {
        coverageRecord: {
          id: createRuntimeWriteId("coverage"),
          notebookId: ctx.notebookId,
          coverageItemId: input.coverageItemId,
          curriculumId: input.curriculumId ?? null,
          moduleId: input.moduleId ?? null,
          objectiveListId: input.objectiveListId ?? null,
          sessionPlanId: input.sessionPlanId ?? null,
          status: input.status ?? "introduced",
          evidenceJson: input.evidenceJson,
          updatedAt: new Date().toISOString(),
        },
        warnings: [],
        reducerResult: buildReducerResult("coverage.record.updated", {
          notebookId: ctx.notebookId,
          coverageItemId: input.coverageItemId,
          status: input.status ?? "introduced",
          curriculumId: input.curriculumId ?? null,
          moduleId: input.moduleId ?? null,
          objectiveListId: input.objectiveListId ?? null,
          sessionPlanId: input.sessionPlanId ?? null,
          evidenceJson: input.evidenceJson,
        }),
      };
    },
    async getCoverageGaps() {
      return { gaps: [] };
    },
    async updateSessionPlan(input, ctx) {
      return {
        sessionPlan: null,
        warnings: [],
        reducerResult: buildReducerResult("session_plan.updated", {
          notebookId: ctx.notebookId,
          sessionPlanId: input.sessionPlanId,
          title: input.title ?? null,
          status: input.status ?? null,
          sessionGoal: input.sessionGoal ?? null,
          plannedObjectiveIds: input.plannedObjectiveIds ?? [],
          openerJson: input.openerJson ?? {},
          diagnosticQuestionIds: input.diagnosticQuestionIds ?? [],
          teachingArcIds: input.teachingArcIds ?? [],
          artifactRefsJson: input.artifactRefsJson ?? [],
          exitCriteriaJson: input.exitCriteriaJson ?? {},
          recommendationReasonJson: input.recommendationReasonJson ?? {},
        }),
      };
    },
    async activateCurriculum(input, ctx) {
      return {
        curriculum: null,
        warnings: [],
        reducerResult: buildReducerResult("curriculum.activated", {
          notebookId: ctx.notebookId,
          curriculumId: input.curriculumId,
          activeModuleId: input.activeModuleId ?? null,
          reasonJson: input.reasonJson,
        }),
      };
    },
    async updateModule(input, ctx) {
      return {
        module: null,
        warnings: [],
        reducerResult: buildReducerResult("module.updated", {
          notebookId: ctx.notebookId,
          moduleId: input.moduleId,
          title: input.title ?? null,
          status: input.status ?? null,
          orderIndex: input.orderIndex ?? null,
        }),
      };
    },
    async updateObjectiveList(input, ctx) {
      return {
        objectiveList: null,
        warnings: [],
        reducerResult: buildReducerResult("objective_list.updated", {
          notebookId: ctx.notebookId,
          objectiveListId: input.objectiveListId,
          title: input.title ?? null,
          status: input.status ?? null,
          currentObjectiveId: input.currentObjectiveId ?? null,
          objectiveIdsOrdered: input.objectiveIdsOrdered ?? [],
        }),
      };
    },
    async updateObjective(input, ctx) {
      return {
        objective: null,
        warnings: [],
        reducerResult: buildReducerResult("objective.updated", {
          notebookId: ctx.notebookId,
          objectiveId: input.objectiveId,
          title: input.title ?? null,
          status: input.status ?? null,
          targetConceptIds: input.targetConceptIds ?? [],
          prerequisiteConceptIds: input.prerequisiteConceptIds ?? [],
        }),
      };
    },
    async reorderObjectiveList(input, ctx) {
      return {
        objectiveList: null,
        warnings: [],
        reducerResult: buildReducerResult("objective_list.reordered", {
          notebookId: ctx.notebookId,
          objectiveListId: input.objectiveListId,
          objectiveIdsOrdered: input.objectiveIdsOrdered,
          currentObjectiveId: input.currentObjectiveId ?? null,
        }),
      };
    },
    async splitObjective(input, ctx) {
      return {
        objectiveList: null,
        createdObjectiveIds: input.splitObjectives.map(() => createRuntimeWriteId("objective")),
        warnings: [],
        reducerResult: buildReducerResult("objective_list.objective_split", {
          notebookId: ctx.notebookId,
          objectiveListId: input.objectiveListId,
          objectiveId: input.objectiveId,
          splitObjectives: input.splitObjectives,
        }),
      };
    },
    async mergeObjectives(input, ctx) {
      return {
        objectiveList: null,
        mergedObjectiveId: createRuntimeWriteId("objective"),
        warnings: [],
        reducerResult: buildReducerResult("objective_list.objectives_merged", {
          notebookId: ctx.notebookId,
          objectiveListId: input.objectiveListId,
          objectiveIds: input.objectiveIds,
          mergedObjectiveTitle: input.mergedObjectiveTitle,
        }),
      };
    },
    async updateStudentProfilePreferences(input, ctx) {
      return {
        studentProfile: {
          id: createRuntimeWriteId("profile"),
          notebookId: ctx.notebookId,
          userId: input.userId ?? ctx.userId,
          goalSummary: input.goalSummary ?? null,
          backgroundSummary: input.backgroundSummary ?? null,
          pacePreference: input.pacePreference ?? null,
          depthPreference: input.depthPreference ?? null,
          examplePreferencesJson: input.examplePreferencesJson ?? {},
          assessmentPreferenceJson: input.assessmentPreferenceJson ?? {},
          constraintsJson: input.constraintsJson ?? {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        warnings: [],
        reducerResult: buildReducerResult(
          "student_profile.updated",
          {
            notebookId: ctx.notebookId,
            userId: input.userId ?? ctx.userId,
            goalSummary: input.goalSummary ?? null,
            backgroundSummary: input.backgroundSummary ?? null,
            pacePreference: input.pacePreference ?? null,
            depthPreference: input.depthPreference ?? null,
            examplePreferencesJson: input.examplePreferencesJson ?? {},
            assessmentPreferenceJson: input.assessmentPreferenceJson ?? {},
            constraintsJson: input.constraintsJson ?? {},
          },
        ),
      };
    },
    async evaluateLearnerResponse(input, ctx) {
      const masteryEvidenceId = createRuntimeWriteId("mev");
      return {
        masteryEvidenceId,
        correctnessLabel: "partial",
        tutoringIntervention: "guided_practice",
        readiness: "developing",
        conceptIds: input.conceptRoles.map((role) => role.conceptId),
        warnings: [],
        reducerResult: buildReducerResult(
          "learning.mastery.updated",
          {
            notebookId: ctx.notebookId,
            masteryEvidenceId,
            conceptIds: input.conceptRoles.map((role) => role.conceptId),
          },
        ),
      };
    },
  };
}

export function buildReducerResult(
  mutationType: string,
  appliedChanges: Record<string, unknown>,
  emittedEventIds: string[] = [],
  rejectedReason?: string,
): ReducerResult {
  return reducerResultSchema.parse({
    accepted: rejectedReason === undefined,
    mutationType,
    appliedChanges,
    emittedEventIds,
    ...(rejectedReason ? { rejectedReason } : {}),
  });
}

export function proposeClaimReducerResult(input: {
  candidateClaimId: string;
  notebookId: string;
  claimText: string;
  claimType: string;
  sourceRefs: NodeRef[];
  conceptIds: string[];
}): ReducerResult {
  return buildReducerResult("wiki.claim.proposed", input);
}

export function createArtifactReducerResult(input: {
  artifactId: string;
  notebookId: string;
  artifactType: "note" | "quiz" | "flashcards" | "worked_example" | "formula_sheet" | "comparison_page" | "concept_card";
  title: string;
  sourceNodeRefs: NodeRef[];
  status?: string;
  visibility?: "hidden" | "learner";
  approvalRequired?: boolean;
  lifecycle?: Record<string, unknown>;
  quality?: Record<string, unknown>;
}): ReducerResult {
  return buildReducerResult("artifact.created", input);
}

function createRuntimeWriteId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}
