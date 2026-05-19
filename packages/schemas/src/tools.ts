import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";

export const sideEffectClassSchema = z.enum([
  "read_only",
  "candidate_write",
  "state_update",
  "published_write",
  "external_write",
]);

export const toolContextSchema = z.object({
  userId: idSchema,
  notebookId: idSchema,
  sessionId: idSchema.optional(),
  runId: idSchema,
  turnId: idSchema.optional(),
  traceId: z.string().min(1),
  selectedNodeRefs: z.array(nodeRefSchema).default([]),
  permissions: z.record(z.string(), z.boolean()),
  idempotencyKey: z.string().optional(),
});

export const reducerResultSchema = z.object({
  accepted: z.boolean(),
  mutationType: z.string().min(1),
  appliedChanges: z.record(z.string(), z.unknown()),
  rejectedReason: z.string().optional(),
  emittedEventIds: z.array(idSchema),
});

export function parseReducerResult(value: unknown): ReducerResult | undefined {
  const parsed = reducerResultSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export type SideEffectClass = z.infer<typeof sideEffectClassSchema>;
export type ToolContext = z.infer<typeof toolContextSchema>;
export type ReducerResult = z.infer<typeof reducerResultSchema>;
