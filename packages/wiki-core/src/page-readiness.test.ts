import { describe, expect, it } from "vitest";
import { interactiveLearningBlockPlanSchema } from "@studyagent/schemas";
import { buildIdempotencyKey, compileBlockPlanToInteractiveBlock } from "./page-generation-contracts.js";
import { derivePageReadiness, learnerPageReadinessLabel } from "./page-readiness.js";

describe("derivePageReadiness", () => {
  it("returns needs_more_source_support without evidence", () => {
    expect(
      derivePageReadiness({
        evidenceCount: 0,
        generationMode: "heuristic",
      }),
    ).toBe("needs_more_source_support");
  });

  it("returns ready_to_study for polished pages with quality and evidence", () => {
    expect(
      derivePageReadiness({
        evidenceCount: 3,
        generationMode: "llm_polished",
        qualityScore: 0.82,
      }),
    ).toBe("ready_to_study");
  });

  it("maps readiness to learner labels", () => {
    expect(
      learnerPageReadinessLabel({
        evidenceCount: 1,
        generationMode: "heuristic",
      }),
    ).toBe("Needs more source support");
  });
});

describe("page generation contracts", () => {
  it("builds stable idempotency keys", () => {
    expect(
      buildIdempotencyKey({
        notebookId: "nb_1",
        targetType: "concept_page",
        pageKey: "concept:cpt_1",
        generationMode: "heuristic",
      }),
    ).toBe("nb_1:concept_page:concept:cpt_1:heuristic:wiki_polish_enqueue");
  });

  it("compiles interactive block plans into schema-valid blocks", () => {
    const plan = interactiveLearningBlockPlanSchema.parse({
      kind: "interactive_learning_block",
      blockKind: "evidence_explorer",
      title: "Inspect Evidence",
      learningPurpose: "Review source excerpts.",
      content: {},
      allowedActions: ["evidence.source_span_opened"],
      evidenceRefs: [
        {
          id: "ev_1",
          kind: "chunk",
          visibility: "learner",
          label: "Excerpt",
          text: "Entropy increases.",
          confidence: null,
          status: null,
          chunkType: null,
          pageStart: null,
          pageEnd: null,
          sourceId: null,
          sourceTitle: null,
          metadata: {},
        },
      ],
      sourceBacked: true,
    });
    const compiled = compileBlockPlanToInteractiveBlock(plan, { blockId: "block_evidence_1" });

    expect(compiled.ok).toBe(true);
    if (compiled.ok) {
      expect(compiled.block.kind).toBe("evidence_explorer");
    }
  });
});
