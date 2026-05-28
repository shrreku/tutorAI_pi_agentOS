import { beforeEach, describe, expect, it, vi } from "vitest";

const { runRuntimeMasteryEvaluation } = vi.hoisted(() => ({
  runRuntimeMasteryEvaluation: vi.fn(),
}));

vi.mock("./mastery-pipeline.js", () => ({ runRuntimeMasteryEvaluation }));

import { maybeRunRuntimeMasteryEvaluation } from "./mastery-session.js";
import type { AppContext } from "./context.js";

describe("maybeRunRuntimeMasteryEvaluation", () => {
  beforeEach(() => {
    runRuntimeMasteryEvaluation.mockReset();
    runRuntimeMasteryEvaluation.mockResolvedValue(null);
  });

  it("uses the existing pending tutor turn id for runtime evidence", async () => {
    const updateWhere = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const ctx = { db: { db: { update } } } as unknown as AppContext;

    await maybeRunRuntimeMasteryEvaluation(ctx, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      runId: "run_1",
      learnerMessage: "The derivative is 2x because the power rule multiplies by 2.",
      runtimeContext: {
        pendingMasteryEvaluation: {
          turnId: "turn_existing_prompt",
          tutorQuestion: "Quick check: what is the derivative of x^2?",
          conceptIds: ["concept_1"],
          objectiveId: null,
          createdAt: "2026-05-16T00:00:00.000Z",
        },
        evaluatedMasteryTurnIds: [],
      },
      masterySnapshot: { concept_1: 0.4 },
      sourceRefs: [],
      contextRefs: [],
    });

    expect(runRuntimeMasteryEvaluation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ turnId: "turn_existing_prompt", runId: "run_1" }),
    );
    expect(update).toHaveBeenCalled();
  });

  it("uses persisted prompt-turn refs instead of current request refs", async () => {
    const updateWhere = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const ctx = { db: { db: { update } } } as unknown as AppContext;

    await maybeRunRuntimeMasteryEvaluation(ctx, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      runId: "run_1",
      learnerMessage: "The answer is from the original source context.",
      runtimeContext: {
        pendingMasteryEvaluation: {
          turnId: "turn_prompt_original",
          tutorQuestion: "Quick check: explain the vector projection from source A.",
          conceptIds: ["concept_original"],
          objectiveId: "objective_original",
          sourceRefs: [{ refType: "source", refId: "src_original" }],
          contextRefs: [{ refType: "chunk", refId: "chunk_original" }],
          sourceScopePolicy: "strict_source_scope",
          createdAt: "2026-05-16T00:00:00.000Z",
        },
        evaluatedMasteryTurnIds: [],
      },
      masterySnapshot: { concept_original: 0.4 },
      sourceRefs: [{ refType: "source", refId: "src_current_after_focus_change" }],
      contextRefs: [{ refType: "chunk", refId: "chunk_current_after_focus_change" }],
    });

    expect(runRuntimeMasteryEvaluation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pending: expect.objectContaining({
          objectiveId: "objective_original",
          sourceRefs: [{ refType: "source", refId: "src_original" }],
          contextRefs: [{ refType: "chunk", refId: "chunk_original" }],
          sourceScopePolicy: "strict_source_scope",
        }),
        sourceRefs: [{ refType: "source", refId: "src_original" }],
        contextRefs: [{ refType: "chunk", refId: "chunk_original" }],
      }),
    );
  });

  it("stores strong runtime Mastery Evidence in session context for objective progression", async () => {
    const updateWhere = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const ctx = { db: { db: { update } } } as unknown as AppContext;

    runRuntimeMasteryEvaluation.mockResolvedValueOnce({
      applied: true,
      evidence: {
        id: "mev_strong",
        notebookId: "nb_1",
        userId: "user_1",
        sessionId: "sess_1",
        turnId: "turn_existing_prompt",
        runId: "run_1",
        objectiveId: "objective_1",
        correctnessLabel: "correct",
        overallScore: 0.92,
        conceptScores: [],
        misconceptions: [],
        readiness: "advanced",
        tutoringIntervention: "advance",
        uncertainty: 0.12,
        confidence: 0.86,
        evidenceType: "mastery_check",
        triggerSource: "runtime_auto",
        sourceRefs: [],
        contextRefs: [],
        evaluatorProvenance: {
          mode: "deterministic",
          model: null,
          fallbackUsed: false,
          notes: "test",
        },
      },
    });

    const result = await maybeRunRuntimeMasteryEvaluation(ctx, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      runId: "run_1",
      learnerMessage: "The derivative is 2x because the power rule multiplies by 2.",
      runtimeContext: {
        pendingMasteryEvaluation: {
          turnId: "turn_existing_prompt",
          tutorQuestion: "Quick check: what is the derivative of x^2?",
          conceptIds: ["concept_1"],
          objectiveId: "objective_1",
          createdAt: "2026-05-16T00:00:00.000Z",
        },
        evaluatedMasteryTurnIds: [],
      },
      masterySnapshot: { concept_1: 0.4 },
      sourceRefs: [],
      contextRefs: [],
    });

    expect(result.runtimeContext.lastRuntimeMasteryEvidence).toEqual({
      evidenceId: "mev_strong",
      objectiveId: "objective_1",
      correctnessLabel: "correct",
      overallScore: 0.92,
      confidence: 0.86,
      uncertainty: 0.12,
      readiness: "advanced",
      tutoringIntervention: "advance",
    });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ runtimeContextJson: result.runtimeContext }));
  });
});
