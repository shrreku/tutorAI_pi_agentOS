import { and, desc, eq } from "drizzle-orm";
import {
  artifacts,
  curricula,
  curriculumModules,
  events,
  learnerTraitEstimates,
  learnerTraitSignals,
  learningState,
  masteryEvidence,
  notebooks,
  objectives,
  quizAttempts,
  sources,
  studentProfiles,
  studyPlans,
  toolCalls,
  tutorSessions,
  tutorTurns,
  wikiPages,
} from "@studyagent/db";
import {
  buildEvalEvidenceSnapshot,
  buildTraitRecommendationOnlySnapshot,
  captureEvalEvidenceSnapshotFromPersistedState,
  evalEvidenceSnapshotSchema,
  type EvalEvidenceSnapshot,
  type PersistedEvalNotebookState,
} from "@studyagent/schemas";
import type { AppContext } from "./context.js";

export async function captureNotebookEvalEvidenceSnapshot(
  ctx: AppContext,
  input: {
    ownerId: string;
    notebookId: string;
    snapshotId: string;
    capturedAt?: string;
  },
): Promise<EvalEvidenceSnapshot> {
  const [owned] = await ctx.db.db
    .select({ id: notebooks.id })
    .from(notebooks)
    .where(and(eq(notebooks.id, input.notebookId), eq(notebooks.ownerId, input.ownerId)))
    .limit(1);
  if (!owned) {
    throw new Error("Notebook not found");
  }

  const persisted = await loadPersistedEvalNotebookState(ctx, input.notebookId, input.ownerId);
  return evalEvidenceSnapshotSchema.parse(
    captureEvalEvidenceSnapshotFromPersistedState({
      snapshotId: input.snapshotId,
      notebookId: input.notebookId,
      ...(input.capturedAt ? { capturedAt: input.capturedAt } : {}),
      state: persisted,
    }),
  );
}

