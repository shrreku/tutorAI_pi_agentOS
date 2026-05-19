import {
  buildMasteryEvidenceId,
  masteryEvidenceSchema,
  masteryScoreToReadiness,
  MASTERY_EVIDENCE_LOW_CONFIDENCE_THRESHOLD,
  MASTERY_EVIDENCE_UNCERTAINTY_THRESHOLD,
  type MasteryEvidence,
  type MasteryEvidenceInput,
  type MasteryEvidenceType,
  type MasteryEvidenceTriggerSource,
  type MasteryCorrectnessLabel,
  type TutoringIntervention,
} from "@studyagent/schemas";
import { z } from "zod";

export type MasteryEvaluatorJudgeResult = {
  correctnessLabel: MasteryCorrectnessLabel;
  overallScore: number;
  confidence: number;
  uncertainty: number;
  misconceptions: Array<{ conceptId: string; description: string }>;
  tutoringIntervention: TutoringIntervention;
  notes: string;
};

const masteryEvaluatorJudgeResultSchema = z.object({
  correctnessLabel: z.enum(["correct", "partial", "incorrect", "needs_more_evidence"]),
  overallScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  uncertainty: z.number().min(0).max(1),
  misconceptions: z.array(z.object({ conceptId: z.string().min(1), description: z.string().min(1) })),
  tutoringIntervention: z.enum(["clarify", "reteach", "worked_example", "guided_practice", "quick_check", "advance"]),
  notes: z.string().min(1),
}) satisfies z.ZodType<MasteryEvaluatorJudgeResult>;

export type MasteryEvaluatorJudge = (
  input: MasteryEvidenceInput & { notebookId: string; userId: string },
) => Promise<MasteryEvaluatorJudgeResult>;

