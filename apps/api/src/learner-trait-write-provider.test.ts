import { describe, expect, it, vi } from "vitest";
import { createTutorWriteToolProvider } from "./tutor-write-provider.js";

const recordLearnerTraitSignalMock = vi.fn(async (_db: unknown, signal: unknown) => ({
  signal,
  eventId: "evt_trait_1",
}));

vi.mock("./learner-trait-store.js", () => ({
  recordLearnerTraitSignal: (db: unknown, signal: unknown) => recordLearnerTraitSignalMock(db, signal),
}));

describe("tutor write provider learner trait signals", () => {
  it("persists governed explicit signals with turn and run evidence refs", async () => {
    recordLearnerTraitSignalMock.mockClear();
    const provider = createTutorWriteToolProvider({ db: {} } as never);
    const result = await provider.recordLearnerTraitSignal(
      {
        trait: "pacePreference",
        value: "slow",
        source: "explicit_self_report",
        strength: 0.95,
        confidence: 0.9,
        evidenceRefs: [{ refType: "self_report", refId: "turn_1", summary: "Please go slower." }],
      },
      {
        userId: "user_1",
        notebookId: "nb_1",
        sessionId: "sess_1",
        runId: "run_1",
        turnId: "turn_1",
        traceId: "trace_1",
        permissions: {},
        selectedNodeRefs: [],
      },
    );

    expect(recordLearnerTraitSignalMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        trait: "pacePreference",
        suggestedValue: "slow",
        turnId: "turn_1",
        runId: "run_1",
        sessionId: "sess_1",
        evidenceRefs: [{ refType: "self_report", refId: "turn_1", summary: "Please go slower." }],
      }),
    );
    expect(result.reducerResult.mutationType).toBe("learner_trait.signal.recorded");
  });
});
