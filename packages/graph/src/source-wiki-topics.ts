import type { GraphCanvasEdge, GraphCanvasNode } from "@studyagent/schemas";

export type SourceWikiTopicAnchor = {
  topicNodeId: string;
  displayNodeId: string;
  title: string;
  conceptIds: Set<string>;
  pageIds: Set<string>;
};

export function deriveSourceWikiTopicAnchors(
  nodes: GraphCanvasNode[],
  edges: GraphCanvasEdge[],
  sourceId: string,
): SourceWikiTopicAnchor[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const topicNodes = nodes.filter((node) => node.nodeType === "topic");
  if (topicNodes.length === 0) return [];

  return topicNodes.map((topicNode) => {
    const linkedTopicPage = edges
      .filter((edge) => edge.source === topicNode.id && edge.relationType === "CONTAINS_PAGE")
      .map((edge) => nodeById.get(edge.target))
      .find((node): node is GraphCanvasNode =>
        Boolean(node && node.nodeType === "wiki_page" && node.properties.pageType === "topic"),
      );

    const conceptIds = new Set<string>();
    const pageIds = new Set<string>();
    for (const edge of edges) {
      if (edge.source !== topicNode.id) continue;
      if (
        edge.relationType === "CONTAINS_CONCEPT" &&
        nodeById.get(edge.target)?.nodeType === "concept"
      ) {
        conceptIds.add(edge.target);
      }
      if (
        edge.relationType === "CONTAINS_PAGE" &&
        nodeById.get(edge.target)?.nodeType === "wiki_page" &&
        edge.target !== linkedTopicPage?.id
      ) {
        pageIds.add(edge.target);
      }
    }

    const title =
      typeof linkedTopicPage?.properties.title === "string" &&
      linkedTopicPage.properties.title.trim().length > 0
        ? linkedTopicPage.properties.title.trim()
        : typeof topicNode.properties.title === "string" &&
            topicNode.properties.title.trim().length > 0
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
}
