import type { GraphCanvasEdge, GraphCanvasNode, GraphQueryResponse } from "@studyagent/schemas";

export type RawNeo4jCanvasNode = { id: string; labels: string[]; props: Record<string, unknown> };
export type RawNeo4jCanvasEdge = { type: string; startId: string; endId: string; props: Record<string, unknown> };

export function normalizeNeo4jCanvasNodes(raw: RawNeo4jCanvasNode[]): GraphCanvasNode[] {
  return raw.map((n) => ({
    id: n.id,
    nodeType: normalizeNodeLabel(n.labels[0] ?? "unknown"),
    labels: n.labels,
    properties: n.props,
  }));
}

function normalizeNodeLabel(label: string): string {
  const explicit: Record<string, string> = {
    WikiPage: "wiki_page",
    StudyPlan: "study_plan",
    WeakConcept: "weak_concept",
    TutorSession: "tutor_session",
    SourceSection: "source_section",
    CurriculumModule: "curriculum_module",
    ObjectiveList: "objective_list",
    SessionPlan: "session_plan",
    CoverageItem: "coverage_item",
    CoverageRecord: "coverage_record",
  };
  if (explicit[label]) return explicit[label];
  return label
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

export function normalizeNeo4jCanvasEdges(raw: RawNeo4jCanvasEdge[], existingIds: Set<string>): GraphCanvasEdge[] {
  return raw
    .map((e, idx) => ({
      id: `${e.startId}-${e.endId}-${e.type}-${idx}`,
      source: e.startId,
      target: e.endId,
      relationType: e.type,
      properties: e.props,
    }))
    .filter((e) => existingIds.has(e.source) && existingIds.has(e.target));
}

export function buildSourceWikiTopicProjection(input: {
  notebookId: string;
  sourceId: string;
  nodes: GraphCanvasNode[];
  edges: GraphCanvasEdge[];
}): GraphQueryResponse {
  const sourceNode = input.nodes.find((node) => node.nodeType === "source" && node.id === input.sourceId);
  if (!sourceNode) {
    return {
      name: "source_wiki_map",
      notebookId: input.notebookId,
      sourceId: input.sourceId,
      nodes: input.nodes,
      edges: input.edges,
    };
  }

  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const topicNodes = input.nodes.filter((node) => node.nodeType === "topic");

  if (topicNodes.length === 0) {
    return {
      name: "source_wiki_map",
      notebookId: input.notebookId,
      sourceId: input.sourceId,
      nodes: input.nodes,
      edges: input.edges,
    };
  }

  const anchors = topicNodes.map((topicNode) => {
    const linkedTopicPage = input.edges
      .filter((edge) => edge.source === topicNode.id && edge.relationType === "CONTAINS_PAGE")
      .map((edge) => nodeById.get(edge.target))
      .find((node): node is GraphCanvasNode => Boolean(node && node.nodeType === "wiki_page" && node.properties.pageType === "topic"));

    const conceptIds = new Set<string>();
    const pageIds = new Set<string>();
    for (const edge of input.edges) {
      if (edge.source !== topicNode.id) continue;
      if (edge.relationType === "CONTAINS_CONCEPT" && nodeById.get(edge.target)?.nodeType === "concept") {
        conceptIds.add(edge.target);
      }
      if (edge.relationType === "CONTAINS_PAGE" && nodeById.get(edge.target)?.nodeType === "wiki_page" && edge.target !== linkedTopicPage?.id) {
        pageIds.add(edge.target);
      }
    }

    const title =
      typeof linkedTopicPage?.properties.title === "string" && linkedTopicPage.properties.title.trim().length > 0
        ? linkedTopicPage.properties.title.trim()
        : typeof topicNode.properties.title === "string" && topicNode.properties.title.trim().length > 0
          ? topicNode.properties.title.trim()
          : "Ungrouped";

    return {
      topicNodeId: topicNode.id,
      displayNodeId: linkedTopicPage?.id ?? topicNode.id,
      title,
      conceptIds,
      pageIds,
    };
  });

  const outNodes = [...input.nodes];
  const outEdges = [...input.edges];
  const seenEdgeIds = new Set(outEdges.map((edge) => edge.id));

  for (const bucket of anchors) {
    const anchorId = bucket.displayNodeId;
    const conceptIds = [...bucket.conceptIds];
    const pageIds = [...bucket.pageIds];

    pushProjectionEdge(outEdges, seenEdgeIds, {
      id: `source-topic-${input.sourceId}-${anchorId}`,
      source: input.sourceId,
      target: anchorId,
      relationType: "HAS_TOPIC",
      properties: { projectedBy: "graph.source_wiki_topic_projection" },
    });

    for (const conceptId of conceptIds) {
      if (!nodeById.has(conceptId)) continue;
      pushProjectionEdge(outEdges, seenEdgeIds, {
        id: `topic-concept-${anchorId}-${conceptId}`,
        source: anchorId,
        target: conceptId,
        relationType: "CONTAINS_CONCEPT",
        properties: { projectedBy: "graph.source_wiki_topic_projection" },
      });
    }

    for (const pageId of pageIds) {
      if (!nodeById.has(pageId)) continue;
      pushProjectionEdge(outEdges, seenEdgeIds, {
        id: `topic-page-${anchorId}-${pageId}`,
        source: anchorId,
        target: pageId,
        relationType: "CONTAINS_PAGE",
        properties: { projectedBy: "graph.source_wiki_topic_projection" },
      });
    }
  }

  return {
    name: "source_wiki_map",
    notebookId: input.notebookId,
    sourceId: input.sourceId,
    nodes: outNodes,
    edges: outEdges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target)),
  };
}

function pushProjectionEdge(edges: GraphCanvasEdge[], seenEdgeIds: Set<string>, edge: GraphCanvasEdge): void {
  if (seenEdgeIds.has(edge.id)) return;
  seenEdgeIds.add(edge.id);
  edges.push(edge);
}

function slugTopicKey(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "ungrouped";
}

function topicFromHeadingPath(props: Record<string, unknown>): string {
  const headingPath = props.headingPath;
  if (!Array.isArray(headingPath) || headingPath.length === 0) return "Ungrouped";
  const head = headingPath[0];
  if (typeof head !== "string") return "Ungrouped";
  const trimmed = head.trim();
  return trimmed.length > 0 ? trimmed : "Ungrouped";
}
