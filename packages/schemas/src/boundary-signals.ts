import { z } from "zod";
import { nodeRefSchema } from "./ids.js";

export const boundarySignalTypeSchema = z.enum([
  "source_scope_boundary",
  "source_coverage_complete",
  "session_plan_boundary",
  "module_milestone",
]);

export const boundarySignalStrengthSchema = z.enum(["weak", "likely", "confirmed"]);

export const boundarySignalSchema = z.object({
  type: boundarySignalTypeSchema,
  strength: boundarySignalStrengthSchema,
  scopeRef: nodeRefSchema.optional(),
  requestedTopic: z.string().min(1).optional(),
  summary: z.string().min(1),
  evidenceRefs: z.array(nodeRefSchema).default([]),
});

export type BoundarySignal = z.infer<typeof boundarySignalSchema>;
export type BoundarySignalType = z.infer<typeof boundarySignalTypeSchema>;
export type BoundarySignalStrength = z.infer<typeof boundarySignalStrengthSchema>;
