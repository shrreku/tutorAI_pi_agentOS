import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  appendEvent,
  artifacts,
  concepts,
  coverageItems,
  coverageRecords,
  curricula,
  curriculumModules,
  learningState,
  objectiveLists,
  objectives,
  quizAttempts,
  sessionPlans,
  studyPlans,
  tutorSessions,
  type DbClient,
} from "@studyagent/db";
import {
  buildAdaptivePlanSignals,
  shouldApplyDurablePlanChange,
  wrapRecommendationReasonJson,
  type AdaptivePlanSignal,
} from "@studyagent/schemas";
import { buildMasteryEvidenceFromOutcome } from "./mastery-outcome-mapper.js";
import { recordAndApplyMasteryEvidence } from "./mastery-pipeline.js";

type ConceptSummary = {
  id: string;
  name: string;
  description: string | null;
};

type RuntimeMeta = {
  notebookId: string;
  userId: string;
  runId?: string;
  sessionId?: string;
};

type DigestRuntimeMeta = {
  notebookId: string;
  sessionId: string;
  runId?: string;
};

type LearningOutcomeInput = RuntimeMeta & {
  conceptIds: string[];
  outcome: "correct" | "incorrect" | "again" | "hard" | "good" | "easy";
  reason: string;
  metadata?: Record<string, unknown>;
};

type AdaptiveSessionPlanObjective = {
  id: string;
  title: string;
  status: string;
  targetConceptIds: string[];
};

type AdaptiveSessionPlanPatch = {
  plannedObjectiveIds: string[];
  sessionGoal: string | null;
  recommendationReasonJson: Record<string, unknown>;
};

type ObjectiveProgressionDecision =
  | { shouldComplete: false }
  | { shouldComplete: true; reason: string };

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function daysFromNow(days: number): Date {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next;
}

type TutorSessionDigestContext = {
  sessionId: string;
  assistantMessage: string;
  userMessage: string;
  currentObjective?: string;
  sourceIds: string[];
  citationIds: string[];
  artifactProposalIds: string[];
  studyPlanSummary?: string;
  learnerStateSummary?: string;
  learnerProgressSummary?: string;
  turnId?: string;
  status: "draft" | "ready";
};

export function buildTutorSessionDigestPayload(input: TutorSessionDigestContext): Record<string, unknown> {
  const nextStep = input.currentObjective ? `Continue with ${input.currentObjective}` : "Continue the current tutoring path";

  return {
    sessionId: input.sessionId,
    status: input.status,
    summary: input.assistantMessage,
    learnerMessage: input.userMessage,
    currentObjective: input.currentObjective ?? null,
    studyPlanSummary: input.studyPlanSummary ?? null,
    learnerStateSummary: input.learnerStateSummary ?? null,
    learnerProgressSummary: input.learnerProgressSummary ?? null,
    nextStep,
    provenance: {
      sourceIds: input.sourceIds,
      citationIds: input.citationIds,
      artifactProposalIds: input.artifactProposalIds,
      turnId: input.turnId ?? null,
    },
  };
}

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
      ...(input.recentWeakConceptFrequencyById !== undefined ? { recentWeakConceptFrequencyById: input.recentWeakConceptFrequencyById } : {}),
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
      const diagnosticTargetCount = objective.targetConceptIds.filter((conceptId) =>
        diagnosticIds.has(conceptId),
      ).length;
      const weakTargetCount = objective.targetConceptIds.filter((conceptId) =>
        input.weakConceptIds.includes(conceptId),
      ).length;
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
    (entry) =>
      entry.weakTargetCount > 0 ||
      entry.misconceptionTargetCount > 0 ||
      entry.diagnosticTargetCount > 0,
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

