import { describe, expect, it, vi } from "vitest";

const { recordLearnerTraitSignalMock } = vi.hoisted(() => ({
  recordLearnerTraitSignalMock: vi.fn(async () => ({ signal: {}, eventId: "evt_1" })),
}));

vi.mock("./learner-trait-store.js", () => ({
  recordLearnerTraitSignal: recordLearnerTraitSignalMock,
  readLearnerTraitSignalsForTurn: vi.fn(async () => []),
}));

import {
  extractExplicitPreferenceSignals,
  recordExplicitPreferenceSignalsFromMessage,
} from "./learner-trait-signals.js";

describe("learner trait explicit signals", () => {
  it("extracts explicit preference signals without treating one-off example requests as durable preferences", () => {
    expect(extractExplicitPreferenceSignals("give me an example")).toEqual([]);
    expect(extractExplicitPreferenceSignals("please go slower")).toEqual([
      expect.objectContaining({ trait: "pacePreference", value: "slow" }),
    ]);
  });

  it("records explicit signals through the trait store module with turn and run refs", async () => {
    recordLearnerTraitSignalMock.mockClear();
    await recordExplicitPreferenceSignalsFromMessage({ db: {} } as never, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      turnId: "turn_1",
      runId: "run_1",
      message: "quiz me on this topic",
    });
    expect(recordLearnerTraitSignalMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        trait: "assessmentPreference",
        turnId: "turn_1",
        runId: "run_1",
        sessionId: "sess_1",
      }),
    );
  });
});
