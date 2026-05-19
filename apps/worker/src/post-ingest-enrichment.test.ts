import { describe, expect, it } from "vitest";
import { compileSourceToWikiChangeSet } from "@studyagent/wiki-core";
import { parseLlmJsonObject } from "./post-ingest-enrichment.js";

describe("wiki change set compilation integration", () => {
  it("produces an apply-ready change set from extraction fixtures", () => {
    const result = compileSourceToWikiChangeSet({
      notebookId: "nb_worker",
      sourceId: "src_worker",
      sourceVersionId: "sv_worker",
      sourceTitle: "Worker Source",
      chunkIds: ["chk_1"],
      extraction: {
        concepts: [{ name: "Voltage" }],
        claims: [{ claimText: "Voltage drives current.", conceptNames: ["Voltage"], evidenceChunkId: "chk_1" }],
        relations: [],
        sourceSummaryMarkdown: "## Summary",
      },
      existingConcepts: [],
      existingClaims: [],
      priorWikiPages: [],
      nextId: (prefix) => `${prefix}test`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.deleteClaimsForSource).toBe(true);
    expect(result.changeSet.wikiPages.length).toBeGreaterThan(0);
  });
});

describe("parseLlmJsonObject", () => {
  it("repairs common invalid markdown/math backslash escapes in LLM JSON", () => {
    const parsed = parseLlmJsonObject('{"sourceSummaryMarkdown":"Use \\$q_x\\$ and \\k for conduction."}') as {
      sourceSummaryMarkdown: string;
    };

    expect(parsed.sourceSummaryMarkdown).toContain("\\$q_x\\$");
    expect(parsed.sourceSummaryMarkdown).toContain("\\k");
  });

  it("extracts JSON from fenced responses", () => {
    expect(parseLlmJsonObject('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });
});
