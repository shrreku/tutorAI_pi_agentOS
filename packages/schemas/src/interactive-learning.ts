import { z } from "zod";
import { evidenceRefSchema } from "./evidence.js";
import { idSchema, nodeRefSchema } from "./ids.js";

export const interactiveLearningBlockKindSchema = z.enum([
  "quiz",
  "flashcard_deck",
  "worked_example",
  "evidence_explorer",
  "simulation",
  "live_plan",
  "source_reader",
  "personalization_controls",
  "dev_trace_dashboard",
  "comparison",
  "concept_timeline",
]);

export const interactiveLearningActionNameSchema = z.enum([
  "quiz.answer_submitted",
  "flashcard.review_rated",
  "worked_example.step_answered",
  "worked_example.step_revealed",
  "simulation.observation_submitted",
  "simulation.parameter_snapshot_submitted",
  "live_plan.action_selected",
  "evidence.source_span_opened",
  "source_reader.annotation_created",
  "surface.completed",
  "tutor.help_requested",
  "personalization.preference_updated",
]);

export const interactiveLearningRendererKindSchema = z.enum(["mcp_app", "native"]);

export const interactiveLearningBlockQualitySchema = z.object({
  sourceBacked: z.boolean().default(false),
  needsReview: z.boolean().default(false),
});

export const interactiveLearningBlockSchema = z.object({
  id: idSchema,
  kind: interactiveLearningBlockKindSchema,
  title: z.string().min(1),
  learningPurpose: z.string().min(1),
  surfaceRole: z.enum(["primary", "supplemental"]).default("primary"),
  nodeRef: nodeRefSchema.optional(),
  artifactRef: nodeRefSchema.optional(),
  objectiveRefs: z.array(nodeRefSchema).default([]),
  conceptRefs: z.array(nodeRefSchema).default([]),
  sourceRefs: z.array(nodeRefSchema).default([]),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  prompt: z.string().nullable().default(null),
  content: z.unknown(),
  canonicalState: z.unknown().default({}),
  allowedActions: z.array(interactiveLearningActionNameSchema).default([]),
  rendererPreference: interactiveLearningRendererKindSchema.default("mcp_app"),
  fallbackSummary: z.string().nullable().default(null),
  quality: interactiveLearningBlockQualitySchema.default({
    sourceBacked: false,
    needsReview: false,
  }),
});

export const quizAnswerSubmittedPayloadSchema = z.object({
  questionId: idSchema,
  answer: z.string().min(1),
  /**
   * Deprecated renderer hint retained for backwards-compatible MCP bundles.
   * The API must recompute correctness from the quiz artifact.
   */
  isCorrect: z.boolean().optional(),
  score: z.number().min(0).max(1).optional(),
  conceptIds: z.array(idSchema).optional(),
  explanation: z.string().optional(),
});

export const flashcardReviewRatedPayloadSchema = z.object({
  cardId: idSchema,
  result: z.enum(["again", "hard", "good", "easy"]),
  conceptIds: z.array(idSchema).optional(),
});

export const workedExampleStepAnsweredPayloadSchema = z.object({
  stepId: idSchema,
  answer: z.string().min(1),
  isCorrect: z.boolean().optional(),
});

export const workedExampleStepRevealedPayloadSchema = z.object({
  stepId: idSchema,
});

export const simulationObservationSubmittedPayloadSchema = z.object({
  observation: z.string().min(1),
  parameterSnapshot: z.record(z.string(), z.unknown()).optional(),
});

export const evidenceSourceSpanOpenedPayloadSchema = z.object({
  evidenceRefId: idSchema.optional(),
  spanId: idSchema.optional(),
  index: z.number().int().nonnegative().optional(),
});

export const livePlanActionSelectedPayloadSchema = z.object({
  actionId: idSchema,
  label: z.string().optional(),
});

export const tutorHelpRequestedPayloadSchema = z.object({
  message: z.string().optional(),
  topic: z.string().optional(),
});

export const personalizationPreferenceUpdatedPayloadSchema = z.object({
  preference: z.enum(["pace", "depth", "examples", "assessment", "urgency"]),
  value: z.string().min(1),
});

export const sourceReaderAnnotationCreatedPayloadSchema = z.object({
  spanId: z.string().min(1),
  annotation: z.string().min(1),
  confusing: z.boolean().optional(),
});

