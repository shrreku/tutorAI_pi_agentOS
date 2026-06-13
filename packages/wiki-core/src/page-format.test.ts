import { describe, expect, it } from "vitest";
import {
  buildHeuristicConceptPageMarkdown,
  buildHeuristicCurriculumPageMarkdown,
  buildHeuristicModulePageMarkdown,
  buildHeuristicTopicPageMarkdown,
} from "./page-format.js";

const evidenceRef = {
  id: "ev_1",
  kind: "chunk" as const,
  visibility: "learner" as const,
  label: "Source excerpt",
  text: "Entropy increases in isolated systems.",
  confidence: null,
  status: null,
  chunkType: null,
  pageStart: null,
  pageEnd: null,
  sourceId: null,
  sourceTitle: null,
  metadata: {},
};

describe("heuristic curriculum pages", () => {
  it("builds a learner-safe curriculum outline page", () => {
    const result = buildHeuristicCurriculumPageMarkdown({
      curriculumTitle: "Thermodynamics Path",
      purpose: "Learn core thermodynamics from uploaded notes.",
      sourceTitles: ["Thermo Notes.pdf"],
      modules: [
        { moduleId: "mod_1", title: "Foundations", summary: "Energy and heat." },
        { moduleId: "mod_2", title: "Entropy", summary: "Second law ideas." },
      ],
      activeModuleId: "mod_1",
    });

    expect(result.generationMode).toBe("heuristic");
    expect(result.markdown).toContain("## Module outline");
    expect(result.markdown).toContain("Foundations");
    expect(result.markdown).not.toMatch(/mod_1|clm_|confidence/i);
  });
});

describe("heuristic module pages", () => {
  it("shows outline-only objectives for undeep-built modules", () => {
    const result = buildHeuristicModulePageMarkdown({
      moduleTitle: "Entropy",
      summary: "Study disorder and the second law.",
      sourceSections: ["Chapter 2"],
      topics: [{ id: "topic_entropy", name: "Entropy" }],
      concepts: [{ id: "cpt_entropy", name: "Entropy" }],
      objectives: [{ id: "obj_1", title: "Explain the second law", deepBuilt: false }],
    });

    expect(["still_improving", "needs_more_source_support"]).toContain(result.readiness);
    expect(result.markdown).toContain("Outline only");
    expect(result.markdown).toContain("Entropy");
  });
});

describe("heuristic topic pages", () => {
  it("includes overview, concepts, and evidence affordance metadata", () => {
    const result = buildHeuristicTopicPageMarkdown({
      topicTitle: "Second Law",
      claims: [
        { text: "Entropy tends to increase in isolated systems.", confidence: 0.82 },
        { text: "Heat flows from hot to cold.", confidence: 0.8 },
      ],
      concepts: [{ id: "cpt_entropy", name: "Entropy" }],
      evidenceRefs: [evidenceRef],
    });

    expect(result.markdown).toContain("## Overview");
    expect(result.markdown).toContain("Entropy tends to increase");
    expect(result.markdown).not.toContain("clm_");
    expect(result.structuredJson.interactiveBlockPlans).toHaveLength(1);
  });

  it("marks sparse topic pages as needing more source support", () => {
    const result = buildHeuristicTopicPageMarkdown({
      topicTitle: "Sparse Topic",
      concepts: [],
      claims: [{ text: "Weak claim.", confidence: 0.2 }],
    });

    expect(result.readiness).toBe("needs_more_source_support");
    expect(result.markdown).toContain("Needs more source support");
  });
});

describe("heuristic concept pages", () => {
  it("renders structured sections without claim ids", () => {
    const result = buildHeuristicConceptPageMarkdown({
      conceptName: "Entropy",
      claims: [
        { text: "Entropy measures disorder in isolated systems.", confidence: 0.82 },
        { text: "For example, mixing gases increases entropy.", confidence: 0.75 },
      ],
      evidenceRefs: [evidenceRef],
    });

    expect(result.markdown).toContain("## Definition");
    expect(result.markdown).toContain("Entropy measures disorder");
    expect(result.markdown).not.toMatch(/clm_|confidence|0\.82/i);
    expect(result.structuredJson.interactiveBlockPlans).toHaveLength(1);
  });

  it("preserves human-authored blocks on regeneration", () => {
    const existing = [
      "# Entropy",
      '<!-- studyagent:owner=human id="note-1" -->',
      "My personal mnemonic for entropy.",
      "<!-- studyagent:end -->",
    ].join("\n");

    const result = buildHeuristicConceptPageMarkdown({
      conceptName: "Entropy",
      claims: [{ text: "Entropy measures disorder.", confidence: 0.8 }],
      existingMarkdown: existing,
    });

    expect(result.markdown).toContain("My personal mnemonic for entropy.");
    expect(result.markdown).toContain("<!-- studyagent:owner=human id=\"note-1\" -->");
  });
});
