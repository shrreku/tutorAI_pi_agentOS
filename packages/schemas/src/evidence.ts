import { z } from "zod";
import { idSchema } from "./ids.js";

export const evidenceVisibilitySchema = z.enum(["learner", "developer"]);

export const evidenceRefSchema = z.object({
  id: idSchema,
  kind: z.enum(["claim", "chunk"]),
  visibility: evidenceVisibilitySchema,
  label: z.string().min(1),
  text: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable().default(null),
  status: z.string().nullable().default(null),
  statementKind: z.enum(["source_backed", "inferred", "generated"]).optional(),
  chunkType: z.string().nullable().default(null),
  pageStart: z.number().int().nullable().default(null),
  pageEnd: z.number().int().nullable().default(null),
  sourceId: z.string().nullable().default(null),
  sourceTitle: z.string().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const evidenceReadModelSchema = z.object({
  nodeId: idSchema,
  entityType: z.string().nullable().default(null),
  entity: z.record(z.string(), z.unknown()).nullable().default(null),
  learnerRefs: z.array(evidenceRefSchema).default([]),
  developerRefs: z.array(evidenceRefSchema).default([]),
});

export type EvidenceVisibility = z.infer<typeof evidenceVisibilitySchema>;
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
export type EvidenceReadModel = z.infer<typeof evidenceReadModelSchema>;