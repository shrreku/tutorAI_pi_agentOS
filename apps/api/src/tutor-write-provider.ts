import { and, eq, inArray } from "drizzle-orm";
import {
  appendEvent,
  artifacts,
  coverageItems,
  coverageRecords,
  claimConceptLinks,
  claims,
  chunks,
  concepts,
  notebooks,
  sessionPlans,
  sourceVersions,
  sources,
  type DbClient,
} from "@studyagent/db";
import { combineConfidence } from "@studyagent/wiki-core";
import {
  type CreateFlashcardsInput,
  type CreateFlashcardsOutput,
  type CoverageGetGapsInput,
  type CoverageGetGapsOutput,
  type CoverageMarkInput,
  type CoverageMarkOutput,
  ToolError,
  type CreateNoteInput,
  type CreateNoteOutput,
  type CreateQuizInput,
  type CreateQuizOutput,
  buildReducerResult,
  type ProposeClaimInput,
  type ProposeClaimOutput,
  type SessionPlanUpdateInput,
  type SessionPlanUpdateOutput,
  type RuntimeWriteToolProvider,
} from "@studyagent/tools";
import type { AppContext } from "./context.js";
import { buildFlashcardsArtifactPayload, buildQuizArtifactPayload } from "./phase7.js";
import { upsertStudentProfile } from "./student-profile.js";

type ResolvedEvidence = {
  sourceId: string;
  sourceVersionId: string;
  sourceChunkIds: string[];
  warnings: Array<{ code: string; message: string }>;
};

type ArtifactVisibility = "hidden" | "learner";
type ArtifactLifecycleStatus = "draft" | "proposed" | "ready";

