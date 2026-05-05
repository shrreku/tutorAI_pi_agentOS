import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";

export const graphNodeTypeSchema = z.enum([
  "notebook",
  "source",
  "source_section",
  "curriculum",
  "curriculum_module",
  "objective",
  "objective_list",
  "study_plan",
  "session_plan",
  "concept",
  "claim",
  "wiki_page",
  "artifact",
  "tutor_session",
  "quiz_attempt",
  "weak_concept",
  "coverage_item",
  "coverage_record",
]);

export const graphRelationTypeSchema = z.enum([
  "depends_on",
  "supports",
  "contradicts",
  "supersedes",
  "example_of",
  "tests_mastery",
  "remediates",
  "derived_from",
  "cites",
  "covers",
  "contains",
  "similar_to",
  "next_objective",
  "completed_by",
  "plans",
]);

export const graphNodeSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  nodeType: graphNodeTypeSchema,
  ref: nodeRefSchema,
  title: z.string().min(1),
  status: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const graphEdgeSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  sourceNodeId: idSchema,
  targetNodeId: idSchema,
  relationType: graphRelationTypeSchema,
  confidence: z.number().min(0).max(1).optional(),
  weight: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type GraphNodeType = z.infer<typeof graphNodeTypeSchema>;
export type GraphRelationType = z.infer<typeof graphRelationTypeSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

// Canvas-facing shapes (normalised from Neo4j raw output)
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

export const graphQueryResponseSchema = z.object({
  name: z.string(),
  notebookId: z.string(),
  nodes: z.array(graphCanvasNodeSchema),
  edges: z.array(graphCanvasEdgeSchema),
  sourceId: z.string().optional(),
  conceptId: z.string().optional(),
  fromConceptId: z.string().optional(),
  toConceptId: z.string().optional(),
});

export type GraphCanvasNode = z.infer<typeof graphCanvasNodeSchema>;
export type GraphCanvasEdge = z.infer<typeof graphCanvasEdgeSchema>;
export type GraphQueryResponse = z.infer<typeof graphQueryResponseSchema>;
