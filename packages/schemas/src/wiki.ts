import { z } from "zod";
import { idSchema, provenanceRefSchema } from "./ids.js";

/** Explainable per-claim confidence factors (GF-0401). */
export const confidenceComponentsSchema = z.object({
  sourceSupport: z.number().min(0).max(1),
  extractionConfidence: z.number().min(0).max(1),
  recency: z.number().min(0).max(1),
  contradictionPenalty: z.number().min(0).max(1),
  humanApproval: z.number().min(0).max(1),
  reinforcementSignal: z.number().min(0).max(1),
});

export type ConfidenceComponents = z.infer<typeof confidenceComponentsSchema>;

export const conceptTypeSchema = z.enum([
  "definition",
  "formula",
  "theorem",
  "process",
  "skill",
  "event",
  "person",
  "place",
  "term",
  "method",
]);

export const claimStatusSchema = z.enum([
  "candidate",
  "admitted",
  "promoted",
  "published",
  "stale",
  "contradicted",
  "superseded",
  "deprecated",
  "archived",
]);

export const claimSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  sourceId: idSchema,
  sourceVersionId: idSchema,
  claimType: z.string().min(1),
  claimText: z.string().min(1),
  status: claimStatusSchema,
  confidence: z.number().min(0).max(1),
  supportScore: z.number().min(0).max(1),
  provenance: z.array(provenanceRefSchema).min(1),
});

export const wikiPageTypeSchema = z.enum([
  "concept",
  "source_summary",
  "topic",
  "comparison",
  "misconception",
  "session_digest",
  "study_guide",
  "formula_sheet",
  "worked_example",
  "teaching_arc",
]);

export const wikiPageSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  pageType: wikiPageTypeSchema,
  pageKey: z.string().min(1),
  title: z.string().min(1),
  version: z.number().int().positive(),
  status: z.enum(["draft", "published", "stale", "archived"]),
  structured: z.record(z.string(), z.unknown()),
  markdown: z.string(),
  provenance: z.array(provenanceRefSchema),
  qualityScore: z.number().min(0).max(1).optional(),
});

export type ConceptType = z.infer<typeof conceptTypeSchema>;
export type ClaimStatus = z.infer<typeof claimStatusSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type WikiPageType = z.infer<typeof wikiPageTypeSchema>;
export type WikiPage = z.infer<typeof wikiPageSchema>;
