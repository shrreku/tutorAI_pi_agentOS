import { z } from "zod";
import { evidenceRefSchema } from "./evidence.js";
import { idSchema, nodeRefSchema } from "./ids.js";
import {
  interactiveLearningActionNameSchema,
  interactiveLearningBlockKindSchema,
} from "./interactive-learning.js";

export const pageReadinessSchema = z.enum([
  "still_improving",
  "ready_to_study",
  "needs_more_source_support",
  "needs_refresh",
]);

export type PageReadiness = z.infer<typeof pageReadinessSchema>;

const PAGE_READINESS_LABELS: Record<PageReadiness, string> = {
  still_improving: "Still improving",
  ready_to_study: "Ready to study",
  needs_more_source_support: "Needs more source support",
  needs_refresh: "Needs refresh",
};

export const PAGE_READINESS_LEARNER_LABELS = PAGE_READINESS_LABELS;

export function pageReadinessLabel(readiness: PageReadiness): string {
  return PAGE_READINESS_LABELS[readiness];
}

export function learnerLabelForPageReadiness(readiness: PageReadiness): string {
  return pageReadinessLabel(readiness);
}

export function pageReadinessFromLearnerLabel(label: string | null | undefined): PageReadiness {
  const normalized = label?.trim().toLowerCase() ?? "";
  if (normalized === "ready to study") return "ready_to_study";
  if (normalized === "needs more source support") return "needs_more_source_support";
  if (normalized === "needs refresh") return "needs_refresh";
  return "still_improving";
}

export const generationModeSchema = z.enum([
  "heuristic",
  "llm_polished",
  "llm_repair",
  "tutor_touch",
  "rolling_module_build",
  "initial_build",
]);

export type GenerationMode = z.infer<typeof generationModeSchema>;

export const generationTriggerSchema = z.enum([
  "post_ingest",
  "post_ingest_baseline",
  "initial_build",
  "module_milestone",
  "learner_jump",
  "tutor_touch",
  "topic_touch",
  "manual_repair",
  "rolling_module_build",
  "tutor_decision",
  "wiki_polish_enqueue",
]);

export type GenerationTrigger = z.infer<typeof generationTriggerSchema>;

export const generationTargetTypeSchema = z.enum([
  "curriculum_outline",
  "curriculum_page",
  "module_deep_build",
  "module_page",
  "topic_page",
  "concept_page",
  "module_objectives",
  "initial_build",
]);

export type GenerationTargetType = z.infer<typeof generationTargetTypeSchema>;

export const generationTargetSchema = z.object({
  notebookId: idSchema,
  targetType: generationTargetTypeSchema,
  targetRef: nodeRefSchema.optional(),
  pageKey: z.string().min(1).optional(),
  sourceIds: z.array(idSchema).default([]),
  sourceId: idSchema.optional(),
  curriculumId: idSchema.optional(),
  moduleId: idSchema.optional(),
  objectiveIds: z.array(idSchema).default([]),
  objectiveId: idSchema.optional(),
  topicIds: z.array(idSchema).default([]),
  topicRef: z.string().optional(),
  conceptIds: z.array(idSchema).default([]),
  conceptId: idSchema.optional(),
  generationMode: generationModeSchema,
  trigger: generationTriggerSchema,
  idempotencyKey: z.string().min(1),
  priority: z.number().min(0).max(1).default(0.5),
  timeoutMs: z.number().int().positive().default(120_000),
  createdByRunId: idSchema.optional(),
  createdByTurnId: idSchema.optional(),
  runId: idSchema.optional(),
  turnId: idSchema.optional(),
});

export type GenerationTarget = z.infer<typeof generationTargetSchema>;

export const pageBlockPlanKindSchema = z.enum([
  "static_reference",
  "source_backed_note",
  "pedagogical_note",
  "evidence_affordance",
  "related_links",
  "intent_action",
  "interactive_learning_block",
]);

export type PageBlockPlanKind = z.infer<typeof pageBlockPlanKindSchema>;

const pageBlockPlanBaseSchema = z.object({
  title: z.string().min(1).optional(),
  markdown: z.string().optional(),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  conceptRefs: z.array(nodeRefSchema).default([]),
  topicRefs: z.array(nodeRefSchema).default([]),
  sourceRefs: z.array(nodeRefSchema).default([]),
  objectiveRefs: z.array(nodeRefSchema).default([]),
});

export const staticReferenceBlockPlanSchema = pageBlockPlanBaseSchema.extend({
  kind: z.literal("static_reference"),
  markdown: z.string().min(1),
});

export const sourceBackedNoteBlockPlanSchema = pageBlockPlanBaseSchema.extend({
  kind: z.literal("source_backed_note"),
  markdown: z.string().min(1),
  evidenceRefs: z.array(evidenceRefSchema).min(1),
});

export const pedagogicalNoteBlockPlanSchema = pageBlockPlanBaseSchema.extend({
  kind: z.literal("pedagogical_note"),
  markdown: z.string().min(1),
  label: z.string().min(1).default("Broader pedagogy"),
});

export const evidenceAffordanceBlockPlanSchema = pageBlockPlanBaseSchema.extend({
  kind: z.literal("evidence_affordance"),
  evidenceRefs: z.array(evidenceRefSchema).min(1),
});

