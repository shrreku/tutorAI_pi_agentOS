import { describe, expect, it, vi } from "vitest";

const { runRuntimeMasteryEvaluation } = vi.hoisted(() => ({
  runRuntimeMasteryEvaluation: vi.fn(async () => null),
}));

vi.mock("./mastery-pipeline.js", () => ({ runRuntimeMasteryEvaluation }));

import { maybeRunRuntimeMasteryEvaluation } from "./mastery-session.js";
import type { AppContext } from "./context.js";

describe("maybeRunRuntimeMasteryEvaluation", () => {
  it("uses the existing pending tutor turn id for runtime evidence", async () => {
    const updateWhere = vi.fn(async () => undefined);
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    const ctx = { db: { db: { update } } } as unknown as AppContext;

    await maybeRunRuntimeMasteryEvaluation(ctx, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
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
      expect.objectContaining({ turnId: "turn_existing_prompt" }),
    );
    expect(update).toHaveBeenCalled();
  });
});
