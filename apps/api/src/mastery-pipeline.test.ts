import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMasteryEvidenceId } from "@studyagent/schemas";
import type { MasteryEvidence } from "@studyagent/schemas";

const { persistMasteryEvidence, readMasteryEvidenceById, applyMasteryEvidence } = vi.hoisted(
  () => ({
    persistMasteryEvidence: vi.fn(),
    readMasteryEvidenceById: vi.fn(),
    applyMasteryEvidence: vi.fn(),
  }),
);

vi.mock("./mastery-evidence-store.js", () => ({
  persistMasteryEvidence,
  readMasteryEvidenceById,
}));
vi.mock("./mastery-learning.js", () => ({ applyMasteryEvidence }));

import {
  buildMasteryEvaluationEvidenceId,
  evaluatePersistAndApply,
  recordAndApplyMasteryEvidence,
} from "./mastery-pipeline.js";

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
        return fn({
          select: () => ({
            from: () => ({
              where: async () => [],
            }),
          }),
        });
      },
    },
  } as never;
  return { client, transactionCalls: () => transactionCalls };
}

describe("recordAndApplyMasteryEvidence", () => {
  beforeEach(() => {
    persistMasteryEvidence.mockReset();
    readMasteryEvidenceById.mockReset();
    applyMasteryEvidence.mockReset();
    persistMasteryEvidence.mockResolvedValue({
      evidenceId: evidence.id,
      eventId: "evt_1",
      inserted: true,
    });
    readMasteryEvidenceById.mockResolvedValue(null);
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
      return { evidenceId: evidence.id, eventId: "evt_1", inserted: true };
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
      return { evidenceId: evidence.id, eventId: "evt_1", inserted: true };
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

describe("evaluatePersistAndApply idempotency", () => {
  beforeEach(() => {
    persistMasteryEvidence.mockReset();
    readMasteryEvidenceById.mockReset();
    applyMasteryEvidence.mockReset();
  });

  it("derives the same evidence id from the same scoped idempotency key", () => {
    const input = {
      notebookId: "nb_1",
      userId: "user_1",
      idempotencyKey: "runtime_auto:sess_1:turn_1",
    };
    expect(buildMasteryEvaluationEvidenceId(input)).toBe(buildMasteryEvaluationEvidenceId(input));
    expect(buildMasteryEvaluationEvidenceId(input)).toMatch(/^mev_[a-f0-9]{64}$/);
  });

  it("replays existing evidence without evaluating or applying mastery again", async () => {
    const existing = {
      ...evidence,
      id: buildMasteryEvaluationEvidenceId({
        notebookId: "nb_1",
        userId: "user_1",
        idempotencyKey: "runtime_auto:sess_1:turn_1",
      }),
    };
    readMasteryEvidenceById.mockResolvedValue(existing);
    persistMasteryEvidence.mockResolvedValue({
      evidenceId: existing.id,
      eventId: "evt_existing",
      inserted: false,
    });

    const { client } = makeTxDbClient();
    const result = await evaluatePersistAndApply(client, {
      notebookId: "nb_1",
      userId: "user_1",
      tutorQuestion: "Explain force.",
      learnerAnswer: "Force is mass times acceleration.",
      conceptRoles: [{ conceptId: "concept_1", role: "primary" }],
      masterySnapshot: {},
      sourceRefs: [],
      contextRefs: [],
      idempotencyKey: "runtime_auto:sess_1:turn_1",
    });

    expect(result.evidence).toEqual(existing);
    expect(result.replayed).toBe(true);
    expect(applyMasteryEvidence).not.toHaveBeenCalled();
  });
});
