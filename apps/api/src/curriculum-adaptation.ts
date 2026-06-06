import {
  buildAdaptivePlanSignals,
  shouldApplyDurablePlanChange,
  wrapRecommendationReasonJson,
  type AdaptivePlanSignal,
} from "@studyagent/schemas";

type AdaptiveSessionPlanObjective = {
  id: string;
  title: string;
  status: string;
  targetConceptIds: string[];
};

export type AdaptiveSessionPlanPatch = {
  plannedObjectiveIds: string[];
  sessionGoal: string | null;
  recommendationReasonJson: Record<string, unknown>;
};

export function buildAdaptiveSessionPlanPatch(input: {
  currentPlannedObjectiveIds: string[];
  currentSessionGoal: string | null;
  objectiveIdsOrdered: string[];
  currentObjectiveId: string | null;
  objectives: AdaptiveSessionPlanObjective[];
  weakConceptIds: string[];
  misconceptionConceptIds?: string[];
  diagnosticConceptIds?: string[];
  recentWeakConceptFrequencyById?: Record<string, number>;
  nextModuleObjectiveIds?: string[];
  timeBudgetMinutes?: number | null;
  sourceCoverageGap?: boolean;
  vagueLearnerMessage?: boolean;
  adaptivePlanSignals?: AdaptivePlanSignal[];
  masteryEvidenceIds?: string[];
}): AdaptiveSessionPlanPatch | null {
  const objectiveById = new Map(input.objectives.map((objective) => [objective.id, objective]));
  const activeObjectiveIds = input.objectiveIdsOrdered.filter((id) => {
    const objective = objectiveById.get(id);
    if (!objective) return false;
    return objective.status !== "completed" && objective.status !== "merged" && objective.status !== "superseded";
  });

  const moduleAdvancementReady =
    activeObjectiveIds.length === 0 && (input.nextModuleObjectiveIds ?? []).length > 0;
  const effectiveSignals =
    input.adaptivePlanSignals ??
    buildAdaptivePlanSignals({
      weakConceptIds: input.weakConceptIds,
      ...(input.misconceptionConceptIds !== undefined ? { misconceptionConceptIds: input.misconceptionConceptIds } : {}),
      ...(input.diagnosticConceptIds !== undefined ? { diagnosticConceptIds: input.diagnosticConceptIds } : {}),
      ...(input.recentWeakConceptFrequencyById !== undefined
        ? { recentWeakConceptFrequencyById: input.recentWeakConceptFrequencyById }
        : {}),
      ...(input.sourceCoverageGap !== undefined ? { sourceCoverageGap: input.sourceCoverageGap } : {}),
      ...(input.vagueLearnerMessage !== undefined ? { vagueLearnerMessage: input.vagueLearnerMessage } : {}),
      moduleAdvancementReady,
      ...(input.nextModuleObjectiveIds !== undefined ? { nextObjectiveIds: input.nextModuleObjectiveIds } : {}),
    });

  if (!shouldApplyDurablePlanChange(effectiveSignals)) {
    return null;
  }

  const misconceptionIds = new Set(input.misconceptionConceptIds ?? []);
  const diagnosticIds = new Set(input.diagnosticConceptIds ?? []);
  const weakFrequencyById = input.recentWeakConceptFrequencyById ?? {};
  const ranked = activeObjectiveIds
    .map((id, index) => {
      const objective = objectiveById.get(id)!;
      const diagnosticTargetCount = objective.targetConceptIds.filter((conceptId) => diagnosticIds.has(conceptId)).length;
      const weakTargetCount = objective.targetConceptIds.filter((conceptId) => input.weakConceptIds.includes(conceptId)).length;
      const weakFrequencyScore = objective.targetConceptIds.reduce(
        (sum, conceptId) => sum + (weakFrequencyById[conceptId] ?? 0),
        0,
      );
      const misconceptionTargetCount = objective.targetConceptIds.filter((conceptId) =>
        misconceptionIds.has(conceptId),
      ).length;
      return { id, index, weakTargetCount, weakFrequencyScore, misconceptionTargetCount, diagnosticTargetCount };
    })
    .sort((a, b) => {
      if (a.id === input.currentObjectiveId) return -1;
      if (b.id === input.currentObjectiveId) return 1;
      if (b.diagnosticTargetCount !== a.diagnosticTargetCount) {
        return b.diagnosticTargetCount - a.diagnosticTargetCount;
      }
      if (b.misconceptionTargetCount !== a.misconceptionTargetCount) {
        return b.misconceptionTargetCount - a.misconceptionTargetCount;
      }
      if (b.weakTargetCount !== a.weakTargetCount) return b.weakTargetCount - a.weakTargetCount;
      if (b.weakFrequencyScore !== a.weakFrequencyScore) return b.weakFrequencyScore - a.weakFrequencyScore;
      return a.index - b.index;
    });

  const timeBudget = input.timeBudgetMinutes ?? null;
  const objectiveCap = timeBudget !== null && timeBudget <= 25 ? 1 : timeBudget !== null && timeBudget <= 45 ? 2 : 3;
  const plannedObjectiveIds = ranked.slice(0, objectiveCap).map((entry) => entry.id);
  if (!plannedObjectiveIds.length && (input.nextModuleObjectiveIds ?? []).length) {
    plannedObjectiveIds.push(...(input.nextModuleObjectiveIds ?? []).slice(0, objectiveCap));
  }
  if (!plannedObjectiveIds.length) {
    return null;
  }

  const needsRemediation = ranked.some(
    (entry) => entry.weakTargetCount > 0 || entry.misconceptionTargetCount > 0 || entry.diagnosticTargetCount > 0,
  );
  const sessionGoal = needsRemediation
    ? "Repair misconceptions and stabilize weak concepts with targeted checkpoints."
    : "Advance the current objective path with one focused checkpoint.";
  const recommendationReasonJson = wrapRecommendationReasonJson({
    signals: effectiveSignals,
    patch: {
      weakConceptCount: input.weakConceptIds.length,
      misconceptionConceptCount: misconceptionIds.size,
      diagnosticConceptCount: diagnosticIds.size,
      timeBudgetMinutes: timeBudget,
      objectiveCap,
      prioritizedObjectiveIds: plannedObjectiveIds,
    },
    ...(input.masteryEvidenceIds?.length ? { masteryEvidenceIds: input.masteryEvidenceIds } : {}),
  });

  const unchanged =
    JSON.stringify(plannedObjectiveIds) === JSON.stringify(input.currentPlannedObjectiveIds) &&
    sessionGoal === input.currentSessionGoal;
  if (unchanged) {
    return null;
  }

  return { plannedObjectiveIds, sessionGoal, recommendationReasonJson };
}
