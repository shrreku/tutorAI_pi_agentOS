import { and, desc, eq, inArray } from "drizzle-orm";
import {
  artifacts,
  chunks,
  claims,
  concepts,
  notebooks,
  sessionPlans,
  sourceVersions,
  sources,
  tutorSessions,
  wikiPages,
  type DbClient,
} from "@studyagent/db";
import type { NodeRef } from "@studyagent/schemas";
import {
  buildReducerResult,
  type CreateConceptCardInput,
  type CreateConceptCardOutput,
  type CreateFlashcardsInput,
  type CreateFlashcardsOutput,
  type CreateNoteInput,
  type CreateNoteOutput,
  type CreateQuizInput,
  type CreateQuizOutput,
  type RuntimeWriteToolProvider,
} from "@studyagent/tools";
import {
  resolveArtifactLifecycleOutcome,
  deriveArtifactLifecycleEventType,
  type ArtifactLearnerVisibility,
  type ArtifactLifecycleOutcome,
  type ArtifactQualityDecision,
} from "./artifact-lifecycle.js";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";
import type { AppContext } from "./context.js";
import { buildFlashcardsArtifactPayload, buildQuizArtifactPayload } from "./assessment-artifacts.js";
import { isJsonRecordLocal, resolveConceptIds } from "./tutor-write-shared.js";

type ArtifactLifecycleStatus = ArtifactLifecycleOutcome["status"];
type ArtifactType = "note" | "quiz" | "flashcards" | "worked_example" | "formula_sheet" | "comparison_page" | "concept_card";

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

async function resolveNotebookArtifactConsent(
  appCtx: AppContext,
  notebookId: string,
): Promise<Record<string, unknown>> {
  const [notebook] = await appCtx.db.db.select({ settingsJson: notebooks.settingsJson }).from(notebooks).where(eq(notebooks.id, notebookId)).limit(1);
  const settings = isJsonRecordLocal(notebook?.settingsJson) ? notebook!.settingsJson : {};
  return isJsonRecordLocal(settings.artifactConsent) ? settings.artifactConsent : {};
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

export function createArtifactWriteHandlers(appCtx: AppContext): Pick<
  RuntimeWriteToolProvider,
  | "createNote"
  | "createQuiz"
  | "createFlashcards"
  | "createWorkedExample"
  | "createFormulaSheet"
  | "createComparisonPage"
  | "createConceptCard"
  | "artifactInsertIntoTutorContext"
> {
  return {
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
  };
}
