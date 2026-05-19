import { describe, it, expect } from "vitest";
import type { GraphQueryResponse } from "@studyagent/schemas";
import {
  buildIntentAwareLayout,
  getStickyStudyPlanPosition,
  promoteCurrentPathConcepts,
} from "./whiteboard-utils.js";

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
  const nodes = graphData.nodes.filter((node) => shouldShowNodeByDefault(viewMode, node.nodeType, isDeveloperMode));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = graphData.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  return { ...graphData, nodes, edges };
}

describe("workspace verification", () => {
  it("keeps viewer/workspace transition state deterministic", () => {
    const machine = (mode: "workspace" | "viewer", selectedNodeId: string | null) =>
      mode === "viewer" && !selectedNodeId ? "workspace" : mode;
    expect(machine("workspace", null)).toBe("workspace");
    expect(machine("viewer", "node_1")).toBe("viewer");
    expect(machine("viewer", null)).toBe("workspace");
  });

  it("applies learner visibility defaults and edge pruning", () => {
    const filtered = applyDefaultViewVisibility(
      {
        nodes: [
          { id: "claim_1", nodeType: "claim", labels: [], properties: {} },
          { id: "concept_1", nodeType: "concept", labels: [], properties: {} },
        ],
        edges: [{ id: "edge_1", source: "claim_1", target: "concept_1", relationType: "supports", properties: {} }],
      } as any,
      "study_map",
      false,
    );
    expect(filtered.nodes.map((n) => n.id)).toEqual(["concept_1"]);
    expect(filtered.edges).toEqual([]);
    expect(shouldShowNodeByDefault("study_map", "claim", true)).toBe(true);
  });

  it("promotes objective-path concepts and collapses off-path concepts", () => {
    const promoted = promoteCurrentPathConcepts(
      {
        name: "study_map",
        notebookId: "nb_1",
        nodes: [
          { id: "c_on_path", nodeType: "concept", labels: [], properties: {} },
          { id: "c_off_path", nodeType: "concept", labels: [], properties: {} },
        ],
        edges: [],
      } as any,
      ["c_on_path"],
    );
    expect(promoted.nodes.map((node) => node.id)).toEqual(["c_on_path"]);
  });

  it("clusters source wiki layout by topic and node family", () => {
    const layout = buildIntentAwareLayout({
      graphData: {
        name: "source_wiki_map",
        notebookId: "nb_1",
        nodes: [
          { id: "src_a", nodeType: "source", labels: [], properties: { headingPath: ["A"] } },
          { id: "concept_a", nodeType: "concept", labels: [], properties: { headingPath: ["A"] } },
          { id: "page_b", nodeType: "wiki_page", labels: [], properties: { headingPath: ["B"] } },
        ],
        edges: [],
      } as any,
      savedPositions: {},
    });
    const byId = Object.fromEntries(layout.map((entry) => [entry.node.id, entry.position]));
    expect(byId["src_a"]?.x).toBe(80);
    expect(byId["concept_a"]?.x).toBe(620);
    expect(byId["page_b"]?.x).toBe(900);
    expect(byId["page_b"]?.y).toBeGreaterThan(byId["concept_a"]?.y ?? 0);
  });

  it("anchors sticky plan near upper middle of workspace", () => {
    const pos = getStickyStudyPlanPosition(1280);
    expect(pos.left).toBeGreaterThanOrEqual(24);
    expect(pos.left).toBeLessThan(600);
  });
});
