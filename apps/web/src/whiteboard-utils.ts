import type { GraphCanvasNode, GraphQueryResponse, SourceWikiTopicGroup } from "@studyagent/schemas";
import { learnerFacingPipelineStatus, pageReadinessLabel, pageReadinessSchema } from "@studyagent/schemas";

export type WorkspaceViewMode = "curriculum" | "study_map" | "source_wiki_map";

export type TopicLayer = SourceWikiTopicGroup;

export interface SourceWikiMapData extends GraphQueryResponse {
  topics: TopicLayer[];
  currentPathConceptIds: string[];
}

export interface IntentAwareLayoutInput {
  graphData: GraphQueryResponse;
  savedPositions: Record<string, { x: number; y: number }>;
  /** Kept for older callers; graph presentation is now owned by the API read model. */
  alreadyPrepared?: boolean;
}

export interface CurriculumObjectiveOutline {
  id: string;
  title: string;
  status: string | null;
  summary: string | null;
  artifactIds: string[];
  sessionIds: string[];
  conceptIds: string[];
  artifactRefs?: Array<{ id: string; title: string }>;
  sessionRefs?: Array<{ id: string; title: string }>;
  conceptRefs?: Array<{ id: string; title: string }>;
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

export function learnerPageReadinessFromNode(node: GraphCanvasNode): string | null {
  const label = node.properties.pageReadinessLabel;
  if (typeof label === "string" && label.trim().length > 0) return label.trim();
  const raw = node.properties.pageReadiness;
  if (typeof raw !== "string") return null;
  const parsed = pageReadinessSchema.safeParse(raw);
  return parsed.success ? pageReadinessLabel(parsed.data) : raw.replace(/_/g, " ");
}

export function learnerMasteryMetaFromNode(node: GraphCanvasNode): string | null {
  if (node.nodeType !== "concept" && node.nodeType !== "weak_concept") return null;
  const status = typeof node.properties.status === "string" ? node.properties.status : null;
  if (!status || status === "active") return null;
  if (status === "weak") return "Needs practice";
  if (status === "mastered") return "Proficient";
  return learnerFacingPipelineStatus(status);
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
  if (node.nodeType === "tutor_session") {
    return "Tutor session";
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
        artifactRefs: [],
        sessionRefs: [],
        conceptRefs: [],
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
      objectivesById.get(source.id)?.artifactRefs?.push({ id: target.id, title: getNodeTitle(target) });
    }
    if (target.nodeType === "objective" && source.nodeType === "artifact") {
      objectivesById.get(target.id)?.artifactIds.push(source.id);
      objectivesById.get(target.id)?.artifactRefs?.push({ id: source.id, title: getNodeTitle(source) });
    }
    if (source.nodeType === "objective" && target.nodeType === "session_plan") {
      objectivesById.get(source.id)?.sessionIds.push(target.id);
      objectivesById.get(source.id)?.sessionRefs?.push({ id: target.id, title: getNodeTitle(target) });
    }
    if (target.nodeType === "objective" && source.nodeType === "session_plan") {
      objectivesById.get(target.id)?.sessionIds.push(source.id);
      objectivesById.get(target.id)?.sessionRefs?.push({ id: source.id, title: getNodeTitle(source) });
    }
    if (source.nodeType === "objective" && target.nodeType === "concept") {
      objectivesById.get(source.id)?.conceptIds.push(target.id);
      objectivesById.get(source.id)?.conceptRefs?.push({ id: target.id, title: getNodeTitle(target) });
    }
    if (target.nodeType === "objective" && source.nodeType === "concept") {
      objectivesById.get(target.id)?.conceptIds.push(source.id);
      objectivesById.get(target.id)?.conceptRefs?.push({ id: source.id, title: getNodeTitle(source) });
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
    ["tutor_session", 65],
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

const LAYOUT_NODE_WIDTH = 168;
const LAYOUT_NODE_HEIGHT = 110;
const LAYOUT_NODE_GAP_X = 80;
const LAYOUT_NODE_GAP_Y = 96;
const LAYOUT_LEVEL_HEIGHT = LAYOUT_NODE_HEIGHT + LAYOUT_NODE_GAP_Y;
const LAYOUT_NODE_SPACING = LAYOUT_NODE_WIDTH + LAYOUT_NODE_GAP_X;
const LAYOUT_START_X = 120;
const LAYOUT_START_Y = 56;

const STUDY_MAP_LEVEL_4_SUBROW: Record<string, number> = {
  artifact: 0,
  concept: 1,
  wiki_page: 2,
};

const STUDY_MAP_LEVEL_4_SUBROW_HEIGHT = LAYOUT_NODE_HEIGHT + 40;

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

const SOURCE_WIKI_TOPIC_LEVEL_TYPES = new Set(["topic"]);

function isSourceWikiTopicPage(node: GraphQueryResponse["nodes"][number]): boolean {
  return node.nodeType === "wiki_page" && node.properties.pageType === "topic";
}

function isSourceWikiConceptPage(node: GraphQueryResponse["nodes"][number]): boolean {
  return node.nodeType === "wiki_page" && node.properties.pageType !== "topic";
}

export function getGraphNodeLevel(
  graphName: string | undefined,
  node: GraphQueryResponse["nodes"][number],
): number {
  if (graphName === "source_wiki_map") {
    if (node.nodeType === "source") return 0;
    if (SOURCE_WIKI_TOPIC_LEVEL_TYPES.has(node.nodeType) || isSourceWikiTopicPage(node)) return 1;
    if (node.nodeType === "concept" || isSourceWikiConceptPage(node)) return 2;
    return 2;
  }

  if (graphName === "study_map") {
    return STUDY_MAP_LEVEL_BY_TYPE[node.nodeType] ?? STUDY_MAP_LEVEL_FALLBACK;
  }

  return 0;
}

function normalizeEdgeLevels(
  graphName: string | undefined,
  sourceNode: GraphQueryResponse["nodes"][number],
  targetNode: GraphQueryResponse["nodes"][number],
): { parent: GraphQueryResponse["nodes"][number]; child: GraphQueryResponse["nodes"][number]; parentLevel: number; childLevel: number } {
  const sourceLevel = getGraphNodeLevel(graphName, sourceNode);
  const targetLevel = getGraphNodeLevel(graphName, targetNode);
  if (sourceLevel <= targetLevel) {
    return { parent: sourceNode, child: targetNode, parentLevel: sourceLevel, childLevel: targetLevel };
  }
  return { parent: targetNode, child: sourceNode, parentLevel: targetLevel, childLevel: sourceLevel };
}

function isAllowedStudyMapEdge(
  parent: GraphQueryResponse["nodes"][number],
  child: GraphQueryResponse["nodes"][number],
): boolean {
  if (child.nodeType === "artifact") {
    return parent.nodeType === "curriculum_module" || parent.nodeType === "tutor_session";
  }
  if (parent.nodeType === "artifact") {
    return false;
  }
  if (parent.nodeType === "source" && (child.nodeType === "artifact" || child.nodeType === "tutor_session")) {
    return false;
  }
  if (parent.nodeType === "source" && child.nodeType === "concept") {
    return false;
  }
  return true;
}

function isStudyMapLevelGapAllowed(
  parent: GraphQueryResponse["nodes"][number],
  child: GraphQueryResponse["nodes"][number],
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

function isPreferredSourceWikiEdge(relationType: string): boolean {
  const normalized = relationType.trim().toUpperCase();
  return normalized === "HAS_TOPIC" || normalized === "CONTAINS_CONCEPT" || normalized === "CONTAINS_PAGE";
}

export function filterHierarchicalGraphEdges(graphData: GraphQueryResponse): GraphQueryResponse["edges"] {
  const nodeById = new Map(graphData.nodes.map((node) => [node.id, node] as const));
  const graphName = graphData.name;

  const candidates = graphData.edges.filter((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) return false;

    const { parent, child, parentLevel, childLevel } = normalizeEdgeLevels(graphName, sourceNode, targetNode);
    const isAdjacentLevel = childLevel - parentLevel === 1;

    if (graphName === "study_map") {
      if (!isAllowedStudyMapEdge(parent, child)) return false;
      return isStudyMapLevelGapAllowed(parent, child, parentLevel, childLevel);
    }

    if (!isAdjacentLevel) return false;

    if (graphName === "source_wiki_map") {
      return isPreferredSourceWikiEdge(edge.relationType);
    }

    return isAdjacentLevel;
  });

  if (graphName !== "source_wiki_map") {
    return candidates;
  }

  const seenPairs = new Set<string>();
  return candidates.filter((edge) => {
    const pairKey = `${edge.source}->${edge.target}`;
    if (seenPairs.has(pairKey)) return false;
    seenPairs.add(pairKey);
    return true;
  });
}

export function getIntentAwareNodePosition(
  nodeType: string,
  nodeIndex: number,
  saved: { x: number; y: number } | undefined,
  graphName?: string,
): { x: number; y: number } {
  if (saved) return saved;

  const level =
    graphName === "study_map"
      ? (STUDY_MAP_LEVEL_BY_TYPE[nodeType] ?? STUDY_MAP_LEVEL_FALLBACK)
      : graphName === "source_wiki_map"
        ? nodeType === "source"
          ? 0
          : nodeType === "topic"
            ? 1
            : 2
        : 0;

  return {
    x: LAYOUT_START_X + (nodeIndex % 5) * LAYOUT_NODE_SPACING,
    y: LAYOUT_START_Y + level * LAYOUT_LEVEL_HEIGHT + Math.floor(nodeIndex / 5) * 28,
  };
}

function getHeadingBucket(properties: Record<string, unknown>): string {
  const headingPath = properties.headingPath;
  if (!Array.isArray(headingPath) || headingPath.length === 0) return "Ungrouped";
  const heading = headingPath[0];
  return typeof heading === "string" && heading.trim().length > 0 ? heading : "Ungrouped";
}

const STUDY_MAP_SIBLING_ORDER: Record<string, number> = {
  artifact: 0,
  concept: 1,
  wiki_page: 2,
};

function compareNodesForLayout(
  graphName: string | undefined,
  a: GraphQueryResponse["nodes"][number],
  b: GraphQueryResponse["nodes"][number],
): number {
  const levelDiff = getGraphNodeLevel(graphName, a) - getGraphNodeLevel(graphName, b);
  if (levelDiff !== 0) return levelDiff;
  if (graphName === "study_map") {
    const orderDiff = (STUDY_MAP_SIBLING_ORDER[a.nodeType] ?? 9) - (STUDY_MAP_SIBLING_ORDER[b.nodeType] ?? 9);
    if (orderDiff !== 0) return orderDiff;
  }
  return getLearnerNodeTitle(a).localeCompare(getLearnerNodeTitle(b));
}

function buildParentChildMaps(
  graphData: GraphQueryResponse,
): {
  childrenByParent: Map<string, string[]>;
  parentsByChild: Map<string, string[]>;
} {
  const nodeById = new Map(graphData.nodes.map((node) => [node.id, node] as const));
  const childrenByParent = new Map<string, string[]>();
  const parentsByChild = new Map<string, string[]>();

  for (const edge of filterHierarchicalGraphEdges(graphData)) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const { parent, child } = normalizeEdgeLevels(graphData.name, sourceNode, targetNode);
    const parentChildren = childrenByParent.get(parent.id) ?? [];
    if (!parentChildren.includes(child.id)) parentChildren.push(child.id);
    childrenByParent.set(parent.id, parentChildren);

    const childParents = parentsByChild.get(child.id) ?? [];
    if (!childParents.includes(parent.id)) childParents.push(parent.id);
    parentsByChild.set(child.id, childParents);
  }

  return { childrenByParent, parentsByChild };
}

function getLayoutY(
  graphName: string | undefined,
  node: GraphQueryResponse["nodes"][number],
  level: number,
): number {
  let y = LAYOUT_START_Y + level * LAYOUT_LEVEL_HEIGHT;
  if (graphName === "study_map" && level === 4) {
    y += (STUDY_MAP_LEVEL_4_SUBROW[node.nodeType] ?? 2) * STUDY_MAP_LEVEL_4_SUBROW_HEIGHT;
  }
  return y;
}

function nodeCenterX(position: { x: number; y: number }): number {
  return position.x + LAYOUT_NODE_WIDTH / 2;
}

function nodeRightX(position: { x: number; y: number }): number {
  return position.x + LAYOUT_NODE_WIDTH;
}

type LayoutCluster = {
  parentId: string | null;
  nodes: GraphQueryResponse["nodes"][number][];
  idealLeft: number;
  placedLeft: number;
};

function primaryParentId(
  graphName: string | undefined,
  nodeId: string,
  nodeById: Map<string, GraphQueryResponse["nodes"][number]>,
  parentsByChild: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
): string | null {
  const node = nodeById.get(nodeId);
  if (!node) return null;
  const nodeLevel = getGraphNodeLevel(graphName, node);
  const parents = (parentsByChild.get(nodeId) ?? [])
    .filter((parentId) => positions.has(parentId))
    .map((parentId) => {
      const parent = nodeById.get(parentId);
      return parent ? { id: parentId, level: getGraphNodeLevel(graphName, parent) } : null;
    })
    .filter((entry): entry is { id: string; level: number } => entry !== null && entry.level < nodeLevel)
    .sort((a, b) => a.level - b.level);

  const directParent = parents.find((entry) => entry.level === nodeLevel - 1);
  return directParent?.id ?? parents[0]?.id ?? null;
}

function clusterBounds(
  cluster: LayoutCluster,
  positions: Map<string, { x: number; y: number }>,
): { left: number; right: number } | null {
  const placed = cluster.nodes
    .map((node) => positions.get(node.id))
    .filter((position): position is { x: number; y: number } => position !== undefined);
  if (!placed.length) return null;
  return {
    left: Math.min(...placed.map((position) => position.x)),
    right: Math.max(...placed.map((position) => nodeRightX(position))),
  };
}

function placeClusterNodes(
  cluster: LayoutCluster,
  left: number,
  y: number,
  positions: Map<string, { x: number; y: number }>,
  savedPositions: Record<string, { x: number; y: number }>,
): void {
  cluster.placedLeft = left;
  cluster.nodes.forEach((node, index) => {
    const saved = savedPositions[node.id];
    if (saved) {
      positions.set(node.id, saved);
      return;
    }
    positions.set(node.id, { x: left + index * LAYOUT_NODE_SPACING, y });
  });
}

function buildParentCenteredClusters(
  graphName: string | undefined,
  rowNodes: GraphQueryResponse["nodes"][number][],
  nodeById: Map<string, GraphQueryResponse["nodes"][number]>,
  parentsByChild: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
): LayoutCluster[] {
  const nodesByParent = new Map<string, GraphQueryResponse["nodes"][number][]>();
  const orphanNodes: GraphQueryResponse["nodes"][number][] = [];

  for (const node of rowNodes) {
    const parentId = primaryParentId(graphName, node.id, nodeById, parentsByChild, positions);
    if (parentId) {
      const bucket = nodesByParent.get(parentId) ?? [];
      bucket.push(node);
      nodesByParent.set(parentId, bucket);
    } else {
      orphanNodes.push(node);
    }
  }

  const clusters: LayoutCluster[] = [];

  for (const [parentId, nodes] of nodesByParent) {
    const sorted = [...nodes].sort((a, b) => compareNodesForLayout(graphName, a, b));
    const parentPosition = positions.get(parentId);
    const parentCenter = parentPosition ? nodeCenterX(parentPosition) : LAYOUT_START_X + LAYOUT_NODE_WIDTH / 2;
    const clusterWidth = sorted.length * LAYOUT_NODE_SPACING;
    clusters.push({
      parentId,
      nodes: sorted,
      idealLeft: parentCenter - clusterWidth / 2,
      placedLeft: 0,
    });
  }

  if (orphanNodes.length > 0) {
    const sorted = [...orphanNodes].sort((a, b) => compareNodesForLayout(graphName, a, b));
    const clusterWidth = sorted.length * LAYOUT_NODE_SPACING;
    clusters.push({
      parentId: null,
      nodes: sorted,
      idealLeft: LAYOUT_START_X,
      placedLeft: 0,
    });
  }

  return clusters.sort((a, b) => a.idealLeft - b.idealLeft);
}

function resolveClusterOverlaps(
  clusters: LayoutCluster[],
  y: number,
  positions: Map<string, { x: number; y: number }>,
  savedPositions: Record<string, { x: number; y: number }>,
): void {
  let cursorX = LAYOUT_START_X;
  for (const cluster of clusters) {
    const clusterWidth = cluster.nodes.length * LAYOUT_NODE_SPACING;
    const placedLeft = Math.max(cursorX, cluster.idealLeft);
    placeClusterNodes(cluster, placedLeft, y, positions, savedPositions);
    cursorX = placedLeft + clusterWidth + LAYOUT_NODE_GAP_X;
  }
}

function nudgeClusterTowardParent(
  cluster: LayoutCluster,
  clusters: LayoutCluster[],
  positions: Map<string, { x: number; y: number }>,
  savedPositions: Record<string, { x: number; y: number }>,
  y: number,
): void {
  if (!cluster.parentId || cluster.nodes.length === 0) return;
  const parentPosition = positions.get(cluster.parentId);
  if (!parentPosition) return;

  const bounds = clusterBounds(cluster, positions);
  if (!bounds) return;

  const parentCenter = nodeCenterX(parentPosition);
  const groupCenter = (bounds.left + bounds.right) / 2;
  const shift = parentCenter - groupCenter;
  if (Math.abs(shift) < 1) return;

  const shiftedLeft = bounds.left + shift;
  const shiftedRight = bounds.right + shift;

  for (const other of clusters) {
    if (other === cluster) continue;
    const otherBounds = clusterBounds(other, positions);
    if (!otherBounds) continue;
    if (shiftedLeft < otherBounds.right + LAYOUT_NODE_GAP_X && shiftedRight > otherBounds.left - LAYOUT_NODE_GAP_X) {
      return;
    }
  }

  for (const node of cluster.nodes) {
    if (savedPositions[node.id]) continue;
    const current = positions.get(node.id);
    if (!current) continue;
    positions.set(node.id, { x: current.x + shift, y: current.y });
  }
  cluster.placedLeft += shift;
}

function centerParentOverChildren(
  parentId: string,
  childrenByParent: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
  savedPositions: Record<string, { x: number; y: number }>,
): void {
  if (savedPositions[parentId]) return;
  const parentPosition = positions.get(parentId);
  if (!parentPosition) return;

  const childBounds = (childrenByParent.get(parentId) ?? [])
    .map((childId) => positions.get(childId))
    .filter((position): position is { x: number; y: number } => position !== undefined);
  if (!childBounds.length) return;

  const left = Math.min(...childBounds.map((position) => position.x));
  const right = Math.max(...childBounds.map((position) => nodeRightX(position)));
  const groupCenter = (left + right) / 2;
  positions.set(parentId, {
    x: groupCenter - LAYOUT_NODE_WIDTH / 2,
    y: parentPosition.y,
  });
}

function enforceRowMinimumSpacing(
  rowNodes: GraphQueryResponse["nodes"][number][],
  y: number,
  positions: Map<string, { x: number; y: number }>,
  savedPositions: Record<string, { x: number; y: number }>,
): void {
  const sorted = [...rowNodes]
    .filter((node) => positions.has(node.id))
    .sort((a, b) => (positions.get(a.id)?.x ?? 0) - (positions.get(b.id)?.x ?? 0));

  let cursorX = LAYOUT_START_X;
  for (const node of sorted) {
    const saved = savedPositions[node.id];
    if (saved) {
      positions.set(node.id, saved);
      cursorX = Math.max(cursorX, saved.x + LAYOUT_NODE_SPACING);
      continue;
    }
    const current = positions.get(node.id);
    if (!current) continue;
    const x = Math.max(cursorX, current.x);
    positions.set(node.id, { x, y });
    cursorX = x + LAYOUT_NODE_SPACING;
  }
}

function layoutRowParentCentered(
  graphName: string | undefined,
  rowNodes: GraphQueryResponse["nodes"][number][],
  nodeById: Map<string, GraphQueryResponse["nodes"][number]>,
  parentsByChild: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
  savedPositions: Record<string, { x: number; y: number }>,
  y: number,
): void {
  const clusters = buildParentCenteredClusters(graphName, rowNodes, nodeById, parentsByChild, positions);
  resolveClusterOverlaps(clusters, y, positions, savedPositions);
  for (const cluster of clusters) {
    nudgeClusterTowardParent(cluster, clusters, positions, savedPositions, y);
  }
  enforceRowMinimumSpacing(rowNodes, y, positions, savedPositions);
}

function layoutHierarchy(
  graphData: GraphQueryResponse,
  savedPositions: Record<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const nodeById = new Map(graphData.nodes.map((node) => [node.id, node] as const));
  const { childrenByParent, parentsByChild } = buildParentChildMaps(graphData);

  const byLevel = new Map<number, GraphQueryResponse["nodes"][number][]>();
  for (const node of graphData.nodes) {
    const level = getGraphNodeLevel(graphData.name, node);
    const bucket = byLevel.get(level) ?? [];
    bucket.push(node);
    byLevel.set(level, bucket);
  }

  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  if (levels.length === 0) return positions;

  const rootLevel = levels[0] ?? 0;
  const rootNodes = [...(byLevel.get(rootLevel) ?? [])].sort((a, b) => compareNodesForLayout(graphData.name, a, b));
  rootNodes.forEach((node, index) => {
    const saved = savedPositions[node.id];
    if (saved) {
      positions.set(node.id, saved);
      return;
    }
    positions.set(node.id, {
      x: LAYOUT_START_X + index * LAYOUT_NODE_SPACING,
      y: getLayoutY(graphData.name, node, rootLevel),
    });
  });

  for (const level of levels) {
    if (level === rootLevel) continue;

    const levelNodes = byLevel.get(level) ?? [];
    const nodesByRow = new Map<number, GraphQueryResponse["nodes"][number][]>();
    for (const node of levelNodes) {
      const y = getLayoutY(graphData.name, node, level);
      const bucket = nodesByRow.get(y) ?? [];
      bucket.push(node);
      nodesByRow.set(y, bucket);
    }

    for (const [y, rowNodes] of [...nodesByRow.entries()].sort(([a], [b]) => a - b)) {
      layoutRowParentCentered(graphData.name, rowNodes, nodeById, parentsByChild, positions, savedPositions, y);
    }
  }

  for (let level = Math.max(...levels) - 1; level >= rootLevel; level -= 1) {
    for (const parent of byLevel.get(level) ?? []) {
      centerParentOverChildren(parent.id, childrenByParent, positions, savedPositions);
    }
  }

  for (const [nodeId, saved] of Object.entries(savedPositions)) {
    if (saved) positions.set(nodeId, saved);
  }

  return positions;
}

export function buildIntentAwareLayout({
  graphData,
  savedPositions,
}: IntentAwareLayoutInput): Array<{
  node: GraphQueryResponse["nodes"][number];
  position: { x: number; y: number };
}> {
  const positions = layoutHierarchy(graphData, savedPositions);

  return graphData.nodes.map((node) => ({
    node,
    position: positions.get(node.id) ?? getIntentAwareNodePosition(node.nodeType, 0, savedPositions[node.id], graphData.name),
  }));
}
