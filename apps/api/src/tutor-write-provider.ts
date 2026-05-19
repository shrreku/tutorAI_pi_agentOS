import { and, desc, eq, inArray } from "drizzle-orm";
import {
  appendEvent,
  artifacts,
  coverageItems,
  coverageRecords,
  curricula,
  curriculumModules,
  objectiveLists,
  objectives,
  claimConceptLinks,
  claims,
  chunks,
  wikiPages,
  concepts,
  notebooks,
  sessionPlans,
  tutorSessions,
  sourceVersions,
  sources,
  type DbClient,
} from "@studyagent/db";
import type { NodeRef } from "@studyagent/schemas";
import { combineConfidence } from "@studyagent/wiki-core";
import {
  type CreateFlashcardsInput,
  type CreateFlashcardsOutput,
  type CreateConceptCardInput,
  type CreateConceptCardOutput,
  type CoverageGetGapsInput,
  type CoverageGetGapsOutput,
  type CoverageMarkInput,
  type CoverageMarkOutput,
  type CurriculumActivateInput,
  type CurriculumActivateOutput,
  ToolError,
  type CreateNoteInput,
  type CreateNoteOutput,
  type CreateQuizInput,
  type CreateQuizOutput,
  type ModuleUpdateInput,
  type ModuleUpdateOutput,
  type ObjectiveListUpdateInput,
  type ObjectiveListUpdateOutput,
  type ObjectiveListReorderInput,
  type ObjectiveListReorderOutput,
  type ObjectiveListSplitObjectiveInput,
  type ObjectiveListSplitObjectiveOutput,
  type ObjectiveListMergeObjectivesInput,
  type ObjectiveListMergeObjectivesOutput,
  type ObjectiveUpdateInput,
  type ObjectiveUpdateOutput,
  buildReducerResult,
  type ProposeClaimInput,
  type ProposeClaimOutput,
  type SessionPlanUpdateInput,
  type SessionPlanUpdateOutput,
  type EvaluateLearnerResponseOutput,
  type RuntimeWriteToolProvider,
  normalizeConceptRole,
  normalizeMasteryEvidenceType,
  normalizeMasteryTriggerSource,
} from "@studyagent/tools";
import {
  resolveArtifactLifecycleOutcome,
  deriveArtifactLifecycleEventType,
  type ArtifactLearnerVisibility,
  type ArtifactLifecycleOutcome,
  type ArtifactQualityDecision,
} from "./artifact-lifecycle.js";
import type { AppContext } from "./context.js";
import { buildFlashcardsArtifactPayload, buildQuizArtifactPayload } from "./phase7.js";
import { evaluatePersistAndApply } from "./mastery-pipeline.js";
import { upsertStudentProfile } from "./student-profile.js";

type ResolvedEvidence = {
  sourceId: string;
  sourceVersionId: string;
  sourceChunkIds: string[];
  warnings: Array<{ code: string; message: string }>;
};

