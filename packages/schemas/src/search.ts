import { z } from "zod";
import { idSchema, provenanceRefSchema } from "./ids.js";

export const searchModeSchema = z.enum(["lexical", "vector", "hybrid"]);

export const notebookSearchAffinityRefSchema = z.object({
  refType: z.string().min(1),
  refId: z.string().min(1),
});

export const notebookSearchRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.coerce.number().int().min(1).max(50).default(15),
  mode: searchModeSchema.default("hybrid"),
  /** Boost hits whose id or provenance matches these refs (GF-0303 selected-node affinity). */
  selectedNodeRefs: z.array(notebookSearchAffinityRefSchema).optional(),
  conceptIds: z.array(idSchema).optional(),
  /** When true, prepend parent structural chunk context to retrieval chunk snippets (GF-0304). */
  expandParents: z.coerce.boolean().optional().default(false),
});

export const sourceRefSchema = z.object({
  sourceId: idSchema,
  sourceVersionId: idSchema.optional(),
});

export const unifiedSearchHitSchema = z.object({
  id: idSchema,
  type: z.enum(["chunk", "claim", "wiki_page", "concept", "artifact"]),
  title: z.string(),
  snippet: z.string(),
  score: z.number(),
  scoreDetails: z.record(z.string(), z.number()).default({}),
  provenance: z.array(provenanceRefSchema).default([]),
  /** Human-readable breakdown of fused score (GF-0303 / GF-0301). */
  scoreExplanation: z.string().optional(),
  /** Primary source anchors for citation UX (subset of provenance). */
  sourceRefs: z.array(sourceRefSchema).optional(),
});

export const notebookSearchResponseSchema = z.object({
  mode: searchModeSchema,
  query: z.string(),
  hits: z.array(unifiedSearchHitSchema),
});

export type SearchMode = z.infer<typeof searchModeSchema>;
export type NotebookSearchRequest = z.infer<typeof notebookSearchRequestSchema>;
export type UnifiedSearchHit = z.infer<typeof unifiedSearchHitSchema>;
export type NotebookSearchResponse = z.infer<typeof notebookSearchResponseSchema>;
