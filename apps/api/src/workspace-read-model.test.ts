import { describe, expect, it } from "vitest";
import type { GraphCanvasEdge, GraphCanvasNode } from "@studyagent/schemas";
import {
  buildNodeCatalog,
  buildSourceWikiTopicGroups,
  filterCanvasByVisibility,
  loadStudyPlanContext,
  workspaceVisibilityForNode,
} from "./workspace-read-model.js";

const emptyContext = {
  currentObjectiveId: null,
  currentModuleId: null,
  currentPathConceptIds: [],
};

describe("workspace read model visibility", () => {
  it("hides draft artifacts and internal planning types in learner mode", () => {
    expect(
      workspaceVisibilityForNode(
        "study_map",
        {
          id: "art_draft",
          nodeType: "artifact",
          labels: ["Artifact"],
          properties: { artifactType: "note", status: "draft" },
        },
        false,
      ),
    ).toBe("hidden");

    expect(
      workspaceVisibilityForNode(
        "study_map",
        {
          id: "art_ready",
          nodeType: "artifact",
          labels: ["Artifact"],
          properties: { artifactType: "quiz", status: "ready" },
        },
        false,
      ),
    ).toBe("learner");

    expect(
      workspaceVisibilityForNode(
        "study_map",
        {
          id: "plan",
          nodeType: "artifact",
          labels: ["Artifact"],
          properties: { artifactType: "study_plan", status: "ready" },
        },
        false,
      ),
    ).toBe("hidden");
  });

  it("marks low-signal nodes as dev_only in learner mode", () => {
    expect(
      workspaceVisibilityForNode(
        "study_map",
        { id: "c1", nodeType: "claim", labels: [], properties: {} },
        false,
      ),
    ).toBe("dev_only");
    expect(
      workspaceVisibilityForNode(
        "source_wiki_map",
        { id: "c1", nodeType: "claim", labels: [], properties: {} },
        false,
      ),
    ).toBe("dev_only");
    expect(
      workspaceVisibilityForNode(
        "study_map",
        { id: "c1", nodeType: "claim", labels: [], properties: {} },
        true,
      ),
    ).toBe("learner");

    expect(
      workspaceVisibilityForNode(
        "study_map",
        {
          id: "obj_1",
          nodeType: "objective",
          labels: [],
          properties: { title: "Explain conduction", status: "active" },
        },
        false,
      ),
    ).toBe("hidden");

    expect(
      workspaceVisibilityForNode(
        "study_map",
        {
          id: "obj_list_1",
          nodeType: "objective_list",
          labels: [],
          properties: { title: "Session objectives", status: "active" },
        },
        false,
      ),
    ).toBe("dev_only");
  });

  it("filters canvas nodes and edges for learner mode", () => {
    const nodes: GraphCanvasNode[] = [
      { id: "claim_1", nodeType: "claim", labels: [], properties: {} },
      { id: "concept_1", nodeType: "concept", labels: [], properties: { title: "Vectors" } },
    ];
    const edges: GraphCanvasEdge[] = [
      { id: "e1", source: "claim_1", target: "concept_1", relationType: "SUPPORTS", properties: {} },
    ];
    const catalog = buildNodeCatalog("study_map", { nodes }, emptyContext, false);
    const filtered = filterCanvasByVisibility({ nodes, edges }, catalog, false);
    expect(filtered.nodes.map((node) => node.id)).toEqual(["concept_1"]);
    expect(filtered.edges).toHaveLength(0);
  });

  it("only offers reference surface targets for learner-visible nodes", () => {
    const catalog = buildNodeCatalog(
      "study_map",
      {
        nodes: [
          {
            id: "art_draft",
            nodeType: "artifact",
            labels: [],
            properties: { artifactType: "note", status: "draft" },
          },
          {
            id: "concept_1",
            nodeType: "concept",
            labels: [],
            properties: { title: "Vectors" },
          },
        ],
      },
      emptyContext,
      false,
    );
    const draft = catalog.find((entry) => entry.node.id === "art_draft");
    const concept = catalog.find((entry) => entry.node.id === "concept_1");
    expect(draft?.referenceSurfaceTarget).toBeNull();
    expect(concept?.referenceSurfaceTarget).toEqual({ refType: "concept", refId: "concept_1" });
  });
});