export type EvaluateLearnerResponseInput = MasteryEvidenceInput & {
  notebookId: string;
  userId: string;
  sessionId?: string | undefined;
  turnId?: string | undefined;
  runId?: string | undefined;
  evidenceType?: MasteryEvidenceType | undefined;
  triggerSource?: MasteryEvidenceTriggerSource | undefined;
};

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenOverlapScore(left: string, right: string): number {
  const a = new Set(normalizeAnswer(left).split(/\W+/).filter(Boolean));
  const b = new Set(normalizeAnswer(right).split(/\W+/).filter(Boolean));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

function deterministicJudge(input: EvaluateLearnerResponseInput): MasteryEvaluatorJudgeResult {
  const learner = normalizeAnswer(input.learnerAnswer);
  if (/\b(i don'?t know|not sure|no idea|idk|maybe)\b/.test(learner)) {
    return {
      correctnessLabel: "needs_more_evidence",
      overallScore: 0.2,
      confidence: 0.3,
      uncertainty: 0.85,
      misconceptions: [],
      tutoringIntervention: "quick_check",
      notes: "Learner expressed uncertainty.",
    };
  }

  if (input.referenceAnswer) {
    const reference = normalizeAnswer(input.referenceAnswer);
    if (learner === reference) {
      return {
        correctnessLabel: "correct",
        overallScore: 1,
        confidence: 0.95,
        uncertainty: 0.05,
        misconceptions: [],
        tutoringIntervention: "advance",
        notes: "Exact normalized answer match.",
      };
    }
    const overlap = tokenOverlapScore(input.learnerAnswer, input.referenceAnswer);
    if (overlap >= 0.75) {
      return {
        correctnessLabel: "partial",
        overallScore: 0.65,
        confidence: 0.72,
        uncertainty: 0.28,
        misconceptions: [],
        tutoringIntervention: "guided_practice",
        notes: "High token overlap with reference answer.",
      };
    }
    return {
      correctnessLabel: "incorrect",
      overallScore: 0.15,
      confidence: 0.8,
      uncertainty: 0.2,
      misconceptions: input.conceptRoles.slice(0, 1).map((role) => ({
        conceptId: role.conceptId,
        description: "Answer diverged from the reference response.",
      })),
      tutoringIntervention: "reteach",
      notes: "Low overlap with reference answer.",
    };
  }

  if (learner.length < 8) {
    return {
      correctnessLabel: "needs_more_evidence",
      overallScore: 0.25,
      confidence: 0.35,
      uncertainty: 0.8,
      misconceptions: [],
      tutoringIntervention: "clarify",
      notes: "Answer too short for confident judgment.",
    };
  }

  return {
    correctnessLabel: "partial",
    overallScore: 0.5,
    confidence: 0.55,
    uncertainty: 0.45,
    misconceptions: [],
    tutoringIntervention: "guided_practice",
    notes: "Heuristic partial credit without reference answer.",
  };
}

function labelToDelta(label: MasteryCorrectnessLabel): number {
  switch (label) {
    case "correct":
      return 0.14;
    case "partial":
      return 0.05;
    case "incorrect":
      return -0.18;
    default:
      return 0;
  }
}

function buildConceptScores(
  input: EvaluateLearnerResponseInput,
  judgment: MasteryEvaluatorJudgeResult,
): MasteryEvidence["conceptScores"] {
  const baseDelta = labelToDelta(judgment.correctnessLabel);
  return input.conceptRoles.map((role) => {
    const prior = input.masterySnapshot[role.conceptId] ?? 0.35;
    const roleWeight = role.role === "primary" ? 1 : role.role === "secondary" ? 0.7 : 0.45;
    const delta = Number((baseDelta * roleWeight * judgment.confidence).toFixed(4));
    const score = Math.min(1, Math.max(0, prior + delta));
    return {
      conceptId: role.conceptId,
      score,
      delta,
      role: role.role,
    };
  });
}

export async function evaluateLearnerResponse(
  input: EvaluateLearnerResponseInput,
  options: { judge?: MasteryEvaluatorJudge } = {},
): Promise<MasteryEvidence> {
  const evidenceType = input.evidenceType ?? (input.referenceAnswer ? "mastery_check" : "open_explanation");
  const triggerSource = input.triggerSource ?? "tutor_tool";

  let judgment: MasteryEvaluatorJudgeResult;
  let mode: MasteryEvidence["evaluatorProvenance"]["mode"] = "deterministic";
  let fallbackUsed = false;
  let model: string | null = null;

  const shouldUseLlm =
    Boolean(options.judge) &&
    (!input.referenceAnswer || evidenceType === "open_explanation" || evidenceType === "self_report");

  if (shouldUseLlm && options.judge) {
    try {
      judgment = await options.judge(input);
      mode = "llm";
      model = "stub";
      const parsedJudgment = masteryEvaluatorJudgeResultSchema.safeParse(judgment);
      if (!parsedJudgment.success) {
        judgment = deterministicJudge(input);
        mode = "fallback";
        fallbackUsed = true;
        model = null;
      } else {
        judgment = parsedJudgment.data;
      }
    } catch {
      judgment = deterministicJudge(input);
      mode = "fallback";
      fallbackUsed = true;
    }
  } else {
    judgment = deterministicJudge(input);
  }

  if (
    judgment.uncertainty >= MASTERY_EVIDENCE_UNCERTAINTY_THRESHOLD ||
    judgment.confidence < MASTERY_EVIDENCE_LOW_CONFIDENCE_THRESHOLD
  ) {
    judgment = {
      ...judgment,
      correctnessLabel: "needs_more_evidence",
      tutoringIntervention: "quick_check",
    };
  }

  const conceptScores = buildConceptScores(input, judgment);
  const avgScore =
    conceptScores.length > 0
      ? conceptScores.reduce((sum, entry) => sum + entry.score, 0) / conceptScores.length
      : judgment.overallScore;

  const evidence = {
    id: buildMasteryEvidenceId(),
    notebookId: input.notebookId,
    userId: input.userId,
    correctnessLabel: judgment.correctnessLabel,
    overallScore: judgment.overallScore,
    conceptScores,
    misconceptions: judgment.misconceptions,
    readiness: masteryScoreToReadiness(avgScore),
    tutoringIntervention: judgment.tutoringIntervention,
    uncertainty: judgment.uncertainty,
    confidence: judgment.confidence,
    evidenceType,
    triggerSource,
    sourceRefs: input.sourceRefs,
    contextRefs: input.contextRefs,
    sessionId: input.sessionId,
    turnId: input.turnId,
    runId: input.runId,
    objectiveId: input.objectiveId,
    evaluatorProvenance: {
      mode,
      model,
      fallbackUsed,
      notes: judgment.notes,
    },
    tutorQuestionSummary: input.tutorQuestion.slice(0, 500),
    learnerAnswerSummary: input.learnerAnswer.slice(0, 500),
    referenceAnswerSummary: input.referenceAnswer?.slice(0, 500),
    createdAt: new Date().toISOString(),
  };
  return masteryEvidenceSchema.parse(evidence);
}