export function createTutorWriteToolProvider(appCtx: AppContext): RuntimeWriteToolProvider {
  return {
    async proposeClaim(input, ctx) {
      const evidence = await resolveEvidence(appCtx.db, ctx.notebookId, input.sourceRefs);
      const conceptIds = await resolveConceptIds(appCtx.db, ctx.notebookId, input.conceptIds);
      const candidateClaimId = `claim_${crypto.randomUUID().replaceAll("-", "")}`;
      const confidence = input.confidenceHint ?? defaultClaimConfidence();

      await appCtx.db.db.insert(claims).values({
        id: candidateClaimId,
        notebookId: ctx.notebookId,
        sourceId: evidence.sourceId,
        sourceVersionId: evidence.sourceVersionId,
        claimType: input.claimType,
        claimText: input.claimText,
        status: "candidate",
        confidence,
        qualityScore: confidence,
        supportScore: Math.max(0.6, confidence),
        confidenceComponentsJson: {
          sourceSupport: 0.78,
          extractionConfidence: input.confidenceHint ?? 0.72,
          recency: 0.8,
          contradictionPenalty: 0,
          humanApproval: 0,
          reinforcementSignal: 0,
        },
        sourceSpanJson: {
          sourceRefs: input.sourceRefs,
        },
        sourceChunkIds: evidence.sourceChunkIds,
        metadataJson: {
          createdBy: "tutor_runtime",
          traceId: ctx.traceId,
        },
      });

      if (conceptIds.length) {
        await appCtx.db.db.insert(claimConceptLinks).values(
          conceptIds.map((conceptId) => ({
            claimId: candidateClaimId,
            conceptId,
            role: "subject",
            confidence,
          })),
        );
      }

      const reducerEvent = await appendEvent(appCtx.db, {
        notebookId: ctx.notebookId,
        runId: ctx.runId,
        eventType: "wiki.claim.proposed",
        payload: {
          candidateClaimId,
          claimText: input.claimText,
          claimType: input.claimType,
          conceptIds,
          sourceRefs: input.sourceRefs,
          traceId: ctx.traceId,
        },
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
      });

      return {
        candidateClaimId,
        status: "candidate",
        warnings: [
          ...evidence.warnings,
          ...(conceptIds.length !== input.conceptIds.length
            ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
            : []),
        ],
        reducerResult: buildReducerResult(
          "wiki.claim.proposed",
          {
            candidateClaimId,
            notebookId: ctx.notebookId,
            claimText: input.claimText,
            claimType: input.claimType,
            conceptIds,
            sourceRefs: input.sourceRefs,
          },
          [reducerEvent.id],
        ),
      };
    },

    async createNote(input, ctx) {
      const result = await createArtifact(
        appCtx,
        {
          notebookId: ctx.notebookId,
          runId: ctx.runId,
          traceId: ctx.traceId,
          ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        },
        "note",
        input.title,
        input.sourceNodeRefs,
        {
        markdown: input.noteMarkdown,
        blockOwnerType: input.blockOwnerType,
        },
      );

      return {
        artifactId: result.artifactId,
        status: result.status,
        warnings: result.warnings,
        reducerResult: buildReducerResult(
          "artifact.created",
          {
            artifactId: result.artifactId,
            notebookId: ctx.notebookId,
            artifactType: "note",
            title: input.title,
            sourceNodeRefs: input.sourceNodeRefs,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
          },
          [result.eventId],
        ),
      };
    },

    async createQuiz(input, ctx) {
      const conceptIds = await resolveConceptIds(appCtx.db, ctx.notebookId, input.conceptIds);
      const payload = await buildQuizArtifactPayload(appCtx.db, ctx.notebookId, conceptIds, input.questionCount, input.prompt);
      const result = await createArtifact(
        appCtx,
        {
          notebookId: ctx.notebookId,
          runId: ctx.runId,
          traceId: ctx.traceId,
          ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        },
        "quiz",
        input.title,
        input.sourceNodeRefs,
        payload,
        "ready",
      );

      return {
        artifactId: result.artifactId,
        status: result.status,
        warnings: [
          ...result.warnings,
          ...(conceptIds.length !== input.conceptIds.length
            ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
            : []),
        ],
        reducerResult: buildReducerResult(
          "artifact.created",
          {
            artifactId: result.artifactId,
            notebookId: ctx.notebookId,
            artifactType: "quiz",
            title: input.title,
            sourceNodeRefs: input.sourceNodeRefs,
            conceptIds,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
          },
          [result.eventId],
        ),
      };
    },
    async createFlashcards(input, ctx) {
      const conceptIds = await resolveConceptIds(appCtx.db, ctx.notebookId, input.conceptIds);
      const payload = await buildFlashcardsArtifactPayload(appCtx.db, ctx.notebookId, conceptIds, input.cardCount, input.prompt);
      const result = await createArtifact(
        appCtx,
        {
          notebookId: ctx.notebookId,
          runId: ctx.runId,
          traceId: ctx.traceId,
          ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        },
        "flashcards",
        input.title,
        input.sourceNodeRefs,
        payload,
        "ready",
      );

      return {
        artifactId: result.artifactId,
        status: result.status,
        warnings: [
          ...result.warnings,
          ...(conceptIds.length !== input.conceptIds.length
            ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
            : []),
        ],
        reducerResult: buildReducerResult(
          "artifact.created",
          {
            artifactId: result.artifactId,
            notebookId: ctx.notebookId,
            artifactType: "flashcards",
            title: input.title,
            sourceNodeRefs: input.sourceNodeRefs,
            conceptIds,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
          },
          [result.eventId],
        ),
      };
    },
    async createWorkedExample(input, ctx) {
      const conceptIds = await resolveConceptIds(appCtx.db, ctx.notebookId, input.conceptIds);
      const result = await createArtifact(
        appCtx,
        {
          notebookId: ctx.notebookId,
          runId: ctx.runId,
          traceId: ctx.traceId,
          ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        },
        "worked_example",
        input.title,
        input.sourceNodeRefs,
        {
          prompt: input.prompt,
          problemStatement: input.problemStatement,
          solutionSteps: input.solutionSteps,
          commonMistakes: input.commonMistakes,
          finalTakeaway: input.finalTakeaway,
          conceptIds,
          sourceNodeRefs: input.sourceNodeRefs,
        },
        "ready",
      );

      return {
        artifactId: result.artifactId,
        status: result.status,
        warnings: [
          ...result.warnings,
          ...(conceptIds.length !== input.conceptIds.length
            ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
            : []),
        ],
        reducerResult: buildReducerResult(
          "artifact.created",
          {
            artifactId: result.artifactId,
            notebookId: ctx.notebookId,
            artifactType: "worked_example",
            title: input.title,
            sourceNodeRefs: input.sourceNodeRefs,
            conceptIds,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
          },
          [result.eventId],
        ),
      };
    },
    async createFormulaSheet(input, ctx) {
      const conceptIds = await resolveConceptIds(appCtx.db, ctx.notebookId, input.conceptIds);
      const result = await createArtifact(
        appCtx,
        {
          notebookId: ctx.notebookId,
          runId: ctx.runId,
          traceId: ctx.traceId,
          ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        },
        "formula_sheet",
        input.title,
        input.sourceNodeRefs,
        {
          prompt: input.prompt,
          formulas: input.formulas,
          conceptIds,
          sourceNodeRefs: input.sourceNodeRefs,
        },
        "ready",
      );

      return {
        artifactId: result.artifactId,
        status: result.status,
        warnings: [
          ...result.warnings,
          ...(conceptIds.length !== input.conceptIds.length
            ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
            : []),
        ],
        reducerResult: buildReducerResult(
          "artifact.created",
          {
            artifactId: result.artifactId,
            notebookId: ctx.notebookId,
            artifactType: "formula_sheet",
            title: input.title,
            sourceNodeRefs: input.sourceNodeRefs,
            conceptIds,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
          },
          [result.eventId],
        ),
      };
    },
    async createComparisonPage(input, ctx) {
      const conceptIds = await resolveConceptIds(appCtx.db, ctx.notebookId, input.conceptIds);
      const result = await createArtifact(
        appCtx,
        {
          notebookId: ctx.notebookId,
          runId: ctx.runId,
          traceId: ctx.traceId,
          ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        },
        "comparison_page",
        input.title,
        input.sourceNodeRefs,
        {
          prompt: input.prompt,
          leftTitle: input.leftTitle,
          rightTitle: input.rightTitle,
          comparisonRows: input.comparisonRows,
          conceptIds,
          sourceNodeRefs: input.sourceNodeRefs,
        },
        "ready",
      );

      return {
        artifactId: result.artifactId,
        status: result.status,
        warnings: [
          ...result.warnings,
          ...(conceptIds.length !== input.conceptIds.length
            ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
            : []),
        ],
        reducerResult: buildReducerResult(
          "artifact.created",
          {
            artifactId: result.artifactId,
            notebookId: ctx.notebookId,
            artifactType: "comparison_page",
            title: input.title,
            sourceNodeRefs: input.sourceNodeRefs,
            conceptIds,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
          },
          [result.eventId],
        ),
      };
    },

    async markCoverage(input, ctx) {
      const result = await upsertCoverageRecord(appCtx, ctx.notebookId, input);
      const status = (input.status ?? "introduced") as "planned" | "introduced" | "checked" | "mastered" | "needs_review";
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "coverage.record.updated",
            payload: {
              coverageRecordId: result.id,
              coverageItemId: result.coverageItemId,
              status,
              curriculumId: result.curriculumId,
              moduleId: result.moduleId,
              objectiveListId: result.objectiveListId,
              sessionPlanId: result.sessionPlanId,
              evidenceJson: result.evidenceJson,
              traceId: ctx.traceId,
            },
          })
        : null;

      return {
        coverageRecord: result
          ? {
              id: result.id,
              notebookId: result.notebookId,
              coverageItemId: result.coverageItemId,
              curriculumId: result.curriculumId,
              moduleId: result.moduleId,
              objectiveListId: result.objectiveListId,
              sessionPlanId: result.sessionPlanId,
              status,
              evidenceJson: result.evidenceJson,
              updatedAt: result.updatedAt.toISOString(),
            }
          : null,
        warnings: result ? [] : [{ code: "coverage_item_missing", message: "Coverage item was not found in this notebook." }],
        reducerResult: buildReducerResult(
          "coverage.record.updated",
          {
            notebookId: ctx.notebookId,
            coverageItemId: input.coverageItemId,
            status,
            curriculumId: input.curriculumId ?? null,
            moduleId: input.moduleId ?? null,
            objectiveListId: input.objectiveListId ?? null,
            sessionPlanId: input.sessionPlanId ?? null,
            evidenceJson: input.evidenceJson,
          },
          event ? [event.id] : [],
        ),
      };
    },

    async getCoverageGaps(input, ctx): Promise<CoverageGetGapsOutput> {
      const gaps = await getCoverageGaps(appCtx, ctx.notebookId, input);
      return { gaps };
    },

    async updateSessionPlan(input, ctx): Promise<SessionPlanUpdateOutput> {
      const result = await updateSessionPlanRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "session_plan.updated",
            payload: {
              sessionPlanId: result.id,
              curriculumId: result.curriculumId,
              moduleId: result.moduleId,
              objectiveListId: result.objectiveListId,
              title: result.title,
              status: result.status,
              sessionGoal: result.sessionGoal,
              plannedObjectiveIds: result.plannedObjectiveIds,
              traceId: ctx.traceId,
            },
          })
        : null;
      return {
        sessionPlan: result
          ? {
              id: result.id,
              notebookId: result.notebookId,
              curriculumId: result.curriculumId,
              moduleId: result.moduleId,
              objectiveListId: result.objectiveListId,
              title: result.title,
              status: result.status,
              sessionGoal: result.sessionGoal,
              plannedObjectiveIds: result.plannedObjectiveIds,
              openerJson: result.openerJson,
              diagnosticQuestionIds: result.diagnosticQuestionIds,
              teachingArcIds: result.teachingArcIds,
              artifactRefsJson: result.artifactRefsJson,
              exitCriteriaJson: result.exitCriteriaJson,
              recommendationReasonJson: result.recommendationReasonJson,
              createdByRunId: result.createdByRunId,
              createdAt: result.createdAt.toISOString(),
              updatedAt: result.updatedAt.toISOString(),
            }
          : null,
        warnings: result ? [] : [{ code: "session_plan_missing", message: "Session plan was not found in this notebook." }],
        reducerResult: buildReducerResult(
          "session_plan.updated",
          {
            notebookId: ctx.notebookId,
            sessionPlanId: input.sessionPlanId,
            title: input.title ?? null,
            status: input.status ?? null,
            sessionGoal: input.sessionGoal ?? null,
            plannedObjectiveIds: input.plannedObjectiveIds ?? [],
            openerJson: input.openerJson ?? {},
            diagnosticQuestionIds: input.diagnosticQuestionIds ?? [],
            teachingArcIds: input.teachingArcIds ?? [],
            artifactRefsJson: input.artifactRefsJson ?? [],
            exitCriteriaJson: input.exitCriteriaJson ?? {},
            recommendationReasonJson: input.recommendationReasonJson ?? {},
          },
          event ? [event.id] : [],
        ),
      };
    },

    async updateStudentProfilePreferences(input, ctx) {
      const result = await upsertStudentProfile(appCtx.db, {
        notebookId: ctx.notebookId,
        userId: input.userId ?? ctx.userId,
        patch: input,
        ...(ctx.runId ? { runId: ctx.runId } : {}),
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        traceId: ctx.traceId,
      });

      return {
        studentProfile: {
          id: result.profile.id,
          notebookId: result.profile.notebookId,
          userId: result.profile.userId,
          goalSummary: result.profile.goalSummary,
          backgroundSummary: result.profile.backgroundSummary,
          pacePreference: result.profile.pacePreference,
          depthPreference: result.profile.depthPreference,
          examplePreferencesJson: result.profile.examplePreferencesJson,
          assessmentPreferenceJson: result.profile.assessmentPreferenceJson,
          constraintsJson: result.profile.constraintsJson,
          createdAt: result.profile.createdAt.toISOString(),
          updatedAt: result.profile.updatedAt.toISOString(),
        },
        warnings: [],
        reducerResult: buildReducerResult(
          "student_profile.updated",
          {
            studentProfileId: result.profile.id,
            notebookId: ctx.notebookId,
            userId: input.userId ?? ctx.userId,
            goalSummary: input.goalSummary ?? null,
            backgroundSummary: input.backgroundSummary ?? null,
            pacePreference: input.pacePreference ?? null,
            depthPreference: input.depthPreference ?? null,
            examplePreferencesJson: input.examplePreferencesJson ?? {},
            assessmentPreferenceJson: input.assessmentPreferenceJson ?? {},
            constraintsJson: input.constraintsJson ?? {},
          },
          [result.eventId],
        ),
      };
    },
  };
}

