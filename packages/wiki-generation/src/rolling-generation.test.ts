import { describe, expect, it } from "vitest";
import { buildGenerationIdempotencyKey } from "@studyagent/schemas";
import {
  buildHeuristicCurriculumPageMarkdown,
  buildHeuristicModulePageMarkdown,
} from "@studyagent/wiki-core";
import { evaluatePagePolishQuality } from "./wiki-polish-executor.js";
import { resetGenerationTargetCacheForTests } from "./rolling-generation.js";

describe("buildGenerationIdempotencyKey", () => {
  it("builds stable keys for generation targets", () => {
    const key = buildGenerationIdempotencyKey({
      notebookId: "nb_1",
      targetType: "initial_build",
      targetRef: "mod_1",
      generationMode: "initial_build",
      trigger: "initial_build",
    });
    expect(key).toBe("nb_1:initial_build:mod_1:initial_build:initial_build");
  });
});

describe("heuristic wiki pages", () => {
  it("renders a full curriculum outline without debug metadata", () => {
    const page = buildHeuristicCurriculumPageMarkdown({
      curriculumTitle: "Heat transfer path",
      sourceTitles: ["Fourier Notes"],
      activeModuleId: "mod_1",
      modules: [
        { moduleId: "mod_1", title: "Conduction basics", summary: "Foundations" },
        { moduleId: "mod_2", title: "Advanced transfer", summary: "Applications" },
      ],
    });
    const markdown = page.markdown;
    expect(markdown).toContain("Heat transfer path");
    expect(markdown).toContain("Conduction basics");
    expect(markdown).toContain("Advanced transfer");
    expect(markdown).not.toMatch(/clm_/i);
  });

  it("marks later modules as outline shells", () => {
    const page = buildHeuristicModulePageMarkdown({
      moduleTitle: "Advanced transfer",
      summary: "Applications module",
      sourceSections: ["Chapter 2"],
      topics: [{ id: "topic_1", name: "Radiation" }],
      concepts: [{ id: "cnc_1", name: "Radiation" }],
      objectives: [],
    });
    const markdown = page.markdown;
    expect(markdown).toContain("Outline only");
    expect(markdown).toContain("Needs more source support");
  });
});

describe("evaluatePagePolishQuality", () => {
  it("rejects learner-unsafe debug metadata", () => {
    const issues = evaluatePagePolishQuality({
      pageType: "concept",
      markdown: "# Concept\n## Definition\nclm_abc123 is referenced.\n## Intuition\nSource-backed note.\n## Source-backed notes\nEvidence from the source.",
      sourceClaimIds: ["clm_abc123"],
    });
    expect(issues.some((issue) => issue.code === "learner_unsafe_metadata")).toBe(true);
  });

  it("accepts polished concept markdown with source grounding", () => {
    const issues = evaluatePagePolishQuality({
      pageType: "concept",
      markdown: [
        "# Voltage",
        "## Definition",
        "Voltage is electric potential difference.",
        "## Intuition",
        "Think of it as pressure for charge flow.",
        "## Source-backed notes",
        "Evidence from the uploaded source supports this definition.",
        "## Practice prompts",
        "- Explain voltage in your own words.",
      ].join("\n"),
      sourceClaimIds: ["clm_1"],
    });
    expect(issues.some((issue) => issue.severity === "error")).toBe(false);
  });
});

describe("generation target cache", () => {
  it("can be reset between tests", () => {
    resetGenerationTargetCacheForTests();
    expect(true).toBe(true);
  });
});
