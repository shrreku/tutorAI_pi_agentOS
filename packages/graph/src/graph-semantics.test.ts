import { describe, expect, it } from "vitest";
import { allGraphRelationSemantics, graphRelationSemantics, learnerVisibleRelationLabel, normalizeGraphRelationKind } from "@studyagent/schemas";

describe("graph semantics registry", () => {
  it.each([
    ["depends_on", "DEPENDS_ON", "source_to_target", "depends on"],
    ["supports", "COVERS", "source_to_target", "supports"],
    ["contradicts", "CONTRADICTS", "bidirectional", null],
    ["elaborates", "DERIVED_FROM", "source_to_target", "elaborates"],
    ["cites", "CITES", "source_to_target", "cites"],
    ["covers", "COVERS", "source_to_target", "covers"],
    ["contains_page", "CONTAINS_PAGE", "source_to_target", "includes page"],
    ["plans", "PLANS", "source_to_target", "plans"],
  ])("%s maps to one projection/search/canvas contract", (kind, neo4jType, direction, label) => {
    expect(graphRelationSemantics(kind)).toMatchObject({ neo4jType, direction, learnerLabel: label });
  });

  it("fails closed for unknown learner relation labels", () => {
    expect(graphRelationSemantics("debug_only")).toBeNull();
    expect(learnerVisibleRelationLabel("debug_only")).toBeNull();
    expect(learnerVisibleRelationLabel("contradicts")).toBeNull();
  });

  it("does not expose internal-only relation kinds to learners", () => {
    expect(learnerVisibleRelationLabel("depends_on")).toBe("depends on");
    expect(learnerVisibleRelationLabel("internal_projection_edge")).toBeNull();
    expect(graphRelationSemantics("internal_projection_edge")).toBeNull();
  });

  it("normalizes Neo4j type aliases to canonical kinds", () => {
    expect(normalizeGraphRelationKind("DEPENDS_ON")).toBe("depends_on");
    expect(normalizeGraphRelationKind("CITES")).toBe("cites");
    expect(normalizeGraphRelationKind("NEXT_OBJECTIVE")).toBe("next_objective");
  });

  it.each([
    ["plans", "PLANS", "plans"],
    ["next_objective", "NEXT_OBJECTIVE", "next objective"],
    ["has_topic", "HAS_TOPIC", "has topic"],
    ["supersedes", "SUPERSEDES", null],
  ])("%s maps through the registry contract", (kind, neo4jType, label) => {
    expect(graphRelationSemantics(kind)).toMatchObject({ neo4jType, learnerLabel: label });
    if (label === null) {
      expect(learnerVisibleRelationLabel(kind)).toBeNull();
    }
  });

  it("covers every canonical relation kind in the registry snapshot", () => {
    const canonical = allGraphRelationSemantics().map((entry) => entry.canonical).sort();
    expect(canonical).toEqual([
      "cites",
      "contains",
      "contains_concept",
      "contains_page",
      "contradicts",
      "covers",
      "depends_on",
      "derived_from",
      "elaborates",
      "example_of",
      "has_topic",
      "next_objective",
      "plans",
      "supersedes",
      "supports",
    ]);
  });
});
