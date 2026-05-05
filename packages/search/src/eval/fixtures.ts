/**
 * Synthetic retrieval eval fixture (no DB). Replace `rankedIds` with real search output in integration tests.
 */
export const entropyFixture = {
  corpusId: "fixture-entropy-101",
  relevantChunkIds: ["chk_entropy_def", "chk_entropy_formula"],
  questions: [
    { id: "q_exact", kind: "exact" as const, text: "entropy definition" },
    { id: "q_semantic", kind: "semantic" as const, text: "disorder of a thermodynamic system" },
    { id: "q_prereq", kind: "prerequisite" as const, text: "Boltzmann relation to microstates" },
    { id: "q_multihop", kind: "multi_hop" as const, text: "connect heat flow to microscopic counting" },
  ],
  /** Ideal ranked list for the fixture (upper bound metrics). */
  oracleRankedIds: ["chk_entropy_def", "chk_entropy_formula", "chk_other"],
};