describe("source wiki topic groups", () => {
  it("returns topic groups from projected topic nodes", () => {
    const nodes: GraphCanvasNode[] = [
      { id: "src_1", nodeType: "source", labels: [], properties: { title: "Lecture" } },
      {
        id: "topic_kinematics",
        nodeType: "topic",
        labels: [],
        properties: { title: "Kinematics", sourceId: "src_1" },
      },
      {
        id: "topic_page_kinematics",
        nodeType: "wiki_page",
        labels: [],
        properties: { title: "Kinematics", pageType: "topic", sourceId: "src_1" },
      },
      { id: "concept_1", nodeType: "concept", labels: [], properties: { title: "Velocity" } },
      { id: "page_1", nodeType: "wiki_page", labels: [], properties: { title: "Velocity page" } },
    ];
    const edges: GraphCanvasEdge[] = [
      { id: "e0", source: "topic_kinematics", target: "topic_page_kinematics", relationType: "CONTAINS_PAGE", properties: {} },
      { id: "e1", source: "topic_page_kinematics", target: "concept_1", relationType: "CONTAINS_CONCEPT", properties: {} },
      { id: "e2", source: "topic_page_kinematics", target: "page_1", relationType: "CONTAINS_PAGE", properties: {} },
    ];
    const catalog = buildNodeCatalog("source_wiki_map", { nodes }, emptyContext, false);
    const topics = buildSourceWikiTopicGroups({ nodes, edges }, "src_1", catalog);
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      id: "topic_page_kinematics",
      title: "Kinematics",
      conceptIds: ["concept_1"],
      pageIds: ["page_1"],
      defaultOpenNodeId: "concept_1",
      evidenceAvailable: true,
    });
    expect(topics[0]?.referenceSurfaceTargets).toEqual(
      expect.arrayContaining([
        { refType: "concept", refId: "concept_1" },
        { refType: "wiki_page", refId: "page_1" },
      ]),
    );
  });

  it("keeps structural topic nodes visible in source wiki mode so learner edges remain connected", () => {
    expect(
      workspaceVisibilityForNode(
        "source_wiki_map",
        { id: "topic_1", nodeType: "topic", labels: [], properties: { title: "Kinematics" } },
        false,
      ),
    ).toBe("learner");
  });

  it("keeps source wiki learner edges when they route through a topic node", () => {
    const nodes: GraphCanvasNode[] = [
      { id: "src_1", nodeType: "source", labels: [], properties: { title: "Lecture" } },
      { id: "topic_1", nodeType: "topic", labels: [], properties: { title: "Kinematics", sourceId: "src_1" } },
      { id: "concept_1", nodeType: "concept", labels: [], properties: { title: "Velocity" } },
      { id: "page_1", nodeType: "wiki_page", labels: [], properties: { title: "Velocity page" } },
    ];
    const edges: GraphCanvasEdge[] = [
      { id: "e1", source: "src_1", target: "topic_1", relationType: "HAS_TOPIC", properties: {} },
      { id: "e2", source: "topic_1", target: "concept_1", relationType: "CONTAINS_CONCEPT", properties: {} },
      { id: "e3", source: "topic_1", target: "page_1", relationType: "CONTAINS_PAGE", properties: {} },
    ];
    const catalog = buildNodeCatalog("source_wiki_map", { nodes }, emptyContext, false);
    const filtered = filterCanvasByVisibility({ nodes, edges }, catalog, false);
    expect(filtered.nodes.map((node) => node.id)).toEqual(["src_1", "topic_1", "concept_1", "page_1"]);
    expect(filtered.edges.map((edge) => edge.id)).toEqual(["e1", "e2", "e3"]);
  });

});

describe("study map emphasis", () => {
  it("marks current objective and path concepts in the catalog", () => {
    const nodes: GraphCanvasNode[] = [
      { id: "obj_current", nodeType: "objective", labels: [], properties: { title: "Solve equations" } },
      { id: "concept_1", nodeType: "concept", labels: [], properties: { title: "Algebra" } },
    ];
    const edges: GraphCanvasEdge[] = [
      { id: "e1", source: "obj_current", target: "concept_1", relationType: "COVERS", properties: {} },
    ];
    const catalog = buildNodeCatalog(
      "study_map",
      { nodes },
      {
        currentObjectiveId: "obj_current",
        currentModuleId: "mod_1",
        currentPathConceptIds: ["concept_1"],
      },
      false,
    );
    expect(catalog.find((entry) => entry.node.id === "obj_current")?.emphasis).toBe("current_objective");
    expect(catalog.find((entry) => entry.node.id === "concept_1")?.emphasis).toBe("current_path");
    expect(loadStudyPlanContext).toBeDefined();
    void edges;
  });
});
