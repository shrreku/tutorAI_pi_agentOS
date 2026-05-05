import type { GraphEdge, GraphNode } from "@studyagent/schemas";

export type WhiteboardGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export function filterGraphByNotebook(graph: WhiteboardGraph, notebookId: string): WhiteboardGraph {
  return {
    nodes: graph.nodes.filter((node) => node.notebookId === notebookId),
    edges: graph.edges.filter((edge) => edge.notebookId === notebookId),
  };
}

export {
  createNeo4jDriver,
  mergeConceptNodes,
  mergeNotebookNode,
  mergeConceptRelation,
  mergeSourceNode,
  mergeCurriculumNode,
  mergeCurriculumModuleNode,
  mergeObjectiveListNode,
  mergeObjectiveNode,
  mergeSessionPlanNode,
  mergeCoverageItemNode,
  mergeCoverageRecordNode,
  linkSourceCoversCurriculum,
  mergeStudyPlanAndObjectives,
  mergeClaimNode,
  mergeClaimContradiction,
  mergeClaimSupersedes,
  mergeWikiPageNode,
  mergeWikiPageForSource,
  verifyNeo4jProjection,
  ensureNeo4jMvpConstraints,
  type IngestConceptRelationKind,
} from "./neo4j-projection.js";

export { queryStudyMapSimple, querySourceWikiMapSimple } from "./neo4j-queries.js";
export { queryConceptNeighborhood, queryConceptShortestPath, type ConceptNeighborhood, type ConceptPathResult } from "./neo4j-traverse.js";
