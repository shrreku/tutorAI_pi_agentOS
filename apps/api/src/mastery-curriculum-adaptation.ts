import { and, desc, eq, inArray } from "drizzle-orm";
import {
  appendEvent,
  learningState,
  objectives,
  objectiveLists,
  quizAttempts,
  sessionPlans,
  studentProfiles,
  studyPlans,
  type DbClient,
} from "@studyagent/db";
import {
  buildAdaptivePlanSignalsFromMasteryEvidence,
  type MasteryEvidence,
} from "@studyagent/schemas";
import { buildAdaptiveSessionPlanPatch } from "./phase7.js";

export async function applyAdaptiveSessionPlanFromMasteryEvidence(
  dbClient: DbClient,
  input: {
    evidence: MasteryEvidence;
    updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
    weakConceptIds: string[];
    sourceCoverageGap?: boolean;
    vagueLearnerMessage?: boolean;
  },
): Promise<boolean> {
  const [activeSessionPlan] = await dbClient.db
    .select({
      id: sessionPlans.id,
      objectiveListId: sessionPlans.objectiveListId,
      plannedObjectiveIds: sessionPlans.plannedObjectiveIds,
      sessionGoal: sessionPlans.sessionGoal,
    })
    .from(sessionPlans)
    .where(and(eq(sessionPlans.notebookId, input.evidence.notebookId), eq(sessionPlans.status, "active")))
    .orderBy(desc(sessionPlans.updatedAt))
    .limit(1);

  if (!activeSessionPlan) return false;

  const [objectiveList] = await dbClient.db
    .select({
      objectiveIdsOrdered: objectiveLists.objectiveIdsOrdered,
      currentObjectiveId: objectiveLists.currentObjectiveId,
    })
    .from(objectiveLists)
    .where(
      and(
        eq(objectiveLists.notebookId, input.evidence.notebookId),
        eq(objectiveLists.id, activeSessionPlan.objectiveListId),
      ),
    )
    .limit(1);

  if (!objectiveList) return false;

  const objectiveRows = objectiveList.objectiveIdsOrdered.length
    ? await dbClient.db
        .select({
          id: objectives.id,
          title: objectives.title,
          status: objectives.status,
          targetConceptIds: objectives.targetConceptIds,
        })
        .from(objectives)
        .where(
          and(
            eq(objectives.notebookId, input.evidence.notebookId),
            inArray(objectives.id, objectiveList.objectiveIdsOrdered),
          ),
        )
    : [];

  const [studyPlan] = await dbClient.db
    .select({ weakConceptIds: studyPlans.weakConceptIds })
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, input.evidence.notebookId), eq(studyPlans.userId, input.evidence.userId)))
    .limit(1);

  const [studentProfile] = await dbClient.db
    .select({ constraintsJson: studentProfiles.constraintsJson })
    .from(studentProfiles)
    .where(
      and(
        eq(studentProfiles.notebookId, input.evidence.notebookId),
        eq(studentProfiles.userId, input.evidence.userId),
      ),
    )
    .limit(1);
  const profileConstraints = (studentProfile?.constraintsJson ?? {}) as Record<string, unknown>;
  const rawTimeBudget = profileConstraints.timeBudgetMinutes;
  const timeBudgetMinutes = typeof rawTimeBudget === "number" ? rawTimeBudget : null;

  const misconceptionRows = await dbClient.db
    .select({ conceptId: learningState.conceptId, misconceptionJson: learningState.misconceptionJson })
    .from(learningState)
    .where(
      and(eq(learningState.notebookId, input.evidence.notebookId), eq(learningState.userId, input.evidence.userId)),
    );
  const misconceptionConceptIds = misconceptionRows
    .filter(
      (row) =>
        row.conceptId &&
        row.conceptId.length > 0 &&
        typeof row.misconceptionJson === "object" &&
        row.misconceptionJson !== null,
    )
    .map((row) => row.conceptId);

  const recentIncorrectAttempts = await dbClient.db
    .select({ conceptIds: quizAttempts.conceptIds })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.notebookId, input.evidence.notebookId),
        eq(quizAttempts.userId, input.evidence.userId),
        eq(quizAttempts.isCorrect, 0),
      ),
    )
    .orderBy(desc(quizAttempts.createdAt))
    .limit(20);
  const diagnosticConceptIds = [...new Set(recentIncorrectAttempts.flatMap((attempt) => attempt.conceptIds ?? []))];

  const weakConceptIds = (() => {
    const nextWeak = new Set([...(studyPlan?.weakConceptIds ?? []), ...input.weakConceptIds]);
    for (const state of input.updatedConceptStates) {
      if (state.masteryScore < 0.45) nextWeak.add(state.conceptId);
      if (state.masteryScore >= 0.65) nextWeak.delete(state.conceptId);
    }
    return [...nextWeak];
  })();

  const adaptivePlanSignals = buildAdaptivePlanSignalsFromMasteryEvidence(input.evidence, {
    weakConceptIds,
    ...(input.sourceCoverageGap !== undefined ? { sourceCoverageGap: input.sourceCoverageGap } : {}),
    ...(input.vagueLearnerMessage !== undefined ? { vagueLearnerMessage: input.vagueLearnerMessage } : {}),
  });

  const adaptivePatch = buildAdaptiveSessionPlanPatch({
    currentPlannedObjectiveIds: activeSessionPlan.plannedObjectiveIds ?? [],
    currentSessionGoal: activeSessionPlan.sessionGoal ?? null,
    objectiveIdsOrdered: objectiveList.objectiveIdsOrdered ?? [],
    currentObjectiveId: objectiveList.currentObjectiveId ?? null,
    objectives: objectiveRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      targetConceptIds: row.targetConceptIds ?? [],
    })),
    weakConceptIds,
    misconceptionConceptIds,
    diagnosticConceptIds,
    timeBudgetMinutes,
    adaptivePlanSignals,
    masteryEvidenceIds: [input.evidence.id],
  });

  if (!adaptivePatch) return false;

  const now = new Date();
  await dbClient.db
    .update(sessionPlans)
    .set({
      plannedObjectiveIds: adaptivePatch.plannedObjectiveIds,
      sessionGoal: adaptivePatch.sessionGoal,
      recommendationReasonJson: adaptivePatch.recommendationReasonJson,
      updatedAt: now,
    })
    .where(eq(sessionPlans.id, activeSessionPlan.id));

  await appendEvent(dbClient, {
    notebookId: input.evidence.notebookId,
    ...(input.evidence.sessionId ? { sessionId: input.evidence.sessionId } : {}),
    ...(input.evidence.runId ? { runId: input.evidence.runId } : {}),
    eventType: "session_plan.updated",
    payload: {
      sessionPlanId: activeSessionPlan.id,
      plannedObjectiveIds: adaptivePatch.plannedObjectiveIds,
      sessionGoal: adaptivePatch.sessionGoal,
      recommendationReasonJson: adaptivePatch.recommendationReasonJson,
      adaptiveRegeneration: true,
      masteryEvidenceId: input.evidence.id,
    },
  });

  return true;
}
