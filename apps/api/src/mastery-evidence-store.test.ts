import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMasteryEvidenceId } from "@studyagent/schemas";
import type { MasteryEvidence } from "@studyagent/schemas";

const { appendEventMock } = vi.hoisted(() => ({
  appendEventMock: vi.fn(async (_db: unknown, _event: unknown) => ({ id: "evt_1" })),
}));

vi.mock("@studyagent/db", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/db")>("@studyagent/db");
  return {
    ...actual,
    appendEvent: appendEventMock,
  };
});

import { persistMasteryEvidence } from "./mastery-evidence-store.js";

describe("persistMasteryEvidence", () => {
  const insertedRows: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    insertedRows.length = 0;
    appendEventMock.mockClear();
  });

  it("persists Pi-executed mastery evidence with non-null turnId", async () => {
    const evidence: MasteryEvidence = {
      id: buildMasteryEvidenceId(),
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      turnId: "turn_pi_eval",
      runId: "run_1",
      correctnessLabel: "correct",
      overallScore: 0.88,
      conceptScores: [{ conceptId: "concept_1", score: 0.8, delta: 0.1, role: "primary" }],
      misconceptions: [],
      readiness: "proficient",
      tutoringIntervention: "advance",
      uncertainty: 0.1,
      confidence: 0.9,
      evidenceType: "mastery_check",
      triggerSource: "tutor_tool",
      sourceRefs: [],
      contextRefs: [],
      evaluatorProvenance: {
        mode: "deterministic",
        model: null,
        fallbackUsed: false,
        notes: "test",
      },
    };

    const dbClient = {
      db: {
        insert: () => ({
          values: async (row: Record<string, unknown>) => {
            insertedRows.push(row);
          },
        }),
      },
    } as never;

    const result = await persistMasteryEvidence(dbClient, evidence);
    expect(result.evidenceId).toBe(evidence.id);
    expect(insertedRows[0]).toMatchObject({
      turnId: "turn_pi_eval",
      runId: "run_1",
      sessionId: "sess_1",
    });
    expect(appendEventMock).toHaveBeenCalledWith(
      dbClient,
      expect.objectContaining({
        eventType: "learning.mastery_evidence.recorded",
        runId: "run_1",
      }),
    );
  });
});
