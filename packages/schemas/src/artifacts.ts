import { z } from "zod";
import { idSchema, nodeRefSchema, provenanceRefSchema } from "./ids.js";

export const artifactTypeSchema = z.enum([
  "note",
  "quiz",
  "flashcards",
  "worked_example",
  "formula_sheet",
  "comparison_page",
  "diagram",
  "revision_plan",
  "study_plan",
  "session_digest",
  "concept_card",
]);

export const artifactSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  artifactType: artifactTypeSchema,
  title: z.string().min(1),
  status: z.enum(["draft", "ready", "failed", "archived"]),
  payload: z.record(z.string(), z.unknown()),
  sourceNodeRefs: z.array(nodeRefSchema).default([]),
  provenance: z.array(provenanceRefSchema).default([]),
  createdByRunId: idSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
