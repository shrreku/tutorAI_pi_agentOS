import { describe, expect, it } from "vitest";
import { resolveClaimGraph } from "./claim-graph-resolution.js";

describe("resolveClaimGraph", () => {
  it("marks claims below confidence threshold", () => {
    const resolved = resolveClaimGraph({
      notebookId: "nb_1",
      sourceId: "src_a",
      ingestionSourceId: "src_a",
      nowMs: 100,
      newClaims: [
        {
          id: "clm_low",
          claimText: "Weak claim",
          claimType: "fact",
          conceptIds: [],
          evidenceChunkIds: [],
          confidenceComponents: {
            sourceSupport: 0.1,
            extractionConfidence: 0.1,
            recency: 0.1,
            contradictionPenalty: 0.5,
            humanApproval: 0,
            reinforcementSignal: 0,
          },
        },
      ],
      existingClaims: [],
      contradictionEdges: [],
      nextRelationId: () => "gre_test",
    });

    expect(resolved.claims[0]!.resolution.kind).toBe("low_confidence");
    expect(resolved.warnings.some((w) => w.code === "claim.low_confidence")).toBe(true);
  });
});