type ArtifactLifecycleStatus = ArtifactLifecycleOutcome["status"];
type ArtifactType = "note" | "quiz" | "flashcards" | "worked_example" | "formula_sheet" | "comparison_page" | "concept_card";
type CoverageScope = {
  curriculumId: string | null;
  moduleId: string | null;
  objectiveListId: string | null;
  sessionPlanId: string | null;
};

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
          keyPoints: input.keyPoints,
          examples: input.examples,
          misconceptions: input.misconceptions,
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
            sourceNodeRefs: result.sourceNodeRefs,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
            lifecycle: result.lifecycle,
            quality: result.quality,
          },
          [result.eventId],
        ),
      };
    },

    async createQuiz(input, ctx) {
      const conceptIds = await resolveConceptIds(appCtx.db, ctx.notebookId, input.conceptIds);
      const runtimeContext = {
        notebookId: ctx.notebookId,
        runId: ctx.runId,
        traceId: ctx.traceId,
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
      };
      const foundResumeArtifact = input.resumeArtifactId
        ? await findArtifactRecord(appCtx.db, ctx.notebookId, input.resumeArtifactId)
        : null;
      const resumeArtifact = foundResumeArtifact?.artifactType === "quiz" ? foundResumeArtifact : null;
      const baseGenerationState = {
        prompt: input.prompt,
        requestedQuestionCount: input.questionCount,
        generatedQuestionCount: 0,
        conceptIds,
        sourceNodeRefs: input.sourceNodeRefs,
        resumeArtifactId: input.resumeArtifactId ?? null,
        updatedAt: new Date().toISOString(),
      };

      if (input.questions?.length) {
        const payload = {
          prompt: input.prompt,
          questions: input.questions,
          conceptIds,
          generationState: {
            ...baseGenerationState,
            status: "complete" as const,
            generatedQuestionCount: input.questions.length,
          },
        };
        const result = resumeArtifact
          ? await finalizeQuizArtifact(appCtx, runtimeContext, resumeArtifact.id, input.title, input.sourceNodeRefs, payload)
          : await createArtifact(appCtx, runtimeContext, "quiz", input.title, input.sourceNodeRefs, payload);
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
              sourceNodeRefs: result.sourceNodeRefs,
              conceptIds,
              status: result.status,
              visibility: result.visibility,
              approvalRequired: result.approvalRequired,
              lifecycle: result.lifecycle,
              quality: result.quality,
            },
            [result.eventId],
          ),
        };
      }

      if (input.deferGeneration) {
        const draftResult = resumeArtifact
          ? await updateQuizDraftArtifact(appCtx, runtimeContext, resumeArtifact.id, input.title, input.sourceNodeRefs, {
              prompt: input.prompt,
              questions: [],
              conceptIds,
              generationState: {
                ...baseGenerationState,
                status: "resuming" as const,
                resumeArtifactId: resumeArtifact.id,
              },
            })
          : await createArtifact(
              appCtx,
              runtimeContext,
              "quiz",
              input.title,
              input.sourceNodeRefs,
              {
                prompt: input.prompt,
                questions: [],
                conceptIds,
                generationState: {
                  ...baseGenerationState,
                  status: "draft" as const,
                },
              },
              "draft",
            );
        return {
          artifactId: draftResult.artifactId,
          status: "draft",
          warnings: [
            ...draftResult.warnings,
            { code: "quiz_generation_deferred", message: "Saved a resumable quiz draft; resume from this artifact to finish generation." },
            ...(conceptIds.length !== input.conceptIds.length
              ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
              : []),
          ],
          reducerResult: buildReducerResult(
            "artifact.created",
            {
              artifactId: draftResult.artifactId,
              notebookId: ctx.notebookId,
              artifactType: "quiz",
              title: input.title,
              sourceNodeRefs: draftResult.sourceNodeRefs,
              conceptIds,
              status: "draft",
              visibility: draftResult.visibility,
              approvalRequired: draftResult.approvalRequired,
              lifecycle: draftResult.lifecycle,
              quality: draftResult.quality,
              resumable: true,
            },
            [draftResult.eventId],
          ),
        };
      }

      const draftResult = resumeArtifact
        ? null
        : await createArtifact(
            appCtx,
            runtimeContext,
            "quiz",
            input.title,
            input.sourceNodeRefs,
            {
              prompt: input.prompt,
              questions: [],
              conceptIds,
              generationState: {
                ...baseGenerationState,
                status: "draft" as const,
              },
            },
            "draft",
          );

        const artifactId = resumeArtifact?.id ?? draftResult!.artifactId;
      try {
        const payload = await buildQuizArtifactPayload(appCtx.db, ctx.notebookId, conceptIds, input.questionCount, input.prompt);
        const finalResult = await finalizeQuizArtifact(
          appCtx,
          runtimeContext,
          artifactId,
          input.title,
          input.sourceNodeRefs,
          {
            ...payload,
            generationState: {
              ...baseGenerationState,
              status: "complete" as const,
              generatedQuestionCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
            },
          },
        );

        return {
          artifactId: finalResult.artifactId,
          status: finalResult.status,
          warnings: [
            ...finalResult.warnings,
            ...(conceptIds.length !== input.conceptIds.length
              ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
              : []),
          ],
          reducerResult: buildReducerResult(
            "artifact.created",
            {
              artifactId: finalResult.artifactId,
              notebookId: ctx.notebookId,
              artifactType: "quiz",
              title: input.title,
              sourceNodeRefs: finalResult.sourceNodeRefs,
              conceptIds,
              status: finalResult.status,
              visibility: finalResult.visibility,
              approvalRequired: finalResult.approvalRequired,
              lifecycle: finalResult.lifecycle,
              quality: finalResult.quality,
            },
            resumeArtifact ? [finalResult.eventId] : [draftResult!.eventId, finalResult.eventId],
          ),
        };
      } catch (error) {
        if (resumeArtifact) {
          return {
            artifactId,
            status: resumeArtifact.status === "ready" || resumeArtifact.status === "proposed" ? resumeArtifact.status : "draft",
            warnings: [
              { code: "quiz_generation_resume_pending", message: "Saved quiz draft could not be finished right now; resume from the saved artifact later." },
              ...(conceptIds.length !== input.conceptIds.length
                ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
                : []),
            ],
            reducerResult: buildReducerResult(
              "artifact.created",
              {
                artifactId,
                notebookId: ctx.notebookId,
                artifactType: "quiz",
                title: input.title,
                sourceNodeRefs: input.sourceNodeRefs,
                conceptIds,
                status: resumeArtifact.status,
                visibility: "hidden",
                approvalRequired: false,
                lifecycle: null,
                quality: null,
              },
              [],
            ),
          };
        }
        return {
          artifactId: draftResult!.artifactId,
          status: "draft",
          warnings: [
            ...draftResult!.warnings,
            { code: "quiz_generation_resume_pending", message: "Saved quiz draft could not be finished right now; resume from the saved draft later." },
            ...(conceptIds.length !== input.conceptIds.length
              ? [{ code: "concept_scope_filtered", message: "Some concept ids were outside this notebook and were ignored." }]
              : []),
          ],
          reducerResult: buildReducerResult(
            "artifact.created",
            {
              artifactId: draftResult!.artifactId,
              notebookId: ctx.notebookId,
              artifactType: "quiz",
              title: input.title,
              sourceNodeRefs: draftResult!.sourceNodeRefs,
              conceptIds,
              status: "draft",
              visibility: draftResult!.visibility,
              approvalRequired: draftResult!.approvalRequired,
              lifecycle: draftResult!.lifecycle,
              quality: draftResult!.quality,
            },
            [draftResult!.eventId],
          ),
        };
      }
    },
    async createFlashcards(input, ctx) {
      const conceptIds = await resolveConceptIds(appCtx.db, ctx.notebookId, input.conceptIds);
      const payload = input.cards?.length
        ? { prompt: input.prompt, cards: input.cards, conceptIds }
        : await buildFlashcardsArtifactPayload(appCtx.db, ctx.notebookId, conceptIds, input.cardCount, input.prompt);
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
            sourceNodeRefs: result.sourceNodeRefs,
            conceptIds,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
            lifecycle: result.lifecycle,
            quality: result.quality,
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
            sourceNodeRefs: result.sourceNodeRefs,
            conceptIds,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
            lifecycle: result.lifecycle,
            quality: result.quality,
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
            sourceNodeRefs: result.sourceNodeRefs,
            conceptIds,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
            lifecycle: result.lifecycle,
            quality: result.quality,
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
            sourceNodeRefs: result.sourceNodeRefs,
            conceptIds,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
            lifecycle: result.lifecycle,
            quality: result.quality,
          },
          [result.eventId],
        ),
      };
    },

    async createConceptCard(input: CreateConceptCardInput, ctx): Promise<CreateConceptCardOutput> {
      const conceptIds = await resolveConceptIds(appCtx.db, ctx.notebookId, input.conceptIds);
      const result = await createArtifact(
        appCtx,
        {
          notebookId: ctx.notebookId,
          runId: ctx.runId,
          traceId: ctx.traceId,
          ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        },
        "concept_card",
        input.title,
        input.sourceNodeRefs,
        {
          prompt: input.prompt,
          definition: input.definition,
          whenToUse: input.whenToUse,
          commonConfusion: input.commonConfusion,
          examples: input.examples,
          conceptIds,
          sourceNodeRefs: input.sourceNodeRefs,
        },
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
            artifactType: "concept_card",
            title: input.title,
            sourceNodeRefs: result.sourceNodeRefs,
            conceptIds,
            status: result.status,
            visibility: result.visibility,
            approvalRequired: result.approvalRequired,
            lifecycle: result.lifecycle,
            quality: result.quality,
          },
          [result.eventId],
        ),
      };
    },

    async artifactInsertIntoTutorContext(input, ctx) {
      const [row] = await appCtx.db.db
        .select({ id: artifacts.id, title: artifacts.title })
        .from(artifacts)
        .where(and(eq(artifacts.id, input.artifactId), eq(artifacts.notebookId, ctx.notebookId)))
        .limit(1);

      if (!row) {
        return {
          success: false,
          warnings: [{ code: "artifact_missing", message: "Artifact not found in this notebook." }],
          reducerResult: buildReducerResult(
            "artifact.insert_into_tutor_context.failed",
            { artifactId: input.artifactId, insertionPoint: input.insertionPoint, tutorMessage: input.tutorMessage },
          ),
        };
      }

      const event = await appendEvent(appCtx.db, {
        notebookId: ctx.notebookId,
        runId: ctx.runId,
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        eventType: "artifact.insert_into_tutor_context",
        payload: {
          artifactId: input.artifactId,
          insertionPoint: input.insertionPoint,
          tutorMessage: input.tutorMessage,
          coverageItemRefsJson: input.coverageItemRefsJson ?? [],
          traceId: ctx.traceId,
        },
      });

      const tutorAnnotation = {
        artifactId: input.artifactId,
        insertionPoint: input.insertionPoint,
        context: input.tutorMessage,
        timestamp: new Date().toISOString(),
      };
      const emittedEventIds = [event.id];

      let preferredSessionPlanId: string | null = null;
      if (ctx.sessionId) {
        const [sessionRow] = await appCtx.db.db
          .select({ runtimeContextJson: tutorSessions.runtimeContextJson })
          .from(tutorSessions)
          .where(and(eq(tutorSessions.id, ctx.sessionId), eq(tutorSessions.notebookId, ctx.notebookId)))
          .limit(1);
        if (isJsonRecordLocal(sessionRow?.runtimeContextJson)) {
          const activeSessionPlanId = sessionRow.runtimeContextJson.activeSessionPlanId;
          preferredSessionPlanId =
            typeof activeSessionPlanId === "string" && activeSessionPlanId.length > 0 ? activeSessionPlanId : null;
        }
      }

      const [activeSessionPlan] = await appCtx.db.db
        .select({
          id: sessionPlans.id,
          artifactRefsJson: sessionPlans.artifactRefsJson,
        })
        .from(sessionPlans)
        .where(
          and(
            eq(sessionPlans.notebookId, ctx.notebookId),
            eq(sessionPlans.status, "active"),
            ...(preferredSessionPlanId ? [eq(sessionPlans.id, preferredSessionPlanId)] : []),
          ),
        )
        .orderBy(desc(sessionPlans.updatedAt))
        .limit(1);
      if (activeSessionPlan) {
        const refs = Array.isArray(activeSessionPlan.artifactRefsJson) ? activeSessionPlan.artifactRefsJson : [];
        const existingRef = refs.find(
          (value) =>
            isJsonRecordLocal(value) &&
            value.artifactId === input.artifactId &&
            value.insertionPoint === input.insertionPoint,
        );
        const nextRefs = existingRef
          ? refs
          : [
              ...refs,
              {
                artifactId: input.artifactId,
                insertionPoint: input.insertionPoint,
                tutorMessage: input.tutorMessage,
                insertedAt: new Date().toISOString(),
              },
            ];
        await appCtx.db.db
          .update(sessionPlans)
          .set({ artifactRefsJson: nextRefs, updatedAt: new Date() })
          .where(eq(sessionPlans.id, activeSessionPlan.id));
        const sessionPlanEvent = await appendEvent(appCtx.db, {
          notebookId: ctx.notebookId,
          runId: ctx.runId,
          ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
          eventType: "session_plan.updated",
          payload: {
            sessionPlanId: activeSessionPlan.id,
            artifactRefsJson: nextRefs,
            reason: "artifact_inserted_into_tutor_context",
            traceId: ctx.traceId,
          },
        });
        emittedEventIds.push(sessionPlanEvent.id);
      }

      return {
        success: true,
        insertedArtifactId: row.id,
        tutorAnnotation,
        warnings: [],
        reducerResult: buildReducerResult(
          "artifact.insert_into_tutor_context",
          { artifactId: row.id, insertionPoint: input.insertionPoint, tutorMessage: input.tutorMessage, coverageItemRefsJson: input.coverageItemRefsJson ?? [] },
          emittedEventIds,
        ),
      };
    },

    async markCoverage(input, ctx) {
      const result = await upsertCoverageRecord(appCtx, ctx.notebookId, input, ctx.runId);
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

    async activateCurriculum(input, ctx): Promise<CurriculumActivateOutput> {
      const result = await activateCurriculumRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "curriculum.activated",
            payload: { curriculumId: result.id, activeModuleId: result.activeModuleId, reasonJson: input.reasonJson, traceId: ctx.traceId },
          })
        : null;
      return {
        curriculum: result,
        warnings: result ? [] : [{ code: "curriculum_missing", message: "Curriculum was not found in this notebook." }],
        reducerResult: buildReducerResult("curriculum.activated", { notebookId: ctx.notebookId, curriculumId: input.curriculumId, activeModuleId: input.activeModuleId ?? null, reasonJson: input.reasonJson }, event ? [event.id] : []),
      };
    },

    async updateModule(input, ctx): Promise<ModuleUpdateOutput> {
      const result = await updateModuleRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "module.updated",
            payload: { moduleId: result.id, curriculumId: result.curriculumId, title: result.title, status: result.status, orderIndex: result.orderIndex, traceId: ctx.traceId },
          })
        : null;
      return {
        module: result,
        warnings: result ? [] : [{ code: "module_missing", message: "Module was not found in this notebook." }],
        reducerResult: buildReducerResult("module.updated", { notebookId: ctx.notebookId, moduleId: input.moduleId, title: input.title ?? null, status: input.status ?? null, orderIndex: input.orderIndex ?? null }, event ? [event.id] : []),
      };
    },

    async updateObjectiveList(input, ctx): Promise<ObjectiveListUpdateOutput> {
      const result = await updateObjectiveListRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "objective_list.updated",
            payload: { objectiveListId: result.id, currentObjectiveId: result.currentObjectiveId, objectiveIdsOrdered: result.objectiveIdsOrdered, traceId: ctx.traceId },
          })
        : null;
      return {
        objectiveList: result,
        warnings: result ? [] : [{ code: "objective_list_missing", message: "Objective list was not found in this notebook." }],
        reducerResult: buildReducerResult("objective_list.updated", { notebookId: ctx.notebookId, objectiveListId: input.objectiveListId, currentObjectiveId: input.currentObjectiveId ?? null, objectiveIdsOrdered: input.objectiveIdsOrdered ?? [] }, event ? [event.id] : []),
      };
    },
    async updateObjective(input, ctx): Promise<ObjectiveUpdateOutput> {
      const result = await updateObjectiveRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "objective.updated",
            payload: { objectiveId: result.id, title: result.title, status: result.status, orderIndex: result.orderIndex, traceId: ctx.traceId },
          })
        : null;
      return {
        objective: result,
        warnings: result ? [] : [{ code: "objective_missing", message: "Objective was not found in this notebook." }],
        reducerResult: buildReducerResult("objective.updated", { notebookId: ctx.notebookId, objectiveId: input.objectiveId, title: input.title ?? null, status: input.status ?? null }, event ? [event.id] : []),
      };
    },
    async reorderObjectiveList(input, ctx): Promise<ObjectiveListReorderOutput> {
      const result = await reorderObjectiveListRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "objective_list.reordered",
            payload: { objectiveListId: result.id, currentObjectiveId: result.currentObjectiveId, objectiveIdsOrdered: result.objectiveIdsOrdered, traceId: ctx.traceId },
          })
        : null;
      return {
        objectiveList: result,
        warnings: result ? [] : [{ code: "objective_list_reorder_rejected", message: "Objective list reorder failed due to scope or ordering mismatch." }],
        reducerResult: buildReducerResult("objective_list.reordered", { notebookId: ctx.notebookId, objectiveListId: input.objectiveListId, objectiveIdsOrdered: input.objectiveIdsOrdered, currentObjectiveId: input.currentObjectiveId ?? null }, event ? [event.id] : []),
      };
    },
    async splitObjective(input, ctx): Promise<ObjectiveListSplitObjectiveOutput> {
      const result = await splitObjectiveRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "objective_list.objective_split",
            payload: { objectiveListId: input.objectiveListId, objectiveId: input.objectiveId, createdObjectiveIds: result.createdObjectiveIds, traceId: ctx.traceId },
          })
        : null;
      return {
        objectiveList: result?.objectiveList ?? null,
        createdObjectiveIds: result?.createdObjectiveIds ?? [],
        warnings: result ? [] : [{ code: "objective_split_rejected", message: "Objective split failed due to scope or missing objective." }],
        reducerResult: buildReducerResult("objective_list.objective_split", { notebookId: ctx.notebookId, objectiveListId: input.objectiveListId, objectiveId: input.objectiveId, splitObjectives: input.splitObjectives }, event ? [event.id] : []),
      };
    },
    async mergeObjectives(input, ctx): Promise<ObjectiveListMergeObjectivesOutput> {
      const result = await mergeObjectivesRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "objective_list.objectives_merged",
            payload: { objectiveListId: input.objectiveListId, objectiveIds: input.objectiveIds, mergedObjectiveId: result.mergedObjectiveId, traceId: ctx.traceId },
          })
        : null;
      return {
        objectiveList: result?.objectiveList ?? null,
        mergedObjectiveId: result?.mergedObjectiveId,
        warnings: result ? [] : [{ code: "objective_merge_rejected", message: "Objective merge failed due to scope or missing objectives." }],
        reducerResult: buildReducerResult("objective_list.objectives_merged", { notebookId: ctx.notebookId, objectiveListId: input.objectiveListId, objectiveIds: input.objectiveIds, mergedObjectiveTitle: input.mergedObjectiveTitle }, event ? [event.id] : []),
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

    async evaluateLearnerResponse(input, ctx): Promise<EvaluateLearnerResponseOutput> {
      const result = await evaluatePersistAndApply(appCtx.db, {
        notebookId: ctx.notebookId,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        turnId: ctx.turnId,
        runId: ctx.runId,
        tutorQuestion: input.tutorQuestion,
        learnerAnswer: input.learnerAnswer,
        objectiveId: input.objectiveId,
        conceptRoles: input.conceptRoles.map((role) => ({
          conceptId: role.conceptId,
          role: normalizeConceptRole(role.role),
        })),
        masterySnapshot: input.masterySnapshot,
        sourceRefs: input.sourceRefs,
        contextRefs: input.contextRefs,
        referenceAnswer: input.referenceAnswer,
        evidenceType: normalizeMasteryEvidenceType(input.evidenceType),
        triggerSource: normalizeMasteryTriggerSource(input.triggerSource),
      });

      return {
        masteryEvidenceId: result.evidenceId,
        correctnessLabel: result.evidence.correctnessLabel,
        tutoringIntervention: result.evidence.tutoringIntervention,
        readiness: result.evidence.readiness,
        conceptIds: result.evidence.conceptScores.map((entry) => entry.conceptId),
        warnings: [],
        reducerResult: buildReducerResult(
          "learning.mastery.updated",
          {
            masteryEvidenceId: result.evidenceId,
            notebookId: ctx.notebookId,
            conceptIds: result.evidence.conceptScores.map((entry) => entry.conceptId),
            correctnessLabel: result.evidence.correctnessLabel,
            tutoringIntervention: result.evidence.tutoringIntervention,
            updatedConceptStates: result.updatedConceptStates,
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
  runId?: string,
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

  const existingRows = await appCtx.db.db
    .select()
    .from(coverageRecords)
    .where(and(eq(coverageRecords.notebookId, notebookId), eq(coverageRecords.coverageItemId, input.coverageItemId)));

  const targetScope: CoverageScope = {
    curriculumId: input.curriculumId ?? null,
    moduleId: input.moduleId ?? null,
    objectiveListId: input.objectiveListId ?? null,
    sessionPlanId: input.sessionPlanId ?? null,
  };
  const existing = findCoverageRecordForScope(existingRows, targetScope);

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
    updatedByRunId: runId,
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

export function findCoverageRecordForScope<T extends CoverageScope>(rows: T[], scope: CoverageScope): T | undefined {
  return rows.find(
    (row) =>
      normalizeScopeValue(row.curriculumId) === normalizeScopeValue(scope.curriculumId) &&
      normalizeScopeValue(row.moduleId) === normalizeScopeValue(scope.moduleId) &&
      normalizeScopeValue(row.objectiveListId) === normalizeScopeValue(scope.objectiveListId) &&
      normalizeScopeValue(row.sessionPlanId) === normalizeScopeValue(scope.sessionPlanId),
  );
}

function normalizeScopeValue(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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
    .where(eq(coverageItems.notebookId, notebookId));

  const groupedRows = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = groupedRows.get(row.coverageItemId);
    if (existing) existing.push(row);
    else groupedRows.set(row.coverageItemId, [row]);
  }

  const scopedRows = [...groupedRows.values()]
    .map((group) => selectPreferredCoverageGapRow(group, input))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return scopedRows
    .filter((row) => !row.recordStatus || input.statuses.includes(row.recordStatus as never))
    .filter((row) => (input.curriculumId ? row.curriculumId === input.curriculumId : true))
    .filter((row) => (input.moduleId ? row.moduleId === input.moduleId : true))
    .filter((row) => (input.objectiveListId ? row.objectiveListId === input.objectiveListId : true))
    .filter((row) => (input.sessionPlanId ? row.sessionPlanId === input.sessionPlanId : true))
    .slice(0, input.limit)
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

export function selectPreferredCoverageGapRow<
  T extends {
    curriculumId: string | null;
    moduleId: string | null;
    objectiveListId: string | null;
    sessionPlanId: string | null;
  },
>(
  rows: T[],
  input: CoverageGetGapsInput,
): T | null {
  const scope = {
    curriculumId: normalizeScopeValue(input.curriculumId),
    moduleId: normalizeScopeValue(input.moduleId),
    objectiveListId: normalizeScopeValue(input.objectiveListId),
    sessionPlanId: normalizeScopeValue(input.sessionPlanId),
  };
  const compatible = rows.filter((row) => {
    const tuple = {
      curriculumId: normalizeScopeValue(row.curriculumId),
      moduleId: normalizeScopeValue(row.moduleId),
      objectiveListId: normalizeScopeValue(row.objectiveListId),
      sessionPlanId: normalizeScopeValue(row.sessionPlanId),
    };
    return (
      (!scope.curriculumId || !tuple.curriculumId || tuple.curriculumId === scope.curriculumId) &&
      (!scope.moduleId || !tuple.moduleId || tuple.moduleId === scope.moduleId) &&
      (!scope.objectiveListId || !tuple.objectiveListId || tuple.objectiveListId === scope.objectiveListId) &&
      (!scope.sessionPlanId || !tuple.sessionPlanId || tuple.sessionPlanId === scope.sessionPlanId)
    );
  });
  if (compatible.length === 0) return null;
  const score = (row: T): number => {
    if (scope.sessionPlanId && normalizeScopeValue(row.sessionPlanId) === scope.sessionPlanId) return 40;
    if (scope.objectiveListId && normalizeScopeValue(row.objectiveListId) === scope.objectiveListId) return 30;
    if (scope.moduleId && normalizeScopeValue(row.moduleId) === scope.moduleId) return 20;
    if (scope.curriculumId && normalizeScopeValue(row.curriculumId) === scope.curriculumId) return 10;
    if (
      !normalizeScopeValue(row.curriculumId) &&
      !normalizeScopeValue(row.moduleId) &&
      !normalizeScopeValue(row.objectiveListId) &&
      !normalizeScopeValue(row.sessionPlanId)
    ) {
      return 1;
    }
    return 0;
  };
  return compatible.sort((left, right) => score(right) - score(left))[0] ?? null;
}

async function activateCurriculumRecord(appCtx: AppContext, notebookId: string, input: CurriculumActivateInput) {
  const [existing] = await appCtx.db.db
    .select()
    .from(curricula)
    .where(and(eq(curricula.id, input.curriculumId), eq(curricula.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  if (input.activeModuleId) {
    const [moduleRow] = await appCtx.db.db
      .select({ id: curriculumModules.id })
      .from(curriculumModules)
      .where(
        and(
          eq(curriculumModules.id, input.activeModuleId),
          eq(curriculumModules.notebookId, notebookId),
          eq(curriculumModules.curriculumId, existing.id),
        ),
      )
      .limit(1);
    if (!moduleRow) return null;
  }
  const updatedAt = new Date();
  await appCtx.db.db
    .update(curricula)
    .set({ status: "active", activeModuleId: input.activeModuleId ?? existing.activeModuleId ?? null, updatedAt })
    .where(eq(curricula.id, existing.id));
  return { id: existing.id, notebookId: existing.notebookId, title: existing.title, status: "active", activeModuleId: input.activeModuleId ?? existing.activeModuleId ?? null };
}

async function updateModuleRecord(appCtx: AppContext, notebookId: string, input: ModuleUpdateInput) {
  const [existing] = await appCtx.db.db
    .select()
    .from(curriculumModules)
    .where(and(eq(curriculumModules.id, input.moduleId), eq(curriculumModules.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  const updatedAt = new Date();
  const next = {
    title: input.title ?? existing.title,
    summary: input.summary ?? existing.summary ?? null,
    status: input.status ?? existing.status,
    orderIndex: input.orderIndex ?? existing.orderIndex,
    targetConceptIds: input.targetConceptIds ?? existing.targetConceptIds,
    prerequisiteModuleIds: input.prerequisiteModuleIds ?? existing.prerequisiteModuleIds,
    estimatedSessionCount: input.estimatedSessionCount ?? existing.estimatedSessionCount,
    coverageRequirementsJson: input.coverageRequirementsJson ?? existing.coverageRequirementsJson,
    masteryGateJson: input.masteryGateJson ?? existing.masteryGateJson,
    updatedAt,
  };
  await appCtx.db.db.update(curriculumModules).set(next).where(eq(curriculumModules.id, existing.id));
  return { id: existing.id, notebookId: existing.notebookId, curriculumId: existing.curriculumId, title: next.title, summary: next.summary, status: next.status, orderIndex: next.orderIndex };
}

async function updateObjectiveListRecord(appCtx: AppContext, notebookId: string, input: ObjectiveListUpdateInput) {
  const [existing] = await appCtx.db.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.id, input.objectiveListId), eq(objectiveLists.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  const updatedAt = new Date();
  const objectiveIdsOrdered = input.objectiveIdsOrdered ?? existing.objectiveIdsOrdered;
  const currentObjectiveId = input.currentObjectiveId === undefined ? existing.currentObjectiveId ?? null : input.currentObjectiveId;
  if (currentObjectiveId && !objectiveIdsOrdered.includes(currentObjectiveId)) {
    return null;
  }
  if (objectiveIdsOrdered.length > 0) {
    const objectiveRows = await appCtx.db.db
      .select({ id: objectives.id })
      .from(objectives)
      .where(
        and(
          eq(objectives.notebookId, notebookId),
          eq(objectives.curriculumId, existing.curriculumId),
          inArray(objectives.id, objectiveIdsOrdered),
        ),
      );
    if (objectiveRows.length !== objectiveIdsOrdered.length) {
      return null;
    }
  }
  const next = {
    title: input.title ?? existing.title,
    status: input.status ?? existing.status,
    currentObjectiveId,
    objectiveIdsOrdered,
    coverageSnapshotJson: input.coverageSnapshotJson ?? existing.coverageSnapshotJson,
    updatedAt,
  };
  await appCtx.db.db.update(objectiveLists).set(next).where(eq(objectiveLists.id, existing.id));
  return { id: existing.id, notebookId: existing.notebookId, curriculumId: existing.curriculumId, moduleId: existing.moduleId, title: next.title, status: next.status, currentObjectiveId: next.currentObjectiveId, objectiveIdsOrdered: next.objectiveIdsOrdered };
}

async function updateObjectiveRecord(appCtx: AppContext, notebookId: string, input: ObjectiveUpdateInput) {
  const [existing] = await appCtx.db.db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, input.objectiveId), eq(objectives.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  const updatedAt = new Date();
  const next = {
    title: input.title ?? existing.title,
    status: input.status ?? existing.status,
    targetConceptIds: input.targetConceptIds ?? existing.targetConceptIds,
    prerequisiteConceptIds: input.prerequisiteConceptIds ?? existing.prerequisiteConceptIds,
    successCriteriaJson: input.successCriteriaJson ?? existing.successCriteriaJson,
    sourceRefsJson: input.sourceRefsJson ?? existing.sourceRefsJson,
    suggestedMode: input.suggestedMode === undefined ? existing.suggestedMode : input.suggestedMode,
    readinessScore: input.readinessScore === undefined ? existing.readinessScore : input.readinessScore,
    updatedAt,
  };
  await appCtx.db.db.update(objectives).set(next).where(eq(objectives.id, existing.id));
  return { id: existing.id, notebookId: existing.notebookId, curriculumId: existing.curriculumId, title: next.title, status: next.status, orderIndex: existing.orderIndex };
}

async function reorderObjectiveListRecord(appCtx: AppContext, notebookId: string, input: ObjectiveListReorderInput) {
  const [existing] = await appCtx.db.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.id, input.objectiveListId), eq(objectiveLists.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  const currentSet = [...(existing.objectiveIdsOrdered ?? [])].sort();
  const incomingSet = [...input.objectiveIdsOrdered].sort();
  if (JSON.stringify(currentSet) !== JSON.stringify(incomingSet)) return null;
  if (input.currentObjectiveId && !input.objectiveIdsOrdered.includes(input.currentObjectiveId)) return null;
  const currentObjectiveId = input.currentObjectiveId === undefined ? existing.currentObjectiveId ?? null : input.currentObjectiveId;
  const updatedAt = new Date();
  await appCtx.db.db
    .update(objectiveLists)
    .set({ objectiveIdsOrdered: input.objectiveIdsOrdered, currentObjectiveId, updatedAt })
    .where(eq(objectiveLists.id, existing.id));
  return { id: existing.id, notebookId: existing.notebookId, curriculumId: existing.curriculumId, moduleId: existing.moduleId, title: existing.title, status: existing.status, currentObjectiveId, objectiveIdsOrdered: input.objectiveIdsOrdered };
}

async function splitObjectiveRecord(appCtx: AppContext, notebookId: string, input: ObjectiveListSplitObjectiveInput) {
  const [list] = await appCtx.db.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.id, input.objectiveListId), eq(objectiveLists.notebookId, notebookId)))
    .limit(1);
  if (!list) return null;
  const splitIndex = list.objectiveIdsOrdered.indexOf(input.objectiveId);
  if (splitIndex < 0) return null;

  const [sourceObjective] = await appCtx.db.db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, input.objectiveId), eq(objectives.notebookId, notebookId)))
    .limit(1);
  if (!sourceObjective) return null;

  const createdObjectiveIds: string[] = [];
  for (let i = 0; i < input.splitObjectives.length; i += 1) {
    const split = input.splitObjectives[i]!;
    const id = `objective_${crypto.randomUUID().replaceAll("-", "")}`;
    createdObjectiveIds.push(id);
    await appCtx.db.db.insert(objectives).values({
      id,
      notebookId,
      curriculumId: sourceObjective.curriculumId,
      title: split.title,
      status: "not_started",
      orderIndex: sourceObjective.orderIndex + i,
      prerequisiteConceptIds: split.prerequisiteConceptIds ?? sourceObjective.prerequisiteConceptIds,
      targetConceptIds: split.targetConceptIds ?? sourceObjective.targetConceptIds,
      successCriteriaJson: sourceObjective.successCriteriaJson,
      sourceRefsJson: sourceObjective.sourceRefsJson,
      suggestedMode: sourceObjective.suggestedMode,
      readinessScore: sourceObjective.readinessScore,
    });
  }

  await appCtx.db.db.update(objectives).set({ status: "superseded", updatedAt: new Date() }).where(eq(objectives.id, sourceObjective.id));
  const objectiveIdsOrdered = [...list.objectiveIdsOrdered];
  objectiveIdsOrdered.splice(splitIndex, 1, ...createdObjectiveIds);
  const currentObjectiveId = list.currentObjectiveId === input.objectiveId ? createdObjectiveIds[0] ?? null : list.currentObjectiveId ?? null;
  await appCtx.db.db
    .update(objectiveLists)
    .set({ objectiveIdsOrdered, currentObjectiveId, updatedAt: new Date() })
    .where(eq(objectiveLists.id, list.id));
  return {
    objectiveList: { id: list.id, notebookId: list.notebookId, curriculumId: list.curriculumId, moduleId: list.moduleId, title: list.title, status: list.status, currentObjectiveId, objectiveIdsOrdered },
    createdObjectiveIds,
  };
}

async function mergeObjectivesRecord(appCtx: AppContext, notebookId: string, input: ObjectiveListMergeObjectivesInput) {
  const [list] = await appCtx.db.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.id, input.objectiveListId), eq(objectiveLists.notebookId, notebookId)))
    .limit(1);
  if (!list) return null;
  if (!input.objectiveIds.every((id) => list.objectiveIdsOrdered.includes(id))) return null;

  const rows = await appCtx.db.db
    .select()
    .from(objectives)
    .where(and(eq(objectives.notebookId, notebookId), inArray(objectives.id, input.objectiveIds)));
  if (rows.length !== input.objectiveIds.length) return null;

  const mergedObjectiveId = `objective_${crypto.randomUUID().replaceAll("-", "")}`;
  const first = rows[0]!;
  await appCtx.db.db.insert(objectives).values({
    id: mergedObjectiveId,
    notebookId,
    curriculumId: first.curriculumId,
    title: input.mergedObjectiveTitle,
    status: "not_started",
    orderIndex: Math.min(...rows.map((row) => row.orderIndex)),
    prerequisiteConceptIds: input.prerequisiteConceptIds ?? first.prerequisiteConceptIds,
    targetConceptIds: input.targetConceptIds ?? first.targetConceptIds,
    successCriteriaJson: first.successCriteriaJson,
    sourceRefsJson: first.sourceRefsJson,
    suggestedMode: first.suggestedMode,
    readinessScore: first.readinessScore,
  });

  await appCtx.db.db.update(objectives).set({ status: "merged", updatedAt: new Date() }).where(inArray(objectives.id, input.objectiveIds));

  const objectiveIdsOrdered = list.objectiveIdsOrdered.filter((id) => !input.objectiveIds.includes(id));
  let insertAt = list.objectiveIdsOrdered.length;
  for (let i = 0; i < list.objectiveIdsOrdered.length; i += 1) {
    if (input.objectiveIds.includes(list.objectiveIdsOrdered[i]!)) {
      insertAt = i;
      break;
    }
  }
  objectiveIdsOrdered.splice(insertAt, 0, mergedObjectiveId);
  const currentObjectiveId = list.currentObjectiveId && input.objectiveIds.includes(list.currentObjectiveId) ? mergedObjectiveId : list.currentObjectiveId ?? null;
  await appCtx.db.db
    .update(objectiveLists)
    .set({ objectiveIdsOrdered, currentObjectiveId, updatedAt: new Date() })
    .where(eq(objectiveLists.id, list.id));
  return {
    objectiveList: { id: list.id, notebookId: list.notebookId, curriculumId: list.curriculumId, moduleId: list.moduleId, title: list.title, status: list.status, currentObjectiveId, objectiveIdsOrdered },
    mergedObjectiveId,
  };
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
  if (input.plannedObjectiveIds) {
    const [objectiveList] = await appCtx.db.db
      .select({ objectiveIdsOrdered: objectiveLists.objectiveIdsOrdered })
      .from(objectiveLists)
      .where(and(eq(objectiveLists.id, existing.objectiveListId), eq(objectiveLists.notebookId, notebookId)))
      .limit(1);
    if (!objectiveList) return null;
    const allowed = new Set(objectiveList.objectiveIdsOrdered ?? []);
    if (input.plannedObjectiveIds.some((id) => !allowed.has(id))) {
      return null;
    }
  }

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
  artifactType: ArtifactType,
  title: string,
  sourceNodeRefs: NodeRef[],
  payload: Record<string, unknown>,
  status?: ArtifactLifecycleStatus,
): Promise<{
  artifactId: string;
  eventId: string;
  sourceNodeRefs: NodeRef[];
  warnings: Array<{ code: string; message: string }>;
  status: ArtifactLifecycleStatus;
  visibility: ArtifactLearnerVisibility;
  approvalRequired: boolean;
  lifecycle: ArtifactLifecycleOutcome;
  quality: ArtifactQualityDecision;
}> {
  const artifactId = `artifact_${crypto.randomUUID().replaceAll("-", "")}`;
  const resolvedRefs = await sanitizeArtifactSourceNodeRefs(appCtx.db, ctx.notebookId, sourceNodeRefs);
  const sourceChunkIds = resolvedRefs.refs.filter((ref) => ref.refType === "chunk").map((ref) => ref.refId);
  const sourceClaimIds = resolvedRefs.refs.filter((ref) => ref.refType === "claim").map((ref) => ref.refId);
  const artifactConsent = await resolveNotebookArtifactConsent(appCtx, ctx.notebookId);
  const lifecycleResult = resolveArtifactLifecycleOutcome({
    artifactType,
    artifactConsent,
    payload,
    sourceRefs: resolvedRefs.refs as NodeRef[],
    ...(status ? { requestedStatus: status } : {}),
  });
  const { lifecycle, quality } = lifecycleResult;
  const payloadWithRefs =
    "sourceNodeRefs" in payload
      ? {
          ...payload,
          sourceNodeRefs: resolvedRefs.refs,
        }
      : payload;

  await appCtx.db.db.insert(artifacts).values({
    id: artifactId,
    notebookId: ctx.notebookId,
    artifactType,
    title,
    status: lifecycle.status,
    payloadJson: payloadWithRefs,
    sourceNodeRefsJson: resolvedRefs.refs,
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
      lifecycle,
      quality,
      qualityIssues: quality.issues,
      sourceNodeRefs: resolvedRefs.refs,
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
        visibility: lifecycle.visibility,
        quality,
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
        quality,
        qualityIssues: quality.issues,
        traceId: ctx.traceId,
      },
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
    });
  }

  return {
    artifactId,
    eventId: event.id,
    sourceNodeRefs: resolvedRefs.refs,
    warnings: [...resolvedRefs.warnings, ...lifecycleResult.warnings],
    status: lifecycle.status,
    visibility: lifecycle.visibility,
    approvalRequired: lifecycle.approvalRequired,
    lifecycle,
    quality,
  };
}

