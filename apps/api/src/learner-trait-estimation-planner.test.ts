import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerTraitEstimate, LearnerTraitSignal } from "@studyagent/schemas";
import { planLearnerTraitEstimation, persistLearnerTraitEstimationPlan } from "./learner-trait-estimation-planner.js";

const readRecentLearnerTraitSignalsMock = vi.fn<() => Promise<LearnerTraitSignal[]>>();
const readCurrentLearnerTraitEstimatesMock = vi.fn<() => Promise<LearnerTraitEstimate[]>>();
const appendEventMock = vi.fn(async () => ({ id: "evt_plan_1" }));

vi.mock("./learner-trait-store.js", () => ({
  readRecentLearnerTraitSignals: (...args: unknown[]) => readRecentLearnerTraitSignalsMock(...(args as Parameters<typeof readRecentLearnerTraitSignalsMock>)),
  readCurrentLearnerTraitEstimates: (...args: unknown[]) => readCurrentLearnerTraitEstimatesMock(...(args as Parameters<typeof readCurrentLearnerTraitEstimatesMock>)),
}));

vi.mock("@studyagent/db", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/db")>("@studyagent/db");
  return {
    ...actual,
    appendEvent: (...args: unknown[]) => appendEventMock(...(args as Parameters<typeof appendEventMock>)),
  };
});

function signal(patch: Partial<LearnerTraitSignal> = {}): LearnerTraitSignal {
  return {
    id: patch.id ?? "lts_1",
    notebookId: patch.notebookId ?? "nb_1",
    userId: patch.userId ?? "user_1",
    source: patch.source ?? "tutor_observation",
    trait: patch.trait ?? "helpSeekingStyle",
    suggestedValue: patch.suggestedValue ?? "avoids_help",
    strength: patch.strength ?? 0.7,
    confidence: patch.confidence ?? 0.65,
    evidenceRefs: patch.evidenceRefs ?? [{ refType: "tutor_observation", refId: patch.id ?? "turn_1" }],
    internalVisibility: true,
    observedAt: patch.observedAt ?? "2026-05-25T08:00:00.000Z",
    ...patch,
  } as LearnerTraitSignal;
}

function createDbClient(masteryRows: Array<Record<string, unknown>> = []) {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => masteryRows,
            }),
          }),
        }),
      }),
    },
  } as never;
}

describe("learner trait estimation planner", () => {
  beforeEach(() => {
    readRecentLearnerTraitSignalsMock.mockReset();
    readCurrentLearnerTraitEstimatesMock.mockReset();
    appendEventMock.mockClear();
    readCurrentLearnerTraitEstimatesMock.mockResolvedValue([]);
  });

  it("skips estimation for sessions that ended without turns", async () => {
    const plan = await planLearnerTraitEstimation(createDbClient(), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      endedWithoutTurns: true,
      now: () => new Date("2026-05-25T09:00:00.000Z"),
    });

    expect(plan.decision).toBe("skip");
    expect(plan.skipReason).toBe("ended_without_turns");
    expect(readRecentLearnerTraitSignalsMock).not.toHaveBeenCalled();
  });

  it("skips ordinary short sessions without trait-relevant signals", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({ source: "tutor_observation", strength: 0.3 }),
    ]);

    const plan = await planLearnerTraitEstimation(createDbClient(), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
    });

    expect(plan.decision).toBe("skip");
    expect(plan.skipReason).toBe("one_off_low_signal_observation");
  });

  it("plans estimation for explicit preference changes", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({ source: "explicit_self_report", trait: "pacePreference", suggestedValue: "slow" }),
    ]);

    const plan = await planLearnerTraitEstimation(createDbClient(), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
    });

    expect(plan.decision).toBe("run");
    expect(plan.trigger.reasons).toContain("explicit_preference_change");
  });

  it("plans estimation for repeated cross-session trait-family signals", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({ id: "lts_1", sessionId: "sess_a" }),
      signal({ id: "lts_2", sessionId: "sess_b", evidenceRefs: [{ refType: "tutor_observation", refId: "turn_2" }] }),
    ]);

    const plan = await planLearnerTraitEstimation(createDbClient(), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_b",
    });

    expect(plan.decision).toBe("run");
    expect(plan.trigger.reasons).toContain("repeated_trait_family_signals");
  });

  it("plans estimation for mastery and self-report contradiction signals", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({
        source: "mastery_evidence_pattern",
        trait: "confidenceStyle",
        suggestedValue: "overconfident",
        evidenceRefs: [{ refType: "mastery_evidence", refId: "mev_1" }],
      }),
    ]);

    const plan = await planLearnerTraitEstimation(createDbClient(), {
      notebookId: "nb_1",
      userId: "user_1",
    });

    expect(plan.decision).toBe("run");
    expect(plan.trigger.reasons).toContain("mastery_self_report_contradiction");
  });

  it("plans estimation for goal or urgency changes", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({ source: "explicit_self_report", trait: "urgencyContext", suggestedValue: "exam_prep" }),
    ]);

    const plan = await planLearnerTraitEstimation(createDbClient(), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
    });

    expect(plan.decision).toBe("run");
    expect(plan.trigger.reasons).toContain("goal_or_urgency_change");
  });

  it("plans estimation when persisted mastery evidence shows self-report contradiction", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([]);

    const plan = await planLearnerTraitEstimation(createDbClient([{
      id: "mev_1",
      turnId: "turn_1",
      sessionId: "sess_1",
      evidenceJson: {
        evidenceType: "self_report",
        correctnessLabel: "incorrect",
        confidence: 0.88,
      },
    }]), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
    });

    expect(plan.decision).toBe("run");
    expect(plan.trigger.reasons).toContain("mastery_self_report_contradiction");
  });

  it("persists skipped and planned decisions as traceable events", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([]);
    const skipped = await planLearnerTraitEstimation(createDbClient(), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
    });
    await persistLearnerTraitEstimationPlan(createDbClient(), skipped);

    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({ source: "explicit_self_report", trait: "urgencyContext", suggestedValue: "exam_prep" }),
    ]);
    const planned = await planLearnerTraitEstimation(createDbClient(), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
    });
    await persistLearnerTraitEstimationPlan(createDbClient(), planned);

    expect(appendEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "learner_trait.estimation.skipped" }),
    );
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "learner_trait.estimation.planned" }),
    );
  });
});
