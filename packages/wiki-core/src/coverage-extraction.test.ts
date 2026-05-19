import { describe, expect, it } from "vitest";
import {
  extractApplicationItems,
  extractCoverageItems,
  extractDefinitionItems,
  extractDistinctionItems,
  extractExampleItems,
  extractFormulaItems,
  extractHistoricalContextItems,
  extractMisconceptionItems,
  extractNotationItems,
  extractProcedureItems,
  persistCoverageItems,
  type CoverageExtractionContext,
} from "./coverage-extraction.js";

function baseContext(chunkText: string): CoverageExtractionContext {
  return {
    notebookId: "nb_1",
    sourceId: "src_1",
    sourceVersionId: "sv_1",
    conceptId: "concept_1",
    chunkText,
    headingPath: ["Chapter 1", "Core Ideas"],
  };
}

describe("coverage extraction", () => {
  it("extracts across all configured item families", () => {
    const ctx = baseContext(`
Derivative = instantaneous rate of change.
      Let x be the input variable.
      Equation 1: d/dx (x^n) = n x^(n-1)
1. Compute the exponent
2. Multiply by the coefficient
3. Reduce exponent by one
      Common misconception: You subtract one from the coefficient.
      Difference between speed and velocity is critical here.
      Example: f(x)=x^3, derivative is 3x^2.
      This concept can be used in optimization.
      Developed by Newton and Leibniz.
    `);

    expect(extractDefinitionItems(ctx).length).toBeGreaterThan(0);
    expect(extractNotationItems(ctx).length).toBeGreaterThan(0);
    expect(extractFormulaItems(ctx).length).toBeGreaterThan(0);
    expect(extractProcedureItems(ctx).length).toBeGreaterThan(0);
    expect(extractMisconceptionItems(ctx).length).toBeGreaterThan(0);
    expect(extractDistinctionItems(ctx).length).toBeGreaterThan(0);
    expect(extractExampleItems(ctx).length).toBeGreaterThan(0);
    expect(extractApplicationItems(ctx).length).toBeGreaterThan(0);
    expect(extractHistoricalContextItems(ctx).length).toBeGreaterThan(0);
  });

  it("deduplicates family/title collisions by confidence", () => {
    const ctx = baseContext("Example: matrix A. Example: matrix A.");
    const all = extractCoverageItems(ctx);
    const keys = new Set(all.map((item) => `${item.itemFamily}:${item.title}`));
    expect(keys.size).toBe(all.length);
  });

  it("persists normalized rows via injected persistence callback", async () => {
    const items = [
      {
        id: "cov_1",
        notebookId: "nb_1",
        itemFamily: "definition" as const,
        title: "Gradient",
        description: "Vector of partial derivatives",
        conceptId: "concept_1",
        claimId: undefined,
        sourceId: "src_1",
        sourceVersionId: "sv_1",
        sourceRefsJson: [{ refType: "source", refId: "src_1" }],
        metadataJson: { extractionMethod: "test" },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const rows: Array<Record<string, unknown>> = [];
    const ids = await persistCoverageItems(items, async (insertRows) => {
      rows.push(...insertRows);
    });

    expect(ids).toHaveLength(items.length);
    expect(rows).toHaveLength(items.length);
    expect(rows[0]?.notebookId).toBe("nb_1");
  });
});