export const relatedLinksBlockPlanSchema = pageBlockPlanBaseSchema.extend({
  kind: z.literal("related_links"),
  links: z
    .array(
      z.object({
        label: z.string().min(1),
        pageKey: z.string().min(1),
        ref: nodeRefSchema.optional(),
      }),
    )
    .min(1),
});

export const intentActionBlockPlanSchema = pageBlockPlanBaseSchema.extend({
  kind: z.literal("intent_action"),
  actionId: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

export const interactiveLearningBlockPlanSchema = z.object({
  kind: z.literal("interactive_learning_block"),
  blockKind: interactiveLearningBlockKindSchema,
  title: z.string().min(1),
  learningPurpose: z.string().min(1),
  prompt: z.string().nullable().default(null),
  content: z.unknown(),
  allowedActions: z.array(interactiveLearningActionNameSchema).default([]),
  artifactRef: nodeRefSchema.optional(),
  conceptRefs: z.array(nodeRefSchema).default([]),
  sourceRefs: z.array(nodeRefSchema).default([]),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  objectiveRefs: z.array(nodeRefSchema).default([]),
  surfaceRole: z.enum(["primary", "supplemental"]).default("primary"),
  fallbackSummary: z.string().nullable().default(null),
  sourceBacked: z.boolean().default(false),
});

export type InteractiveLearningBlockPlan = z.infer<typeof interactiveLearningBlockPlanSchema>;

export const pageBlockPlanSchema = z.discriminatedUnion("kind", [
  staticReferenceBlockPlanSchema,
  sourceBackedNoteBlockPlanSchema,
  pedagogicalNoteBlockPlanSchema,
  evidenceAffordanceBlockPlanSchema,
  relatedLinksBlockPlanSchema,
  intentActionBlockPlanSchema,
  interactiveLearningBlockPlanSchema,
]);

export type PageBlockPlan = z.infer<typeof pageBlockPlanSchema>;

export const pageQualityIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["warning", "error"]).default("error"),
  section: z.string().optional(),
  blockIndex: z.number().int().nonnegative().optional(),
});

export type PageQualityIssue = z.infer<typeof pageQualityIssueSchema>;

export const pageGenerationOutputSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  pageKey: z.string().min(1),
  readiness: pageReadinessSchema,
  generationMode: generationModeSchema,
  blocks: z.array(pageBlockPlanSchema).default([]),
  topicRefs: z.array(nodeRefSchema).default([]),
  conceptRefs: z.array(nodeRefSchema).default([]),
  objectiveRefs: z.array(nodeRefSchema).default([]),
  sourceRefs: z.array(nodeRefSchema).default([]),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  citationsBySection: z.record(z.string(), z.array(idSchema)).default({}),
  qualityIssues: z.array(pageQualityIssueSchema).default([]),
  warnings: z.array(z.string()).default([]),
  markdown: z.string().optional(),
});

export type PageGenerationOutput = z.infer<typeof pageGenerationOutputSchema>;

export const pagePolishOutputSchema = z.object({
  markdown: z.string().min(1),
  pageReadiness: pageReadinessSchema,
  generationMode: generationModeSchema.default("llm_polished"),
  qualityIssues: z.array(pageQualityIssueSchema).default([]),
});

export type PagePolishOutput = z.infer<typeof pagePolishOutputSchema>;

const ARTIFACT_BACKED_BLOCK_KINDS = new Set(["quiz", "flashcard_deck", "worked_example"]);

export function validateInteractiveLearningBlockPlan(
  plan: InteractiveLearningBlockPlan,
): { ok: true } | { ok: false; error: string } {
  if (ARTIFACT_BACKED_BLOCK_KINDS.has(plan.blockKind) && !plan.artifactRef) {
    return {
      ok: false,
      error: `Block kind "${plan.blockKind}" requires an artifactRef.`,
    };
  }
  if (plan.blockKind === "evidence_explorer" && plan.evidenceRefs.length === 0) {
    return {
      ok: false,
      error: "evidence_explorer blocks require at least one evidence ref.",
    };
  }
  return { ok: true };
}

export function buildGenerationIdempotencyKey(input: {
  notebookId: string;
  targetType: GenerationTargetType;
  targetRef: string;
  generationMode: GenerationMode;
  trigger: GenerationTrigger;
}): string {
  return `${input.notebookId}:${input.targetType}:${input.targetRef}:${input.generationMode}:${input.trigger}`;
}

export const materialPathChangeKindSchema = z.enum([
  "skip_module",
  "reorder_modules",
  "replace_module_focus",
  "exam_prep_path",
  "narrow_sources",
  "expand_beyond_sources",
  "reduce_depth",
]);

export type MaterialPathChangeKind = z.infer<typeof materialPathChangeKindSchema>;

export function requiresMaterialPathChangeConfirmation(input: {
  kind?: MaterialPathChangeKind | string | null;
  learnerConfirmed?: boolean | null;
}): boolean {
  if (input.learnerConfirmed === true) return false;
  if (!input.kind) return false;
  return materialPathChangeKindSchema.safeParse(input.kind).success;
}