async function upsertCoverageRecord(
  appCtx: AppContext,
  notebookId: string,
  input: CoverageMarkInput,
): Promise<{
  id: string;
  notebookId: string;
  coverageItemId: string;
  curriculumId: string | null;
  moduleId: string | null;
  objectiveListId: string | null;
  sessionPlanId: string | null;
  status: string;
  evidenceJson: Record<string, unknown>;
  updatedAt: Date;
} | null> {
  const [coverageItem] = await appCtx.db.db
    .select({ id: coverageItems.id })
    .from(coverageItems)
    .where(and(eq(coverageItems.id, input.coverageItemId), eq(coverageItems.notebookId, notebookId)))
    .limit(1);
  if (!coverageItem) return null;

  const [existing] = await appCtx.db.db
    .select()
    .from(coverageRecords)
    .where(
      and(
        eq(coverageRecords.notebookId, notebookId),
        eq(coverageRecords.coverageItemId, input.coverageItemId),
        input.curriculumId ? eq(coverageRecords.curriculumId, input.curriculumId) : eq(coverageRecords.curriculumId, coverageRecords.curriculumId),
        input.moduleId ? eq(coverageRecords.moduleId, input.moduleId) : eq(coverageRecords.moduleId, coverageRecords.moduleId),
        input.objectiveListId ? eq(coverageRecords.objectiveListId, input.objectiveListId) : eq(coverageRecords.objectiveListId, coverageRecords.objectiveListId),
        input.sessionPlanId ? eq(coverageRecords.sessionPlanId, input.sessionPlanId) : eq(coverageRecords.sessionPlanId, coverageRecords.sessionPlanId),
      ),
    )
    .limit(1);

  const now = new Date();
  const status = input.status ?? "introduced";
  const values = {
    notebookId,
    coverageItemId: input.coverageItemId,
    curriculumId: input.curriculumId ?? null,
    moduleId: input.moduleId ?? null,
    objectiveListId: input.objectiveListId ?? null,
    sessionPlanId: input.sessionPlanId ?? null,
    status,
    evidenceJson: input.evidenceJson,
    updatedByRunId: undefined,
    updatedAt: now,
  } as const;

  if (existing) {
    await appCtx.db.db.update(coverageRecords).set(values).where(eq(coverageRecords.id, existing.id));
    return { id: existing.id, ...values, updatedAt: now };
  }

  const id = `coverage_${crypto.randomUUID().replaceAll("-", "")}`;
  await appCtx.db.db.insert(coverageRecords).values({ id, ...values });
  return { id, ...values, updatedAt: now };
}

