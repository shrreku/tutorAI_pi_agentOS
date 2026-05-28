import { describe, expect, it } from "vitest";
import type { LearnerTraitEstimate, LearnerTraitSignal } from "@studyagent/schemas";
import { buildLearnerTraitEvidencePacket, detectLearnerTraitEstimationTrigger } from "./learner-trait-estimation.js";

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

describe("learner trait estimation trigger detector", () => {
  it("triggers for explicit preference changes", () => {
    const summary = detectLearnerTraitEstimationTrigger({
      signals: [signal({ source: "explicit_self_report", trait: "pacePreference", suggestedValue: "slow" })],
    });

    expect(summary.shouldEstimate).toBe(true);
    expect(summary.reasons).toContain("explicit_preference_change");
  });

  it("triggers for repeated trait-family signals and tutor-observed friction", () => {
    const summary = detectLearnerTraitEstimationTrigger({
      signals: [signal({ id: "lts_1" }), signal({ id: "lts_2", evidenceRefs: [{ refType: "tutor_observation", refId: "turn_2" }] })],
    });

    expect(summary.reasons).toContain("repeated_trait_family_signals");
    expect(summary.reasons).toContain("repeated_tutor_observed_friction");
  });

  it("triggers for mastery/self-report contradiction and urgency changes", () => {
    const summary = detectLearnerTraitEstimationTrigger({
      signals: [
        signal({
          source: "mastery_evidence_pattern",
          trait: "confidenceStyle",
          suggestedValue: "overconfident",
          evidenceRefs: [{ refType: "mastery_evidence", refId: "mev_1" }],
        }),
        signal({ source: "explicit_self_report", trait: "urgencyContext", suggestedValue: "exam_prep" }),
      ],
    });

    expect(summary.reasons).toContain("mastery_self_report_contradiction");
    expect(summary.reasons).toContain("goal_or_urgency_change");
  });

  it("does not trigger on a one-off low-signal observation", () => {
    const summary = detectLearnerTraitEstimationTrigger({
      signals: [signal({ source: "tutor_observation", strength: 0.3 })],
    });

    expect(summary.shouldEstimate).toBe(false);
  });

  it("triggers on strong contradiction against an existing estimate", () => {
    const currentEstimate: LearnerTraitEstimate = {
      trait: "pacePreference",
      value: "fast",
      confidence: 0.8,
      lane: "explicit",
      evidenceRefs: [{ refType: "trait_signal", refId: "lts_old" }],
      contradictionRefs: [],
      decay: {},
      lastUpdatedReason: "prior preference",
    };
    const summary = detectLearnerTraitEstimationTrigger({
      currentEstimates: [currentEstimate],
      signals: [signal({ trait: "pacePreference", suggestedValue: "slow", strength: 0.9 })],
    });

    expect(summary.reasons).toContain("strong_estimate_contradiction");
  });
});

describe("learner trait evidence packet builder", () => {
  it("builds a bounded notebook-scoped packet", () => {
    const trigger = detectLearnerTraitEstimationTrigger({
      signals: [signal({ source: "explicit_self_report", trait: "assessmentPreference", suggestedValue: "quiz" })],
    });
    const packet = buildLearnerTraitEvidencePacket({
      notebookId: "nb_1",
      userId: "user_1",
      trigger,
      signals: [
        signal({ id: "lts_kept", source: "explicit_self_report", trait: "assessmentPreference", suggestedValue: "quiz" }),
        signal({ id: "lts_other", notebookId: "nb_other" }),
      ],
      currentEstimates: [],
      masteryEvidenceSummaries: [{ evidenceRef: { refType: "mastery_evidence", refId: "mev_1" }, summary: "Learner solved the checkpoint." }],
      profileSummary: "Prefers practice after explanations.",
      now: () => new Date("2026-05-25T08:30:00.000Z"),
    });

    expect(packet.signals.map((entry) => entry.id)).toEqual(["lts_kept"]);
    expect(packet.masteryEvidenceSummaries[0]?.evidenceRef.refId).toBe("mev_1");
    expect(packet.builtAt).toBe("2026-05-25T08:30:00.000Z");
  });

  it("preserves contradiction context from current estimates", () => {
    const trigger = detectLearnerTraitEstimationTrigger({
      signals: [signal({ source: "explicit_self_report", trait: "confidenceStyle", suggestedValue: "underconfident" })],
    });
    const packet = buildLearnerTraitEvidencePacket({
      notebookId: "nb_1",
      userId: "user_1",
      trigger,
      signals: [signal({ source: "explicit_self_report", trait: "confidenceStyle", suggestedValue: "underconfident" })],
      currentEstimates: [{
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
      }],
    });

    expect(packet.contradictionRefs).toEqual([{ refType: "self_report", refId: "turn_low_confidence" }]);
  });
});
