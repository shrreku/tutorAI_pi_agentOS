import { describe, expect, it } from "vitest";
import { assembleSearchContextForAgent } from "./assemble-context.js";
import { resolveOpenRouterEmbeddingModelId } from "./embedding-model.js";
import { applyRrfRerankFactors, reciprocalRankFusion, type UnifiedSearchResult } from "./rrf.js";

describe("@studyagent/search", () => {
  it("resolves short Gemini embedding names to OpenRouter model ids", () => {
    expect(resolveOpenRouterEmbeddingModelId("gemini-embedding-2")).toBe("google/gemini-embedding-2-preview");
    expect(resolveOpenRouterEmbeddingModelId("google/gemini-embedding-001")).toBe("google/gemini-embedding-001");
  });

  it("fuses lexical, vector, and graph-style lists with RRF then applies deterministic rerank bumps", () => {
    const a: UnifiedSearchResult = {
      id: "chk_a",
      type: "chunk",
      title: "Chunk",
      snippet: "alpha",
      score: 0.1,
      scoreDetails: { lexical: 0.9, confidence: 0.5 },
      provenance: [{ refType: "chunk", refId: "chk_a", role: "derived_from" }],
    };
    const b: UnifiedSearchResult = {
      id: "cnc_b",
      type: "concept",
      title: "Beta",
      snippet: "beta",
      score: 0.2,
      scoreDetails: { graphLexical: 1, confidence: 0.8 },
      provenance: [{ refType: "concept", refId: "cnc_b", role: "derived_from" }],
    };
    const fused = reciprocalRankFusion([[a], [b]], 60);
    const bumped = applyRrfRerankFactors(fused);
    expect(bumped[0]!.score).toBeGreaterThan(0);
    expect(bumped[0]!.scoreDetails.rerankBump).toBeGreaterThan(0);
  });

  it("assembles deduped agent context with citation handles under a char budget", () => {
    const { body, citations } = assembleSearchContextForAgent(
      [
        {
          id: "x1",
          type: "chunk",
          title: "Chunk",
          snippet: "Hello world",
          score: 1,
          scoreDetails: {},
          provenance: [{ refType: "chunk", refId: "x1", role: "derived_from" }],
        },
        {
          id: "x1",
          type: "chunk",
          title: "Chunk",
          snippet: "dup",
          score: 1,
          scoreDetails: {},
          provenance: [{ refType: "chunk", refId: "x1", role: "derived_from" }],
        },
      ],
      500,
    );
    expect(body).toContain("[chunk:1]");
    expect(body.includes("dup")).toBe(false);
    expect(citations.length).toBeGreaterThan(0);
  });
});
