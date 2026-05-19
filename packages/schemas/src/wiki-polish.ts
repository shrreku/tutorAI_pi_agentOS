import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";

export const wikiPolishCandidateStatusSchema = z.enum(["queued", "processing", "polished", "skipped"]);

export type WikiPolishCandidateStatus = z.infer<typeof wikiPolishCandidateStatusSchema>;

export const wikiPagePolishCandidateSchema = z.object({
  pageRef: z.object({
    refType: z.literal("wiki_page"),
    refId: idSchema,
  }),
  pageKey: z.string().min(1),
  pageType: z.enum(["concept", "source_summary", "topic"]),
  title: z.string().min(1),
  priorityScore: z.number().min(0).max(1),
  reasons: z.array(z.string().min(1)).default([]),
  sourceRefs: z.array(nodeRefSchema).default([]),
  learnerSignalRefs: z.array(nodeRefSchema).default([]),
  status: wikiPolishCandidateStatusSchema,
  lastPolishedAt: z.string().datetime().nullable().default(null),
  learnerStatusLabel: z.string().min(1),
});

export type WikiPagePolishCandidate = z.infer<typeof wikiPagePolishCandidateSchema>;

export function learnerStatusLabelForPolishCandidate(input: {
  status: WikiPolishCandidateStatus;
  reasons: string[];
}): string {
  if (input.status === "polished") return "Ready to study";
  if (input.reasons.includes("already_polished")) return "Ready to study";
  if (input.reasons.includes("weak_concept_priority")) return "Worth revisiting soon";
  if (input.reasons.includes("recently_used")) return "Recently helpful — improving next";
  if (input.reasons.includes("low_page_quality")) return "Still improving";
  if (input.reasons.includes("source_coverage_gap")) return "Needs more source support";
  return "Queued for improvement";
}
