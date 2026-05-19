import { describe, expect, it } from "vitest";
import { mapGraphNodeToNodeRef, mapGraphNodeTypeToRefType } from "./whiteboard-node-ref.js";

describe("whiteboard node-ref mapping", () => {
  it("maps known graph node types to canonical ref types", () => {
    const knownTypes = [
      "source",
      "source_section",
      "topic",
      "concept",
      "weak_concept",
      "claim",
      "curriculum",
      "curriculum_module",
      "objective",
      "objective_list",
      "session_plan",
      "coverage_item",
      "coverage_record",
      "study_plan",
      "wiki_page",
      "artifact",
      "tutor_session",
    ] as const;

    for (const type of knownTypes) {
      const refType = mapGraphNodeTypeToRefType(type);
      expect(refType).not.toBe("whiteboard_node");
    }
  });

  it("maps tutor_session to session", () => {
    expect(mapGraphNodeToNodeRef({ id: "sess_1", nodeType: "tutor_session" })).toEqual({
      refType: "session",
      refId: "sess_1",
    });
  });

  it("maps legacy studyplan type to study_plan", () => {
    expect(mapGraphNodeTypeToRefType("studyplan")).toBe("study_plan");
  });

  it("maps weak concept nodes to the underlying concept ref when available", () => {
    expect(
      mapGraphNodeToNodeRef({
        id: "weak_cnc_1",
        nodeType: "weak_concept",
        properties: { conceptId: "cnc_1" },
      }),
    ).toEqual({
      refType: "concept",
      refId: "cnc_1",
    });
  });

  it("falls back to whiteboard_node for unknown types", () => {
    expect(mapGraphNodeTypeToRefType("unknown_type")).toBe("whiteboard_node");
  });
});
