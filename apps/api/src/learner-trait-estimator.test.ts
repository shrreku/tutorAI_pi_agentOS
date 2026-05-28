import { describe, expect, it, vi } from "vitest";
import type { LearnerTraitEstimate, LearnerTraitEvidencePacket, LearnerTraitProposal, LearnerTraitSignal } from "@studyagent/schemas";
import { learnerTraitEstimates, learnerTraitSignals } from "@studyagent/db";
import {
  applyLearnerTraitProposalGuardrails,
  createOpenRouterLearnerTraitEstimatorClient,
  derivePersonalizationRecommendations,
  runLearnerTraitEstimationCycle,
} from "./learner-trait-estimation.js";

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
    observedAt: "2026-05-25T08:00:00.000Z",
    ...patch,
  } as LearnerTraitSignal;
}

function packet(signals: LearnerTraitSignal[] = [signal()]): LearnerTraitEvidencePacket {
  return {
    packetId: "ltp_packet",
    notebookId: "nb_1",
    userId: "user_1",
    trigger: {
      shouldEstimate: true,
      reasons: ["explicit_preference_change"],
      evidenceRefs: [{ refType: "self_report", refId: "turn_1" }],
      traitFamilies: ["pacePreference"],
    },
    signals,
    currentEstimates: [],
    masteryEvidenceSummaries: [],
    sessionSummaries: [],
    contradictionRefs: [],
    builtAt: "2026-05-25T08:05:00.000Z",
  };
}

function proposal(patch: Partial<LearnerTraitProposal> = {}): LearnerTraitProposal {
  return {
    proposalId: patch.proposalId ?? "proposal_1",
    notebookId: patch.notebookId ?? "nb_1",
    userId: patch.userId ?? "user_1",
    trait: patch.trait ?? "pacePreference",
    value: patch.value ?? "slow",
    confidence: patch.confidence ?? 0.9,
    lane: patch.lane ?? "explicit",
    evidenceRefs: patch.evidenceRefs ?? [{ refType: "self_report", refId: "turn_1" }],
    contradictionRefs: patch.contradictionRefs ?? [],
    updateReason: patch.updateReason ?? "explicit learner preference",
    recommendationText: patch.recommendationText ?? "Use smaller steps.",
    safetyNotes: patch.safetyNotes ?? [],
  } as LearnerTraitProposal;
}