async function getCoverageGaps(
  appCtx: AppContext,
  notebookId: string,
  input: CoverageGetGapsInput,
): Promise<CoverageGetGapsOutput["gaps"]> {
  const rows = await appCtx.db.db
    .select({
      coverageItemId: coverageItems.id,
      title: coverageItems.title,
      itemFamily: coverageItems.itemFamily,
      description: coverageItems.description,
      recordStatus: coverageRecords.status,
      curriculumId: coverageRecords.curriculumId,
      moduleId: coverageRecords.moduleId,
      objectiveListId: coverageRecords.objectiveListId,
      sessionPlanId: coverageRecords.sessionPlanId,
    })
    .from(coverageItems)
    .leftJoin(
      coverageRecords,
      and(eq(coverageRecords.coverageItemId, coverageItems.id), eq(coverageRecords.notebookId, notebookId)),
    )
    .where(eq(coverageItems.notebookId, notebookId))
    .limit(input.limit);

  return rows
    .filter((row) => !row.recordStatus || input.statuses.includes(row.recordStatus as never))
    .map((row) => ({
      coverageItemId: row.coverageItemId,
      title: row.title,
      itemFamily: row.itemFamily,
      description: row.description,
      status: (row.recordStatus ?? "planned") as "planned" | "introduced" | "checked" | "mastered" | "needs_review",
      curriculumId: row.curriculumId,
      moduleId: row.moduleId,
      objectiveListId: row.objectiveListId,
      sessionPlanId: row.sessionPlanId,
    }));
}

