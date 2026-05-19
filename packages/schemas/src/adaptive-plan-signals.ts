import { z } from "zod";
import {
  MASTERY_EVIDENCE_LOW_CONFIDENCE_THRESHOLD,
  MASTERY_EVIDENCE_UNCERTAINTY_THRESHOLD,
  type MasteryEvidence,
} from "./mastery-evidence.js";
import { idSchema, nodeRefSchema } from "./ids.js";

export const adaptivePlanSignalTypeSchema = z.enum([
  "checkpoint_performance",
  "repeated_mistake",
  "learner_self_report",
  "mastery_change",
  "weak_concept_recurrence",
  "source_coverage_gap",
  "multi_turn_confusion",
  "vague_message",
]);

export type AdaptivePlanSignalType = z.infer<typeof adaptivePlanSignalTypeSchema>;

export const learnerConfirmationStateSchema = z.enum(["unconfirmed", "confirmed", "rejected"]);

export type LearnerConfirmationState = z.infer<typeof learnerConfirmationStateSchema>;

export const adaptivePlanSignalSchema = z.object({
  id: idSchema,
  signalType: adaptivePlanSignalTypeSchema,
  targetRefs: z.array(nodeRefSchema).default([]),
  confidence: z.number().min(0).max(1),
  sourceRefs: z.array(nodeRefSchema).default([]),
  turnRefs: z.array(z.object({ refType: z.enum(["turn", "session", "run"]), refId: idSchema })).default([]),
  learnerConfirmation: learnerConfirmationStateSchema.default("unconfirmed"),
  reason: z.string().min(1),
});

export type AdaptivePlanSignal = z.infer<typeof adaptivePlanSignalSchema>;

export const DURABLE_PLAN_CHANGE_CONFIDENCE_THRESHOLD = 0.55;

const DURABLE_SIGNAL_TYPES = new Set<AdaptivePlanSignalType>([
  "checkpoint_performance",
  "repeated_mistake",
  "learner_self_report",
  "mastery_change",
  "weak_concept_recurrence",
  "source_coverage_gap",
  "multi_turn_confusion",
]);

export function shouldApplyDurablePlanChange(signals: AdaptivePlanSignal[]): boolean {
  const durable = signals.filter(
    (signal) => DURABLE_SIGNAL_TYPES.has(signal.signalType) && signal.confidence >= DURABLE_PLAN_CHANGE_CONFIDENCE_THRESHOLD,
  );
  return durable.length > 0;
}

export function wrapRecommendationReasonJson(input: {
  signals: AdaptivePlanSignal[];
  patch: Record<string, unknown>;
  masteryEvidenceIds?: string[];
}): Record<string, unknown> {
  return {
    ...input.patch,
    strategy: "adaptive_regeneration_from_learning_state",
    adaptivePlanSignalIds: input.signals.map((signal) => signal.id),
    adaptivePlanSignals: input.signals,
    durableChangeApplied: shouldApplyDurablePlanChange(input.signals),
    ...(input.masteryEvidenceIds?.length ? { masteryEvidenceIds: input.masteryEvidenceIds } : {}),
  };
}