async function findArtifactRecord(appDb: AppContext["db"], notebookId: string, artifactId: string) {
  const [artifact] = await appDb.db
    .select({ id: artifacts.id, notebookId: artifacts.notebookId, status: artifacts.status, artifactType: artifacts.artifactType })
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, notebookId)))
    .limit(1);
  return artifact ?? null;
}

async function finalizeQuizArtifact(
  appCtx: AppContext,
  ctx: { notebookId: string; sessionId?: string; runId: string; traceId: string },
  artifactId: string,
  title: string,
  sourceNodeRefs: Array<{ refType: string; refId: string }>,
  payload: Record<string, unknown>,
): Promise<{
  artifactId: string;
  eventId: string;
  sourceNodeRefs: NodeRef[];
  warnings: Array<{ code: string; message: string }>;
  status: ArtifactLifecycleStatus;
  visibility: ArtifactLearnerVisibility;
  approvalRequired: boolean;
  lifecycle: ArtifactLifecycleOutcome;
  quality: ArtifactQualityDecision;
}> {
  const resolvedRefs = await sanitizeArtifactSourceNodeRefs(appCtx.db, ctx.notebookId, sourceNodeRefs);
  const artifactConsent = await resolveNotebookArtifactConsent(appCtx, ctx.notebookId);
  const lifecycleResult = resolveArtifactLifecycleOutcome({
    artifactType: "quiz",
    artifactConsent,
    payload,
    sourceRefs: resolvedRefs.refs as NodeRef[],
  });
  const { lifecycle, quality } = lifecycleResult;
  const finalPayload = {
    ...payload,
    generationState: {
      ...(isJsonRecordLocal(payload.generationState) ? payload.generationState : {}),
      status: "complete",
      generatedQuestionCount: Array.isArray(payload.questions) ? payload.questions.length : 0,
      updatedAt: new Date().toISOString(),
    },
  };
  const sourceChunkIds = resolvedRefs.refs.filter((ref) => ref.refType === "chunk").map((ref) => ref.refId);
  const sourceClaimIds = resolvedRefs.refs.filter((ref) => ref.refType === "claim").map((ref) => ref.refId);
  await appCtx.db.db
    .update(artifacts)
    .set({
      title,
      status: lifecycle.status,
      payloadJson: finalPayload,
      sourceNodeRefsJson: resolvedRefs.refs,
      sourceClaimIds,
      sourceChunkIds,
      updatedAt: new Date(),
    })
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, ctx.notebookId)));

  const eventType = deriveArtifactLifecycleEventType("draft", lifecycle.status) ?? "artifact.updated";
  const event = await appendEvent(appCtx.db, {
    notebookId: ctx.notebookId,
    runId: ctx.runId,
    eventType,
    payload: {
      artifactId,
      artifactType: "quiz",
      title,
      status: lifecycle.status,
      visibility: lifecycle.visibility,
      approvalRequired: lifecycle.approvalRequired,
      lifecycle,
      quality,
      qualityIssues: quality.issues,
      sourceNodeRefs: resolvedRefs.refs,
      traceId: ctx.traceId,
    },
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  });

  return {
    artifactId,
    eventId: event.id,
    sourceNodeRefs: resolvedRefs.refs,
    warnings: [...resolvedRefs.warnings, ...lifecycleResult.warnings],
    status: lifecycle.status,
    visibility: lifecycle.visibility,
    approvalRequired: lifecycle.approvalRequired,
    lifecycle,
    quality,
  };
}

