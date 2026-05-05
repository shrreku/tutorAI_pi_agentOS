import { describe, expect, it } from "vitest";
import { eventEnvelopeSchema, notebookSearchResponseSchema, sourceSchema } from "./index.js";

describe("shared schemas", () => {
  it("validates event envelopes", () => {
    const parsed = eventEnvelopeSchema.parse({
      id: "evt_1",
      notebookId: "nb_1",
      eventType: "source.uploaded",
      sequenceNo: 1,
      createdAt: "2026-05-04T00:00:00.000Z",
      payload: { sourceId: "src_1" },
    });

    expect(parsed.eventType).toBe("source.uploaded");
  });

  it("parses notebook search responses", () => {
    const parsed = notebookSearchResponseSchema.parse({
      mode: "hybrid",
      query: "entropy",
      hits: [
        {
          id: "chk_1",
          type: "chunk",
          title: "Chunk",
          snippet: "Entropy is…",
          score: 0.04,
          scoreDetails: { lexical: 0.1, rrf: 0.02 },
          provenance: [{ refType: "chunk", refId: "chk_1", role: "derived_from" }],
          scoreExplanation: "RRF 0.0200 · lexical 0.100",
          sourceRefs: [{ sourceId: "src_1", sourceVersionId: "sv_1" }],
        },
      ],
    });
    expect(parsed.hits[0]!.type).toBe("chunk");
    expect(parsed.hits[0]!.scoreExplanation).toContain("RRF");
  });

  it("keeps source status explicit for tutoring readiness", () => {
    const parsed = sourceSchema.parse({
      id: "src_1",
      notebookId: "nb_1",
      title: "Linear Algebra Notes",
      sourceType: "pdf",
      originalObjectKey: "sources/src_1/original.pdf",
      status: "tutoring_ready",
      createdAt: "2026-05-04T00:00:00.000Z",
      updatedAt: "2026-05-04T00:00:00.000Z",
    });

    expect(parsed.metadata).toEqual({});
  });
});
