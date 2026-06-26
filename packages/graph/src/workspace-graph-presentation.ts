import type { GraphCanvasEdge, GraphCanvasNode } from "@studyagent/schemas";

export type WorkspacePresentationGraph = {
  name?: string;
  nodes: GraphCanvasNode[];
  edges: GraphCanvasEdge[];
};

export const STUDY_MAP_EXCLUDED_NODE_TYPES = new Set([
  "objective",
  "study_plan",
  "studyplan",
  "objective_list",
  "session_plan",
  "weak_concept",
]);

const STUDY_MAP_BRIDGE_NODE_TYPES = STUDY_MAP_EXCLUDED_NODE_TYPES;

const STUDY_MAP_LEVEL_BY_TYPE: Record<string, number> = {
  source: 0,
  curriculum: 1,
  curriculum_module: 2,
  tutor_session: 3,
  artifact: 4,
  concept: 4,
  wiki_page: 4,
};

const STUDY_MAP_LEVEL_FALLBACK = 4;

function isTopicWikiPage(node: GraphCanvasNode): boolean {
  return node.nodeType === "wiki_page" && node.properties.pageType === "topic";
}

export function getGraphNodeLevel(graphName: string | undefined, node: GraphCanvasNode): number {
  if (graphName === "source_wiki_map") {
    if (node.nodeType === "source") return 0;
    if (node.nodeType === "topic" || isTopicWikiPage(node)) return 1;
    if (node.nodeType === "concept" || (node.nodeType === "wiki_page" && !isTopicWikiPage(node)))
      return 2;
    return 2;
  }

  if (graphName === "study_map") {
    return STUDY_MAP_LEVEL_BY_TYPE[node.nodeType] ?? STUDY_MAP_LEVEL_FALLBACK;
  }

  return 0;
}

function normalizeEdgeLevels(
  graphName: string | undefined,
  sourceNode: GraphCanvasNode,
  targetNode: GraphCanvasNode,
): {
  parent: GraphCanvasNode;
  child: GraphCanvasNode;
  parentLevel: number;
  childLevel: number;
} {
  const sourceLevel = getGraphNodeLevel(graphName, sourceNode);
  const targetLevel = getGraphNodeLevel(graphName, targetNode);
  if (sourceLevel <= targetLevel) {
    return {
      parent: sourceNode,
      child: targetNode,
      parentLevel: sourceLevel,
      childLevel: targetLevel,
    };
  }
  return {
    parent: targetNode,
    child: sourceNode,
    parentLevel: targetLevel,
    childLevel: sourceLevel,
  };
}

function isAllowedStudyMapEdge(parent: GraphCanvasNode, child: GraphCanvasNode): boolean {
  if (child.nodeType === "artifact") {
    return parent.nodeType === "curriculum_module" || parent.nodeType === "tutor_session";
  }
  if (parent.nodeType === "artifact") return false;
  if (
    parent.nodeType === "source" &&
    (child.nodeType === "artifact" || child.nodeType === "tutor_session")
  ) {
    return false;
  }
  if (parent.nodeType === "source" && child.nodeType === "concept") return false;
  return true;
}

function isStudyMapLevelGapAllowed(
  parent: GraphCanvasNode,
  child: GraphCanvasNode,
  parentLevel: number,
  childLevel: number,
): boolean {
  if (childLevel - parentLevel === 1) return true;
  if (child.nodeType === "artifact") {
    return (
      (parent.nodeType === "curriculum_module" || parent.nodeType === "tutor_session") &&
      childLevel > parentLevel
    );
  }
  return false;
}

function buildUndirectedAdjacency(
  edges: GraphCanvasEdge[],
  nodeIds: Set<string>,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const touch = (nodeId: string) => {
    if (!adjacency.has(nodeId)) adjacency.set(nodeId, new Set());
    return adjacency.get(nodeId)!;
  };

  for (const nodeId of nodeIds) touch(nodeId);
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    touch(edge.source).add(edge.target);
    touch(edge.target).add(edge.source);
  }
  return adjacency;
}