async function updateQuizDraftArtifact(
  appCtx: AppContext,
  ctx: { notebookId: string; sessionId?: string; runId: string; traceId: string },
  artifactId: string,
  title: string,
  sourceNodeRefs: Array<{ refType: string; refId: string }>,
  payload: Record<string, unknown>,
): Promise<{
  artifactId: string;
  eventId: string;
  sourceNodeRefs: NodeRef[];
  warnings: Array<{ code: string; message: string }>;
  status: ArtifactLifecycleStatus;
  visibility: ArtifactLearnerVisibility;
  approvalRequired: boolean;
  lifecycle: ArtifactLifecycleOutcome;
  quality: ArtifactQualityDecision;
}> {
  const resolvedRefs = await sanitizeArtifactSourceNodeRefs(appCtx.db, ctx.notebookId, sourceNodeRefs);
  const artifactConsent = await resolveNotebookArtifactConsent(appCtx, ctx.notebookId);
  const lifecycleResult = resolveArtifactLifecycleOutcome({
    artifactType: "quiz",
    artifactConsent,
    payload,
    sourceRefs: resolvedRefs.refs as NodeRef[],
    requestedStatus: "draft",
  });
  const { lifecycle, quality } = lifecycleResult;
  const sourceChunkIds = resolvedRefs.refs.filter((ref) => ref.refType === "chunk").map((ref) => ref.refId);
  const sourceClaimIds = resolvedRefs.refs.filter((ref) => ref.refType === "claim").map((ref) => ref.refId);

  await appCtx.db.db
    .update(artifacts)
    .set({
      title,
      status: "draft",
      payloadJson: payload,
      sourceNodeRefsJson: resolvedRefs.refs,
      sourceClaimIds,
      sourceChunkIds,
      updatedAt: new Date(),
    })
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, ctx.notebookId)));

  const event = await appendEvent(appCtx.db, {
    notebookId: ctx.notebookId,
    runId: ctx.runId,
    eventType: "artifact.updated",
    payload: {
      artifactId,
      artifactType: "quiz",
      title,
      status: "draft",
      visibility: lifecycle.visibility,
      approvalRequired: lifecycle.approvalRequired,
      lifecycle,
      quality,
      qualityIssues: quality.issues,
      sourceNodeRefs: resolvedRefs.refs,
      traceId: ctx.traceId,
      resumable: true,
    },
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  });

  return {
    artifactId,
    eventId: event.id,
    sourceNodeRefs: resolvedRefs.refs,
    warnings: [...resolvedRefs.warnings, ...lifecycleResult.warnings],
    status: "draft",
    visibility: lifecycle.visibility,
    approvalRequired: lifecycle.approvalRequired,
    lifecycle,
    quality,
  };
}