export function buildAdaptivePlanSignalsFromMasteryEvidence(
  evidence: MasteryEvidence,
  context: {
    sourceCoverageGap?: boolean;
    vagueLearnerMessage?: boolean;
    recentWeakConceptFrequencyById?: Record<string, number>;
    weakConceptIds?: string[];
  } = {},
): AdaptivePlanSignal[] {
  if (context.vagueLearnerMessage) {
    return buildAdaptivePlanSignals({ vagueLearnerMessage: true });
  }

  const tooUncertain =
    evidence.correctnessLabel === "needs_more_evidence" ||
    evidence.uncertainty >= MASTERY_EVIDENCE_UNCERTAINTY_THRESHOLD ||
    evidence.confidence < MASTERY_EVIDENCE_LOW_CONFIDENCE_THRESHOLD;
  if (tooUncertain) {
    return [];
  }

  const turnRef = evidence.turnId
    ? { refType: "turn" as const, refId: evidence.turnId }
    : evidence.sessionId
      ? { refType: "session" as const, refId: evidence.sessionId }
      : null;

  const misconceptionConceptIds = evidence.misconceptions.map((entry) => entry.conceptId);
  const diagnosticConceptIds = evidence.conceptScores
    .filter((entry) => entry.delta < 0 || entry.score < 0.5)
    .map((entry) => entry.conceptId);
  const masteryIncreasedConceptIds =
    evidence.tutoringIntervention === "advance" ||
    (evidence.correctnessLabel === "correct" && evidence.confidence >= 0.7)
      ? evidence.conceptScores.filter((entry) => entry.score >= 0.65 || entry.delta > 0).map((entry) => entry.conceptId)
      : [];
  const weakConceptIds =
    context.weakConceptIds ??
    evidence.conceptScores.filter((entry) => entry.score < 0.45).map((entry) => entry.conceptId);

  return buildAdaptivePlanSignals({
    weakConceptIds,
    misconceptionConceptIds,
    diagnosticConceptIds,
    ...(context.recentWeakConceptFrequencyById
      ? { recentWeakConceptFrequencyById: context.recentWeakConceptFrequencyById }
      : {}),
    ...(context.sourceCoverageGap ? { sourceCoverageGap: true } : {}),
    masteryIncreasedConceptIds,
    checkpointFailed:
      evidence.evidenceType === "mastery_check" &&
      (evidence.correctnessLabel === "incorrect" || evidence.correctnessLabel === "partial"),
    selfReported: evidence.evidenceType === "self_report",
    multiTurnConfusion: evidence.tutoringIntervention === "clarify" && evidence.uncertainty >= 0.5,
    ...(turnRef ? { turnRef } : {}),
    sourceRefs: evidence.sourceRefs,
  });
}