function pushProjectedEdge(
  edges: GraphCanvasEdge[],
  seen: Set<string>,
  source: string,
  target: string,
  relationType: string,
): void {
  const key = `${source}->${target}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({
    id: `projected-${source}-${target}-${relationType}`,
    source,
    target,
    relationType,
    properties: { projectedBy: "graph.study_map_hierarchy" },
  });
}

export function projectStudyMapEdges(graph: WorkspacePresentationGraph): GraphCanvasEdge[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const allNodeIds = new Set(graph.nodes.map((node) => node.id));
  const visibleNodes = graph.nodes.filter(
    (node) => !STUDY_MAP_EXCLUDED_NODE_TYPES.has(node.nodeType),
  );
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const adjacency = buildUndirectedAdjacency(graph.edges, allNodeIds);
  const projected: GraphCanvasEdge[] = [];
  const seen = new Set<string>();

  for (const edge of graph.edges) {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    const { parent, child } = normalizeEdgeLevels(graph.name, sourceNode, targetNode);
    pushProjectedEdge(projected, seen, parent.id, child.id, edge.relationType);
  }

  for (const startNode of visibleNodes) {
    const startLevel = getGraphNodeLevel(graph.name, startNode);
    const queue = [startNode.id];
    const visited = new Set([startNode.id]);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const neighborId of adjacency.get(currentId) ?? []) {
        if (visited.has(neighborId)) continue;
        const neighbor = nodeById.get(neighborId);
        if (!neighbor) continue;
        visited.add(neighborId);

        if (!visibleIds.has(neighborId)) {
          if (STUDY_MAP_BRIDGE_NODE_TYPES.has(neighbor.nodeType)) queue.push(neighborId);
          continue;
        }

        if (neighborId === startNode.id) continue;
        const neighborLevel = getGraphNodeLevel(graph.name, neighbor);
        if (neighborLevel === startLevel) continue;
        const { parent, child, parentLevel, childLevel } = normalizeEdgeLevels(
          graph.name,
          startNode,
          neighbor,
        );
        if (!isAllowedStudyMapEdge(parent, child)) continue;
        if (!isStudyMapLevelGapAllowed(parent, child, parentLevel, childLevel)) continue;
        pushProjectedEdge(projected, seen, parent.id, child.id, "CONNECTS");
      }
    }
  }

  const childrenByParent = new Map<string, Set<string>>();
  for (const edge of projected) {
    const bucket = childrenByParent.get(edge.source) ?? new Set();
    bucket.add(edge.target);
    childrenByParent.set(edge.source, bucket);
  }

  const modules = visibleNodes.filter((node) => node.nodeType === "curriculum_module");
  const sessions = visibleNodes.filter((node) => node.nodeType === "tutor_session");
  const preferredModule =
    modules.find((node) => node.properties.status === "active") ?? modules[0] ?? null;
  const hasParentEdge = (nodeId: string): boolean =>
    [...childrenByParent.values()].some((children) => children.has(nodeId));

  for (const session of sessions) {
    if (hasParentEdge(session.id) || !preferredModule) continue;
    pushProjectedEdge(projected, seen, preferredModule.id, session.id, "HOSTS");
    const moduleChildren = childrenByParent.get(preferredModule.id) ?? new Set<string>();
    moduleChildren.add(session.id);
    childrenByParent.set(preferredModule.id, moduleChildren);
  }

  const artifacts = visibleNodes.filter((node) => node.nodeType === "artifact");
  for (const artifact of artifacts) {
    if (hasParentEdge(artifact.id)) continue;
    const parentSession = sessions[sessions.length - 1] ?? null;
    if (parentSession) {
      pushProjectedEdge(projected, seen, parentSession.id, artifact.id, "COMPLETED_BY");
    } else if (preferredModule) {
      pushProjectedEdge(projected, seen, preferredModule.id, artifact.id, "COVERS");
    }
  }

  return projected;
}

function isHiddenStudyMapArtifact(node: GraphCanvasNode): boolean {
  if (node.nodeType !== "artifact") return false;
  const artifactType =
    typeof node.properties.artifactType === "string"
      ? node.properties.artifactType
      : typeof node.properties.artifact_type === "string"
        ? node.properties.artifact_type
        : "";
  return artifactType === "session_digest";
}

export function filterStudyMapNodes(graph: WorkspacePresentationGraph): WorkspacePresentationGraph {
  const nodes = graph.nodes.filter(
    (node) => !STUDY_MAP_EXCLUDED_NODE_TYPES.has(node.nodeType) && !isHiddenStudyMapArtifact(node),
  );
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
  return { ...graph, nodes, edges };
}

function isPreferredSourceWikiEdge(relationType: string): boolean {
  const normalized = relationType.trim().toUpperCase();
  return (
    normalized === "HAS_TOPIC" ||
    normalized === "CONTAINS_CONCEPT" ||
    normalized === "CONTAINS_PAGE"
  );
}

export function dedupeSourceWikiGraph(
  graph: WorkspacePresentationGraph,
): WorkspacePresentationGraph {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const hiddenIds = new Set<string>();
  const remapIds = new Map<string, string>();

  for (const node of graph.nodes) {
    if (node.nodeType !== "topic") continue;
    const linkedTopicPage = graph.edges
      .filter(
        (edge) => edge.source === node.id && edge.relationType.toUpperCase() === "CONTAINS_PAGE",
      )
      .map((edge) => nodeById.get(edge.target))
      .find((candidate): candidate is GraphCanvasNode =>
        Boolean(candidate && isTopicWikiPage(candidate)),
      );

    if (linkedTopicPage) {
      hiddenIds.add(node.id);
      remapIds.set(node.id, linkedTopicPage.id);
    }
  }

  for (const node of graph.nodes) {
    if (node.nodeType !== "wiki_page" || isTopicWikiPage(node)) continue;
    const linkedConcept = graph.edges
      .flatMap((edge) => {
        if (edge.source === node.id) return [nodeById.get(edge.target)];
        if (edge.target === node.id) return [nodeById.get(edge.source)];
        return [];
      })
      .find((candidate) => candidate?.nodeType === "concept");
    if (linkedConcept) hiddenIds.add(node.id);
  }

  const remapNodeId = (nodeId: string): string => {
    let current = nodeId;
    const visited = new Set<string>();
    while (remapIds.has(current) && !visited.has(current)) {
      visited.add(current);
      current = remapIds.get(current)!;
    }
    return current;
  };

  const nodes = graph.nodes.filter((node) => !hiddenIds.has(node.id));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges
    .map((edge) => ({
      ...edge,
      source: remapNodeId(edge.source),
      target: remapNodeId(edge.target),
    }))
    .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));

  return { ...graph, nodes, edges };
}

export function filterHierarchicalGraphEdges(graph: WorkspacePresentationGraph): GraphCanvasEdge[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const graphName = graph.name;

  const candidates = graph.edges.filter((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) return false;

    const { parent, child, parentLevel, childLevel } = normalizeEdgeLevels(
      graphName,
      sourceNode,
      targetNode,
    );

    if (graphName === "study_map") {
      if (!isAllowedStudyMapEdge(parent, child)) return false;
      return isStudyMapLevelGapAllowed(parent, child, parentLevel, childLevel);
    }

    if (childLevel - parentLevel !== 1) return false;

    if (graphName === "source_wiki_map") {
      return isPreferredSourceWikiEdge(edge.relationType);
    }

    return true;
  });

  if (graphName !== "source_wiki_map") return candidates;

  const seenPairs = new Set<string>();
  return candidates.filter((edge) => {
    const pairKey = `${edge.source}->${edge.target}`;
    if (seenPairs.has(pairKey)) return false;
    seenPairs.add(pairKey);
    return true;
  });
}

export function presentStudyMapCanvas(canvas: {
  nodes: GraphCanvasNode[];
  edges: GraphCanvasEdge[];
}): { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] } {
  const projected = {
    name: "study_map" as const,
    nodes: canvas.nodes,
    edges: projectStudyMapEdges({ name: "study_map", ...canvas }),
  };
  const visible = filterStudyMapNodes(projected);
  return {
    nodes: visible.nodes,
    edges: filterHierarchicalGraphEdges({ name: "study_map", ...visible }),
  };
}

export function presentSourceWikiCanvas(canvas: {
  nodes: GraphCanvasNode[];
  edges: GraphCanvasEdge[];
}): { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] } {
  const deduped = dedupeSourceWikiGraph({ name: "source_wiki_map", ...canvas });
  return {
    nodes: deduped.nodes,
    edges: filterHierarchicalGraphEdges({ name: "source_wiki_map", ...deduped }),
  };
}
