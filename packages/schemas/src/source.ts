import { z } from "zod";
import { idSchema } from "./ids.js";

export const sourceTypeSchema = z.enum(["pdf", "markdown", "text", "html", "pasted_note"]);

export const sourceStatusSchema = z.enum([
  "uploaded",
  "parsing",
  "chunking",
  "enriching",
  "indexing",
  "compiling",
  "indexed",
  "tutoring_ready",
  "ready",
  "needs_review",
  "failed",
]);

export const sourceMetadataSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  language: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  contentHash: z.string().optional(),
  originalFilename: z.string().optional(),
  mimeType: z.string().optional(),
});

export const sourceSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  title: z.string().min(1),
  sourceType: sourceTypeSchema,
  originalObjectKey: z.string().min(1),
  status: sourceStatusSchema,
  metadata: sourceMetadataSchema.default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const sourceSpanSchema = z.object({
  sourceId: idSchema,
  sourceVersionId: idSchema.optional(),
  pageStart: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().nonnegative().optional(),
  headingPath: z.array(z.string()).default([]),
});

export type SourceType = z.infer<typeof sourceTypeSchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export type SourceMetadata = z.infer<typeof sourceMetadataSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type SourceSpan = z.infer<typeof sourceSpanSchema>;
