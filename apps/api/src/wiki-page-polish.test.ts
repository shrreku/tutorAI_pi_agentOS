import { describe, expect, it } from "vitest";
import { compileInteractiveBlockPlan, compilePageBlockPlansToInteractiveBlocks } from "@studyagent/wiki-core";
import { polishWikiPage } from "@studyagent/wiki-generation";

const interactivePlanDefaults = {
  prompt: null,
  conceptRefs: [],
  sourceRefs: [],
  objectiveRefs: [],
  surfaceRole: "primary" as const,
  fallbackSummary: null,
  sourceBacked: false,
};

const evidenceRef = {
  id: "ev_1",
  kind: "chunk" as const,
  visibility: "learner" as const,
  label: "Entropy excerpt",
  text: "Entropy increases in isolated systems.",
  confidence: null,
  status: null,
  chunkType: "paragraph",
  pageStart: 1,
  pageEnd: 1,
  sourceTitle: "Thermodynamics",
  sourceId: "src_1",
  sourceVersionId: "sv_1",
  metadata: {},
};

const polishedConceptOutput = {
  title: "Entropy",
  pageKey: "concept:cpt_entropy",
  readiness: "ready_to_study",
  generationMode: "llm_polished",
  markdown: [
    "# Entropy",
    "## Definition",
    "Entropy measures disorder.",
    "## Intuition",
    "More arrangements means higher entropy.",
    "## Formal details",
    "S = k ln W",
    "## Examples",
    "Gas expansion increases entropy.",
    "## Common confusions",
    "Entropy is not the same as energy.",
    "## Source-backed notes",
    "- Entropy increases in isolated systems.",
    "## Practice prompts",
    "- Explain entropy in your own words.",
  ].join("\n\n"),
  blocks: [
    {
      kind: "interactive_learning_block",
      blockKind: "evidence_explorer",
      title: "Inspect Evidence",
      learningPurpose: "Review source excerpts.",
      content: {},
      allowedActions: ["evidence.source_span_opened", "tutor.help_requested"],
      evidenceRefs: [evidenceRef],
      sourceBacked: true,
    },
  ],
  citationsBySection: { source_backed_notes: ["clm_supported"] },
  qualityIssues: [],
  warnings: [],
};

describe("wiki page polish", () => {
  it("compiles evidence explorer block plans", () => {
    const block = compileInteractiveBlockPlan(
      {
        kind: "interactive_learning_block",
        blockKind: "evidence_explorer",
        title: "Inspect Evidence",
        learningPurpose: "Review source excerpts.",
        content: {},
        allowedActions: ["evidence.source_span_opened", "tutor.help_requested"],
        evidenceRefs: [evidenceRef],
        ...interactivePlanDefaults,
        sourceBacked: true,
      },
      {
        nodeRef: { refType: "wiki_page", refId: "wp_1" },
        surfaceType: "wiki_page",
        blockIndex: 0,
      },
    );
    expect(block?.kind).toBe("evidence_explorer");
    expect(block?.allowedActions).toContain("tutor.help_requested");
  });

  it("rejects quiz block plans without artifact refs", () => {
    const block = compileInteractiveBlockPlan(
      {
        kind: "interactive_learning_block",
        blockKind: "quiz",
        title: "Quiz",
        learningPurpose: "Practice",
        content: {},
        allowedActions: ["quiz.answer_submitted"],
        evidenceRefs: [],
        ...interactivePlanDefaults,
      },
      {
        nodeRef: { refType: "wiki_page", refId: "wp_1" },
        surfaceType: "wiki_page",
        blockIndex: 0,
      },
    );
    expect(block).toBeNull();
  });

  it("rejects simulation plans with unsupported templates", () => {
    const block = compileInteractiveBlockPlan(
      {
        kind: "interactive_learning_block",
        blockKind: "simulation",
        title: "Custom sim",
        learningPurpose: "Explore",
        content: { simulationTemplateId: "unsupported-template" },
        allowedActions: ["simulation.observation_submitted"],
        evidenceRefs: [evidenceRef],
        ...interactivePlanDefaults,
        sourceBacked: true,
      },
      {
        nodeRef: { refType: "wiki_page", refId: "wp_1" },
        surfaceType: "wiki_page",
        blockIndex: 0,
      },
    );
    expect(block).toBeNull();
  });

  it("runs polish with repair on quality failure", async () => {
    let calls = 0;
    const result = await polishWikiPage(
      { apiKey: "test", baseUrl: "https://example.com", model: "test", label: "test" },
      {
        pageType: "concept",
        title: "Entropy",
        pageKey: "concept:cpt_entropy",
        currentMarkdown: "# Entropy",
        sourceExcerpt: "Entropy increases in isolated systems.",
        evidenceRefs: [evidenceRef],
        supportedClaimIds: new Set(["clm_supported"]),
      },
      async () => {
        calls += 1;
        if (calls === 1) {
          return {
            title: polishedConceptOutput.title,
            pageKey: polishedConceptOutput.pageKey,
            readiness: "still_improving",
            generationMode: "llm_polished",
            markdown: "# Entropy\n\n## Definition\nOnly definition.\n\n## Intuition\nBrief intuition.",
            blocks: [],
            citationsBySection: {},
            qualityIssues: [],
            warnings: [],
          };
        }
        return polishedConceptOutput;
      },
    );

    expect(calls).toBe(2);
    expect(result.repaired).toBe(true);
    expect(result.output?.readiness).toBe("ready_to_study");
    expect(
      compilePageBlockPlansToInteractiveBlocks(result.output!.blocks, {
        nodeRef: { refType: "wiki_page", refId: "wp_1" },
        surfaceType: "wiki_page",
      }),
    ).toHaveLength(1);
  });

  it("falls back when LLM is unavailable", async () => {
    const result = await polishWikiPage(null, {
      pageType: "concept",
      title: "Entropy",
      pageKey: "concept:cpt_entropy",
      currentMarkdown: "# Entropy",
      sourceExcerpt: "",
      evidenceRefs: [],
    });
    expect(result.output).toBeNull();
    expect(result.qualityIssues[0]?.code).toBe("llm_unavailable");
  });
});
