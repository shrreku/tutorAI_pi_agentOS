import { describe, expect, it } from "vitest";
import {
  buildHeuristicCurriculumPageMarkdown,
  buildHeuristicModulePageMarkdown,
  compileSourceToWikiChangeSet,
} from "@studyagent/wiki-core";
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

describe("rolling baseline heuristic pages", () => {
  it("creates curriculum and module shells for a multi-module outline", () => {
    const curriculumPage = buildHeuristicCurriculumPageMarkdown({
      curriculumTitle: "Physics path",
      sourceTitles: ["Mechanics PDF"],
      activeModuleId: "mod_1",
      modules: [
        { moduleId: "mod_1", title: "Kinematics", summary: "Motion basics" },
        { moduleId: "mod_2", title: "Dynamics", summary: "Forces" },
        { moduleId: "mod_3", title: "Energy", summary: "Work and power" },
      ],
    });
    const moduleOne = buildHeuristicModulePageMarkdown({
      moduleTitle: "Kinematics",
      summary: "Motion basics",
      sourceSections: ["Mechanics PDF"],
      topics: [{ id: "topic_1", name: "Velocity" }],
      concepts: [
        { id: "cnc_1", name: "Velocity" },
        { id: "cnc_2", name: "Acceleration" },
      ],
      objectives: [
        { id: "obj_1", title: "Explain velocity", deepBuilt: true },
        { id: "obj_2", title: "Apply acceleration", deepBuilt: true },
      ],
    });
    const moduleTwo = buildHeuristicModulePageMarkdown({
      moduleTitle: "Dynamics",
      summary: "Forces",
      sourceSections: ["Mechanics PDF"],
      topics: [{ id: "topic_2", name: "Force" }],
      concepts: [{ id: "cnc_3", name: "Force" }],
      objectives: [],
    });

    expect(curriculumPage.markdown).toContain("Module outline");
    expect(moduleOne.markdown).toContain("Explain velocity");
    expect(moduleTwo.markdown).toContain("Outline only");
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
});
