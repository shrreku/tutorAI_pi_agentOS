import { describe, expect, it, vi } from "vitest";

const { recordLearnerTraitSignalMock, readLearnerTraitSignalsForTurnMock } = vi.hoisted(() => ({
  recordLearnerTraitSignalMock: vi.fn(async (_db: unknown, _signal: unknown) => ({
    signal: {},
    eventId: "evt_1",
  })),
  readLearnerTraitSignalsForTurnMock: vi.fn(async (_db: unknown, _input: unknown) => []),
}));

vi.mock("./learner-trait-store.js", () => ({
  recordLearnerTraitSignal: recordLearnerTraitSignalMock,
  readLearnerTraitSignalsForTurn: (db: unknown, input: unknown) =>
    readLearnerTraitSignalsForTurnMock(db, input),
}));

import {
  extractExplicitPreferenceSignals,
  extractReflectiveBehaviorSignals,
  processCompletedTutorTurnLearnerTraitSignals,
  recordExplicitPreferenceSignalsFromMessage,
  recordReflectiveBehaviorSignalsFromTurn,
} from "./learner-trait-signals.js";

describe("learner trait signal module", () => {
  it("extracts explicit preference signals without treating one-off example requests as durable preferences", () => {
    expect(extractExplicitPreferenceSignals("give me an example")).toEqual([]);
    expect(extractExplicitPreferenceSignals("please go slower")).toEqual([
      expect.objectContaining({ trait: "pacePreference", value: "slow" }),
    ]);
  });

  it("records explicit signals through the trait store with turn, run, and self-report evidence refs", async () => {
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
        source: "explicit_self_report",
        turnId: "turn_1",
        runId: "run_1",
        sessionId: "sess_1",
        evidenceRefs: expect.arrayContaining([
          expect.objectContaining({ refType: "self_report", refId: "turn_1" }),
          expect.objectContaining({ refType: "session_trace", refId: "sess_1" }),
        ]),
      }),
    );
  });

  it("suppresses reflective inferred signals for one-off example requests", () => {
    expect(extractReflectiveBehaviorSignals({ userMessage: "give me an example" })).toEqual([]);
    expect(
      extractReflectiveBehaviorSignals({ userMessage: "Can you give me an example?" }),
    ).toEqual([]);
  });

  it("extracts reflective behavior signals at lower-confidence lanes with turn evidence", () => {
    expect(
      extractReflectiveBehaviorSignals({
        userMessage: "I'm stuck and don't understand this step.",
      }),
    ).toEqual([expect.objectContaining({ trait: "helpSeekingStyle", value: "asks_early" })]);
  });

  it("processes completed tutor turns through explicit and reflective lanes", async () => {
    recordLearnerTraitSignalMock.mockClear();
    const result = await processCompletedTutorTurnLearnerTraitSignals({ db: {} } as never, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      turnId: "turn_1",
      runId: "run_1",
      userMessage: "Please go slower. I'm stuck on this part.",
      assistantMessage: "Let's break it down.",
    });

    expect(result.explicitCount).toBe(1);
    expect(result.inferredCount).toBe(1);
    expect(recordLearnerTraitSignalMock).toHaveBeenCalledTimes(2);
    const inferredCall = (recordLearnerTraitSignalMock.mock.calls as unknown[][]).find((call) => {
      const payload = call[1] as { source?: string } | undefined;
      return payload?.source === "behavior_extraction";
    });
    expect(inferredCall?.[1]).toEqual(
      expect.objectContaining({
        source: "behavior_extraction",
        strength: 0.55,
        confidence: 0.5,
        turnId: "turn_1",
      }),
    );
  });

  it("does not duplicate explicit signals when the governed tool already recorded the trait for the turn", async () => {
    readLearnerTraitSignalsForTurnMock.mockResolvedValueOnce([
      {
        id: "lts_tool",
        notebookId: "nb_1",
        userId: "user_1",
        source: "explicit_self_report",
        trait: "pacePreference",
        suggestedValue: "slow",
        strength: 0.95,
        confidence: 0.9,
        evidenceRefs: [{ refType: "self_report", refId: "turn_1" }],
        turnId: "turn_1",
        internalVisibility: true,
        observedAt: "2026-05-25T08:00:00.000Z",
      } as never,
    ]);
    recordLearnerTraitSignalMock.mockClear();

    const explicitCount = await recordExplicitPreferenceSignalsFromMessage({ db: {} } as never, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      turnId: "turn_1",
      runId: "run_1",
      message: "Please go slower",
    });

    expect(explicitCount).toBe(0);
    expect(recordLearnerTraitSignalMock).not.toHaveBeenCalled();
  });

  it("skips signal processing for empty completed-turn messages", async () => {
    recordLearnerTraitSignalMock.mockClear();
    const result = await processCompletedTutorTurnLearnerTraitSignals({ db: {} } as never, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      turnId: "turn_1",
      runId: "run_1",
      userMessage: "   ",
      assistantMessage: "   ",
    });

    expect(result).toEqual({ explicitCount: 0, inferredCount: 0 });
    expect(recordLearnerTraitSignalMock).not.toHaveBeenCalled();
  });

  it("does not duplicate reflective inferred signals when one already exists for the turn", async () => {
    readLearnerTraitSignalsForTurnMock.mockResolvedValueOnce([
      {
        id: "lts_reflective",
        notebookId: "nb_1",
        userId: "user_1",
        source: "behavior_extraction",
        trait: "helpSeekingStyle",
        suggestedValue: "asks_early",
        strength: 0.55,
        confidence: 0.5,
        evidenceRefs: [{ refType: "behavior_observation", refId: "turn_1" }],
        turnId: "turn_1",
        internalVisibility: true,
        observedAt: "2026-05-25T08:00:00.000Z",
      } as never,
    ]);
    recordLearnerTraitSignalMock.mockClear();

    const inferredCount = await recordReflectiveBehaviorSignalsFromTurn({ db: {} } as never, {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      turnId: "turn_1",
      runId: "run_1",
      userMessage: "I'm stuck and don't understand this step.",
      assistantMessage: "Let's break it down.",
    });

    expect(inferredCount).toBe(0);
    expect(recordLearnerTraitSignalMock).not.toHaveBeenCalled();
  });
});
