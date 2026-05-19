import { describe, expect, it } from "vitest";
import { buildWikiPolishQueue, enqueueWikiPagePolishRepair } from "./wiki-polish-queue.js";

function page(
  id: string,
  overrides: Partial<Parameters<typeof buildWikiPolishQueue>[0]["pages"][number]> = {},
) {
  return {
    id,
    pageKey: `concept:${id}`,
    pageType: "concept" as const,
    title: `Concept ${id}`,
    qualityScore: 0.55,
    status: "published",
    sourceId: "src_1",
    sourceChunkIds: ["chk_1"],
    conceptId: id,
    structuredJson: {},
    ...overrides,
  };
}

describe("wiki polish queue", () => {
  it("prioritizes weak-concept pages on a large source", () => {
    const pages = Array.from({ length: 10 }, (_, index) => page(`concept_${index}`));
    const queue = buildWikiPolishQueue({
      pages,
      weakConceptIds: ["concept_2"],
      largeSourceConceptCount: 10,
    });
    expect(queue[0]?.pageRef.refId).toBe("concept_2");
    expect(queue[0]?.reasons).toContain("weak_concept_priority");
    expect(queue[0]?.learnerStatusLabel).not.toMatch(/0\.\d+/);
  });

  it("prioritizes recently used pages", () => {
    const queue = buildWikiPolishQueue({
      pages: [page("concept_a"), page("concept_b")],
      recentlyUsedPageIds: ["concept_b"],
    });
    const recent = queue.find((candidate) => candidate.pageRef.refId === "concept_b");
    expect(recent?.reasons).toContain("recently_used");
  });

  it("skips already polished high-quality pages", () => {
    const queue = buildWikiPolishQueue({
      pages: [
        page("concept_done", {
          qualityScore: 0.9,
          structuredJson: { lastPolishedAt: "2026-05-15T00:00:00.000Z" },
        }),
      ],
    });
    expect(queue[0]?.status).toBe("skipped");
    expect(queue[0]?.learnerStatusLabel).toBe("Ready to study");
  });

  it("enqueues tutor-triggered repair for a missing or weak page", () => {
    const candidate = enqueueWikiPagePolishRepair([page("concept_weak", { qualityScore: 0.4 })], "concept_weak");
    expect(candidate?.status).toBe("queued");
    expect(candidate?.reasons).toContain("tutor_triggered_repair");
    expect(candidate?.learnerStatusLabel).toBe("Improving this page next");
  });
});