export function buildAdaptivePlanSignals(input: {
  weakConceptIds?: string[];
  misconceptionConceptIds?: string[];
  diagnosticConceptIds?: string[];
  recentWeakConceptFrequencyById?: Record<string, number>;
  sourceCoverageGap?: boolean;
  vagueLearnerMessage?: boolean;
  masteryIncreasedConceptIds?: string[];
  selfReported?: boolean;
  checkpointFailed?: boolean;
  multiTurnConfusion?: boolean;
  moduleAdvancementReady?: boolean;
  nextObjectiveIds?: string[];
  turnRef?: { refType: "turn" | "session" | "run"; refId: string } | null;
  sourceRefs?: Array<{ refType: string; refId: string }>;
}): AdaptivePlanSignal[] {
  const signals: AdaptivePlanSignal[] = [];
  let seq = 0;
  const nextId = () => `aps_${(++seq).toString(36)}`;

  if (input.vagueLearnerMessage) {
    signals.push({
      id: nextId(),
      signalType: "vague_message",
      targetRefs: [],
      confidence: 0.2,
      sourceRefs: [],
      turnRefs: input.turnRef ? [input.turnRef] : [],
      learnerConfirmation: "unconfirmed",
      reason: "Learner message was too vague to justify a durable plan change.",
    });
    return signals;
  }

  if (input.checkpointFailed) {
    signals.push({
      id: nextId(),
      signalType: "checkpoint_performance",
      targetRefs: (input.diagnosticConceptIds ?? []).map((refId) => ({ refType: "concept" as const, refId })),
      confidence: 0.78,
      sourceRefs: (input.sourceRefs ?? []).map((ref) => ({ refType: ref.refType as "source", refId: ref.refId })),
      turnRefs: input.turnRef ? [input.turnRef] : [],
      learnerConfirmation: "unconfirmed",
      reason: "Checkpoint performance showed the learner needs remediation.",
    });
  }

  for (const conceptId of input.misconceptionConceptIds ?? []) {
    signals.push({
      id: nextId(),
      signalType: "repeated_mistake",
      targetRefs: [{ refType: "concept", refId: conceptId }],
      confidence: 0.82,
      sourceRefs: [],
      turnRefs: input.turnRef ? [input.turnRef] : [],
      learnerConfirmation: "unconfirmed",
      reason: `Repeated mistake detected for concept ${conceptId}.`,
    });
  }

  const frequency = input.recentWeakConceptFrequencyById ?? {};
  for (const conceptId of input.weakConceptIds ?? []) {
    const count = frequency[conceptId] ?? 1;
    if ((input.misconceptionConceptIds ?? []).includes(conceptId)) continue;
    signals.push({
      id: nextId(),
      signalType: "weak_concept_recurrence",
      targetRefs: [{ refType: "concept", refId: conceptId }],
      confidence: clampConfidence(0.52 + count * 0.1),
      sourceRefs: [],
      turnRefs: input.turnRef ? [input.turnRef] : [],
      learnerConfirmation: "unconfirmed",
      reason: `Weak concept ${conceptId} recurred ${count} times recently.`,
    });
  }

  for (const conceptId of input.diagnosticConceptIds ?? []) {
    if ((input.misconceptionConceptIds ?? []).includes(conceptId)) continue;
    signals.push({
      id: nextId(),
      signalType: "checkpoint_performance",
      targetRefs: [{ refType: "concept", refId: conceptId }],
      confidence: 0.74,
      sourceRefs: [],
      turnRefs: input.turnRef ? [input.turnRef] : [],
      learnerConfirmation: "unconfirmed",
      reason: `Diagnostic evidence flagged concept ${conceptId}.`,
    });
  }

  for (const conceptId of input.masteryIncreasedConceptIds ?? []) {
    signals.push({
      id: nextId(),
      signalType: "mastery_change",
      targetRefs: [{ refType: "concept", refId: conceptId }],
      confidence: 0.7,
      sourceRefs: [],
      turnRefs: input.turnRef ? [input.turnRef] : [],
      learnerConfirmation: "unconfirmed",
      reason: `Mastery improved for concept ${conceptId}.`,
    });
  }

  if (input.selfReported) {
    signals.push({
      id: nextId(),
      signalType: "learner_self_report",
      targetRefs: [],
      confidence: 0.62,
      sourceRefs: (input.sourceRefs ?? []).map((ref) => ({ refType: ref.refType as "source", refId: ref.refId })),
      turnRefs: input.turnRef ? [input.turnRef] : [],
      learnerConfirmation: "unconfirmed",
      reason: "Learner self-reported readiness or confusion.",
    });
  }

  if (input.sourceCoverageGap) {
    signals.push({
      id: nextId(),
      signalType: "source_coverage_gap",
      targetRefs: (input.sourceRefs ?? []).map((ref) => ({ refType: ref.refType as "source", refId: ref.refId })),
      confidence: 0.76,
      sourceRefs: (input.sourceRefs ?? []).map((ref) => ({ refType: ref.refType as "source", refId: ref.refId })),
      turnRefs: input.turnRef ? [input.turnRef] : [],
      learnerConfirmation: "unconfirmed",
      reason: "Selected sources did not cover the requested teaching context.",
    });
  }

  if (input.moduleAdvancementReady) {
    signals.push({
      id: nextId(),
      signalType: "mastery_change",
      targetRefs: (input.nextObjectiveIds ?? []).map((refId) => ({ refType: "objective" as const, refId })),
      confidence: 0.72,
      sourceRefs: [],
      turnRefs: input.turnRef ? [input.turnRef] : [],
      learnerConfirmation: "unconfirmed",
      reason: "Current module objectives are complete; advancing the session plan.",
    });
  }

  if (input.multiTurnConfusion) {
    signals.push({
      id: nextId(),
      signalType: "multi_turn_confusion",
      targetRefs: (input.weakConceptIds ?? []).map((refId) => ({ refType: "concept" as const, refId })),
      confidence: 0.68,
      sourceRefs: [],
      turnRefs: input.turnRef ? [input.turnRef] : [],
      learnerConfirmation: "unconfirmed",
      reason: "Learner showed sustained confusion across multiple turns.",
    });
  }

  return signals;
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}
