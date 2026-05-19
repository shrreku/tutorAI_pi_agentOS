export type WhiteboardNodeRef = { refType: string; refId: string };

export function mapGraphNodeTypeToRefType(nodeType: string): string {
  const byType: Record<string, string> = {
    source: "source",
    source_section: "source_section",
    topic: "topic",
    concept: "concept",
    weak_concept: "weak_concept",
    claim: "claim",
    curriculum: "curriculum",
    curriculum_module: "curriculum_module",
    objective: "objective",
    objective_list: "objective_list",
    session_plan: "session_plan",
    coverage_item: "coverage_item",
    coverage_record: "coverage_record",
    study_plan: "study_plan",
    studyplan: "study_plan",
    wiki_page: "wiki_page",
    artifact: "artifact",
    tutor_session: "session",
  };
  return byType[nodeType] ?? "whiteboard_node";
}

export function mapGraphNodeToNodeRef(node: { id: string; nodeType: string; properties?: Record<string, unknown> }): WhiteboardNodeRef {
  if (node.nodeType === "weak_concept") {
    const conceptId = node.properties && typeof node.properties.conceptId === "string" ? node.properties.conceptId : null;
    if (conceptId) {
      return {
        refType: "concept",
        refId: conceptId,
      };
    }
  }
  return {
    refType: mapGraphNodeTypeToRefType(node.nodeType),
    refId: node.id,
  };
}
