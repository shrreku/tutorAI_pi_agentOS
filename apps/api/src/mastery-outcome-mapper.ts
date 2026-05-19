import {
  buildMasteryEvidenceId,
  masteryScoreToReadiness,
  type MasteryEvidence,
  type MasteryEvidenceType,
  type MasteryCorrectnessLabel,
} from "@studyagent/schemas";

type LearningOutcome = "correct" | "incorrect" | "again" | "hard" | "good" | "easy";

const OUTCOME_LABEL: Record<LearningOutcome, MasteryCorrectnessLabel> = {
  correct: "correct",
  incorrect: "incorrect",
  again: "incorrect",
  hard: "partial",
  good: "partial",
  easy: "correct",
};

const OUTCOME_SCORE: Record<LearningOutcome, number> = {
  correct: 0.95,
  incorrect: 0.1,
  again: 0.15,
  hard: 0.45,
  good: 0.7,
  easy: 0.92,
};

const OUTCOME_EVIDENCE_TYPE: Record<string, MasteryEvidenceType> = {
  quiz_attempt: "quiz_artifact",
  flashcard_review: "quiz_artifact",
  learning_outcome: "tutor_observation",
};

export function buildMasteryEvidenceFromOutcome(input: {
  notebookId: string;
  userId: string;
  conceptIds: string[];
  outcome: LearningOutcome;
  reason: string;
  sessionId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
}): MasteryEvidence {
  const label = OUTCOME_LABEL[input.outcome];
  const overallScore = OUTCOME_SCORE[input.outcome];
  const evidenceType = OUTCOME_EVIDENCE_TYPE[input.reason] ?? "tutor_observation";
  const deltaByOutcome: Record<LearningOutcome, number> = {
    correct: 0.14,
    incorrect: -0.2,
    again: -0.12,
    hard: -0.04,
    good: 0.08,
    easy: 0.14,
  };
  const delta = deltaByOutcome[input.outcome];

  const conceptScores = input.conceptIds.map((conceptId) => ({
    conceptId,
    score: Math.min(1, Math.max(0, 0.35 + delta)),
    delta,
    role: "primary" as const,
  }));
  const avg =
    conceptScores.length > 0
      ? conceptScores.reduce((sum, entry) => sum + entry.score, 0) / conceptScores.length
      : overallScore;

  return {
    id: buildMasteryEvidenceId(),
    notebookId: input.notebookId,
    userId: input.userId,
    correctnessLabel: label,
    overallScore,
    conceptScores,
    misconceptions:
      label === "incorrect"
        ? input.conceptIds.slice(0, 1).map((conceptId) => ({
            conceptId,
            description: input.reason,
          }))
        : [],
    readiness: masteryScoreToReadiness(avg),
    tutoringIntervention: label === "correct" ? "advance" : label === "partial" ? "guided_practice" : "reteach",
    uncertainty: label === "needs_more_evidence" ? 0.8 : 0.2,
    confidence: label === "incorrect" ? 0.85 : 0.75,
    evidenceType,
    triggerSource: input.reason === "quiz_attempt" ? "quiz_attempt" : "tutor_tool",
    sourceRefs: [],
    contextRefs: [],
    sessionId: input.sessionId,
    runId: input.runId,
    evaluatorProvenance: {
      mode: "deterministic",
      model: null,
      fallbackUsed: false,
      notes: `Mapped legacy outcome ${input.outcome} (${input.reason})`,
    },
    learnerAnswerSummary: typeof input.metadata?.answer === "string" ? input.metadata.answer : undefined,
    createdAt: new Date().toISOString(),
  };
}
