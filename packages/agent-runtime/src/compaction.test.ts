import { describe, expect, it } from "vitest";
import { compactStudyAgentContext } from "./compaction.js";

describe("study agent compaction", () => {
  it("retains the required tutoring state and produces a compact summary", () => {
    const compacted = compactStudyAgentContext({
      notebookId: "nb_1",
      activeMode: "learn",
      selectedNodeRefs: [{ refType: "concept", refId: "c_1" }],
      activeConceptIds: ["c_1", "c_2"],
      activeObjectiveIds: ["o_1"],
      latestLearnerMessage: "Can you explain span in plain language?",
      latestTutorQuestion: "What is the span of these vectors?",
      recentCheckpointState: { score: 0.7 },
      sourceIds: ["src_1"],
      citationIds: ["cit_1"],
      currentLearningStateSummary: "Weak on linear combinations.",
      openArtifactProposals: [{ type: "note" }],
    });

    expect(compacted.notebookId).toBe("nb_1");
    expect(compacted.compressedContext).toContain("concepts=c_1,c_2");
    expect(compacted.compressedContext).toContain("citations=cit_1");
  });
});