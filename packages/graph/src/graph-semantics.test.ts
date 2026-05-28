import { describe, expect, it } from "vitest";
import { graphRelationSemantics, learnerVisibleRelationLabel } from "./graph-semantics.js";

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
});
