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

describe("recordAndApplyMasteryEvidence", () => {
  beforeEach(() => {
    persistMasteryEvidence.mockReset();
    applyMasteryEvidence.mockReset();
    persistMasteryEvidence.mockResolvedValue({ evidenceId: evidence.id, eventId: "evt_1" });
    applyMasteryEvidence.mockResolvedValue({
      updatedConceptStates: [{ conceptId: "concept_1", masteryScore: 0.8, nextReviewAt: new Date().toISOString() }],
      weakConceptIds: [],
    });
  });

  it("persists evidence before reducer-applied mastery updates", async () => {
    const calls: string[] = [];
    persistMasteryEvidence.mockImplementation(async () => {
      calls.push("persist");
      return { evidenceId: evidence.id, eventId: "evt_1" };
    });
    applyMasteryEvidence.mockImplementation(async () => {
      calls.push("apply");
      return { updatedConceptStates: [], weakConceptIds: [] };
    });

    await recordAndApplyMasteryEvidence({} as never, evidence, { applyAdaptivePlan: false });
    expect(calls).toEqual(["persist", "apply"]);
  });
});
