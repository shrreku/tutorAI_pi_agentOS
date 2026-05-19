import { z } from "zod";
import { graphCanvasEdgeSchema, graphCanvasNodeSchema } from "./graph-canvas.js";
import { projectionHealthSchema } from "./graph-projection.js";
import { idSchema, nodeRefSchema } from "./ids.js";

export const workspaceVisibilitySchema = z.enum(["learner", "dev_only", "hidden"]);
export type WorkspaceVisibility = z.infer<typeof workspaceVisibilitySchema>;

export const workspaceNodeDescriptorSchema = z.object({
  node: graphCanvasNodeSchema,
  visibility: workspaceVisibilitySchema,
  referenceSurfaceTarget: nodeRefSchema.nullable(),
  emphasis: z.enum(["current_objective", "current_module", "current_path", "none"]).default("none"),
  evidenceAvailable: z.boolean().default(false),
});

export type WorkspaceNodeDescriptor = z.infer<typeof workspaceNodeDescriptorSchema>;

export const sourceWikiTopicGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceId: z.string(),
  conceptCount: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  conceptIds: z.array(idSchema),
  pageIds: z.array(idSchema),
  defaultOpenNodeId: idSchema.nullable(),
  evidenceAvailable: z.boolean(),
  referenceSurfaceTargets: z.array(nodeRefSchema),
});

export type SourceWikiTopicGroup = z.infer<typeof sourceWikiTopicGroupSchema>;

export const workspaceEmphasisSchema = z.object({
  currentModuleId: idSchema.nullable(),
  currentObjectiveId: idSchema.nullable(),
  currentPathConceptIds: z.array(idSchema),
});

export type WorkspaceEmphasis = z.infer<typeof workspaceEmphasisSchema>;

export const workspaceGraphReadModelSchema = z.object({
  viewMode: z.enum(["study_map", "source_wiki_map"]),
  devMode: z.boolean(),
  emphasis: workspaceEmphasisSchema,
  nodeCatalog: z.array(workspaceNodeDescriptorSchema),
  topics: z.array(sourceWikiTopicGroupSchema).optional(),
  projectionWarning: z.string().nullable().optional(),
  projectionHealth: projectionHealthSchema.optional(),
});

export type WorkspaceGraphReadModel = z.infer<typeof workspaceGraphReadModelSchema>;

export const workspaceGraphQueryResponseSchema = z.object({
  name: z.string(),
  notebookId: z.string(),
  nodes: z.array(graphCanvasNodeSchema),
  edges: z.array(graphCanvasEdgeSchema),
  sourceId: z.string().optional(),
  conceptId: z.string().optional(),
  fromConceptId: z.string().optional(),
  toConceptId: z.string().optional(),
  readModel: workspaceGraphReadModelSchema,
});

export type WorkspaceGraphQueryResponse = z.infer<typeof workspaceGraphQueryResponseSchema>;
