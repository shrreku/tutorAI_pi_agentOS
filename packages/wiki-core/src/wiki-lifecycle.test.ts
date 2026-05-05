import { describe, expect, it } from "vitest";
import { combineConfidence, reinforcementSignalFromCount } from "./confidence.js";
import { extractHumanBlocks, mergeAgentMarkdownWithHumanBlocks } from "./page-blocks.js";
import { extractClaimIdsFromText, planCrossSourceSupersessions } from "./claim-resolver.js";
import { lintNotebookWiki } from "./wiki-lint.js";

describe("GF-0401 confidence", () => {
  it("combines explainable components", () => {
    const c = combineConfidence({
      sourceSupport: 0.8,
      extractionConfidence: 0.7,
      recency: 0.9,
      contradictionPenalty: 0.1,
      humanApproval: 0,
      reinforcementSignal: reinforcementSignalFromCount(3),
    });
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThanOrEqual(1);
  });
});

describe("GF-0404 page blocks", () => {
  it("extracts and merges human regions", () => {
    const md = [
      "## Agent",
      "",
      '<!-- studyagent:owner=human id="notes" -->',
      "My notes",
      "<!-- studyagent:end -->",
    ].join("\n");
    const blocks = extractHumanBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.body).toContain("My notes");
    const merged = mergeAgentMarkdownWithHumanBlocks("## New agent", blocks);
    expect(merged).toContain("## New agent");
    expect(merged).toContain("My notes");
  });
});

describe("GF-0402 supersession planner", () => {
  it("supersedes older duplicate cross-source", () => {
    const existing = [
      {
        id: "clm_old",
        sourceId: "src_a",
        normalized: "gravity pulls masses",
        createdAtMs: 1,
      },
    ];
    const incoming = [
      {
        id: "clm_new",
        sourceId: "src_b",
        normalized: "gravity pulls masses",
        createdAtMs: 2,
      },
    ];
    const plans = planCrossSourceSupersessions(incoming, existing);
    expect(plans).toEqual([{ olderId: "clm_old", winnerId: "clm_new" }]);
  });
});

describe("GF-0405 claim id extraction", () => {
  it("finds clm ids in tutor text", () => {
    const ids = extractClaimIdsFromText("See claim clm_abcd1234 and also CLM_ABCD1234.");
    expect(ids).toContain("clm_abcd1234");
    expect(ids.length).toBe(1);
  });
});

describe("GF-0403 wiki lint", () => {
  it("flags duplicate concept names", () => {
    const issues = lintNotebookWiki({
      pages: [],
      concepts: [
        { id: "c1", canonicalName: "Foo" },
        { id: "c2", canonicalName: "foo" },
      ],
      claims: [],
      graphRelations: [],
    });
    expect(issues.some((i) => i.code === "duplicate_concepts")).toBe(true);
  });
});
