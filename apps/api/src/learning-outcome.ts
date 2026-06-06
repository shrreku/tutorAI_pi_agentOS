import { and, desc, eq, gt, inArray } from "drizzle-orm";
import {
  coverageItems,
  coverageRecords,
  curricula,
  curriculumModules,
  learningState,
  objectiveLists,
  objectives,
  sessionPlans,
  studyPlans,
  type DbClient,
} from "@studyagent/db";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";
import { buildMasteryEvidenceFromOutcome } from "./mastery-outcome-mapper.js";
import { recordAndApplyMasteryEvidence } from "./mastery-pipeline.js";
import { decideObjectiveCompletion } from "./objective-progression.js";

type LearningOutcomeInput = {
  notebookId: string;
  userId: string;
  runId?: string;
  sessionId?: string;
  conceptIds: string[];
  outcome: "correct" | "incorrect" | "again" | "hard" | "good" | "easy";
  reason: string;
  metadata?: Record<string, unknown>;
};

export async function applyLearningOutcome(
  dbClient: DbClient,
  input: LearningOutcomeInput,
): Promise<{
  updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
  weakConceptIds: string[];
}> {
  const conceptIds = [...new Set(input.conceptIds.filter(Boolean))];
  if (!conceptIds.length) {
    return { updatedConceptStates: [], weakConceptIds: [] };
  }

  const evidence = buildMasteryEvidenceFromOutcome({
    notebookId: input.notebookId,
    userId: input.userId,
    conceptIds,
    outcome: input.outcome,
    reason: input.reason,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
  });
  const applied = await recordAndApplyMasteryEvidence(dbClient, evidence);

  for (const state of applied.updatedConceptStates) {
    await advanceCoverageLifecycleForConcept(dbClient, {
      notebookId: input.notebookId,
      conceptId: state.conceptId,
      masteryScore: state.masteryScore,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
  }

  const [studyPlan] = await dbClient.db
    .select()
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, input.notebookId), eq(studyPlans.userId, input.userId)))
    .limit(1);

  if (studyPlan) {
    const now = new Date();

    if (studyPlan.currentObjectiveId) {
    const [currentObjective] = await dbClient.db
      .select({
        id: objectives.id,
        title: objectives.title,
        status: objectives.status,
        targetConceptIds: objectives.targetConceptIds,
      })
      .from(objectives)
      .where(and(eq(objectives.notebookId, input.notebookId), eq(objectives.id, studyPlan.currentObjectiveId)))
      .limit(1);

    if (currentObjective && currentObjective.status !== "completed") {
      const targetConceptIds = currentObjective.targetConceptIds ?? [];
      const conceptMasteryById: Record<string, number> = {};
      if (targetConceptIds.length > 0) {
        const persistedTargetMasteries = await dbClient.db
          .select({ conceptId: learningState.conceptId, masteryScore: learningState.masteryScore })
          .from(learningState)
          .where(and(eq(learningState.notebookId, input.notebookId), inArray(learningState.conceptId, targetConceptIds)));
        for (const row of persistedTargetMasteries) {
          conceptMasteryById[row.conceptId] = row.masteryScore;
        }
      }
      for (const state of applied.updatedConceptStates) {
        conceptMasteryById[state.conceptId] = state.masteryScore;
      }
      const shouldComplete = decideObjectiveCompletion({
        objectiveTitle: currentObjective.title,
        targetConceptIds,
        conceptMasteryById,
      });

      if (shouldComplete.shouldComplete) {
          await dbClient.db
            .update(objectives)
            .set({ status: "completed", updatedAt: now })
            .where(eq(objectives.id, currentObjective.id));

          const nextCompleted = [...new Set([...(studyPlan.completedObjectiveIds ?? []), currentObjective.id])];
          const nextUpcoming = (studyPlan.upcomingObjectiveIds ?? []).filter((id) => id !== currentObjective.id);
          let nextCurrentObjectiveId = nextUpcoming[0] ?? null;
          let nextUpcomingObjectiveIds = nextUpcoming.slice(1);

          if (!nextCurrentObjectiveId) {
            const activeCurriculumCandidates = await dbClient.db
              .select({ id: curricula.id, activeModuleId: curricula.activeModuleId, status: curricula.status })
              .from(curricula)
              .where(eq(curricula.notebookId, input.notebookId))
              .orderBy(desc(curricula.updatedAt))
              .limit(10);
            const activeCurriculum =
              activeCurriculumCandidates.find((curriculum) => curriculum.status === "active") ??
              activeCurriculumCandidates[0];
            if (activeCurriculum?.activeModuleId) {
              const [activeModule] = await dbClient.db
                .select({ orderIndex: curriculumModules.orderIndex })
                .from(curriculumModules)
                .where(and(eq(curriculumModules.notebookId, input.notebookId), eq(curriculumModules.id, activeCurriculum.activeModuleId)))
                .limit(1);
              if (activeModule) {
                const [nextModule] = await dbClient.db
                  .select({ id: curriculumModules.id })
                  .from(curriculumModules)
                  .where(
                    and(
                      eq(curriculumModules.notebookId, input.notebookId),
                      eq(curriculumModules.curriculumId, activeCurriculum.id),
                      gt(curriculumModules.orderIndex, activeModule.orderIndex),
                    ),
                  )
                  .orderBy(curriculumModules.orderIndex)
                  .limit(1);

                if (nextModule) {
                  await dbClient.db
                    .update(curricula)
                    .set({ activeModuleId: nextModule.id, updatedAt: now })
                    .where(eq(curricula.id, activeCurriculum.id));

                  const [nextObjectiveList] = await dbClient.db
                    .select({
                      id: objectiveLists.id,
                      currentObjectiveId: objectiveLists.currentObjectiveId,
                      objectiveIdsOrdered: objectiveLists.objectiveIdsOrdered,
                    })
                    .from(objectiveLists)
                    .where(
                      and(
                        eq(objectiveLists.notebookId, input.notebookId),
                        eq(objectiveLists.moduleId, nextModule.id),
                      ),
                    )
                    .orderBy(desc(objectiveLists.updatedAt))
                    .limit(1);

                  if (nextObjectiveList) {
                    nextCurrentObjectiveId = nextObjectiveList.currentObjectiveId ?? nextObjectiveList.objectiveIdsOrdered[0] ?? null;
                    const ordered = nextObjectiveList.objectiveIdsOrdered ?? [];
                    nextUpcomingObjectiveIds = nextCurrentObjectiveId
                      ? ordered.filter((id) => id !== nextCurrentObjectiveId)
                      : ordered;

                    const [nextModuleSessionPlan] = await dbClient.db
                      .select({ id: sessionPlans.id })
                      .from(sessionPlans)
                      .where(
                        and(
                          eq(sessionPlans.notebookId, input.notebookId),
                          eq(sessionPlans.moduleId, nextModule.id),
                        ),
                      )
                      .orderBy(desc(sessionPlans.updatedAt))
                      .limit(1);
                    if (nextModuleSessionPlan) {
                      await dbClient.db
                        .update(sessionPlans)
                        .set({ status: "archived", updatedAt: now })
                        .where(
                          and(
                            eq(sessionPlans.notebookId, input.notebookId),
                            eq(sessionPlans.status, "active"),
                          ),
                        );
                      await dbClient.db
                        .update(sessionPlans)
                        .set({ status: "active", updatedAt: now })
                        .where(eq(sessionPlans.id, nextModuleSessionPlan.id));
                    }

                    await appendEvent(dbClient, {
                      notebookId: input.notebookId,
                      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
                      ...(input.runId ? { runId: input.runId } : {}),
                      eventType: "module.updated",
                      payload: {
                        moduleId: nextModule.id,
                        status: "active",
                        reason: "module_transition_after_objective_completion",
                      },
                    });
                  }
                }
              }
            }
          }

          await dbClient.db
            .update(studyPlans)
            .set({
              currentObjectiveId: nextCurrentObjectiveId,
              upcomingObjectiveIds: nextUpcomingObjectiveIds,
              completedObjectiveIds: nextCompleted,
              updatedAt: now,
            })
            .where(eq(studyPlans.id, studyPlan.id));

          await appendEvent(dbClient, {
            notebookId: input.notebookId,
            ...(input.sessionId ? { sessionId: input.sessionId } : {}),
            ...(input.runId ? { runId: input.runId } : {}),
            eventType: "objective.completed",
            payload: {
              objectiveId: currentObjective.id,
              reason: shouldComplete.reason,
            },
          });

          await appendEvent(dbClient, {
            notebookId: input.notebookId,
            ...(input.sessionId ? { sessionId: input.sessionId } : {}),
            ...(input.runId ? { runId: input.runId } : {}),
            eventType: "study_plan.updated",
            payload: {
              studyPlanId: studyPlan.id,
              currentObjectiveId: nextCurrentObjectiveId,
              upcomingObjectiveIds: nextUpcomingObjectiveIds,
              completedObjectiveIds: nextCompleted,
            },
          });
        }
      }
    }
  }

  return {
    updatedConceptStates: applied.updatedConceptStates,
    weakConceptIds: applied.weakConceptIds,
  };
}

