import { z } from "zod";
import { idSchema, nodeRefSchema, provenanceRefSchema } from "./ids.js";
import { evidenceRefSchema } from "./evidence.js";

export const referenceBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "markdown",
    "summary",
    "definition",
    "formula_table",
    "step_list",
    "question_list",
    "flashcard_list",
    "comparison_table",
    "citation_list",
    "example",
    "callout",
    "quiz_feedback",
    "metadata",
  ]),
  title: z.string().min(1).optional(),
  content: z.unknown(),
  evidenceRefs: z.array(evidenceRefSchema).default([]),
});

export const referenceSurfaceSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  nodeRef: nodeRefSchema,
  title: z.string().min(1),
  surfaceType: z.enum([
    "curriculum",
    "module",
    "objective",
    "objective_list",
    "session",
    "concept",
    "wiki_page",
    "artifact",
    "source",
    "fallback",
  ]),
  summary: z.string().nullable().default(null),
  status: z.string().nullable().default(null),
  blocks: z.array(referenceBlockSchema).default([]),
  scopeRefs: z.array(nodeRefSchema).default([]),
  sourceRefs: z.array(nodeRefSchema).default([]),
  provenanceRefs: z.array(provenanceRefSchema).default([]),
  coverageRefs: z.array(nodeRefSchema).default([]),
  primaryActions: z.array(z.enum(["ask_tutor", "review", "quiz", "open_provenance", "open_source"])).default(["ask_tutor"]),
  quality: z.object({
    confidence: z.number().min(0).max(1).nullable().default(null),
    sourceBacked: z.boolean().default(false),
    needsReview: z.boolean().default(false),
  }).default({ confidence: null, sourceBacked: false, needsReview: false }),
  generation: z.object({
    mode: z.enum(["ai", "heuristic"]).default("heuristic"),
    label: z.string().min(1).default("Heuristic"),
    generatedAt: z.string().nullable().default(null),
  }).nullable().optional(),
});

export type ReferenceBlock = z.infer<typeof referenceBlockSchema>;
export type ReferenceSurface = z.infer<typeof referenceSurfaceSchema>;

const INTERNAL_ARTIFACT_STATUSES = new Set(["draft", "rejected", "failed", "archived"]);

export function learnerFacingSurfaceStatus(input: {
  surfaceType: ReferenceSurface["surfaceType"];
  status: string | null;
  quality?: ReferenceSurface["quality"];
}): string | null {
  if (input.surfaceType === "artifact") {
    if (!input.status || INTERNAL_ARTIFACT_STATUSES.has(input.status)) return null;
    if (input.status === "ready") return "Ready to study";
    if (input.status === "proposed") return "Suggested";
    if (input.quality?.needsReview) return "Needs review";
    return null;
  }
  if (input.surfaceType === "wiki_page" && input.status === "draft") return "In progress";
  if (input.status && INTERNAL_ARTIFACT_STATUSES.has(input.status)) return null;
  return input.status;
}
