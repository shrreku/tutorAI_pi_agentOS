import { describe, expect, it } from "vitest";
import type { GraphQueryResponse, SourceWikiTopicGroup } from "@studyagent/schemas";
import {
  buildCurriculumOutline,
  buildIntentAwareLayout,
  collapseObjectiveHistory,
  getIntentAwareNodePosition,
  getLearnerNodeTitle,
  getStickyStudyPlanPosition,
  promoteCurrentPathConcepts,
  isWeakPlanningTitle,
  topicsFromReadModel,
} from "./whiteboard-utils.js";

type TopicLayer = SourceWikiTopicGroup;

function shouldShowNodeByDefault(viewMode: "curriculum" | "study_map" | "source_wiki_map", nodeType: string, isDeveloperMode: boolean): boolean {
  if (isDeveloperMode) return true;
  if (viewMode === "study_map" && ["claim", "source_section", "coverage_item", "coverage_record", "objective_list"].includes(nodeType)) {
    return false;
  }
  if (viewMode === "source_wiki_map" && ["claim", "coverage_item", "coverage_record", "weak_concept", "objective_list", "session_plan"].includes(nodeType)) {
    return false;
  }
  return true;
}

function applyDefaultViewVisibility(
  graphData: GraphQueryResponse,
  viewMode: "curriculum" | "study_map" | "source_wiki_map",
  isDeveloperMode: boolean,
): GraphQueryResponse {
  if (isDeveloperMode) return graphData;
  const nodes = graphData.nodes
    .filter((node) => shouldShowNodeByDefault(viewMode, node.nodeType, isDeveloperMode))
    .filter((node) => {
      if (node.nodeType !== "artifact") return true;
      const artifactType =
        typeof node.properties.artifactType === "string"
          ? node.properties.artifactType
          : typeof node.properties.artifact_type === "string"
            ? node.properties.artifact_type
            : "";
      const status = typeof node.properties.status === "string" ? node.properties.status : "";
      if (["teaching_arc", "study_plan", "session_plan"].includes(artifactType)) return false;
      return !["draft", "failed", "archived", "rejected"].includes(status);
    })
    .map((node) => (isWeakPlanningTitle(typeof node.properties.title === "string" ? node.properties.title : null) || isWeakPlanningTitle(typeof node.properties.canonicalName === "string" ? node.properties.canonicalName : null) ? {
      ...node,
      properties: {
        ...node.properties,
        title:
          ({
            objective_list: "Objective sequence",
            session_plan: "Lesson plan",
            study_plan: "Live Plan",
            studyplan: "Live Plan",
            curriculum_module: "Course module",
            curriculum: "Course",
          } as Record<string, string>)[node.nodeType] ?? "Reference needs review",
        needsReview: true,
      },
    } : node));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = graphData.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  return { ...graphData, nodes, edges };
}

function getTopicTitle(properties: Record<string, unknown>): string {
  const headingPath = properties.headingPath;
  if (!Array.isArray(headingPath) || headingPath.length === 0) return "Ungrouped";
  const [topHeading] = headingPath;
  return typeof topHeading === "string" && topHeading.trim().length > 0 ? topHeading : "Ungrouped";
}

function buildTopicLayer(graphData: GraphQueryResponse, sourceId: string): TopicLayer[] {
  const topicMap = new Map<string, TopicLayer>();
  const topicDetails = new Map<string, { concepts: Set<string>; pages: Set<string> }>();

  const getOrCreateTopic = (topicTitle: string): TopicLayer => {
    const existing = topicMap.get(topicTitle);
    if (existing) return existing;

    const topic: TopicLayer = {
      id: `topic_${topicTitle.replace(/\s+/g, "_").toLowerCase()}`,
      title: topicTitle,
      sourceId,
      conceptCount: 0,
      pageCount: 0,
      conceptIds: [],
      pageIds: [],
      defaultOpenNodeId: null,
      evidenceAvailable: false,
      referenceSurfaceTargets: [],
    };
    topicMap.set(topicTitle, topic);
    topicDetails.set(topicTitle, { concepts: new Set<string>(), pages: new Set<string>() });
    return topic;
  };

  for (const node of graphData.nodes) {
    if (node.nodeType !== "concept") continue;
    const topicTitle = getTopicTitle(node.properties);
    const topic = getOrCreateTopic(topicTitle);
    const detail = topicDetails.get(topicTitle)!;
    topic.conceptCount += 1;
    detail.concepts.add(node.id);
  }

  for (const node of graphData.nodes) {
    if (node.nodeType !== "wiki_page") continue;
    const topicTitle = getTopicTitle(node.properties);
    const topic = getOrCreateTopic(topicTitle);
    const detail = topicDetails.get(topicTitle)!;
    topic.pageCount += 1;
    detail.pages.add(node.id);
  }

  for (const [topicTitle, detail] of topicDetails.entries()) {
    const topic = topicMap.get(topicTitle);
    if (!topic) continue;
    topic.conceptIds = Array.from(detail.concepts);
    topic.pageIds = Array.from(detail.pages);
  }

  return Array.from(topicMap.values());
}

