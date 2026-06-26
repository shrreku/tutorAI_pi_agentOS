import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerTraitEstimate, LearnerTraitSignal } from "@studyagent/schemas";
import { collectLearnerTraitEvidencePacket } from "./learner-trait-evidence-collector.js";

const readRecentLearnerTraitSignalsMock = vi.fn<() => Promise<LearnerTraitSignal[]>>();
const readCurrentLearnerTraitEstimatesMock = vi.fn<() => Promise<LearnerTraitEstimate[]>>();

vi.mock("./learner-trait-store.js", () => ({
  readRecentLearnerTraitSignals: (...args: unknown[]) =>
    readRecentLearnerTraitSignalsMock(
      ...(args as Parameters<typeof readRecentLearnerTraitSignalsMock>),
    ),
  readCurrentLearnerTraitEstimates: (...args: unknown[]) =>
    readCurrentLearnerTraitEstimatesMock(
      ...(args as Parameters<typeof readCurrentLearnerTraitEstimatesMock>),
    ),
}));

function createDbClient(input: {
  masteryRows?: Array<Record<string, unknown>>;
  profileRows?: Array<Record<string, unknown>>;
  turnRows?: Array<Record<string, unknown>>;
}) {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => input.masteryRows ?? [],
            }),
            limit: async () => input.profileRows ?? [],
          }),
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => input.turnRows ?? [],
              }),
            }),
          }),
        }),
      }),
    },
  } as never;
}

function signal(patch: Partial<LearnerTraitSignal> = {}): LearnerTraitSignal {
  return {
    id: patch.id ?? "lts_1",
    notebookId: patch.notebookId ?? "nb_1",
    userId: patch.userId ?? "user_1",
    source: patch.source ?? "explicit_self_report",
    trait: patch.trait ?? "pacePreference",
    suggestedValue: patch.suggestedValue ?? "slow",
    strength: patch.strength ?? 0.9,
    confidence: patch.confidence ?? 0.95,
    evidenceRefs: patch.evidenceRefs ?? [{ refType: "self_report", refId: "turn_1" }],
    internalVisibility: true,
    observedAt: patch.observedAt ?? "2026-05-25T08:00:00.000Z",
    ...patch,
  } as LearnerTraitSignal;
}

