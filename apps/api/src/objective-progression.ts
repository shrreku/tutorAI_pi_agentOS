import { eq } from "drizzle-orm";
import { objectiveLists, objectives, studyPlans, type DbClient } from "@studyagent/db";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";
import { loadNotebookStudyState } from "./study-state.js";

export type ObjectiveProgressionDecision =
  | { shouldComplete: false }
  | { shouldComplete: true; reason: string };

export function decideObjectiveCompletion(input: {
  objectiveTitle: string;
  targetConceptIds: string[];
  conceptMasteryById: Record<string, number>;
}): ObjectiveProgressionDecision {
  if (!input.targetConceptIds.length) return { shouldComplete: false };
  const masteries = input.targetConceptIds
    .map((conceptId) => input.conceptMasteryById[conceptId])
    .filter((value): value is number => typeof value === "number");
  if (!masteries.length) return { shouldComplete: false };
  const avg = masteries.reduce((sum, value) => sum + value, 0) / masteries.length;
  if (avg >= 0.74) {
    return {
      shouldComplete: true,
      reason: `Objective "${input.objectiveTitle}" reached mastery threshold (${avg.toFixed(2)} avg).`,
    };
  }
  return { shouldComplete: false };
}

export function readMasteryEvidenceObjectiveAdvancement(
  runtimeContext: Record<string, unknown>,
): { evidenceId: string; objectiveId: string } | null {
  const value = runtimeContext.lastRuntimeMasteryEvidence;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.evidenceId !== "string" || typeof record.objectiveId !== "string") return null;
  const correctnessLabel = typeof record.correctnessLabel === "string" ? record.correctnessLabel : "";
  const readiness = typeof record.readiness === "string" ? record.readiness : "";
  const tutoringIntervention = typeof record.tutoringIntervention === "string" ? record.tutoringIntervention : "";
  const confidence = typeof record.confidence === "number" ? record.confidence : 0;
  const uncertainty = typeof record.uncertainty === "number" ? record.uncertainty : 1;
  const overallScore = typeof record.overallScore === "number" ? record.overallScore : 0;
  const strongEnough =
    correctnessLabel === "correct" &&
    confidence >= 0.7 &&
    uncertainty <= 0.35 &&
    overallScore >= 0.75 &&
    (readiness === "proficient" || readiness === "advanced" || tutoringIntervention === "advance");
  return strongEnough ? { evidenceId: record.evidenceId, objectiveId: record.objectiveId } : null;
}

export async function applyMasteryEvidenceObjectiveProgression(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    sessionId: string;
    runId: string;
    turnId: string;
    assistantMessage: string;
    runtimeContext: Record<string, unknown>;
  },
): Promise<void> {
  const progressionEvidence = readMasteryEvidenceObjectiveAdvancement(input.runtimeContext);
  if (!progressionEvidence) return;

  const state = await loadNotebookStudyState(dbClient, input.notebookId, input.userId);
  const current = state.studyPlan?.currentObjective;
  if (!state.studyPlan || !current) return;
  if (progressionEvidence.objectiveId !== current.id) return;
  if (state.studyPlan.completedObjectives.some((objective) => objective.id === current.id)) return;

  const upcomingIds = state.studyPlan.upcomingObjectives.map((objective) => objective.id);
  const nextObjectiveId = upcomingIds[0] ?? null;
  const completedIds = [...new Set([...state.studyPlan.completedObjectives.map((objective) => objective.id), current.id])];
  const remainingUpcomingIds = upcomingIds.filter((id) => id !== nextObjectiveId);

  await dbClient.db.update(objectives).set({ status: "completed", updatedAt: new Date() }).where(eq(objectives.id, current.id));
  await dbClient.db
    .update(studyPlans)
    .set({
      currentObjectiveId: nextObjectiveId,
      upcomingObjectiveIds: remainingUpcomingIds,
      completedObjectiveIds: completedIds,
      progressSummaryJson: {
        lastCompletedObjectiveId: current.id,
        lastCompletedObjectiveTitle: current.title,
        lastProgressTurnId: input.turnId,
        lastAssistantSummary: input.assistantMessage.slice(0, 400),
        masteryEvidenceId: progressionEvidence.evidenceId,
      },
      updatedAt: new Date(),
    })
    .where(eq(studyPlans.id, state.studyPlan.id));

  if (state.objectiveList?.id) {
    await dbClient.db
      .update(objectiveLists)
      .set({ currentObjectiveId: nextObjectiveId, updatedAt: new Date() })
      .where(eq(objectiveLists.id, state.objectiveList.id));
  }

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    runId: input.runId,
    eventType: "objective.completed",
    payload: {
      objectiveId: current.id,
      title: current.title,
      nextObjectiveId,
      reason: "mastery_evidence",
      masteryEvidenceId: progressionEvidence.evidenceId,
    },
  });
  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    runId: input.runId,
    eventType: "study_plan.updated",
    payload: {
      studyPlanId: state.studyPlan.id,
      currentObjectiveId: nextObjectiveId,
      completedObjectiveIds: completedIds,
      reason: "mastery_evidence",
      masteryEvidenceId: progressionEvidence.evidenceId,
    },
  });
}