export const interactiveLearningActionEnvelopeSchema = z.object({
  notebookId: idSchema,
  surfaceId: idSchema,
  blockId: idSchema,
  nodeRef: nodeRefSchema,
  artifactId: idSchema.optional(),
  sourceRefs: z.array(nodeRefSchema).default([]),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  objectiveRefs: z.array(nodeRefSchema).default([]),
  conceptRefs: z.array(nodeRefSchema).default([]),
  sessionId: idSchema.optional(),
  turnId: idSchema.optional(),
  runId: idSchema.optional(),
  rendererKind: interactiveLearningRendererKindSchema.default("native"),
  rendererVersion: z.string().optional(),
  actionName: interactiveLearningActionNameSchema,
  actionPayload: z.unknown(),
  createdAt: z.string().datetime().optional(),
});

export const interactiveLearningActionResponseSchema = z.object({
  ok: z.literal(true),
  actionName: interactiveLearningActionNameSchema,
  block: interactiveLearningBlockSchema,
  updatedConceptStates: z
    .array(
      z.object({
        conceptId: idSchema,
        masteryScore: z.number(),
        nextReviewAt: z.string(),
      }),
    )
    .optional(),
  attemptId: idSchema.optional(),
  emitsMasteryEvidence: z.boolean().default(false),
});

export type InteractiveLearningBlockKind = z.infer<typeof interactiveLearningBlockKindSchema>;
export type InteractiveLearningActionName = z.infer<typeof interactiveLearningActionNameSchema>;
export type InteractiveLearningBlock = z.infer<typeof interactiveLearningBlockSchema>;
export type InteractiveLearningActionEnvelope = z.infer<
  typeof interactiveLearningActionEnvelopeSchema
>;
export type InteractiveLearningActionResponse = z.infer<
  typeof interactiveLearningActionResponseSchema
>;

const ACTION_PAYLOAD_SCHEMAS: Partial<Record<InteractiveLearningActionName, z.ZodType<unknown>>> = {
  "quiz.answer_submitted": quizAnswerSubmittedPayloadSchema,
  "flashcard.review_rated": flashcardReviewRatedPayloadSchema,
  "worked_example.step_answered": workedExampleStepAnsweredPayloadSchema,
  "worked_example.step_revealed": workedExampleStepRevealedPayloadSchema,
  "simulation.observation_submitted": simulationObservationSubmittedPayloadSchema,
  "simulation.parameter_snapshot_submitted": simulationObservationSubmittedPayloadSchema,
  "evidence.source_span_opened": evidenceSourceSpanOpenedPayloadSchema,
  "live_plan.action_selected": livePlanActionSelectedPayloadSchema,
  "tutor.help_requested": tutorHelpRequestedPayloadSchema,
  "personalization.preference_updated": personalizationPreferenceUpdatedPayloadSchema,
  "source_reader.annotation_created": sourceReaderAnnotationCreatedPayloadSchema,
};

export function parseInteractiveLearningActionPayload<T extends InteractiveLearningActionName>(
  actionName: T,
  payload: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const schema = ACTION_PAYLOAD_SCHEMAS[actionName];
  if (!schema) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return { success: true, data: payload };
    }
    return { success: true, data: {} };
  }
  const parsed = schema.safeParse(payload ?? {});
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  return { success: true, data: parsed.data };
}

export const PASSIVE_INTERACTIVE_ACTIONS = new Set<InteractiveLearningActionName>([
  "evidence.source_span_opened",
  "worked_example.step_revealed",
  "flashcard.review_rated",
  "simulation.parameter_snapshot_submitted",
  "surface.completed",
  "live_plan.action_selected",
  "personalization.preference_updated",
  "source_reader.annotation_created",
  "tutor.help_requested",
]);

export const mcpAppSandboxPolicySchema = z.object({
  permissions: z.array(z.string()).default(["allow-scripts"]),
  allowNetwork: z.boolean().default(false),
  allowSubframes: z.boolean().default(false),
});

