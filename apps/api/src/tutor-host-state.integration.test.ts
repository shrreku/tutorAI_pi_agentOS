import { describe, expect, it } from "vitest";
import { buildStudyAgentHostStateSignature } from "@studyagent/agent-runtime";

describe("tutor host state signature integration", () => {
  it("materializes a new signature when personalization recommendations change", () => {
    const base = {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      notebookTitle: "Notebook",
      activeMode: "learn" as const,
      selectedNodeRefs: [{ refType: "concept" as const, refId: "concept_1" }],
      currentObjective: "Derivatives",
    };

    const before = buildStudyAgentHostStateSignature({
      ...base,
      personalizationRecommendations: ["Use more examples"],
    });
    const after = buildStudyAgentHostStateSignature({
      ...base,
      personalizationRecommendations: ["Use more examples", "Quiz more often"],
    });

    expect(before).not.toBe(after);
  });
});