export async function sanitizeArtifactSourceNodeRefs(
  dbClient: DbClient,
  notebookId: string,
  refs: Array<{ refType: string; refId: string }>,
): Promise<{
  refs: NodeRef[];
  warnings: Array<{ code: string; message: string }>;
}> {
  const warnings: Array<{ code: string; message: string }> = [];
  const deduped: NodeRef[] = [];
  const seen = new Set<string>();
  const allowedTypes = new Set(["chunk", "claim", "source", "concept", "wiki_page", "artifact"]);

  for (const ref of refs) {
    if (!allowedTypes.has(ref.refType)) {
      warnings.push({ code: "source_ref_type_unsupported", message: `Unsupported source ref type "${ref.refType}" ignored.` });
      continue;
    }
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ref as NodeRef);
  }

  const chunksRequested = deduped.filter((ref) => ref.refType === "chunk").map((ref) => ref.refId);
  const claimsRequested = deduped.filter((ref) => ref.refType === "claim").map((ref) => ref.refId);
  const sourcesRequested = deduped.filter((ref) => ref.refType === "source").map((ref) => ref.refId);
  const conceptsRequested = deduped.filter((ref) => ref.refType === "concept").map((ref) => ref.refId);
  const pagesRequested = deduped.filter((ref) => ref.refType === "wiki_page").map((ref) => ref.refId);
  const artifactsRequested = deduped.filter((ref) => ref.refType === "artifact").map((ref) => ref.refId);

  const allowedChunkIds = new Set<string>();
  const allowedClaimIds = new Set<string>();
  const allowedSourceIds = new Set<string>();
  const allowedConceptIds = new Set<string>();
  const allowedPageIds = new Set<string>();
  const allowedArtifactIds = new Set<string>();

  if (chunksRequested.length > 0) {
    const chunkRows = await dbClient.db
      .select({ id: chunks.id })
      .from(chunks)
      .innerJoin(sourceVersions, eq(chunks.sourceVersionId, sourceVersions.id))
      .innerJoin(sources, eq(sourceVersions.sourceId, sources.id))
      .where(and(eq(sources.notebookId, notebookId), inArray(chunks.id, chunksRequested)));
    for (const row of chunkRows) allowedChunkIds.add(row.id);
  }
  if (claimsRequested.length > 0) {
    const claimRows = await dbClient.db
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.notebookId, notebookId), inArray(claims.id, claimsRequested)));
    for (const row of claimRows) allowedClaimIds.add(row.id);
  }
  if (sourcesRequested.length > 0) {
    const sourceRows = await dbClient.db
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.notebookId, notebookId), inArray(sources.id, sourcesRequested)));
    for (const row of sourceRows) allowedSourceIds.add(row.id);
  }
  if (conceptsRequested.length > 0) {
    const conceptRows = await dbClient.db
      .select({ id: concepts.id })
      .from(concepts)
      .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, conceptsRequested)));
    for (const row of conceptRows) allowedConceptIds.add(row.id);
  }
  if (pagesRequested.length > 0) {
    const pageRows = await dbClient.db
      .select({ id: wikiPages.id })
      .from(wikiPages)
      .where(and(eq(wikiPages.notebookId, notebookId), inArray(wikiPages.id, pagesRequested)));
    for (const row of pageRows) allowedPageIds.add(row.id);
  }
  if (artifactsRequested.length > 0) {
    const artifactRows = await dbClient.db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(and(eq(artifacts.notebookId, notebookId), inArray(artifacts.id, artifactsRequested)));
    for (const row of artifactRows) allowedArtifactIds.add(row.id);
  }

  const filtered = deduped.filter((ref) => {
    if (ref.refType === "chunk") return allowedChunkIds.has(ref.refId);
    if (ref.refType === "claim") return allowedClaimIds.has(ref.refId);
    if (ref.refType === "source") return allowedSourceIds.has(ref.refId);
    if (ref.refType === "concept") return allowedConceptIds.has(ref.refId);
    if (ref.refType === "wiki_page") return allowedPageIds.has(ref.refId);
    if (ref.refType === "artifact") return allowedArtifactIds.has(ref.refId);
    return false;
  });

  if (filtered.length !== deduped.length) {
    warnings.push({
      code: "source_ref_scope_filtered",
      message: "Some source refs were outside notebook scope and were ignored.",
    });
  }

  return { refs: filtered, warnings };
}

async function resolveNotebookArtifactConsent(
  appCtx: AppContext,
  notebookId: string,
): Promise<Record<string, unknown>> {
  const [notebook] = await appCtx.db.db.select({ settingsJson: notebooks.settingsJson }).from(notebooks).where(eq(notebooks.id, notebookId)).limit(1);
  const settings = isJsonRecordLocal(notebook?.settingsJson) ? notebook!.settingsJson : {};
  return isJsonRecordLocal(settings.artifactConsent) ? settings.artifactConsent : {};
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