async function advanceCoverageLifecycleForConcept(
  dbClient: DbClient,
  input: { notebookId: string; conceptId: string; masteryScore: number; runId?: string; sessionId?: string },
): Promise<void> {
  const desiredStatus = input.masteryScore >= 0.74 ? "mastered" : input.masteryScore < 0.45 ? "needs_review" : "checked";
  const rows = await dbClient.db
    .select({
      id: coverageRecords.id,
      coverageItemId: coverageRecords.coverageItemId,
      notebookId: coverageRecords.notebookId,
      curriculumId: coverageRecords.curriculumId,
      moduleId: coverageRecords.moduleId,
      objectiveListId: coverageRecords.objectiveListId,
      sessionPlanId: coverageRecords.sessionPlanId,
      evidenceJson: coverageRecords.evidenceJson,
      updatedAt: coverageRecords.updatedAt,
    })
    .from(coverageRecords)
    .innerJoin(coverageItems, eq(coverageItems.id, coverageRecords.coverageItemId))
    .where(and(eq(coverageRecords.notebookId, input.notebookId), eq(coverageItems.conceptId, input.conceptId)));

  for (const row of rows) {
    await dbClient.db
      .update(coverageRecords)
      .set({
        status: desiredStatus,
        evidenceJson: {
          ...(row.evidenceJson ?? {}),
          lastConceptOutcomeDrivenAt: new Date().toISOString(),
          conceptId: input.conceptId,
          masteryScore: input.masteryScore,
          drivenBy: "learning_outcome",
        },
        updatedAt: new Date(),
      })
      .where(eq(coverageRecords.id, row.id));
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      eventType: "coverage.record.updated",
      payload: {
        coverageRecordId: row.id,
        coverageItemId: row.coverageItemId,
        status: desiredStatus,
        curriculumId: row.curriculumId,
        moduleId: row.moduleId,
        objectiveListId: row.objectiveListId,
        sessionPlanId: row.sessionPlanId,
        evidenceJson: {
          ...(row.evidenceJson ?? {}),
          lastConceptOutcomeDrivenAt: new Date().toISOString(),
          conceptId: input.conceptId,
          masteryScore: input.masteryScore,
          drivenBy: "learning_outcome",
        },
      },
    });
  }
}
