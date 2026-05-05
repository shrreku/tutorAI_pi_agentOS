import type { NodeRef, ReducerResult, ToolContext } from "@studyagent/schemas";
import { idSchema, nodeRefSchema, reducerResultSchema } from "@studyagent/schemas";
import { z } from "zod";
import type { ToolDefinition, ToolRegistry } from "./index.js";

const positiveIntSchema = z.number().int().positive();

const candidateWriteWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

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

export type ProposeClaimInput = z.infer<typeof proposeClaimInputSchema>;
export type ProposeClaimOutput = z.infer<typeof proposeClaimOutputSchema>;
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;
export type CreateNoteOutput = z.infer<typeof createNoteOutputSchema>;
export type CreateQuizInput = z.infer<typeof createQuizInputSchema>;
export type CreateQuizOutput = z.infer<typeof createQuizOutputSchema>;
export type CreateFlashcardsInput = z.infer<typeof createFlashcardsInputSchema>;
export type CreateFlashcardsOutput = z.infer<typeof createFlashcardsOutputSchema>;
export type CreateWorkedExampleInput = z.infer<typeof createWorkedExampleInputSchema>;
export type CreateWorkedExampleOutput = z.infer<typeof createQuizOutputSchema>;
export type CreateFormulaSheetInput = z.infer<typeof createFormulaSheetInputSchema>;
export type CreateFormulaSheetOutput = z.infer<typeof createQuizOutputSchema>;
export type CreateComparisonPageInput = z.infer<typeof createComparisonPageInputSchema>;
export type CreateComparisonPageOutput = z.infer<typeof createQuizOutputSchema>;
export type CoverageMarkInput = z.infer<typeof coverageMarkInputSchema>;
export type CoverageMarkOutput = z.infer<typeof coverageMarkOutputSchema>;
export type CoverageGetGapsInput = z.infer<typeof coverageGetGapsInputSchema>;
export type CoverageGetGapsOutput = z.infer<typeof coverageGetGapsOutputSchema>;
export type SessionPlanUpdateInput = z.infer<typeof sessionPlanUpdateInputSchema>;
export type SessionPlanUpdateOutput = z.infer<typeof sessionPlanUpdateOutputSchema>;
export type StudentProfileUpdatePreferencesInput = z.infer<typeof studentProfileUpdatePreferencesInputSchema>;
export type StudentProfileUpdatePreferencesOutput = z.infer<typeof studentProfileUpdatePreferencesOutputSchema>;

export type RuntimeWriteToolProvider = {
  proposeClaim(input: ProposeClaimInput, ctx: ToolContext): Promise<ProposeClaimOutput>;
  createNote(input: CreateNoteInput, ctx: ToolContext): Promise<CreateNoteOutput>;
  createQuiz(input: CreateQuizInput, ctx: ToolContext): Promise<CreateQuizOutput>;
  createFlashcards(input: CreateFlashcardsInput, ctx: ToolContext): Promise<CreateFlashcardsOutput>;
  createWorkedExample(input: CreateWorkedExampleInput, ctx: ToolContext): Promise<CreateWorkedExampleOutput>;
  createFormulaSheet(input: CreateFormulaSheetInput, ctx: ToolContext): Promise<CreateFormulaSheetOutput>;
  createComparisonPage(input: CreateComparisonPageInput, ctx: ToolContext): Promise<CreateComparisonPageOutput>;
  markCoverage(input: CoverageMarkInput, ctx: ToolContext): Promise<CoverageMarkOutput>;
  getCoverageGaps(input: CoverageGetGapsInput, ctx: ToolContext): Promise<CoverageGetGapsOutput>;
  updateSessionPlan(input: SessionPlanUpdateInput, ctx: ToolContext): Promise<SessionPlanUpdateOutput>;
  updateStudentProfilePreferences(
    input: StudentProfileUpdatePreferencesInput,
    ctx: ToolContext,
  ): Promise<StudentProfileUpdatePreferencesOutput>;
};

