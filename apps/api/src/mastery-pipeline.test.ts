import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMasteryEvidenceId } from "@studyagent/schemas";
import type { MasteryEvidence } from "@studyagent/schemas";

const { persistMasteryEvidence, applyMasteryEvidence } = vi.hoisted(() => ({
  persistMasteryEvidence: vi.fn(),
  applyMasteryEvidence: vi.fn(),
}));

vi.mock("./mastery-evidence-store.js", () => ({ persistMasteryEvidence }));
vi.mock("./mastery-learning.js", () => ({ applyMasteryEvidence }));

import { recordAndApplyMasteryEvidence } from "./mastery-pipeline.js";

const evidence: MasteryEvidence = {
  id: buildMasteryEvidenceId(),
  notebookId: "nb_1",
  userId: "user_1",
  correctnessLabel: "correct",
  overallScore: 0.9,
  conceptScores: [{ conceptId: "concept_1", score: 0.8, delta: 0.1, role: "primary" }],
  misconceptions: [],
  readiness: "proficient",
  tutoringIntervention: "advance",
  uncertainty: 0.1,
  confidence: 0.9,
  evidenceType: "mastery_check",
  triggerSource: "runtime_auto",
  sourceRefs: [],
  contextRefs: [],
  evaluatorProvenance: { mode: "deterministic", model: null, fallbackUsed: false, notes: "test" },
};

// Fake DB whose transaction() runs the callback with a tx client, tracking how many
// transactions were opened so tests can assert persist+apply share one transaction.
function makeTxDbClient(): { client: never; transactionCalls: () => number } {
  let transactionCalls = 0;
  const client = {
    db: {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        transactionCalls += 1;
        return fn({});
      },
    },
  } as never;
  return { client, transactionCalls: () => transactionCalls };
}

describe("recordAndApplyMasteryEvidence", () => {
  beforeEach(() => {
    persistMasteryEvidence.mockReset();
    applyMasteryEvidence.mockReset();
    persistMasteryEvidence.mockResolvedValue({ evidenceId: evidence.id, eventId: "evt_1" });
    applyMasteryEvidence.mockResolvedValue({
      updatedConceptStates: [
        { conceptId: "concept_1", masteryScore: 0.8, nextReviewAt: new Date().toISOString() },
      ],
      weakConceptIds: [],
    });
  });

  it("persists evidence before reducer-applied mastery updates, inside one transaction", async () => {
    const calls: string[] = [];
    persistMasteryEvidence.mockImplementation(async () => {
      calls.push("persist");
      return { evidenceId: evidence.id, eventId: "evt_1" };
    });
    applyMasteryEvidence.mockImplementation(async () => {
      calls.push("apply");
      return { updatedConceptStates: [], weakConceptIds: [] };
    });

    const { client, transactionCalls } = makeTxDbClient();
    await recordAndApplyMasteryEvidence(client, evidence, { applyAdaptivePlan: false });
    expect(calls).toEqual(["persist", "apply"]);
    // persist + apply share a single transaction so they commit/roll back atomically.
    expect(transactionCalls()).toBe(1);
  });

  it("propagates an apply failure so the whole transaction rolls back (no orphaned audit record)", async () => {
    const calls: string[] = [];
    persistMasteryEvidence.mockImplementation(async () => {
      calls.push("persist");
      return { evidenceId: evidence.id, eventId: "evt_1" };
    });
    applyMasteryEvidence.mockImplementation(async () => {
      calls.push("apply");
      throw new Error("apply failed");
    });

    const { client, transactionCalls } = makeTxDbClient();
    await expect(
      recordAndApplyMasteryEvidence(client, evidence, { applyAdaptivePlan: false }),
    ).rejects.toThrow("apply failed");
    // Both ran inside the one transaction, so a real DB discards the persisted audit row too.
    expect(transactionCalls()).toBe(1);
    expect(calls).toEqual(["persist", "apply"]);
  });
});
