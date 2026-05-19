import { describe, expect, it } from "vitest";
import { extractHumanBlocks } from "./page-blocks.js";
import {
  buildConceptPageMarkdown,
  compileSourceToWikiChangeSet,
  normalizeSourceSummaryMarkdown,
  type CompileSourceWikiInput,
} from "./source-compilation.js";
import type { WikiChangeSet } from "./wiki-change-set.js";

let seq = 0;
function seqId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}

function baseFixture(overrides: Partial<CompileSourceWikiInput> = {}): CompileSourceWikiInput {
  seq = 0;
  return {
    notebookId: "nb_test",
    sourceId: "src_a",
    sourceVersionId: "sv_1",
    sourceTitle: "Thermodynamics Intro",
    chunkIds: ["chk_1", "chk_2"],
    extraction: {
      concepts: [{ name: "Entropy", conceptType: "term" }],
      claims: [
        {
          claimText: "Entropy increases in isolated systems.",
          conceptNames: ["Entropy"],
          evidenceChunkId: "chk_1",
        },
      ],
      relations: [],
      sourceSummaryMarkdown: "## Overview\n\nEntropy and heat flow.",
    },
    existingConcepts: [],
    existingClaims: [],
    priorWikiPages: [],
    nextId: seqId,
    now: new Date("2026-05-15T12:00:00.000Z"),
    ...overrides,
  };
}

describe("Source-to-LLM-Wiki compilation (ticket 9)", () => {
  it("compiles a source fixture into a wiki change set without database access", () => {
    const result = compileSourceToWikiChangeSet(baseFixture());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { changeSet } = result;
    expect(changeSet.concepts).toHaveLength(1);
    expect(changeSet.concepts[0]!.action).toBe("create");
    expect(changeSet.claims).toHaveLength(1);
    expect(changeSet.claims[0]!.evidenceRefs[0]).toEqual({ kind: "source_chunk", chunkId: "chk_1" });
    expect(changeSet.wikiPages.some((p) => p.pageType === "source_summary")).toBe(true);
    expect(changeSet.wikiPages.some((p) => p.pageType === "concept")).toBe(true);
    expect(changeSet.warnings).toBeDefined();
    expect(changeSet.fingerprint).toMatch(/^wcs_/);
  });

  it("returns structured reasons when compilation cannot proceed", () => {
    const noChunks = compileSourceToWikiChangeSet(baseFixture({ chunkIds: [] }));
    expect(noChunks.ok).toBe(false);
    if (noChunks.ok) return;
    expect(noChunks.reasons[0]!.code).toBe("no_source_chunks");

    const empty = compileSourceToWikiChangeSet(
      baseFixture({
        extraction: { concepts: [], claims: [], relations: [], sourceSummaryMarkdown: "" },
      }),
    );
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.reasons[0]!.code).toBe("empty_extraction");
  });

  it("is idempotent for unchanged extraction and human blocks", () => {
    const input = baseFixture();
    const first = compileSourceToWikiChangeSet(input);
    const second = compileSourceToWikiChangeSet(input);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.changeSet.fingerprint).toBe(second.changeSet.fingerprint);
  });
});