export const mcpAppBundleManifestSchema = z.object({
  bundleId: z.string().min(1),
  version: z.string().min(1),
  blockKind: z.union([interactiveLearningBlockKindSchema, z.literal("simulation_template")]),
  simulationTemplateId: z.string().optional(),
  resourceUri: z.string().regex(/^ui:\/\/studyagent\//),
  assetPath: z.string().min(1),
  supportedActions: z.array(interactiveLearningActionNameSchema).min(1),
  sandboxPolicy: mcpAppSandboxPolicySchema,
  fallbackSupported: z.boolean().default(true),
  blockSchemaVersion: z.string().default("1"),
});

export const simulationTemplateSchema = z.object({
  templateId: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  parameterSchema: z.record(z.string(), z.unknown()).default({}),
  supportedConceptFamilies: z.array(z.string()).default([]),
  promptSlots: z.array(z.string()).default([]),
  expectedObservationSchema: z.record(z.string(), z.unknown()).default({}),
  actionSchema: z
    .array(interactiveLearningActionNameSchema)
    .default(["simulation.observation_submitted"]),
  evidenceRequired: z.boolean().default(false),
  bundleResourceUri: z.string().regex(/^ui:\/\/studyagent\//),
});

export const simulationDraftStatusSchema = z.enum([
  "draft",
  "sandbox_preview",
  "evaluation_failed",
  "evaluation_passed",
  "promoted",
  "rejected",
]);

export const simulationDraftSchema = z.object({
  draftId: idSchema,
  conceptNeed: z.string().min(1),
  draftSource: z.enum(["generated", "manual", "imported"]).default("generated"),
  generatedCodeRef: z.string().optional(),
  sandboxMetadata: z.record(z.string(), z.unknown()).default({}),
  evaluationStatus: simulationDraftStatusSchema.default("draft"),
  promotionDecision: z.enum(["pending", "approved", "rejected"]).default("pending"),
  promotedTemplateId: z.string().optional(),
  checklist: z
    .object({
      conceptCorrectness: z.boolean().optional(),
      parameterBounds: z.boolean().optional(),
      accessibility: z.boolean().optional(),
      responsiveness: z.boolean().optional(),
      sandboxSafety: z.boolean().optional(),
      externalNetworkBlocked: z.boolean().optional(),
      learnerInstructions: z.boolean().optional(),
      eventSchema: z.boolean().optional(),
      evidenceRequirements: z.boolean().optional(),
    })
    .default({}),
});

export type McpAppBundleManifest = z.infer<typeof mcpAppBundleManifestSchema>;
export type SimulationTemplate = z.infer<typeof simulationTemplateSchema>;
export type SimulationDraft = z.infer<typeof simulationDraftSchema>;

type QuizAnswerSurface = {
  id: string;
  nodeRef: z.infer<typeof nodeRefSchema>;
  artifactRef?: z.infer<typeof nodeRefSchema>;
  interactiveBlocks?: Array<{ id: string; kind: string }>;
};

export function buildQuizAnswerSubmittedEnvelope(input: {
  notebookId: string;
  surface: QuizAnswerSurface;
  questionId: string;
  answer: string;
  isCorrect?: boolean;
  score?: number;
  conceptIds?: string[];
  explanation?: string;
  sessionId?: string;
  turnId?: string;
  runId?: string;
}): InteractiveLearningActionEnvelope {
  const artifactId =
    input.surface.artifactRef?.refId ??
    (input.surface.nodeRef.refType === "artifact" ? input.surface.nodeRef.refId : undefined);
  const quizBlock =
    input.surface.interactiveBlocks?.find((block) => block.kind === "quiz") ??
    (artifactId ? { id: `interactive_quiz_${artifactId}`, kind: "quiz" } : null);
  if (!quizBlock) {
    throw new Error("Quiz interactive block not found on reference surface.");
  }

  return interactiveLearningActionEnvelopeSchema.parse({
    notebookId: input.notebookId,
    surfaceId: input.surface.id,
    blockId: quizBlock.id,
    nodeRef: input.surface.nodeRef,
    ...(artifactId ? { artifactId } : {}),
    actionName: "quiz.answer_submitted",
    actionPayload: {
      questionId: input.questionId,
      answer: input.answer,
      ...(input.conceptIds?.length ? { conceptIds: input.conceptIds } : {}),
      ...(input.explanation ? { explanation: input.explanation } : {}),
    },
    rendererKind: "mcp_app",
    rendererVersion: "v1",
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.turnId ? { turnId: input.turnId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
  });
}
