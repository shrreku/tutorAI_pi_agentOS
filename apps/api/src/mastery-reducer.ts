import {
  MASTERY_EVIDENCE_LOW_CONFIDENCE_THRESHOLD,
  MASTERY_EVIDENCE_UNCERTAINTY_THRESHOLD,
  type MasteryEvidence,
  type MasteryEvidenceType,
} from "@studyagent/schemas";

const EVIDENCE_TYPE_WEIGHT: Record<MasteryEvidenceType, number> = {
  mastery_check: 1,
  quiz_artifact: 0.95,
  repeated_mistake: 0.85,
  open_explanation: 0.7,
  tutor_observation: 0.55,
  self_report: 0.35,
};

const LABEL_SIGN: Record<MasteryEvidence["correctnessLabel"], number> = {
  correct: 1,
  partial: 0.45,
  incorrect: -1,
  needs_more_evidence: 0,
};

export function shouldApplyStrongMasteryUpdate(evidence: MasteryEvidence): boolean {
  return (
    evidence.confidence >= MASTERY_EVIDENCE_LOW_CONFIDENCE_THRESHOLD &&
    evidence.uncertainty < MASTERY_EVIDENCE_UNCERTAINTY_THRESHOLD &&
    evidence.correctnessLabel !== "needs_more_evidence"
  );
}

export function computeMasteryDeltaForEvidence(evidence: MasteryEvidence, conceptId: string): number {
  const conceptScore = evidence.conceptScores.find((entry) => entry.conceptId === conceptId);
  if (!conceptScore) return 0;

  const typeWeight = EVIDENCE_TYPE_WEIGHT[evidence.evidenceType];
  const sign = LABEL_SIGN[evidence.correctnessLabel];
  if (sign === 0) return 0;

  const confidenceScale = shouldApplyStrongMasteryUpdate(evidence) ? evidence.confidence : Math.min(evidence.confidence, 0.35);
  const uncertaintyPenalty = 1 - evidence.uncertainty * 0.5;
  const baseMagnitude = Math.abs(conceptScore.delta) > 0 ? Math.abs(conceptScore.delta) : 0.08;

  return Number((sign * baseMagnitude * typeWeight * confidenceScale * uncertaintyPenalty).toFixed(4));
}

export function computeNextReviewDays(evidence: MasteryEvidence): number {
  switch (evidence.correctnessLabel) {
    case "correct":
      return 7;
    case "partial":
      return 3;
    case "incorrect":
      return 1;
    default:
      return 2;
  }
}