export function registerWriteToolsV1(registry: ToolRegistry, provider: RuntimeWriteToolProvider): void {
  registry.register({
    name: "wiki.propose_claim",
    description: "Proposes a provenance-backed candidate claim for reducer validation.",
    inputSchema: proposeClaimInputSchema,
    outputSchema: proposeClaimOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.proposeClaim(input, ctx),
  });

  registry.register({
    name: "artifact.create_note",
    description: "Creates a draft note artifact from grounded notebook context.",
    inputSchema: createNoteInputSchema,
    outputSchema: createNoteOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.createNote(input, ctx),
  });

  registry.register({
    name: "artifact.create_quiz",
    description: "Creates a draft quiz artifact from notebook concepts and sources.",
    inputSchema: createQuizInputSchema,
    outputSchema: createQuizOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.createQuiz(input, ctx),
  });

  registry.register({
    name: "artifact.create_flashcards",
    description: "Creates a flashcard artifact from notebook concepts and sources.",
    inputSchema: createFlashcardsInputSchema,
    outputSchema: createFlashcardsOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.createFlashcards(input, ctx),
  });

  registry.register({
    name: "artifact.create_worked_example",
    description: "Creates a worked-example artifact from notebook concepts and sources.",
    inputSchema: createWorkedExampleInputSchema,
    outputSchema: createQuizOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.createWorkedExample(input, ctx),
  });

  registry.register({
    name: "artifact.create_formula_sheet",
    description: "Creates a formula-sheet artifact from notebook concepts and sources.",
    inputSchema: createFormulaSheetInputSchema,
    outputSchema: createQuizOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.createFormulaSheet(input, ctx),
  });

  registry.register({
    name: "artifact.create_comparison_page",
    description: "Creates a comparison-page artifact from notebook concepts and sources.",
    inputSchema: createComparisonPageInputSchema,
    outputSchema: createQuizOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.createComparisonPage(input, ctx),
  });

  registry.register({
    name: "coverage.mark_introduced",
    description: "Marks a coverage item as introduced in the current notebook context.",
    inputSchema: coverageMarkInputSchema,
    outputSchema: coverageMarkOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.markCoverage({ ...input, status: "introduced" }, ctx),
  });

  registry.register({
    name: "coverage.mark_checked",
    description: "Marks a coverage item as checked in the current notebook context.",
    inputSchema: coverageMarkInputSchema,
    outputSchema: coverageMarkOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.markCoverage({ ...input, status: "checked" }, ctx),
  });

  registry.register({
    name: "coverage.get_gaps",
    description: "Returns coverage gaps for the current notebook context.",
    inputSchema: coverageGetGapsInputSchema,
    outputSchema: coverageGetGapsOutputSchema,
    sideEffectClass: "read_only",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.getCoverageGaps(input, ctx),
  });

  registry.register({
    name: "session_plan.update",
    description: "Updates the active session plan artifact in the notebook.",
    inputSchema: sessionPlanUpdateInputSchema,
    outputSchema: sessionPlanUpdateOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.updateSessionPlan(input, ctx),
  });

  registry.register({
    name: "artifact.update_session_plan",
    description: "Updates the active session plan artifact in the notebook.",
    inputSchema: sessionPlanUpdateInputSchema,
    outputSchema: sessionPlanUpdateOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.updateSessionPlan(input, ctx),
  });

  registry.register({
    name: "student_profile.update_preferences",
    description: "Updates learner preferences in the student profile.",
    inputSchema: studentProfileUpdatePreferencesInputSchema,
    outputSchema: studentProfileUpdatePreferencesOutputSchema,
    sideEffectClass: "candidate_write",
    timeoutMs: 5000,
    execute: (input, ctx) => provider.updateStudentProfilePreferences(input, ctx),
  });
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
        warnings: [],
        reducerResult: buildReducerResult("artifact.created", {
          notebookId: ctx.notebookId,
          title: input.title,
          prompt: input.prompt,
          conceptIds: input.conceptIds,
          questionCount: input.questionCount,
          sourceNodeRefs: input.sourceNodeRefs,
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
  artifactType: "note" | "quiz" | "flashcards" | "worked_example" | "formula_sheet" | "comparison_page";
  title: string;
  sourceNodeRefs: NodeRef[];
}): ReducerResult {
  return buildReducerResult("artifact.created", input);
}

function createRuntimeWriteId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}