import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";

export const graphNodeTypeSchema = z.enum([
  "notebook",
  "source",
  "source_section",
  "topic",
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

export {
  graphCanvasEdgeSchema,
  graphCanvasNodeSchema,
  type GraphCanvasEdge,
  type GraphCanvasNode,
} from "./graph-canvas.js";
import { graphCanvasEdgeSchema, graphCanvasNodeSchema } from "./graph-canvas.js";
import { workspaceGraphReadModelSchema } from "./workspace-read-model.js";

export const graphQueryResponseSchema = z.object({
  name: z.string(),
  notebookId: z.string(),
  nodes: z.array(graphCanvasNodeSchema),
  edges: z.array(graphCanvasEdgeSchema),
  sourceId: z.string().optional(),
  conceptId: z.string().optional(),
  fromConceptId: z.string().optional(),
  toConceptId: z.string().optional(),
  readModel: workspaceGraphReadModelSchema.optional(),
});

export type GraphQueryResponse = z.infer<typeof graphQueryResponseSchema>;
