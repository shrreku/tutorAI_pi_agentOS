import { z } from "zod";

export const graphCanvasNodeSchema = z.object({
  id: z.string(),
  nodeType: z.string(),
  labels: z.array(z.string()),
  properties: z.record(z.string(), z.unknown()),
});

export const graphCanvasEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  relationType: z.string(),
  properties: z.record(z.string(), z.unknown()),
});

export type GraphCanvasNode = z.infer<typeof graphCanvasNodeSchema>;
export type GraphCanvasEdge = z.infer<typeof graphCanvasEdgeSchema>;
