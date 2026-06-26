import { describe, expect, it } from "vitest";
import { decideQualityRepair, runQualityGates, validatePolishedPage } from "./page-quality.js";

const evidenceRef = {
  id: "ev_1",
  kind: "chunk" as const,
  visibility: "learner" as const,
  label: "Entropy excerpt",
  text: "Entropy increases in isolated systems.",
};

function baseConceptOutput() {
  return {
    title: "Entropy",
    pageKey: "concept:cpt_entropy",
    readiness: "still_improving" as const,
    generationMode: "llm_polished" as const,
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
        kind: "source_backed_note" as const,
        markdown: "- Entropy increases in isolated systems.",
        evidenceRefs: [evidenceRef],
      },
    ],
    citationsBySection: { source_backed_notes: ["clm_supported"] },
    qualityIssues: [],
    warnings: [],
  };
}

describe("page quality gates", () => {
  it("accepts a clean polished concept page", () => {
    const output = validatePolishedPage(baseConceptOutput());
    const result = runQualityGates(output, {
      pageType: "concept",
      supportedClaimIds: new Set(["clm_supported"]),
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects learner-visible debug metadata", () => {
    const output = validatePolishedPage({
      ...baseConceptOutput(),
      markdown: `${baseConceptOutput().markdown}\n\nconfidence: 0.42`,
    });
    const result = runQualityGates(output, { pageType: "concept" });
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === "learner_unsafe_metadata")).toBe(true);
  });

  it("rejects unsupported source claim citations", () => {
    const output = validatePolishedPage(baseConceptOutput());
    const result = runQualityGates(output, {
      pageType: "concept",
      supportedClaimIds: new Set(["clm_other"]),
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === "unsupported_source_claim")).toBe(true);
  });

  it("rejects source-backed blocks that cite unsupported Evidence refs", () => {
    const output = validatePolishedPage(baseConceptOutput());
    const result = runQualityGates(output, {
      pageType: "concept",
      supportedClaimIds: new Set(["clm_supported"]),
      supportedChunkIds: new Set(["chunk_other"]),
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === "unsupported_evidence_ref")).toBe(true);
  });

  it("rejects source-backed blocks without section citation coverage", () => {
    const output = validatePolishedPage({
      ...baseConceptOutput(),
      citationsBySection: {},
    });
    const result = runQualityGates(output, {
      pageType: "concept",
      supportedClaimIds: new Set(["clm_supported"]),
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === "missing_section_citations")).toBe(true);
  });

  it("rejects artifact-backed interactive plans without artifact refs", () => {
    const output = validatePolishedPage({
      ...baseConceptOutput(),
      blocks: [
        ...baseConceptOutput().blocks,
        {
          kind: "interactive_learning_block",
          blockKind: "quiz",
          title: "Quick quiz",
          learningPurpose: "Practice",
          content: {},
          allowedActions: ["quiz.answer_submitted"],
        },
      ],
    });
    const result = runQualityGates(output, { pageType: "concept" });
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === "artifact_block_without_ref")).toBe(true);
  });

  it("allows one repair attempt for minor citation failures", () => {
    const decision = decideQualityRepair([
      { code: "missing_citations", message: "Missing Evidence refs.", severity: "error" },
    ]);
    expect(decision.shouldAttemptRepair).toBe(true);
    expect(decision.repairHint).toContain("Missing Evidence refs.");
  });

  it("skips repair for persistent learner-unsafe metadata", () => {
    const decision = decideQualityRepair([
      { code: "learner_unsafe_metadata", message: "Debug metadata leaked.", severity: "error" },
    ]);
    expect(decision.shouldAttemptRepair).toBe(false);
  });
});
