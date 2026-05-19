import type { GraphQueryResponse, SourceWikiTopicGroup } from "@studyagent/schemas";

export type WorkspaceViewMode = "curriculum" | "study_map" | "source_wiki_map";

export type TopicLayer = SourceWikiTopicGroup;

export interface SourceWikiMapData extends GraphQueryResponse {
  topics: TopicLayer[];
  currentPathConceptIds: string[];
}

export interface IntentAwareLayoutInput {
  graphData: GraphQueryResponse;
  savedPositions: Record<string, { x: number; y: number }>;
}

export interface CurriculumObjectiveOutline {
  id: string;
  title: string;
  status: string | null;
  summary: string | null;
  artifactIds: string[];
  sessionIds: string[];
  conceptIds: string[];
}

export interface CurriculumModuleOutline {
  id: string;
  title: string;
  status: string | null;
  summary: string | null;
  objectives: CurriculumObjectiveOutline[];
}

export interface CurriculumOutline {
  curriculum: {
    id: string;
    title: string;
    status: string | null;
    summary: string | null;
  } | null;
  modules: CurriculumModuleOutline[];
  orphanObjectives: CurriculumObjectiveOutline[];
}

/** Study Map and Source Wiki graph queries return server-built `readModel` visibility. */
export function resolveWorkspaceGraph(
  graphData: GraphQueryResponse,
  _viewMode: WorkspaceViewMode,
  _isDeveloperMode: boolean,
): GraphQueryResponse {
  return graphData;
}

/** Topic groups are owned by the Workspace Read Model (`readModel.topics`). */
export function topicsFromReadModel(
  graphData: GraphQueryResponse | null | undefined,
  _sourceId: string,
): TopicLayer[] {
  return graphData?.readModel?.topics ?? [];
}

export function isWeakPlanningTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return (
    /^(objective|module|session)\s+\d+\b/i.test(title) ||
    /\b(current teaching session|active objective list|living study plan)\b/i.test(title) ||
    /^[a-z]+_[a-z0-9_]+$/i.test(title)
  );
}

export function getStickyStudyPlanPosition(containerWidth: number): { left: number } {
  // Keep sticky planning anchor near upper-middle.
  return { left: Math.max(24, Math.floor(containerWidth * 0.5 - 210)) };
}

export function getLearnerNodeTitle(node: GraphQueryResponse["nodes"][number]): string {
  const props = node.properties;
  const title = props.title ?? props.name ?? props.canonicalName ?? props.canonical_name;
  if (typeof title === "string" && title.trim().length > 0) return title.trim();
  if (node.nodeType === "concept" && typeof props.name === "string" && props.name.trim().length > 0) {
    return props.name.trim();
  }
  if (["curriculum", "curriculum_module", "objective", "session_plan", "study_plan"].includes(node.nodeType)) {
    return "Planning needs review";
  }
  return "Reference needs review";
}

function getNodeTitle(node: GraphQueryResponse["nodes"][number]): string {
  return getLearnerNodeTitle(node);
}

function getNodeSummary(node: GraphQueryResponse["nodes"][number]): string | null {
  const summary = node.properties.summary ?? node.properties.description ?? node.properties.sessionGoal;
  return typeof summary === "string" && summary.trim().length > 0 ? summary.trim() : null;
}

function getNodeStatus(node: GraphQueryResponse["nodes"][number]): string | null {
  const status = node.properties.status;
  return typeof status === "string" && status.trim().length > 0 ? status : null;
}