export async function upsertTutorSessionDigestArtifact(
  dbClient: DbClient,
  input: DigestRuntimeMeta & TutorSessionDigestContext,
): Promise<{ artifactId: string; created: boolean }> {
  const [existingMatchesSession] = await dbClient.db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.notebookId, input.notebookId),
        eq(artifacts.artifactType, "session_digest"),
        sql`${artifacts.payloadJson}->>'sessionId' = ${input.sessionId}`,
      ),
    )
    .orderBy(desc(artifacts.updatedAt))
    .limit(1);
  const payloadJson = buildTutorSessionDigestPayload(input);
  const now = new Date();

  if (existingMatchesSession) {
    await dbClient.db
      .update(artifacts)
      .set({
        title: input.status === "ready" ? `Session digest · ${now.toLocaleDateString("en-US")}` : `Session digest draft · ${now.toLocaleDateString("en-US")}`,
        status: input.status,
        payloadJson,
        sourceNodeRefsJson: input.sourceIds.map((sourceId) => ({ refType: "source", refId: sourceId })),
        sourceClaimIds: input.citationIds,
        sourceChunkIds: [],
        createdByRunId: input.runId,
        updatedAt: now,
      })
      .where(eq(artifacts.id, existingMatchesSession.id));

    return { artifactId: existingMatchesSession.id, created: false };
  }

  const artifactId = `artifact_${crypto.randomUUID().replaceAll("-", "")}`;
  await dbClient.db.insert(artifacts).values({
    id: artifactId,
    notebookId: input.notebookId,
    artifactType: "session_digest",
    title: input.status === "ready" ? `Session digest · ${now.toLocaleDateString("en-US")}` : `Session digest draft · ${now.toLocaleDateString("en-US")}`,
    status: input.status,
    payloadJson,
    sourceNodeRefsJson: input.sourceIds.map((sourceId) => ({ refType: "source", refId: sourceId })),
    sourceClaimIds: input.citationIds,
    sourceChunkIds: [],
    createdByRunId: input.runId,
  });

  return { artifactId, created: true };
}

async function loadConcepts(
  dbClient: DbClient,
  notebookId: string,
  conceptIds: string[],
  fallbackLimit: number,
): Promise<ConceptSummary[]> {
  if (conceptIds.length > 0) {
    const rows = await dbClient.db
      .select({
        id: concepts.id,
        name: concepts.canonicalName,
        description: concepts.description,
      })
      .from(concepts)
      .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, conceptIds)));
    return rows;
  }

  return dbClient.db
    .select({
      id: concepts.id,
      name: concepts.canonicalName,
      description: concepts.description,
    })
    .from(concepts)
    .where(eq(concepts.notebookId, notebookId))
    .orderBy(desc(concepts.updatedAt))
    .limit(fallbackLimit);
}

export async function buildQuizArtifactPayload(
  dbClient: DbClient,
  notebookId: string,
  conceptIds: string[],
  questionCount: number,
  prompt: string,
): Promise<Record<string, unknown>> {
  const selectedConcepts = await loadConcepts(dbClient, notebookId, conceptIds, questionCount);
  const questions = selectedConcepts.slice(0, questionCount).map((concept, index) => ({
    id: `quizq_${crypto.randomUUID().replaceAll("-", "")}`,
    conceptId: concept.id,
    prompt: `How would you explain ${concept.name} in your own words?`,
    referenceAnswer:
      concept.description?.trim() ||
      `${concept.name} is a key notebook concept. Explain what it is, why it matters, and connect it to the uploaded material.`,
    explanation: `Focus your review on ${concept.name} and tie your answer back to the notebook evidence.`,
    orderIndex: index,
  }));

  return {
    prompt,
    conceptIds: selectedConcepts.map((concept) => concept.id),
    questions,
    questionCount: questions.length,
  };
}

export async function buildFlashcardsArtifactPayload(
  dbClient: DbClient,
  notebookId: string,
  conceptIds: string[],
  cardCount: number,
  prompt: string,
): Promise<Record<string, unknown>> {
  const selectedConcepts = await loadConcepts(dbClient, notebookId, conceptIds, cardCount);
  const cards = selectedConcepts.slice(0, cardCount).map((concept, index) => ({
    id: `card_${crypto.randomUUID().replaceAll("-", "")}`,
    conceptId: concept.id,
    front: `What is ${concept.name}?`,
    back:
      concept.description?.trim() ||
      `${concept.name} is a notebook concept to review. State the definition, a relevant example, and when to use it.`,
    orderIndex: index,
  }));

  return {
    prompt,
    conceptIds: selectedConcepts.map((concept) => concept.id),
    cards,
    cardCount: cards.length,
    reviews: [],
  };
}

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