export async function loadPersistedEvalNotebookState(
  ctx: AppContext,
  notebookId: string,
  userId: string,
): Promise<PersistedEvalNotebookState> {
  const limit = 250;
  const [
    masteryRows,
    artifactRows,
    quizRows,
    eventRows,
    turnRows,
    toolRows,
    traitSignalRows,
    traitEstimateRows,
    sourceRows,
    wikiRows,
    objectiveRows,
    studyPlanRows,
    profileRows,
    learningStateRows,
    curriculumRows,
    curriculumModuleRows,
  ] = await Promise.all([
    ctx.db.db.select().from(masteryEvidence).where(eq(masteryEvidence.notebookId, notebookId)).orderBy(desc(masteryEvidence.createdAt)).limit(limit),
    ctx.db.db.select().from(artifacts).where(eq(artifacts.notebookId, notebookId)).orderBy(desc(artifacts.updatedAt)).limit(limit),
    ctx.db.db.select().from(quizAttempts).where(eq(quizAttempts.notebookId, notebookId)).orderBy(desc(quizAttempts.createdAt)).limit(limit),
    ctx.db.db.select().from(events).where(eq(events.notebookId, notebookId)).orderBy(desc(events.createdAt)).limit(limit),
    ctx.db.db
      .select({
        id: tutorTurns.id,
        sessionId: tutorTurns.sessionId,
        createdAt: tutorTurns.createdAt,
      })
      .from(tutorTurns)
      .innerJoin(tutorSessions, eq(tutorTurns.sessionId, tutorSessions.id))
      .where(eq(tutorSessions.notebookId, notebookId))
      .orderBy(desc(tutorTurns.createdAt))
      .limit(limit),
    ctx.db.db
      .select({
        id: toolCalls.id,
        toolName: toolCalls.toolName,
        sessionId: toolCalls.sessionId,
        turnId: toolCalls.turnId,
      })
      .from(toolCalls)
      .innerJoin(tutorSessions, eq(toolCalls.sessionId, tutorSessions.id))
      .where(eq(tutorSessions.notebookId, notebookId))
      .orderBy(desc(toolCalls.createdAt))
      .limit(limit),
    ctx.db.db.select().from(learnerTraitSignals).where(and(eq(learnerTraitSignals.notebookId, notebookId), eq(learnerTraitSignals.userId, userId))).orderBy(desc(learnerTraitSignals.createdAt)).limit(limit),
    ctx.db.db.select().from(learnerTraitEstimates).where(and(eq(learnerTraitEstimates.notebookId, notebookId), eq(learnerTraitEstimates.userId, userId))).orderBy(desc(learnerTraitEstimates.updatedAt)).limit(limit),
    ctx.db.db.select().from(sources).where(eq(sources.notebookId, notebookId)).orderBy(desc(sources.updatedAt)).limit(limit),
    ctx.db.db.select().from(wikiPages).where(eq(wikiPages.notebookId, notebookId)).orderBy(desc(wikiPages.updatedAt)).limit(limit),
    ctx.db.db.select().from(objectives).where(eq(objectives.notebookId, notebookId)).orderBy(desc(objectives.updatedAt)).limit(limit),
    ctx.db.db.select().from(studyPlans).where(and(eq(studyPlans.notebookId, notebookId), eq(studyPlans.userId, userId))).limit(limit),
    ctx.db.db.select().from(studentProfiles).where(and(eq(studentProfiles.notebookId, notebookId), eq(studentProfiles.userId, userId))).limit(limit),
    ctx.db.db.select().from(learningState).where(and(eq(learningState.notebookId, notebookId), eq(learningState.userId, userId))).limit(limit),
    ctx.db.db.select().from(curricula).where(eq(curricula.notebookId, notebookId)).orderBy(desc(curricula.updatedAt)).limit(limit),
    ctx.db.db.select().from(curriculumModules).where(eq(curriculumModules.notebookId, notebookId)).orderBy(desc(curriculumModules.updatedAt)).limit(limit),
  ]);

  return {
    notebookId,
    masteryEvidence: masteryRows.map((row) => {
      const evidence = row.evidenceJson as Record<string, unknown>;
      return {
        id: row.id,
        ...(row.turnId ? { turnId: row.turnId } : {}),
        ...(row.sessionId ? { sessionId: row.sessionId } : {}),
        ...(typeof evidence.correctnessLabel === "string" ? { correctnessLabel: evidence.correctnessLabel } : {}),
        ...(typeof evidence.overallScore === "number" ? { overallScore: evidence.overallScore } : {}),
        ...(typeof evidence.confidence === "number" ? { confidence: evidence.confidence } : {}),
        ...(typeof evidence.triggerSource === "string" ? { triggerSource: evidence.triggerSource } : {}),
      };
    }),
    artifacts: artifactRows.map((row) => ({ id: row.id, status: row.status })),
    quizAttempts: quizRows.map((row) => ({
      id: row.id,
      ...(row.artifactId ? { artifactId: row.artifactId } : {}),
    })),
    sessionEvents: eventRows
      .filter((row) => row.eventType.startsWith("session.") || row.eventType.startsWith("learner_trait."))
      .map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        eventType: row.eventType,
        ...(row.sessionId ? { sessionId: row.sessionId } : {}),
        timestamp: row.createdAt.toISOString(),
      })),
    tutorTurns: turnRows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      timestamp: row.createdAt.toISOString(),
    })),
    toolCalls: toolRows.map((row) => ({
      id: row.id,
      toolName: row.toolName,
      ...(row.sessionId ? { sessionId: row.sessionId } : {}),
      ...(row.turnId ? { turnId: row.turnId } : {}),
    })),
    learnerTraitSignals: traitSignalRows.map((row) => ({ id: row.id })),
    learnerTraitEstimates: traitEstimateRows.map((row) => ({ id: row.id })),
    workspaceReferenceSurfaces: [
      ...sourceRows.map((row) => ({ refType: "source" as const, refId: row.id })),
      ...wikiRows.map((row) => ({ refType: "wiki_page" as const, refId: row.id })),
      ...artifactRows.map((row) => ({ refType: "artifact" as const, refId: row.id })),
    ],
    notebookEvents: eventRows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      ...(row.sessionId ? { sessionId: row.sessionId } : {}),
      timestamp: row.createdAt.toISOString(),
    })),
    sources: sourceRows.map((row) => {
      const metadata = row.metadataJson ?? {};
      const readiness = metadata.readiness && typeof metadata.readiness === "object"
        ? metadata.readiness as Record<string, unknown>
        : {};
      return {
        id: row.id,
        status: row.status,
        tutoringReady: readiness.tutoringReady === true || readiness.tutor === "ready",
        wikiReady: readiness.wiki === "ready" || readiness.learnerSourceWiki === "ready",
        graphReady: readiness.projection === "ready" || readiness.graph === "ready",
      };
    }),
    objectives: objectiveRows.map((row) => ({ id: row.id, status: row.status })),
    studyPlans: studyPlanRows.map((row) => ({ id: row.id, status: row.status })),
    explicitLearnerGoals: profileRows.flatMap((row) => {
      const goals: Array<{ refType: "notebook"; refId: string; summary: string }> = [];
      if (row.goalSummary) {
        goals.push({ refType: "notebook", refId: notebookId, summary: row.goalSummary });
      }
      return goals;
    }),
    learningStates: learningStateRows.map((row) => ({
      conceptId: row.conceptId,
      ...(typeof row.masteryScore === "number" ? { masteryScore: row.masteryScore } : {}),
    })),
    weakConceptIds: [...new Set(studyPlanRows.flatMap((row) => row.weakConceptIds ?? []))],
    curricula: curriculumRows.map((row) => ({ id: row.id, status: row.status })),
    curriculumModules: curriculumModuleRows.map((row) => ({ id: row.id, status: row.status })),
    personalizationRecommendations: traitEstimateRows.map((row) => ({ id: `ltr_${row.trait}`, trait: row.trait })),
  };
}

export function buildTraitRecommendationOnlySnapshotFromStates(input: {
  before: EvalEvidenceSnapshot;
  after: EvalEvidenceSnapshot;
}) {
  return buildTraitRecommendationOnlySnapshot(input);
}