describe("learner trait evidence collector", () => {
  beforeEach(() => {
    readRecentLearnerTraitSignalsMock.mockReset();
    readCurrentLearnerTraitEstimatesMock.mockReset();
    readCurrentLearnerTraitEstimatesMock.mockResolvedValue([]);
  });

  it("includes cross-session repeated signals in the evidence packet", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({ id: "lts_sess_a", sessionId: "sess_a" }),
      signal({
        id: "lts_sess_b",
        sessionId: "sess_b",
        trait: "pacePreference",
        suggestedValue: "slow",
      }),
    ]);

    const packet = await collectLearnerTraitEvidencePacket(createDbClient({}), {
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_b",
      trigger: {
        shouldEstimate: true,
        reasons: ["repeated_trait_family_signals"],
        evidenceRefs: [],
        traitFamilies: ["pacePreference"],
      },
      now: () => new Date("2026-05-25T09:00:00.000Z"),
    });

    expect(packet.signals.map((entry) => entry.id)).toEqual(["lts_sess_a", "lts_sess_b"]);
    expect(readRecentLearnerTraitSignalsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ notebookId: "nb_1", userId: "user_1" }),
    );
    const firstCall = readRecentLearnerTraitSignalsMock.mock.calls[0] as unknown[] | undefined;
    expect(firstCall?.[1]).not.toHaveProperty("sessionId");
  });

  it("includes mastery evidence summaries for confidence contradiction context", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({ trait: "confidenceStyle", suggestedValue: "underconfident" }),
    ]);

    const packet = await collectLearnerTraitEvidencePacket(
      createDbClient({
        masteryRows: [
          {
            id: "mev_1",
            turnId: "turn_1",
            sessionId: "sess_1",
            evidenceJson: {
              correctnessLabel: "incorrect",
              confidence: 0.9,
              evidenceType: "self_report",
            },
          },
        ],
      }),
      {
        notebookId: "nb_1",
        userId: "user_1",
        trigger: {
          shouldEstimate: true,
          reasons: ["mastery_self_report_contradiction"],
          evidenceRefs: [{ refType: "mastery_evidence", refId: "mev_1" }],
          traitFamilies: ["confidenceStyle"],
        },
      },
    );

    expect(packet.masteryEvidenceSummaries).toEqual([
      expect.objectContaining({
        evidenceRef: { refType: "mastery_evidence", refId: "mev_1", summary: "turn turn_1" },
        summary: expect.stringContaining("self-report contradiction"),
      }),
    ]);
  });

  it("includes explicit profile preference summaries when available", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({ trait: "assessmentPreference", suggestedValue: "quiz" }),
    ]);

    const packet = await collectLearnerTraitEvidencePacket(
      createDbClient({
        profileRows: [
          {
            goalSummary: "Pass the midterm",
            pacePreference: "slow",
            depthPreference: "intuitive",
            examplePreferencesJson: { preference: "worked_examples" },
            assessmentPreferenceJson: { preference: "quiz" },
          },
        ],
      }),
      {
        notebookId: "nb_1",
        userId: "user_1",
        trigger: {
          shouldEstimate: true,
          reasons: ["explicit_preference_change"],
          evidenceRefs: [],
          traitFamilies: ["assessmentPreference"],
        },
      },
    );

    expect(packet.profileSummary).toContain("Pass the midterm");
    expect(packet.profileSummary).toContain("Profile pace preference: slow");
    expect(packet.profileSummary).toContain("Example preference: worked_examples");
    expect(packet.profileSummary).toContain("Assessment preference: quiz");
  });

  it("preserves contradiction refs from current estimates and mastery summaries", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({ trait: "confidenceStyle", suggestedValue: "underconfident" }),
    ]);
    readCurrentLearnerTraitEstimatesMock.mockResolvedValue([
      {
        notebookId: "nb_1",
        userId: "user_1",
        trait: "confidenceStyle",
        value: "calibrated",
        confidence: 0.7,
        lane: "inferred",
        evidenceRefs: [{ refType: "trait_signal", refId: "lts_prior" }],
        contradictionRefs: [{ refType: "self_report", refId: "turn_low_confidence" }],
        decay: {},
        lastUpdatedReason: "prior evidence",
      },
    ]);

    const packet = await collectLearnerTraitEvidencePacket(createDbClient({}), {
      notebookId: "nb_1",
      userId: "user_1",
      trigger: {
        shouldEstimate: true,
        reasons: ["strong_estimate_contradiction"],
        evidenceRefs: [],
        traitFamilies: ["confidenceStyle"],
      },
    });

    expect(packet.contradictionRefs).toEqual([
      { refType: "self_report", refId: "turn_low_confidence" },
    ]);
  });

  it("prioritizes explicit self-report over conflicting inferred behavior in the packet", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([
      signal({
        id: "lts_inferred",
        source: "behavior_extraction",
        trait: "pacePreference",
        suggestedValue: "fast",
        strength: 0.55,
      }),
      signal({
        id: "lts_explicit",
        source: "explicit_self_report",
        trait: "pacePreference",
        suggestedValue: "slow",
        strength: 0.95,
      }),
    ]);

    const packet = await collectLearnerTraitEvidencePacket(createDbClient({}), {
      notebookId: "nb_1",
      userId: "user_1",
      trigger: {
        shouldEstimate: true,
        reasons: ["explicit_preference_change"],
        evidenceRefs: [],
        traitFamilies: ["pacePreference"],
      },
    });

    expect(packet.signals.map((entry) => entry.id)).toEqual(["lts_explicit", "lts_inferred"]);
    expect(packet.signals[0]?.source).toBe("explicit_self_report");
  });

  it("includes mastery evidence pattern signals derived from persisted mastery evidence", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([]);

    const packet = await collectLearnerTraitEvidencePacket(
      createDbClient({
        masteryRows: [
          {
            id: "mev_1",
            turnId: "turn_1",
            sessionId: "sess_1",
            evidenceJson: {
              evidenceType: "self_report",
              correctnessLabel: "incorrect",
              confidence: 0.88,
            },
          },
        ],
      }),
      {
        notebookId: "nb_1",
        userId: "user_1",
        trigger: {
          shouldEstimate: true,
          reasons: ["mastery_self_report_contradiction"],
          evidenceRefs: [{ refType: "mastery_evidence", refId: "mev_1" }],
          traitFamilies: ["confidenceStyle"],
        },
      },
    );

    expect(packet.signals).toEqual([
      expect.objectContaining({
        source: "mastery_evidence_pattern",
        trait: "confidenceStyle",
        suggestedValue: "overconfident",
      }),
      expect.objectContaining({
        source: "mastery_evidence_pattern",
        trait: "metacognitiveAccuracy",
        suggestedValue: "low",
      }),
    ]);
  });

  it("builds an empty-context packet when no trait evidence exists", async () => {
    readRecentLearnerTraitSignalsMock.mockResolvedValue([]);

    const packet = await collectLearnerTraitEvidencePacket(createDbClient({}), {
      notebookId: "nb_1",
      userId: "user_1",
      trigger: {
        shouldEstimate: false,
        reasons: [],
        evidenceRefs: [],
        traitFamilies: [],
      },
      now: () => new Date("2026-05-25T09:00:00.000Z"),
    });

    expect(packet.signals).toEqual([]);
    expect(packet.masteryEvidenceSummaries).toEqual([]);
    expect(packet.sessionSummaries).toEqual([]);
  });
});