export async function recordQuizAttempt(
  dbClient: DbClient,
  input: RuntimeMeta & {
    artifactId: string;
    questionId: string;
    answer: string;
    isCorrect: boolean;
    score?: number;
    conceptIds: string[];
    explanation?: string;
  },
): Promise<{ attemptId: string; updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }> }> {
  const attemptId = `qat_${crypto.randomUUID().replaceAll("-", "")}`;
  await dbClient.db.insert(quizAttempts).values({
    id: attemptId,
    artifactId: input.artifactId,
    notebookId: input.notebookId,
    sessionId: input.sessionId ?? null,
    userId: input.userId,
    questionId: input.questionId,
    answerJson: {
      answer: input.answer,
      explanation: input.explanation,
    },
    isCorrect: input.isCorrect ? 1 : 0,
    score: input.score ?? (input.isCorrect ? 1 : 0),
    conceptIds: input.conceptIds,
  });

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "quiz.attempt.recorded",
    payload: {
      attemptId,
      artifactId: input.artifactId,
      questionId: input.questionId,
      isCorrect: input.isCorrect,
      conceptIds: input.conceptIds,
    },
  });

  const learning = await applyLearningOutcome(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    conceptIds: input.conceptIds,
    outcome: input.isCorrect ? "correct" : "incorrect",
    reason: "quiz_attempt",
    metadata: {
      artifactId: input.artifactId,
      questionId: input.questionId,
    },
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  return { attemptId, updatedConceptStates: learning.updatedConceptStates };
}

export async function recordFlashcardReview(
  dbClient: DbClient,
  input: RuntimeMeta & {
    artifactId: string;
    cardId: string;
    result: "again" | "hard" | "good" | "easy";
    conceptIds: string[];
  },
): Promise<{ updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }> }> {
  const [artifact] = await dbClient.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, input.artifactId), eq(artifacts.notebookId, input.notebookId)))
    .limit(1);

  if (artifact) {
    const payload = { ...(artifact.payloadJson ?? {}) };
    const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
    reviews.push({
      cardId: input.cardId,
      result: input.result,
      reviewedAt: new Date().toISOString(),
      conceptIds: input.conceptIds,
    });
    payload.reviews = reviews;

    await dbClient.db
      .update(artifacts)
      .set({
        payloadJson: payload,
        updatedAt: new Date(),
      })
      .where(eq(artifacts.id, input.artifactId));
  }

  const learning = await applyLearningOutcome(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    conceptIds: input.conceptIds,
    outcome: input.result,
    reason: "flashcard_review",
    metadata: {
      artifactId: input.artifactId,
      cardId: input.cardId,
    },
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  return { updatedConceptStates: learning.updatedConceptStates };
}

export async function crystallizeTutorSession(
  dbClient: DbClient,
  input: RuntimeMeta & {
    sessionId: string;
    assistantMessage: string;
    userMessage: string;
    currentObjective?: string;
    sourceIds: string[];
    citationIds: string[];
    artifactProposalIds: string[];
    studyPlanSummary?: string;
    learnerStateSummary?: string;
    learnerProgressSummary?: string;
  },
): Promise<{ artifactId: string }> {
  const now = new Date();
  const [existingSession] = await dbClient.db
    .select({ runtimeContextJson: tutorSessions.runtimeContextJson })
    .from(tutorSessions)
    .where(eq(tutorSessions.id, input.sessionId))
    .limit(1);

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "session.crystallization.started",
    payload: {
      currentObjective: input.currentObjective,
      sourceIds: input.sourceIds,
      citationIds: input.citationIds,
    },
  });

  const digest = await upsertTutorSessionDigestArtifact(dbClient, {
    ...input,
    status: "ready",
  });

  if (digest.created) {
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      ...(input.runId ? { runId: input.runId } : {}),
      eventType: "artifact.created",
      payload: {
        artifactId: digest.artifactId,
        artifactType: "session_digest",
        title: `Session digest · ${now.toLocaleDateString("en-US")}`,
      },
    });
  }

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "artifact.ready",
    payload: {
      artifactId: digest.artifactId,
      artifactType: "session_digest",
    },
  });

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "session.crystallization.completed",
    payload: {
      artifactId: digest.artifactId,
      artifactType: "session_digest",
    },
  });

  await dbClient.db
    .update(tutorSessions)
    .set({
      status: "completed",
      endedAt: now,
      runtimeContextJson: {
        ...(isJsonRecordLocal(existingSession?.runtimeContextJson) ? existingSession.runtimeContextJson : {}),
        status: "completed",
        endedAt: now.toISOString(),
        sessionDigestDraft: null,
        updatedAt: now.toISOString(),
        crystallizedArtifactId: digest.artifactId,
      },
    })
    .where(eq(tutorSessions.id, input.sessionId));

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "session.completed",
    payload: {
      sessionId: input.sessionId,
      artifactId: digest.artifactId,
    },
  });

  return { artifactId: digest.artifactId };
}

function isJsonRecordLocal(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
