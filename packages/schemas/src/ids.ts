import { z } from "zod";

export const idSchema = z.string().min(1);

export const entityRefTypeSchema = z.enum([
  "user",
  "notebook",
  "source",
  "source_section",
  "source_version",
  "chunk",
  "topic",
  "concept",
  "weak_concept",
  "claim",
  "curriculum",
  "curriculum_module",
  "objective",
  "objective_list",
  "session_plan",
  "coverage_item",
  "coverage_record",
  "study_plan",
  "wiki_page",
  "artifact",
  "session",
  "turn",
  "tool_call",
  "whiteboard_node",
  "whiteboard_edge",
]);

export const nodeRefSchema = z.object({
  refType: entityRefTypeSchema,
  refId: idSchema,
});

export const provenanceRoleSchema = z.enum([
  "supports",
  "derived_from",
  "contradicts",
  "supersedes",
  "generated_by",
]);

export const provenanceRefSchema = nodeRefSchema.extend({
  role: provenanceRoleSchema,
});

export type StudyAgentId = z.infer<typeof idSchema>;
export type EntityRefType = z.infer<typeof entityRefTypeSchema>;
export type NodeRef = z.infer<typeof nodeRefSchema>;
export type ProvenanceRef = z.infer<typeof provenanceRefSchema>;
