import { describe, expect, it } from "vitest";
import { entropyFixture } from "./fixtures.js";
import { citationCoverage, meanReciprocalRank, recallAtK } from "./metrics.js";

describe("retrieval eval metrics (GF-0305)", () => {
  it("computes Recall@K and MRR against a frozen oracle ranking", () => {
    const rel = new Set(entropyFixture.relevantChunkIds);
    const r1 = recallAtK(rel, entropyFixture.oracleRankedIds, 1);
    const r2 = recallAtK(rel, entropyFixture.oracleRankedIds, 2);
    expect(r1).toBe(0.5);
    expect(r2).toBe(1);
    expect(meanReciprocalRank(rel, entropyFixture.oracleRankedIds)).toBe(1);
  });

  it("scores citation coverage on ranked provenance", () => {
    const cov = citationCoverage([
      { provenance: [{ refType: "chunk" }] },
      { provenance: [{ refType: "wiki_page" }] },
    ]);
    expect(cov).toBe(0.5);
  });
});