describe("learner trait estimator client and guardrails", () => {
  it("parses strict proposal JSON from an OpenRouter-compatible model", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ proposals: [proposal()] }) } }],
      }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const client = createOpenRouterLearnerTraitEstimatorClient({
      apiKey: "key",
      baseUrl: "https://example.invalid",
      model: "trait-model",
    });

    await expect(client.propose(packet())).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("https://example.invalid/chat/completions", expect.any(Object));
    vi.unstubAllGlobals();
  });

  it("normalizes close model proposal JSON before schema validation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              proposals: [{
                trait: "examplePreference",
                value: "visual examples",
                evidenceRefs: [],
                rationale: "The learner explicitly asked for visual examples.",
              }],
            }),
          },
        }],
      }),
    })));
    const client = createOpenRouterLearnerTraitEstimatorClient({
      apiKey: "key",
      baseUrl: "https://example.invalid",
      model: "trait-model",
    });

    await expect(client.propose(packet([
      signal({
        trait: "examplePreference",
        suggestedValue: "visual",
        evidenceRefs: [{ refType: "session_trace", refId: "sess_1" }],
      }),
    ]))).resolves.toMatchObject([
      {
        notebookId: "nb_1",
        userId: "user_1",
        trait: "examplePreference",
        value: "visual",
        confidence: 0.9,
        lane: "explicit",
        evidenceRefs: [{ refType: "session_trace", refId: "sess_1" }],
      },
    ]);
    vi.unstubAllGlobals();
  });

  it("fails cleanly for invalid model output", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ proposals: [{ nope: true }] }) } }] }),
    })));
    const client = createOpenRouterLearnerTraitEstimatorClient({
      apiKey: "key",
      baseUrl: "https://example.invalid",
      model: "trait-model",
    });

    await expect(client.propose(packet())).rejects.toThrow();
    vi.unstubAllGlobals();
  });

  it("accepts, caps, and rejects proposals deterministically", () => {
    const accepted = applyLearnerTraitProposalGuardrails({ proposal: proposal(), packet: packet() });
    const capped = applyLearnerTraitProposalGuardrails({
      proposal: proposal({ lane: "inferred", confidence: 0.95, evidenceRefs: [{ refType: "self_report", refId: "turn_1" }] }),
      packet: packet([signal({ source: "tutor_observation", strength: 0.7 })]),
    });
    const rejected = applyLearnerTraitProposalGuardrails({
      proposal: proposal({ evidenceRefs: [{ refType: "self_report", refId: "outside_packet" }] }),
      packet: packet(),
    });

    expect(accepted.status).toBe("accepted");
    expect(capped.status).toBe("capped");
    expect(capped.acceptedEstimate?.confidence).toBeLessThan(0.95);
    expect(rejected.status).toBe("rejected");
    expect(rejected.acceptedEstimate).toBeUndefined();
  });

  it("preserves explicit preferences when inferred evidence conflicts", () => {
    const current: LearnerTraitEstimate = {
      trait: "pacePreference",
      value: "slow",
      lane: "explicit",
      confidence: 0.9,
      evidenceRefs: [{ refType: "trait_signal", refId: "lts_old" }],
      lastUpdatedReason: "explicit preference",
    };
    const rejected = applyLearnerTraitProposalGuardrails({
      proposal: proposal({ lane: "inferred", value: "fast" }),
      packet: packet(),
      currentEstimates: [current],
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.reasons.join(" ")).toContain("explicit preference");
  });

  it("derives recommendation-only tutor guidance", () => {
    const recommendations = derivePersonalizationRecommendations({
      notebookId: "nb_1",
      userId: "user_1",
      estimates: [{
        trait: "confidenceStyle",
        value: "underconfident",
        lane: "inferred",
        confidence: 0.7,
        evidenceRefs: [{ refType: "mastery_evidence", refId: "mev_1" }],
        lastUpdatedReason: "low confidence with strong answers",
      }],
    });

    expect(recommendations[0]?.recommendation).toContain("evidence-backed encouragement");
    expect(recommendations[0]?.includeRawLabel).toBe(false);
  });
});

describe("learner trait session-boundary cycle", () => {
  it("persists accepted estimates and skips rejected proposals", async () => {
    const insertedSignals = [signal()];
    const estimates: LearnerTraitEstimate[] = [];
    const events: Array<{ eventType: string; payloadJson?: unknown }> = [];
    const dbClient = {
      db: {
        select: () => ({
          from: (table: unknown) => ({
            where: () => ({
              orderBy: () => table === learnerTraitSignals
                ? ({
                    limit: async () => insertedSignals.map((entry) => ({ signalJson: entry })),
                  })
                : Promise.resolve(estimates.map((entry) => ({ estimateJson: entry, updatedAt: new Date() }))),
            }),
          }),
        }),
        insert: (table: unknown) => ({
          values: (value: unknown) => ({
            onConflictDoUpdate: async () => {
              const record = value as { estimateJson?: LearnerTraitEstimate };
              if (table === learnerTraitEstimates && record.estimateJson) estimates.push(record.estimateJson);
            },
          }),
        }),
        transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
          execute: async () => undefined,
          select: () => ({ from: () => ({ where: async () => [{ m: events.length }] }) }),
          insert: () => ({ values: async (value: { eventType: string; payloadJson: unknown }) => events.push(value) }),
        }),
      },
    } as never;

    const result = await runLearnerTraitEstimationCycle({
      dbClient,
      notebookId: "nb_1",
      userId: "user_1",
      sessionId: "sess_1",
      estimator: {
        async propose() {
          return [
            proposal(),
            proposal({ proposalId: "proposal_bad", evidenceRefs: [{ refType: "self_report", refId: "outside_packet" }] }),
          ];
        },
      },
    });

    expect(result.persistedEstimateIds).toHaveLength(1);
    expect(result.guardrailDecisions.map((decision) => decision.status)).toEqual(["accepted", "rejected"]);
  });
});