async function updateSessionPlanRecord(
  appCtx: AppContext,
  notebookId: string,
  input: SessionPlanUpdateInput,
): Promise<
  | {
      id: string;
      notebookId: string;
      curriculumId: string;
      moduleId: string;
      objectiveListId: string;
      title: string;
      status: string;
      sessionGoal: string | null;
      plannedObjectiveIds: string[];
      openerJson: Record<string, unknown>;
      diagnosticQuestionIds: string[];
      teachingArcIds: string[];
      artifactRefsJson: unknown[];
      exitCriteriaJson: Record<string, unknown>;
      recommendationReasonJson: Record<string, unknown>;
      createdByRunId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }
  | null
> {
  const [existing] = await appCtx.db.db
    .select()
    .from(sessionPlans)
    .where(and(eq(sessionPlans.id, input.sessionPlanId), eq(sessionPlans.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;

  const updatedAt = new Date();
  const next = {
    title: input.title ?? existing.title,
    status: input.status ?? existing.status,
    sessionGoal: input.sessionGoal ?? existing.sessionGoal ?? null,
    plannedObjectiveIds: input.plannedObjectiveIds ?? existing.plannedObjectiveIds,
    openerJson: input.openerJson ?? existing.openerJson,
    diagnosticQuestionIds: input.diagnosticQuestionIds ?? existing.diagnosticQuestionIds,
    teachingArcIds: input.teachingArcIds ?? existing.teachingArcIds,
    artifactRefsJson: input.artifactRefsJson ?? existing.artifactRefsJson,
    exitCriteriaJson: input.exitCriteriaJson ?? existing.exitCriteriaJson,
    recommendationReasonJson: input.recommendationReasonJson ?? existing.recommendationReasonJson,
    updatedAt,
  };

  await appCtx.db.db.update(sessionPlans).set(next).where(eq(sessionPlans.id, existing.id));
  return { ...existing, ...next };
}

async function createArtifact(
  appCtx: AppContext,
  ctx: { notebookId: string; sessionId?: string; runId: string; traceId: string },
  artifactType: "note" | "quiz" | "flashcards" | "worked_example" | "formula_sheet" | "comparison_page",
  title: string,
  sourceNodeRefs: Array<{ refType: string; refId: string }>,
  payload: Record<string, unknown>,
  status?: ArtifactLifecycleStatus,
): Promise<{
  artifactId: string;
  eventId: string;
  warnings: Array<{ code: string; message: string }>;
  status: ArtifactLifecycleStatus;
  visibility: ArtifactVisibility;
  approvalRequired: boolean;
}> {
  const artifactId = `artifact_${crypto.randomUUID().replaceAll("-", "")}`;
  const sourceChunkIds = sourceNodeRefs.filter((ref) => ref.refType === "chunk").map((ref) => ref.refId);
  const sourceClaimIds = sourceNodeRefs.filter((ref) => ref.refType === "claim").map((ref) => ref.refId);
  const lifecycle = await resolveArtifactLifecycle(appCtx, ctx.notebookId, artifactType, status);

  await appCtx.db.db.insert(artifacts).values({
    id: artifactId,
    notebookId: ctx.notebookId,
    artifactType,
    title,
    status: lifecycle.status,
    payloadJson: payload,
    sourceNodeRefsJson: sourceNodeRefs,
    sourceClaimIds,
    sourceChunkIds,
    createdByRunId: ctx.runId,
    updatedAt: new Date(),
  });

  const event = await appendEvent(appCtx.db, {
    notebookId: ctx.notebookId,
    runId: ctx.runId,
    eventType: "artifact.created",
    payload: {
      artifactId,
      artifactType,
      title,
      status: lifecycle.status,
      visibility: lifecycle.visibility,
      approvalRequired: lifecycle.approvalRequired,
      sourceNodeRefs,
      traceId: ctx.traceId,
    },
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  });

  if (lifecycle.status === "ready") {
    await appendEvent(appCtx.db, {
      notebookId: ctx.notebookId,
      runId: ctx.runId,
      eventType: "artifact.ready",
      payload: {
        artifactId,
        artifactType,
        title,
        status: lifecycle.status,
        traceId: ctx.traceId,
      },
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
    });
  } else if (lifecycle.status === "proposed") {
    await appendEvent(appCtx.db, {
      notebookId: ctx.notebookId,
      runId: ctx.runId,
      eventType: "artifact.proposed",
      payload: {
        artifactId,
        artifactType,
        title,
        status: lifecycle.status,
        visibility: lifecycle.visibility,
        approvalRequired: lifecycle.approvalRequired,
        traceId: ctx.traceId,
      },
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
    });
  }

  return { artifactId, eventId: event.id, warnings: [], ...lifecycle };
}

async function resolveArtifactLifecycle(
  appCtx: AppContext,
  notebookId: string,
  artifactType: "note" | "quiz" | "flashcards" | "worked_example" | "formula_sheet" | "comparison_page",
  requestedStatus?: ArtifactLifecycleStatus,
): Promise<{ status: ArtifactLifecycleStatus; visibility: ArtifactVisibility; approvalRequired: boolean }> {
  const [notebook] = await appCtx.db.db.select({ settingsJson: notebooks.settingsJson }).from(notebooks).where(eq(notebooks.id, notebookId)).limit(1);
  const settings = isJsonRecordLocal(notebook?.settingsJson) ? notebook!.settingsJson : {};
  const artifactConsent = isJsonRecordLocal(settings.artifactConsent) ? settings.artifactConsent : {};

  const autoCreateLearnerArtifacts = artifactConsent.autoCreateLearnerArtifacts === true;
  const autoCreateNotes = artifactConsent.autoCreateNotes === true;

  if (requestedStatus === "ready") {
    return { status: "ready", visibility: "learner", approvalRequired: false };
  }

  if (artifactType === "note") {
    return autoCreateNotes
      ? { status: "ready", visibility: "learner", approvalRequired: false }
      : { status: "draft", visibility: "hidden", approvalRequired: false };
  }

  return autoCreateLearnerArtifacts
    ? { status: "ready", visibility: "learner", approvalRequired: false }
    : { status: "proposed", visibility: "learner", approvalRequired: true };
}

function isJsonRecordLocal(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveConceptIds(dbClient: DbClient, notebookId: string, requestedIds: string[]): Promise<string[]> {
  if (!requestedIds.length) return [];

  const rows = await dbClient.db
    .select({ id: concepts.id })
    .from(concepts)
    .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, requestedIds)));

  return rows.map((row) => row.id);
}

async function resolveEvidence(
  dbClient: DbClient,
  notebookId: string,
  refs: Array<{ refType: string; refId: string }>,
): Promise<ResolvedEvidence> {
  const warnings: ResolvedEvidence["warnings"] = [];

  for (const ref of refs) {
    if (ref.refType === "chunk") {
      const [row] = await dbClient.db
        .select({
          sourceId: sources.id,
          sourceVersionId: sourceVersions.id,
          chunkId: chunks.id,
        })
        .from(chunks)
        .innerJoin(sourceVersions, eq(chunks.sourceVersionId, sourceVersions.id))
        .innerJoin(sources, eq(sourceVersions.sourceId, sources.id))
        .where(and(eq(chunks.id, ref.refId), eq(sources.notebookId, notebookId)))
        .limit(1);

      if (row) {
        return {
          sourceId: row.sourceId,
          sourceVersionId: row.sourceVersionId,
          sourceChunkIds: [row.chunkId],
          warnings,
        };
      }
    }

    if (ref.refType === "source_version") {
      const [row] = await dbClient.db
        .select({
          sourceId: sources.id,
          sourceVersionId: sourceVersions.id,
        })
        .from(sourceVersions)
        .innerJoin(sources, eq(sourceVersions.sourceId, sources.id))
        .where(and(eq(sourceVersions.id, ref.refId), eq(sources.notebookId, notebookId)))
        .limit(1);

      if (row) {
        return {
          sourceId: row.sourceId,
          sourceVersionId: row.sourceVersionId,
          sourceChunkIds: [],
          warnings,
        };
      }
    }

    if (ref.refType === "source") {
      const [row] = await dbClient.db
        .select({
          sourceId: sources.id,
          sourceVersionId: sourceVersions.id,
        })
        .from(sources)
        .innerJoin(sourceVersions, eq(sourceVersions.sourceId, sources.id))
        .where(and(eq(sources.id, ref.refId), eq(sources.notebookId, notebookId)))
        .limit(1);

      if (row) {
        return {
          sourceId: row.sourceId,
          sourceVersionId: row.sourceVersionId,
          sourceChunkIds: [],
          warnings,
        };
      }
    }

    warnings.push({
      code: "source_ref_unresolved",
      message: `Could not resolve notebook-scoped evidence for ${ref.refType}:${ref.refId}`,
    });
  }

  throw new ToolError("missing_source_evidence", "Write tools require at least one notebook-scoped source reference.");
}

function defaultClaimConfidence(): number {
  return combineConfidence({
    sourceSupport: 0.78,
    extractionConfidence: 0.72,
    recency: 0.8,
    contradictionPenalty: 0,
    humanApproval: 0,
    reinforcementSignal: 0,
  });
}
