import { z } from "zod";

/** One row returned by `wiki.search` (Pi / tools) — aligned with unified retrieval hits. */
export const wikiSearchResultRowSchema = z.object({
  resultType: z.enum(["claim", "wiki_page", "chunk", "concept", "relation"]),
  refType: z.string().min(1),
  refId: z.string().min(1),
  title: z.string().optional(),
  score: z.number(),
  snippet: z.string(),
  provenanceRefs: z
    .array(
      z.object({
        refType: z.string().min(1),
        refId: z.string().min(1),
      }),
    )
    .default([]),
  sourceRefs: z
    .array(
      z.object({
        sourceId: z.string().min(1),
        sourceVersionId: z.string().min(1).optional(),
      }),
    )
    .optional(),
  scoreExplanation: z.string().optional(),
});

export const wikiSearchResponsePayloadSchema = z.object({
  results: z.array(wikiSearchResultRowSchema),
});

export type WikiSearchResultRow = z.infer<typeof wikiSearchResultRowSchema>;
