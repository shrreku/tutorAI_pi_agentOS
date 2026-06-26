import { and, desc, eq } from "drizzle-orm";
import { appendEvent, masteryEvidence, type DbClient } from "@studyagent/db";
import {
  learnerTraitEstimationPlanSchema,
  type LearnerTraitEstimationPlan,
  type LearnerTraitEstimationSkipReason,
  type LearnerTraitSignal,
} from "@studyagent/schemas";
import { detectLearnerTraitEstimationTrigger } from "./learner-trait-estimation.js";
import { deriveMasteryEvidencePatternSignals } from "./learner-trait-mastery-patterns.js";
import {
  readCurrentLearnerTraitEstimates,
  readRecentLearnerTraitSignals,
} from "./learner-trait-store.js";

const MASTERY_EVIDENCE_LIMIT = 20;

export type PlanLearnerTraitEstimationInput = {
  notebookId: string;
  userId: string;
  sessionId?: string;
  explicitAgentDecision?: boolean;
  endedWithoutTurns?: boolean;
  now?: () => Date;
};

export async function planLearnerTraitEstimation(
  dbClient: DbClient,
  input: PlanLearnerTraitEstimationInput,
): Promise<LearnerTraitEstimationPlan> {
  const plannedAt = (input.now ?? (() => new Date()))().toISOString();

  if (input.endedWithoutTurns) {
    return learnerTraitEstimationPlanSchema.parse({
      planId: `ltplan_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: input.notebookId,
      userId: input.userId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      decision: "skip",
      skipReason: "ended_without_turns",
      trigger: {
        shouldEstimate: false,
        reasons: [],
        evidenceRefs: [],
        traitFamilies: [],
      },
      plannedAt,
    });
  }

  const [signals, currentEstimates, masteryRows] = await Promise.all([
    readRecentLearnerTraitSignals(dbClient, {
      notebookId: input.notebookId,
      userId: input.userId,
      limit: 50,
    }),
    readCurrentLearnerTraitEstimates(dbClient, {
      notebookId: input.notebookId,
      userId: input.userId,
    }),
    dbClient.db
      .select()
      .from(masteryEvidence)
      .where(
        and(
          eq(masteryEvidence.notebookId, input.notebookId),
          eq(masteryEvidence.userId, input.userId),
        ),
      )
      .orderBy(desc(masteryEvidence.createdAt))
      .limit(MASTERY_EVIDENCE_LIMIT),
  ]);

  const patternSignals = deriveMasteryEvidencePatternSignals({
    notebookId: input.notebookId,
    userId: input.userId,
    masteryRows,
    ...(input.now ? { now: input.now } : {}),
  });
  const planningSignals = [...signals, ...patternSignals];

  const trigger = detectLearnerTraitEstimationTrigger({
    signals: planningSignals,
    currentEstimates,
    ...(input.explicitAgentDecision !== undefined
      ? { explicitAgentDecision: input.explicitAgentDecision }
      : {}),
  });

  const skipReason = trigger.shouldEstimate ? undefined : inferSkipReason(planningSignals);
  const plan = learnerTraitEstimationPlanSchema.parse({
    planId: `ltplan_${crypto.randomUUID().replaceAll("-", "")}`,
    notebookId: input.notebookId,
    userId: input.userId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    decision: trigger.shouldEstimate ? "run" : "skip",
    ...(skipReason ? { skipReason } : {}),
    trigger,
    plannedAt,
  });

  return plan;
}

export async function persistLearnerTraitEstimationPlan(
  dbClient: DbClient,
  plan: LearnerTraitEstimationPlan,
): Promise<void> {
  await appendEvent(dbClient, {
    notebookId: plan.notebookId,
    ...(plan.sessionId ? { sessionId: plan.sessionId } : {}),
    eventType:
      plan.decision === "run"
        ? "learner_trait.estimation.planned"
        : "learner_trait.estimation.skipped",
    payload: {
      planId: plan.planId,
      decision: plan.decision,
      skipReason: plan.skipReason ?? null,
      trigger: plan.trigger,
      plannedAt: plan.plannedAt,
    },
  });
}

function inferSkipReason(signals: LearnerTraitSignal[]): LearnerTraitEstimationSkipReason {
  if (!signals.length) return "no_trait_relevant_signals";
  const hasExplicitOrRepeated = signals.some(
    (signal) =>
      signal.source === "explicit_self_report" ||
      signal.source === "tutor_recorded_preference" ||
      signal.source === "onboarding_profile" ||
      signal.strength >= 0.65,
  );
  return hasExplicitOrRepeated ? "no_trait_relevant_signals" : "one_off_low_signal_observation";
}