describe("whiteboard utils", () => {
  it("hides low-signal nodes in study map learner mode", () => {
    expect(shouldShowNodeByDefault("study_map", "claim", false)).toBe(false);
    expect(shouldShowNodeByDefault("study_map", "source_section", false)).toBe(false);
    expect(shouldShowNodeByDefault("study_map", "concept", false)).toBe(true);
  });

  it("keeps all nodes visible in developer mode", () => {
    expect(shouldShowNodeByDefault("study_map", "claim", true)).toBe(true);
  });

  it("filters graph data consistently with visibility defaults", () => {
    const graph = {
      nodes: [
        { id: "n1", nodeType: "claim", labels: [], properties: {} },
        { id: "n2", nodeType: "concept", labels: [], properties: {} },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", type: "supports", properties: {} }],
    };
    const filtered = applyDefaultViewVisibility(graph as never, "study_map", false);
    expect(filtered.nodes.map((node) => node.id)).toEqual(["n2"]);
    expect(filtered.edges).toHaveLength(0);
  });

  it("computes upper-middle sticky study-plan position", () => {
    const pos = getStickyStudyPlanPosition(1200);
    expect(pos.left).toBeGreaterThan(300);
    expect(pos.left).toBeLessThan(500);
  });

  it("collapses completed objective history in study-map mode", () => {
    const graph = {
      name: "study_map",
      notebookId: "nb_1",
      nodes: [
        { id: "plan_1", nodeType: "study_plan", labels: [], properties: { currentObjectiveId: "obj_current" } },
        { id: "obj_current", nodeType: "objective", labels: [], properties: { status: "in_progress" } },
        { id: "obj_done", nodeType: "objective", labels: [], properties: { status: "completed" } },
      ],
      edges: [
        { id: "e1", source: "plan_1", target: "obj_current", relationType: "plans", properties: {} },
        { id: "e2", source: "plan_1", target: "obj_done", relationType: "plans", properties: {} },
      ],
    };
    const collapsed = collapseObjectiveHistory(graph as never);
    expect(collapsed.nodes.map((node) => node.id)).toEqual(["plan_1", "obj_current"]);
    expect(collapsed.edges).toHaveLength(1);
  });

  it("positions study-map planning nodes in deterministic lanes", () => {
    expect(getIntentAwareNodePosition("curriculum", 0, undefined)).toEqual({ x: 80, y: 60 });
    expect(getIntentAwareNodePosition("objective", 2, undefined)).toEqual({ x: 860, y: 340 });
    expect(getIntentAwareNodePosition("concept", 7, undefined)).toEqual({ x: 210, y: 160 });
    expect(getIntentAwareNodePosition("objective", 2, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });

  it("builds topic layers from heading paths and source pages", () => {
    const graph = {
      name: "source_wiki_map",
      notebookId: "nb_1",
      nodes: [
        { id: "c1", nodeType: "concept", labels: [], properties: { headingPath: ["Linear Algebra"] } },
        { id: "c2", nodeType: "concept", labels: [], properties: { headingPath: ["Linear Algebra"] } },
        { id: "p1", nodeType: "wiki_page", labels: [], properties: { headingPath: ["Linear Algebra"] } },
      ],
      edges: [
        { id: "e1", source: "c1", target: "p1", relationType: "cites", properties: {} },
      ],
    };

    const topics = buildTopicLayer(graph as never, "source_1");
    expect(topics).toHaveLength(1);
    expect(topics[0]?.title).toBe("Linear Algebra");
    expect(topics[0]?.conceptCount).toBe(2);
    expect(topics[0]?.pageCount).toBe(1);
    expect(topics[0]?.conceptIds).toEqual(["c1", "c2"]);
    expect(topics[0]?.pageIds).toEqual(["p1"]);
  });

  it("promotes current-path concepts and collapses the rest", () => {
    const graph = {
      name: "study_map",
      notebookId: "nb_1",
      nodes: [
        { id: "obj_1", nodeType: "objective", labels: [], properties: { status: "completed" } },
        { id: "c1", nodeType: "concept", labels: [], properties: {} },
        { id: "c2", nodeType: "concept", labels: [], properties: {} },
      ],
      edges: [{ id: "e1", source: "c1", target: "c2", relationType: "related_to", properties: {} }],
    };

    const promoted = promoteCurrentPathConcepts(graph as never, ["c1"]);
    const concept1 = promoted.nodes.find((node) => node.id === "c1");
    const concept2 = promoted.nodes.find((node) => node.id === "c2");
    const objective = promoted.nodes.find((node) => node.id === "obj_1");

    expect(concept1?.properties.promoted).toBe(true);
    expect(concept1?.properties.collapsed).toBe(false);
    expect(concept2).toBeUndefined();
    expect(objective).toBeUndefined();
    expect(promoted.edges).toEqual([]);
  });

  it("builds source-wiki clustered layout lanes by topic", () => {
    const graph = {
      name: "source_wiki_map",
      notebookId: "nb_1",
      nodes: [
        { id: "src1", nodeType: "source", labels: [], properties: { headingPath: ["Linear Algebra"] } },
        { id: "c1", nodeType: "concept", labels: [], properties: { headingPath: ["Linear Algebra"] } },
        { id: "p1", nodeType: "wiki_page", labels: [], properties: { headingPath: ["Linear Algebra"] } },
        { id: "c2", nodeType: "concept", labels: [], properties: { headingPath: ["Calculus"] } },
      ],
      edges: [],
    };

    const layout = buildIntentAwareLayout({ graphData: graph as never, savedPositions: {} });
    const byId = Object.fromEntries(layout.map((entry) => [entry.node.id, entry.position]));
    expect(byId["src1"]?.x).toBe(80);
    expect(byId["c1"]?.x).toBe(620);
    expect(byId["p1"]?.x).toBe(900);
    expect(byId["c2"]?.y).toBeGreaterThan(byId["c1"]?.y ?? 0);
  });

  it("reads source wiki topics from the workspace read model", () => {
    const topics = topicsFromReadModel(
      {
        name: "source_wiki_map",
        notebookId: "nb_1",
        nodes: [],
        edges: [],
        readModel: {
          topics: [
            {
              id: "topic_linear_algebra",
              title: "Linear Algebra",
              sourceId: "source_1",
              conceptCount: 2,
              pageCount: 1,
              conceptIds: ["c1", "c2"],
              pageIds: ["p1"],
              relationships: [],
            },
          ],
        },
      } as never,
      "source_1",
    );
    expect(topics).toHaveLength(1);
    expect(topics[0]?.title).toBe("Linear Algebra");
  });

  it("builds a readable curriculum outline from graph nodes", () => {
    const graph = {
      name: "study_map",
      notebookId: "nb_1",
      nodes: [
        { id: "cur_1", nodeType: "curriculum", labels: [], properties: { title: "Heat Transfer" } },
        { id: "mod_1", nodeType: "curriculum_module", labels: [], properties: { title: "Conduction", summary: "Core conduction ideas." } },
        { id: "obj_1", nodeType: "objective", labels: [], properties: { title: "Explain Fourier's law", status: "active" } },
        { id: "art_1", nodeType: "artifact", labels: [], properties: { title: "Formula sheet" } },
        { id: "sess_1", nodeType: "session_plan", labels: [], properties: { title: "Fourier lesson" } },
        { id: "concept_1", nodeType: "concept", labels: [], properties: { canonicalName: "Heat flux" } },
      ],
      edges: [
        { id: "e1", source: "cur_1", target: "mod_1", relationType: "contains", properties: {} },
        { id: "e2", source: "mod_1", target: "obj_1", relationType: "contains", properties: {} },
        { id: "e3", source: "obj_1", target: "art_1", relationType: "supports", properties: {} },
        { id: "e4", source: "obj_1", target: "sess_1", relationType: "plans", properties: {} },
        { id: "e5", source: "obj_1", target: "concept_1", relationType: "covers", properties: {} },
      ],
    };

    const outline = buildCurriculumOutline(graph as never);
    expect(outline.curriculum?.title).toBe("Heat Transfer");
    expect(outline.modules[0]?.title).toBe("Conduction");
    expect(outline.modules[0]?.objectives[0]?.title).toBe("Explain Fourier's law");
    expect(outline.modules[0]?.objectives[0]?.artifactIds).toEqual(["art_1"]);
    expect(outline.modules[0]?.objectives[0]?.sessionIds).toEqual(["sess_1"]);
    expect(outline.modules[0]?.objectives[0]?.conceptIds).toEqual(["concept_1"]);
  });

  it("prefers concept names over raw ids for learner titles", () => {
    expect(
      getLearnerNodeTitle({
        id: "cnc_913ebc3e",
        nodeType: "concept",
        labels: [],
        properties: { name: "Introduction to Conduction" },
      }),
    ).toBe("Introduction to Conduction");
  });
});
