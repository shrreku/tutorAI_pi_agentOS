import { z } from "zod";
import { idSchema } from "./ids.js";

export const projectionHealthStatusSchema = z.enum(["idle", "healthy", "stale", "failed"]);
export type ProjectionHealthStatus = z.infer<typeof projectionHealthStatusSchema>;

export const projectionHealthSchema = z.object({
  scope: z.enum(["notebook", "source"]),
  notebookId: idSchema,
  sourceId: idSchema.optional(),
  status: projectionHealthStatusSchema,
  lagSeconds: z.number().int().nonnegative().nullable(),
  lastProjectedAt: z.string().datetime().nullable(),
  lastFailureAt: z.string().datetime().nullable(),
  failureReason: z.string().nullable(),
  learnerWarning: z.string().nullable(),
  developerDetail: z.string().nullable(),
});

export type ProjectionHealth = z.infer<typeof projectionHealthSchema>;

export const projectionErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  scope: z.enum(["notebook", "source"]),
  notebookId: idSchema,
  sourceId: idSchema.optional(),
});

export type ProjectionError = z.infer<typeof projectionErrorSchema>;