function sortByOrderThenTitle<T extends { id: string; title: string }>(items: T[], orderById: Map<string, number>): T[] {
  return [...items].sort((a, b) => {
    const aOrder = orderById.get(a.id);
    const bOrder = orderById.get(b.id);
    if (aOrder !== undefined || bOrder !== undefined) {
      return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return a.title.localeCompare(b.title);
  });
}

export function buildCurriculumOutline(graphData: GraphQueryResponse): CurriculumOutline {
  const nodesById = new Map(graphData.nodes.map((node) => [node.id, node] as const));
  const curriculumNode = graphData.nodes.find((node) => node.nodeType === "curriculum") ?? null;
  const modulesById = new Map<string, CurriculumModuleOutline>();
  const objectivesById = new Map<string, CurriculumObjectiveOutline>();
  const objectiveModule = new Map<string, string>();
  const moduleOrder = new Map<string, number>();
  const objectiveOrder = new Map<string, number>();

  for (const node of graphData.nodes) {
    if (node.nodeType === "curriculum_module") {
      modulesById.set(node.id, {
        id: node.id,
        title: getNodeTitle(node),
        status: getNodeStatus(node),
        summary: getNodeSummary(node),
        objectives: [],
      });
    }
    if (node.nodeType === "objective") {
      objectivesById.set(node.id, {
        id: node.id,
        title: getNodeTitle(node),
        status: getNodeStatus(node),
        summary: getNodeSummary(node),
        artifactIds: [],
        sessionIds: [],
        conceptIds: [],
      });
    }
  }

  for (const edge of graphData.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) continue;

    if (source.nodeType === "curriculum" && target.nodeType === "curriculum_module") {
      moduleOrder.set(target.id, moduleOrder.size);
    }

    if (source.nodeType === "curriculum_module" && target.nodeType === "objective") {
      objectiveModule.set(target.id, source.id);
      objectiveOrder.set(target.id, objectiveOrder.size);
    }

    if (source.nodeType === "objective" && target.nodeType === "artifact") {
      objectivesById.get(source.id)?.artifactIds.push(target.id);
    }
    if (target.nodeType === "objective" && source.nodeType === "artifact") {
      objectivesById.get(target.id)?.artifactIds.push(source.id);
    }
    if (source.nodeType === "objective" && target.nodeType === "session_plan") {
      objectivesById.get(source.id)?.sessionIds.push(target.id);
    }
    if (target.nodeType === "objective" && source.nodeType === "session_plan") {
      objectivesById.get(target.id)?.sessionIds.push(source.id);
    }
    if (source.nodeType === "objective" && target.nodeType === "concept") {
      objectivesById.get(source.id)?.conceptIds.push(target.id);
    }
    if (target.nodeType === "objective" && source.nodeType === "concept") {
      objectivesById.get(target.id)?.conceptIds.push(source.id);
    }
  }

  const orphanObjectives: CurriculumObjectiveOutline[] = [];
  for (const objective of objectivesById.values()) {
    const moduleId = objectiveModule.get(objective.id);
    const module = moduleId ? modulesById.get(moduleId) : null;
    if (module) module.objectives.push(objective);
    else orphanObjectives.push(objective);
  }

  const modules = sortByOrderThenTitle(Array.from(modulesById.values()), moduleOrder).map((module) => ({
    ...module,
    objectives: sortByOrderThenTitle(module.objectives, objectiveOrder),
  }));

  return {
    curriculum: curriculumNode
      ? {
          id: curriculumNode.id,
          title: getNodeTitle(curriculumNode),
          status: getNodeStatus(curriculumNode),
          summary: getNodeSummary(curriculumNode),
        }
      : null,
    modules,
    orphanObjectives: sortByOrderThenTitle(orphanObjectives, objectiveOrder),
  };
}