describe("human block preservation (ticket 10)", () => {
  it("preserves human blocks when generated content changes", () => {
    const priorMd = [
      "# Entropy",
      "",
      '<!-- studyagent:owner=human id="notes" -->',
      "Learner note: think about disorder.",
      "<!-- studyagent:end -->",
    ].join("\n");

    const first = compileSourceToWikiChangeSet(
      baseFixture({
        priorWikiPages: [{ pageKey: "concept:cnc_1", pageType: "concept", markdown: priorMd }],
        existingConcepts: [{ id: "cnc_1", canonicalName: "Entropy" }],
        extraction: {
          concepts: [{ name: "Entropy" }],
          claims: [],
          relations: [],
          sourceSummaryMarkdown: "v1",
        },
      }),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const conceptPage = first.changeSet.wikiPages.find((p) => p.pageKey === "concept:cnc_1");
    expect(conceptPage?.blocks.some((b) => b.origin === "human" && b.id === "notes")).toBe(true);
    expect(conceptPage?.markdown).toContain("Learner note");

    const second = compileSourceToWikiChangeSet(
      baseFixture({
        priorWikiPages: [{ pageKey: "concept:cnc_1", pageType: "concept", markdown: priorMd }],
        existingConcepts: [{ id: "cnc_1", canonicalName: "Entropy" }],
        extraction: {
          concepts: [{ name: "Entropy" }],
          claims: [{ claimText: "New claim about entropy.", conceptNames: ["Entropy"] }],
          relations: [],
          sourceSummaryMarkdown: "v2 summary",
        },
      }),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const page2 = second.changeSet.wikiPages.find((p) => p.pageKey === "concept:cnc_1");
    expect(page2?.markdown).toContain("Learner note");
    expect(page2?.blocks.some((b) => b.origin === "generated")).toBe(true);
    expect(page2?.blocks.some((b) => b.origin === "human")).toBe(true);
  });

  it("marks generated vs human-authored blocks in the change set", () => {
    const result = compileSourceToWikiChangeSet(
      baseFixture({
        priorWikiPages: [
          {
            pageKey: "source:src_a",
            pageType: "source_summary",
            markdown: [
              "## Old",
              '<!-- studyagent:owner=human id="summary-note" -->',
              "Human summary",
              "<!-- studyagent:end -->",
            ].join("\n"),
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const summary = result.changeSet.wikiPages.find((p) => p.pageType === "source_summary");
    expect(summary?.blocks.filter((b) => b.origin === "human")).toHaveLength(1);
    expect(summary?.blocks.filter((b) => b.origin === "generated")).toHaveLength(1);
  });

  it("does not drop human blocks when replacing generated concept pages", () => {
    const result = compileSourceToWikiChangeSet(baseFixture());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.deleteWikiPageKeys.length).toBeGreaterThanOrEqual(0);
    const humanOnly = extractHumanBlocks(
      [
        '<!-- studyagent:owner=human id="x" -->',
        "kept",
        "<!-- studyagent:end -->",
      ].join("\n"),
    );
    expect(humanOnly).toHaveLength(1);
  });
});

describe("claim conflict and supersession (ticket 11)", () => {
  it("supersedes duplicate cross-source claims", () => {
    const result = compileSourceToWikiChangeSet(
      baseFixture({
        existingClaims: [
          {
            id: "clm_old",
            sourceId: "src_other",
            claimText: "Entropy increases in isolated systems",
            createdAtMs: 1,
            status: "candidate",
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.claimPatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimId: "clm_old",
          status: "superseded",
          resolution: expect.objectContaining({ kind: "superseded" }),
        }),
      ]),
    );
    expect(result.changeSet.graphRelations.some((r) => r.relationType === "supersedes")).toBe(true);
    expect(result.changeSet.events.some((e) => e.eventType === "wiki.claim.superseded")).toBe(true);
  });

  it("resolves contradictory claims from concept-level contradicts edges", () => {
    const result = compileSourceToWikiChangeSet(
      baseFixture({
        extraction: {
          concepts: [{ name: "Heat" }, { name: "Cold" }],
          claims: [
            { claimText: "Heat always flows to cold regions.", conceptNames: ["Heat"] },
            { claimText: "Cold regions never receive heat.", conceptNames: ["Cold"] },
          ],
          relations: [{ fromConcept: "Heat", toConcept: "Cold", relationType: "contradicts" }],
          sourceSummaryMarkdown: "Summary",
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.claims.some((c) => c.status === "contradicted")).toBe(true);
    expect(result.changeSet.graphRelations.some((r) => r.relationType === "contradicts")).toBe(true);
    expect(result.changeSet.warnings.some((w) => w.code === "claim.contradiction_resolved")).toBe(true);
  });

  it("warns on duplicate normalized new claims", () => {
    const result = compileSourceToWikiChangeSet(
      baseFixture({
        extraction: {
          concepts: [{ name: "Entropy" }],
          claims: [
            { claimText: "Same fact.", conceptNames: ["Entropy"] },
            { claimText: "Same fact!", conceptNames: ["Entropy"] },
          ],
          relations: [],
          sourceSummaryMarkdown: "S",
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.warnings.some((w) => w.code === "duplicate_normalized_claim")).toBe(true);
  });

  it("flags low-confidence claims with resolution metadata", () => {
    const result = compileSourceToWikiChangeSet(baseFixture());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lowConfidence = result.changeSet.claims.find((c) => c.resolution.kind === "low_confidence");
    if (lowConfidence) {
      expect(result.changeSet.warnings.some((w) => w.code === "claim.low_confidence")).toBe(true);
    }
  });

  it("concept pages keep claim ids in metadata but not learner markdown", () => {
    const result = compileSourceToWikiChangeSet(baseFixture());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const claimId = result.changeSet.claims[0]!.id;
    const conceptPage = result.changeSet.wikiPages.find((p) => p.pageType === "concept");
    expect(conceptPage?.sourceClaimIds).toContain(claimId);
    expect(conceptPage?.markdown).not.toContain(claimId);
    expect(conceptPage?.markdown).not.toMatch(/claim\s*`/i);
  });
});

describe("learner-readable wiki pages (tickets 1-2)", () => {
  it("renders concept pages without claim ids or debug labels", () => {
    const markdown = buildConceptPageMarkdown("Entropy", [
      { id: "clm_hidden", text: "Entropy measures disorder in isolated systems.", confidence: 0.82 },
    ]);
    expect(markdown).toContain("## Definition");
    expect(markdown).toContain("Entropy measures disorder");
    expect(markdown).not.toContain("clm_hidden");
    expect(markdown).not.toContain("claim");
  });

  it("uses learner-safe support language for weak claims", () => {
    const markdown = buildConceptPageMarkdown("Heat", [
      { id: "clm_1", text: "Heat flows from hot to cold.", confidence: 0.3 },
    ]);
    expect(markdown).toContain("Needs more source support");
  });

  it("normalizes source summary markdown with readable headings", () => {
    expect(normalizeSourceSummaryMarkdown("Entropy increases in closed systems.", "Thermo Notes")).toContain(
      "## Overview",
    );
  });

  it("compiles a large source fixture with multiple concepts and topics", () => {
    const result = compileSourceToWikiChangeSet(
      baseFixture({
        extraction: {
          concepts: [
            { name: "Entropy", conceptType: "term" },
            { name: "Enthalpy", conceptType: "term" },
            { name: "Heat capacity", conceptType: "term" },
          ],
          claims: [
            {
              claimText: "Entropy increases in isolated systems.",
              conceptNames: ["Entropy"],
              evidenceChunkId: "chk_1",
            },
            {
              claimText: "Enthalpy tracks heat at constant pressure.",
              conceptNames: ["Enthalpy"],
              evidenceChunkId: "chk_2",
            },
            {
              claimText: "Heat capacity depends on material and temperature.",
              conceptNames: ["Heat capacity"],
              evidenceChunkId: "chk_1",
            },
          ],
          relations: [{ fromConcept: "Entropy", toConcept: "Enthalpy", relationType: "depends_on" }],
          sourceSummaryMarkdown: "Thermodynamics overview across entropy, enthalpy, and heat capacity.",
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.wikiPages[0]?.pageType).toBe("topic");
    expect(result.changeSet.wikiPages[0]?.title).toBe("Topic · Thermodynamics Intro");
    expect(result.changeSet.wikiPages.filter((page) => page.pageType === "concept")).toHaveLength(3);
    expect(result.changeSet.wikiPages.some((page) => page.pageType === "source_summary")).toBe(true);
    for (const page of result.changeSet.wikiPages) {
      expect(page.markdown).not.toMatch(/claim\s*`/i);
      expect(page.markdown).not.toMatch(/clm_/);
    }
  });

  it("limits concept pages to the top batch when requested", () => {
    const result = compileSourceToWikiChangeSet(
      baseFixture({
        maxConceptPages: 2,
        extraction: {
          concepts: [{ name: "Entropy" }, { name: "Enthalpy" }, { name: "Heat capacity" }],
          claims: [
            { claimText: "Entropy increases in isolated systems.", conceptNames: ["Entropy"], evidenceChunkId: "chk_1" },
            { claimText: "Entropy and enthalpy are linked.", conceptNames: ["Entropy", "Enthalpy"], evidenceChunkId: "chk_1" },
            { claimText: "Enthalpy tracks heat at constant pressure.", conceptNames: ["Enthalpy"], evidenceChunkId: "chk_2" },
          ],
          relations: [],
          sourceSummaryMarkdown: "Batch-limited summary.",
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const conceptPages = result.changeSet.wikiPages.filter((page) => page.pageType === "concept");
    expect(conceptPages).toHaveLength(2);
    expect(conceptPages.map((page) => page.title)).toEqual(["Concept · Entropy", "Concept · Enthalpy"]);
    expect(result.changeSet.warnings.some((warning) => warning.code === "concept_page_batch_limited")).toBe(true);
  });
});