export function collapseObjectiveHistory(graphData: GraphQueryResponse): GraphQueryResponse {
  if (graphData.name !== "study_map") return graphData;
  const currentObjectiveIds = new Set(
    graphData.nodes
      .filter((node) => node.nodeType === "study_plan")
      .map((node) => node.properties.currentObjectiveId)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  if (!currentObjectiveIds.size) return graphData;

  const nodes = graphData.nodes.map((node) => {
    if (node.nodeType !== "objective") return node;
    const status = typeof node.properties.status === "string" ? node.properties.status : "";
    if (currentObjectiveIds.has(node.id)) {
      return { ...node, properties: { ...node.properties, collapsed: false, collapseReason: "current" } };
    }
    if (status === "completed") {
      return { ...node, properties: { ...node.properties, collapsed: true, collapseReason: "history", priority: 0 } };
    }
    if (status === "not_started") {
      return { ...node, properties: { ...node.properties, collapsed: true, collapseReason: "future", priority: 1 } };
    }
    return { ...node, properties: { ...node.properties, collapsed: false } };
  });

  const visibleNodes = nodes.filter((node) => !node.properties.collapsed);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const edges = graphData.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
  return { ...graphData, nodes: visibleNodes, edges };
}

export function limitLearnerGraphDensity(graphData: GraphQueryResponse, maxNodes = 80): GraphQueryResponse {
  if (graphData.nodes.length <= maxNodes) return graphData;
  const priorityByType = new Map<string, number>([
    ["curriculum", 100],
    ["curriculum_module", 90],
    ["objective", 80],
    ["session_plan", 70],
    ["artifact", 60],
    ["wiki_page", 50],
    ["concept", 40],
    ["source", 30],
  ]);
  const sortedNodes = [...graphData.nodes].sort((a, b) => {
    const aPriority = Number(a.properties.priority ?? 0) + (priorityByType.get(a.nodeType) ?? 0);
    const bPriority = Number(b.properties.priority ?? 0) + (priorityByType.get(b.nodeType) ?? 0);
    if (aPriority !== bPriority) return bPriority - aPriority;
    const aStatus = typeof a.properties.status === "string" ? a.properties.status : "";
    const bStatus = typeof b.properties.status === "string" ? b.properties.status : "";
    if (aStatus === "current" && bStatus !== "current") return -1;
    if (bStatus === "current" && aStatus !== "current") return 1;
    return getNodeTitle(a).localeCompare(getNodeTitle(b));
  });
  const visibleNodes = sortedNodes.slice(0, maxNodes);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const edges = graphData.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  return {
    ...graphData,
    nodes: visibleNodes,
    edges,
  };
}

export function promoteCurrentPathConcepts(
  graphData: GraphQueryResponse,
  currentPathConceptIds: string[],
): GraphQueryResponse {
  const priorityIds = new Set(currentPathConceptIds);
  const nodes = graphData.nodes.map((node) => {
    if (node.nodeType === "concept" && priorityIds.has(node.id)) {
      return { ...node, properties: { ...node.properties, promoted: true, collapsed: false, priority: 1 } };
    }
    if (node.nodeType === "objective" && node.properties.status === "completed") {
      return { ...node, properties: { ...node.properties, collapsed: true, collapseReason: "completed" } };
    }
    if (node.nodeType === "concept" && !priorityIds.has(node.id)) {
      return { ...node, properties: { ...node.properties, collapsed: true, collapseReason: "not_current_path" } };
    }
    return node;
  });
  const visibleNodes = nodes.filter((node) => !node.properties.collapsed);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graphData.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  return { ...graphData, nodes: visibleNodes, edges: visibleEdges };
}

export function getIntentAwareNodePosition(
  nodeType: string,
  nodeIndex: number,
  saved: { x: number; y: number } | undefined,
): { x: number; y: number } {
  if (saved) return saved;
  const laneByType: Record<string, number> = {
    curriculum: 0,
    curriculum_module: 1,
    objective_list: 2,
    objective: 3,
    session_plan: 4,
    artifact: 5,
  };
  const lane = laneByType[nodeType];
  if (lane === undefined) {
    return { x: (nodeIndex % 6) * 210, y: Math.floor(nodeIndex / 6) * 160 };
  }
  return { x: lane * 260 + 80, y: nodeIndex * 140 + 60 };
}

function getHeadingBucket(properties: Record<string, unknown>): string {
  const headingPath = properties.headingPath;
  if (!Array.isArray(headingPath) || headingPath.length === 0) return "Ungrouped";
  const heading = headingPath[0];
  return typeof heading === "string" && heading.trim().length > 0 ? heading : "Ungrouped";
}

export function buildIntentAwareLayout({ graphData, savedPositions }: IntentAwareLayoutInput): Array<{
  node: GraphQueryResponse["nodes"][number];
  position: { x: number; y: number };
}> {
  const isSourceWiki = graphData.name === "source_wiki_map";
  const topicByNodeId = new Map<string, string>();
  const topicOrder = new Map<string, number>();
  let topicCounter = 0;

  if (isSourceWiki) {
    for (const node of graphData.nodes) {
      const topic = getHeadingBucket(node.properties);
      topicByNodeId.set(node.id, topic);
      if (!topicOrder.has(topic)) {
        topicOrder.set(topic, topicCounter++);
      }
    }
  }

  const laneCounts = new Map<string, number>();
  return graphData.nodes.map((node, index) => {
    const saved = savedPositions[node.id];
    if (saved) {
      return { node, position: saved };
    }

    if (!isSourceWiki) {
      return {
        node,
        position: getIntentAwareNodePosition(node.nodeType, index, undefined),
      };
    }

    const topic = topicByNodeId.get(node.id) ?? "Ungrouped";
    const topicIndex = topicOrder.get(topic) ?? 0;
    const clusterOffsetY = topicIndex * 220;
    const laneKey = `${topic}:${node.nodeType}`;
    const laneCount = laneCounts.get(laneKey) ?? 0;
    laneCounts.set(laneKey, laneCount + 1);

    const xByType: Record<string, number> = {
      source: 80,
      topic: 320,
      concept: 620,
      wiki_page: 900,
      claim: 1120,
      source_section: 1120,
    };
    const x = xByType[node.nodeType] ?? 1280;
    const y = clusterOffsetY + 60 + laneCount * 92;
    return { node, position: { x, y } };
  });
}
