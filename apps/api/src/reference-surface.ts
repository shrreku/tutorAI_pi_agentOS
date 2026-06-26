import { and, desc, eq, inArray } from "drizzle-orm";
import {
  artifacts,
  concepts,
  claims,
  curricula,
  curriculumModules,
  objectiveLists,
  chunks,
  objectives,
  sessionPlans,
  studyPlans,
  tutorSessions,
  tutorTurns,
  sourceVersions,
  sources,
  wikiPages,
} from "@studyagent/db";
import type { AppContext } from "./context.js";
import { buildLearningArtifactView } from "./artifact-view.js";
import {
  buildEvidenceFromClaimAndChunkIds,
  isLearnerSafeClaim,
  loadConceptClaimIds,
  loadSourceChunkEvidence,
  mapChunkRefsWithSourceTitles,
  resolveNodeOpenTarget,
  sanitizeLearnerEvidenceRefs,
  toChunkEvidenceRefs,
  toLearnerClaimEvidenceRefs,
} from "./node-open-target.js";
import type { EvidenceReadModel, EvidenceRef, ReferenceBlock, ReferenceSurface, LearnerFacingReferenceSurface, NodeRef } from "@studyagent/schemas";
import { learnerFacingSurfaceStatus, learnerSafeValue, mapLearnerPrimaryActions, type PageReadiness } from "@studyagent/schemas";
import { resolveGenerationModeFromWikiRecord, resolvePageReadinessFromWikiPage } from "@studyagent/wiki-core";
import {
  buildInteractiveBlocksForSurface,
  buildLivePlanBlock,
  buildPersonalizationControlsBlock,
  buildSourceReaderBlock,
  toLearnerFacingInteractiveBlock,
} from "./interactive-learning-blocks.js";
import { loadInteractiveBlockState } from "./interactive-learning-state.js";
import { formatLearnerStateSummary, loadNotebookStudyState } from "./study-state.js";
import {
  compilePageBlockPlansToInteractiveBlocks,
  interactiveBlockPlansFromStructuredJson,
} from "@studyagent/wiki-core";

export function toLearnerFacingReferenceSurface(surface: ReferenceSurface): LearnerFacingReferenceSurface {
  const { provenanceRefs: _provenanceRefs, generation: _generation, ...learnerSurface } = surface;
  return learnerSafeValue({
    ...learnerSurface,
    primaryActions: mapLearnerPrimaryActions(surface.primaryActions),
    quality: {
      ...surface.quality,
      confidence: null,
    },
    blocks: surface.blocks.map((block) => ({
      ...block,
      evidenceRefs: sanitizeLearnerEvidenceRefs(block.evidenceRefs ?? [], false),
    })),
    interactiveBlocks: (surface.interactiveBlocks ?? []).map((block) => toLearnerFacingInteractiveBlock(block)),
  });
}

async function withInteractiveBlocks(
  ctx: AppContext,
  surface: ReferenceSurface,
  input: {
    artifact?: {
      id: string;
      notebookId: string;
      artifactType: string;
      title: string;
      status: string;
      payloadJson: Record<string, unknown>;
      sourceNodeRefsJson?: unknown[] | null;
      sourceClaimIds?: string[] | null;
      sourceChunkIds?: string[] | null;
    };
    evidenceRefs?: EvidenceRef[];
    userId?: string | undefined;
    structuredJson?: Record<string, unknown> | null;
  } = {},
): Promise<LearnerFacingReferenceSurface> {
  const evidenceRefs =
    input.evidenceRefs ??
    surface.blocks.flatMap((block) => block.evidenceRefs ?? []);

  const storedPlans = interactiveBlockPlansFromStructuredJson(input.structuredJson ?? null);
  const storedInteractiveBlocks =
    storedPlans.length > 0
      ? compilePageBlockPlansToInteractiveBlocks(storedPlans, {
          nodeRef: surface.nodeRef,
          surfaceType: surface.surfaceType,
        })
      : [];

  const interactiveBlocks = await buildInteractiveBlocksForSurface(ctx, {
    notebookId: surface.notebookId,
    surfaceType: surface.surfaceType,
    nodeRef: surface.nodeRef,
    title: surface.title,
    artifact: input.artifact ?? null,
    evidenceRefs,
    sourceRefs: surface.sourceRefs,
    userId: input.userId,
    includeSurfaceDefaults: storedPlans.length === 0,
  });

  return toLearnerFacingReferenceSurface({
    ...surface,
    interactiveBlocks: [...interactiveBlocks, ...storedInteractiveBlocks],
  });
}

export async function buildReferenceSurface(
  ctx: AppContext,
  notebookId: string,
  nodeId: string,
  options: { userId?: string } = {},
): Promise<LearnerFacingReferenceSurface> {
  const base = (overrides: Partial<ReferenceSurface> & Pick<ReferenceSurface, "nodeRef" | "title" | "surfaceType">): ReferenceSurface => ({
    id: `surface_${nodeId}`,
    notebookId,
    summary: null,
    status: null,
    blocks: [],
    interactiveBlocks: [],
    scopeRefs: [],
    sourceRefs: [],
    provenanceRefs: [],
    coverageRefs: [],
    primaryActions: ["ask_tutor"],
    quality: { confidence: null, sourceBacked: false, needsReview: false },
    generation: null,
    ...overrides,
  });

  const openTarget = await resolveNodeOpenTarget(ctx, notebookId, nodeId);

  const [studyPlanRow] = await ctx.db.db
    .select()
    .from(studyPlans)
    .where(and(eq(studyPlans.id, nodeId), eq(studyPlans.notebookId, notebookId)))
    .limit(1);

  if (studyPlanRow && options.userId) {
    const studyState = await loadNotebookStudyState(ctx.db, notebookId, options.userId);
    const nodeRef = { refType: "study_plan" as const, refId: studyPlanRow.id };
    const livePlanBlock = buildLivePlanBlock(
      {
        currentObjective: studyState.studyPlan?.currentObjective ?? null,
        upcomingObjectives: studyState.studyPlan?.upcomingObjectives ?? [],
        weakConcepts: studyState.studyPlan?.weakConcepts ?? [],
        completedObjectiveIds: (studyState.studyPlan?.completedObjectives ?? []).map((objective) => objective.id),
      },
      nodeRef,
    );
    const personalizationBlock = await buildPersonalizationControlsBlock(
      ctx,
      notebookId,
      options.userId,
      nodeRef,
    );
    return toLearnerFacingReferenceSurface(
      base({
        nodeRef,
        title: studyPlanRow.title ?? "Live Plan",
        surfaceType: "objective",
        summary: formatLearnerStateSummary(studyState) ?? null,
        interactiveBlocks: [livePlanBlock, personalizationBlock],
        primaryActions: ["ask_tutor"],
        quality: { confidence: null, sourceBacked: false, needsReview: false },
      }),
    );
  }

  if (openTarget.kind === "concept" && openTarget.entity) {
    const concept = openTarget.entity;
    const [conceptWikiPage] = await ctx.db.db
      .select()
      .from(wikiPages)
      .where(and(eq(wikiPages.notebookId, notebookId), eq(wikiPages.pageType, "concept"), eq(wikiPages.pageKey, `concept:${concept.id}`)))
      .limit(1);
    const claimIds = await loadConceptClaimIds(ctx, nodeId);
    const claimRows = claimIds.length ? await ctx.db.db.select().from(claims).where(inArray(claims.id, claimIds)).limit(12) : [];
    const chunkIds = Array.from(new Set(claimRows.flatMap((claim) => claim.sourceChunkIds ?? [])));
    const chunkRows = chunkIds.length ? await ctx.db.db.select({ id: chunks.id, chunkType: chunks.chunkType, text: chunks.text, pageStart: chunks.pageStart, pageEnd: chunks.pageEnd, sourceVersionId: chunks.sourceVersionId }).from(chunks).where(inArray(chunks.id, chunkIds)).limit(10) : [];
    const chunkEvidence = await mapChunkRefsWithSourceTitles(ctx, chunkRows);
    const acceptedClaims = claimRows.filter((claim) => isLearnerSafeClaim(claim));
    const definitionClaims = acceptedClaims.filter((claim) => /definition|define|means|is a|refers to/i.test(claim.claimText)).slice(0, 4);
    const formulaClaims = acceptedClaims.filter((claim) => /formula|equation|=|\\frac|\\Delta|propto|\^/.test(claim.claimText)).slice(0, 6);
    const exampleClaims = acceptedClaims.filter((claim) => /example|instance|case|when|for example/i.test(claim.claimText)).slice(0, 4);
    const misconceptionClaims = acceptedClaims.filter((claim) => /misconception|mistake|confus|not the same|incorrect/i.test(claim.claimText)).slice(0, 4);

    const learnerEvidence = [
      ...toChunkEvidenceRefs(chunkEvidence, "learner"),
      ...toLearnerClaimEvidenceRefs(acceptedClaims),
    ];

    const conceptBlocks: ReferenceBlock[] = [];
    if (conceptWikiPage?.markdown.trim()) {
      conceptBlocks.push({
        id: "wiki",
        kind: "markdown",
        title: "Concept Wiki",
        content: conceptWikiPage.markdown,
        evidenceRefs: learnerEvidence,
      });
    } else {
      conceptBlocks.push({ id: "overview", kind: "summary", title: "Overview", content: concept.description ?? `${concept.canonicalName} reference.`, evidenceRefs: learnerEvidence });
    }
    if (definitionClaims.length > 0) {
      conceptBlocks.push({
        id: "definitions",
        kind: "definition",
        title: "Definitions",
        content: definitionClaims.map((claim) => claim.claimText).join("\n\n"),
        evidenceRefs: toLearnerClaimEvidenceRefs(definitionClaims),
      });
    }
    if (formulaClaims.length > 0) {
      conceptBlocks.push({
        id: "formulas",
        kind: "formula_table",
        title: "Formulas and notation",
        content: formulaClaims.map((claim) => ({ statement: claim.claimText })),
        evidenceRefs: toLearnerClaimEvidenceRefs(formulaClaims),
      });
    }
    if (exampleClaims.length > 0) {
      conceptBlocks.push({
        id: "examples",
        kind: "step_list",
        title: "Examples",
        content: exampleClaims.map((claim) => ({ title: "Source example", body: claim.claimText })),
        evidenceRefs: toLearnerClaimEvidenceRefs(exampleClaims),
      });
    }
    if (misconceptionClaims.length > 0) {
      conceptBlocks.push({
        id: "misconceptions",
        kind: "comparison_table",
        title: "Misconceptions",
        content: misconceptionClaims.map((claim) => ({ issue: claim.claimText })),
        evidenceRefs: toLearnerClaimEvidenceRefs(misconceptionClaims),
      });
    }
    conceptBlocks.push({
      id: "source_claims",
      kind: "step_list",
      title: "Source-backed notes",
      content: acceptedClaims.map((claim) => ({ title: "Source note", body: claim.claimText })),
      evidenceRefs: toLearnerClaimEvidenceRefs(acceptedClaims),
    });
    return withInteractiveBlocks(
      ctx,
      base({
        nodeRef: semanticRef("concept", concept.id, concept.canonicalName),
        title: concept.canonicalName,
        surfaceType: "concept",
        summary: concept.description,
        status: wikiPageReadinessStatus(conceptWikiPage, acceptedClaims.length),
        blocks: conceptBlocks,
        sourceRefs: chunkEvidence.map((item) => ({ refType: "chunk", refId: item.id })),
        provenanceRefs: [
          ...chunkEvidence.map((item) => ({ refType: "chunk" as const, refId: item.id, role: "derived_from" as const })),
        ],
        primaryActions: ["ask_tutor", "quiz", "regenerate", "open_provenance"],
        quality: { confidence: conceptWikiPage?.qualityScore ?? concept.confidence ?? null, sourceBacked: chunkEvidence.length > 0 || (conceptWikiPage?.sourceChunkIds ?? []).length > 0, needsReview: acceptedClaims.length === 0 || claimRows.some((claim) => claim.status === "candidate") },
        generation: generationFromRecord(conceptWikiPage?.structuredJson),
      }),
      {
        evidenceRefs: learnerEvidence,
        structuredJson: conceptWikiPage?.structuredJson ?? null,
        ...(options.userId ? { userId: options.userId } : {}),
      },
    );
  }

  if (openTarget.kind === "wiki_page" && openTarget.entity) {
    const wikiPage = openTarget.entity;
    const chunkRefs = (wikiPage.sourceChunkIds ?? []).map((id) => ({ refType: "chunk" as const, refId: id }));
    const claimRefs = (wikiPage.sourceClaimIds ?? []).map((id) => ({ refType: "claim" as const, refId: id }));
    const sourceRefs = [...chunkRefs, ...claimRefs];
    const evidence = await buildEvidenceFromClaimAndChunkIds(
      ctx,
      wikiPage.sourceClaimIds ?? [],
      wikiPage.sourceChunkIds ?? [],
    );
    const learnerEvidence = evidence.learnerRefs;
    return withInteractiveBlocks(
      ctx,
      base({
        nodeRef: semanticRef("wiki_page", wikiPage.id, wikiPage.title),
        title: wikiPage.title,
        surfaceType: "wiki_page",
        status: wikiPageReadinessStatus(wikiPage),
        blocks: [{ id: "markdown", kind: "markdown", title: "Reference", content: wikiPage.markdown, evidenceRefs: learnerEvidence }],
        sourceRefs: chunkRefs,
        provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" })),
        primaryActions: ["ask_tutor", "regenerate", "open_provenance"],
        quality: {
          confidence: wikiPage.qualityScore ?? null,
          sourceBacked: learnerEvidence.length > 0,
          needsReview: wikiPage.status !== "published",
        },
        generation: generationFromRecord(wikiPage.structuredJson),
      }),
      {
        evidenceRefs: learnerEvidence,
        structuredJson: wikiPage.structuredJson ?? null,
        ...(options.userId ? { userId: options.userId } : {}),
      },
    );
  }

  const [curriculum] = await ctx.db.db.select().from(curricula).where(and(eq(curricula.id, nodeId), eq(curricula.notebookId, notebookId))).limit(1);
  if (curriculum) {
    const moduleRows = await ctx.db.db
      .select({ id: curriculumModules.id, title: curriculumModules.title, summary: curriculumModules.summary, status: curriculumModules.status, orderIndex: curriculumModules.orderIndex })
      .from(curriculumModules)
      .where(and(eq(curriculumModules.curriculumId, curriculum.id), eq(curriculumModules.notebookId, notebookId)))
      .limit(12);
    const orderedModules = [...moduleRows].sort((a, b) => a.orderIndex - b.orderIndex);
    const curriculumSummary = typeof curriculum.scopeJson?.summary === "string"
      ? curriculum.scopeJson.summary
      : readablePlanningSummary(null, curriculum.title) ?? `${curriculum.title} study path.`;
    const regeneratedMarkdown = jsonString(curriculum.scopeJson, "regeneratedMarkdown");
    const curriculumPageReadiness = await loadWikiPageReadinessByKey(ctx, notebookId, `curriculum:${curriculum.id}`);
    return toLearnerFacingReferenceSurface(base({
      nodeRef: semanticRef("curriculum", curriculum.id, curriculum.title),
      title: curriculum.title,
      surfaceType: "curriculum",
      summary: curriculumSummary,
      status: curriculumPageReadiness,
      blocks: [
        { id: "overview", kind: "markdown", title: "Overview", content: regeneratedMarkdown ?? markdownPage(curriculum.title, curriculumSummary), evidenceRefs: [] },
        {
          id: "modules",
          kind: "step_list",
          title: "Modules",
          content: orderedModules.map((row) => ({
            title: row.title,
            body: readablePlanningSummary(row.summary, row.title) ?? `${row.title} study module.`,
            status: row.status,
          })),
          evidenceRefs: [],
        },
      ],
      sourceRefs: curriculum.sourceIds.map((id) => ({ refType: "source", refId: id })),
      provenanceRefs: curriculum.sourceIds.map((id) => ({ refType: "source", refId: id, role: "derived_from" })),
      primaryActions: ["ask_tutor", "review", "regenerate"],
      quality: { confidence: curriculum.confidence ?? null, sourceBacked: curriculum.sourceIds.length > 0, needsReview: isWeakPlanningLabel(curriculum.title) },
      generation: generationFromRecord(curriculum.scopeJson),
    }));
  }

  const [module] = await ctx.db.db.select().from(curriculumModules).where(and(eq(curriculumModules.id, nodeId), eq(curriculumModules.notebookId, notebookId))).limit(1);
  if (module) {
    const moduleSummary = readablePlanningSummary(module.summary, module.title);
    const regeneratedMarkdown = jsonString(module.coverageRequirementsJson, "regeneratedMarkdown");
    const [objectiveList] = await ctx.db.db
      .select({ id: objectiveLists.id, objectiveIdsOrdered: objectiveLists.objectiveIdsOrdered, currentObjectiveId: objectiveLists.currentObjectiveId })
      .from(objectiveLists)
      .where(and(eq(objectiveLists.notebookId, notebookId), eq(objectiveLists.moduleId, module.id)))
      .limit(1);
    const objectiveRows = objectiveList?.objectiveIdsOrdered?.length
      ? await ctx.db.db
          .select({
            id: objectives.id,
            title: objectives.title,
            status: objectives.status,
            successCriteriaJson: objectives.successCriteriaJson,
          })
          .from(objectives)
          .where(and(eq(objectives.notebookId, notebookId), inArray(objectives.id, objectiveList.objectiveIdsOrdered)))
      : [];
    const objectiveOrder = new Map((objectiveList?.objectiveIdsOrdered ?? []).map((id, index) => [id, index] as const));
    const orderedObjectives = [...objectiveRows].sort((a, b) => (objectiveOrder.get(a.id) ?? 0) - (objectiveOrder.get(b.id) ?? 0));
    const sourceRefs = Array.isArray(module.sourceRefsJson)
      ? module.sourceRefsJson
          .map((ref): { refType: "source" | "chunk"; refId: string } | null => {
            if (typeof ref !== "object" || ref === null) return null;
            const record = ref as Record<string, unknown>;
            const refId = typeof record.refId === "string" ? record.refId : typeof record.id === "string" ? record.id : null;
            const refType = record.refType === "chunk" ? "chunk" : "source";
            return refId ? { refType, refId } : null;
          })
          .filter((ref): ref is { refType: "source" | "chunk"; refId: string } => Boolean(ref))
      : [];
    const modulePageReadiness = await loadWikiPageReadinessByKey(ctx, notebookId, `module:${module.id}`);
    return toLearnerFacingReferenceSurface(base({
      nodeRef: semanticRef("curriculum_module", module.id, module.title),
      title: module.title,
      surfaceType: "module",
      summary: moduleSummary,
      status: modulePageReadiness,
      blocks: [
        { id: "overview", kind: "markdown", title: "Overview", content: regeneratedMarkdown ?? markdownPage(module.title, moduleSummary ?? `${module.title} module reference.`), evidenceRefs: [] },
        {
          id: "objectives",
          kind: "step_list",
          title: "Objective list",
          content: orderedObjectives.map((objective) => ({
            title: objective.title,
            body: objectiveSuccessSummary(objective.successCriteriaJson),
            status: objective.id === objectiveList?.currentObjectiveId ? "current" : objective.status,
          })),
          evidenceRefs: [],
        },
      ],
      scopeRefs: [semanticRef("curriculum", module.curriculumId)],
      sourceRefs,
      provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" })),
      primaryActions: ["ask_tutor", "review", "regenerate"],
      quality: { confidence: null, sourceBacked: sourceRefs.length > 0, needsReview: isWeakPlanningLabel(module.title) },
      generation: generationFromRecord(module.coverageRequirementsJson),
    }));
  }

  const [objectiveList] = await ctx.db.db.select().from(objectiveLists).where(and(eq(objectiveLists.id, nodeId), eq(objectiveLists.notebookId, notebookId))).limit(1);
  if (objectiveList) {
    const objectiveRows = objectiveList.objectiveIdsOrdered.length
      ? await ctx.db.db
          .select({
            id: objectives.id,
            title: objectives.title,
            status: objectives.status,
            successCriteriaJson: objectives.successCriteriaJson,
            sourceRefsJson: objectives.sourceRefsJson,
          })
          .from(objectives)
          .where(and(eq(objectives.notebookId, notebookId), inArray(objectives.id, objectiveList.objectiveIdsOrdered)))
      : [];
    const objectiveOrder = new Map(objectiveList.objectiveIdsOrdered.map((id, index) => [id, index] as const));
    const orderedObjectives = [...objectiveRows].sort((a, b) => (objectiveOrder.get(a.id) ?? 0) - (objectiveOrder.get(b.id) ?? 0));
    const sourceRefs = orderedObjectives.flatMap((objective) => parseSourceRefs(objective.sourceRefsJson));
    const regeneratedMarkdown = jsonString(objectiveList.coverageSnapshotJson, "regeneratedMarkdown");
    return toLearnerFacingReferenceSurface(base({
      nodeRef: semanticRef("objective_list", objectiveList.id, objectiveList.title),
      title: objectiveList.title,
      surfaceType: "objective_list",
      summary: null,
      status: objectiveList.status,
      blocks: [
        { id: "overview", kind: "markdown", title: "Overview", content: regeneratedMarkdown ?? markdownPage(objectiveList.title, "Ordered objectives for this module."), evidenceRefs: [] },
        {
          id: "objectives",
          kind: "step_list",
          title: "Objectives",
          content: orderedObjectives.map((objective) => ({
            title: objective.title,
            body: objectiveSuccessSummary(objective.successCriteriaJson),
            status: objective.id === objectiveList.currentObjectiveId ? "current" : objective.status,
          })),
          evidenceRefs: [],
        },
      ],
      scopeRefs: [
        semanticRef("curriculum", objectiveList.curriculumId),
        semanticRef("curriculum_module", objectiveList.moduleId),
      ],
      sourceRefs,
      provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" })),
      primaryActions: ["ask_tutor", "review", "regenerate"],
      quality: { confidence: null, sourceBacked: sourceRefs.length > 0, needsReview: isWeakPlanningLabel(objectiveList.title) },
      generation: generationFromRecord(objectiveList.coverageSnapshotJson),
    }));
  }

  const [objective] = await ctx.db.db.select().from(objectives).where(and(eq(objectives.id, nodeId), eq(objectives.notebookId, notebookId))).limit(1);
  if (objective) {
    const conceptIds = [...new Set([...(objective.prerequisiteConceptIds ?? []), ...(objective.targetConceptIds ?? [])])];
    const conceptRows = conceptIds.length
      ? await ctx.db.db
          .select({
            id: concepts.id,
            title: concepts.canonicalName,
          })
          .from(concepts)
          .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, conceptIds)))
      : [];
    const conceptTitleById = new Map(conceptRows.map((row) => [row.id, row.title]));
    const conceptRefs = conceptIds.map((id) => semanticRef("concept", id, conceptTitleById.get(id)));
    const sourceRefs = Array.isArray(objective.sourceRefsJson)
      ? objective.sourceRefsJson
          .map((ref): { refType: "source" | "chunk"; refId: string } | null => {
            if (typeof ref !== "object" || ref === null) return null;
            const record = ref as Record<string, unknown>;
            const refId = typeof record.refId === "string" ? record.refId : typeof record.id === "string" ? record.id : null;
            const refType = record.refType === "chunk" ? "chunk" : "source";
            return refId ? { refType, refId } : null;
          })
          .filter((ref): ref is { refType: "source" | "chunk"; refId: string } => Boolean(ref))
      : [];
    const regeneratedMarkdown = jsonString(objective.successCriteriaJson, "regeneratedMarkdown");
    const linkedArtifactRows = await ctx.db.db
      .select({ id: artifacts.id, title: artifacts.title, artifactType: artifacts.artifactType, status: artifacts.status, sourceNodeRefsJson: artifacts.sourceNodeRefsJson })
      .from(artifacts)
      .where(eq(artifacts.notebookId, notebookId))
      .limit(100);
    const linkedArtifacts = linkedArtifactRows
      .filter((artifact) => !["teaching_arc", "study_plan", "session_plan"].includes(artifact.artifactType))
      .filter((artifact) => Array.isArray(artifact.sourceNodeRefsJson) && artifact.sourceNodeRefsJson.some((ref) => {
        if (typeof ref !== "object" || ref === null) return false;
        const record = ref as Record<string, unknown>;
        return record.refType === "objective" && record.refId === objective.id;
      }))
      .map((artifact) => ({ id: artifact.id, title: artifact.title, type: artifact.artifactType, status: artifact.status }));
    return toLearnerFacingReferenceSurface(base({
      nodeRef: semanticRef("objective", objective.id, objective.title),
      title: objective.title,
      surfaceType: "objective",
      summary: null,
      status: objective.status,
      blocks: [
        ...(regeneratedMarkdown ? [{ id: "overview", kind: "markdown" as const, title: "Overview", content: regeneratedMarkdown, evidenceRefs: [] }] : []),
        { id: "success", kind: "metadata", title: "Success criteria", content: objective.successCriteriaJson ?? {}, evidenceRefs: [] },
        {
          id: "concepts",
          kind: "metadata",
          title: "Concepts",
          content: {
            prerequisites: (objective.prerequisiteConceptIds ?? []).map((id) => ({
              id,
              title: conceptTitleById.get(id) ?? "Concept needs review",
            })),
            targets: (objective.targetConceptIds ?? []).map((id) => ({
              id,
              title: conceptTitleById.get(id) ?? "Concept needs review",
            })),
          },
          evidenceRefs: [],
        },
        { id: "linked_artifacts", kind: "metadata", title: "Linked artifacts", content: linkedArtifacts, evidenceRefs: [] },
      ],
      scopeRefs: [semanticRef("curriculum", objective.curriculumId), ...conceptRefs],
      sourceRefs,
      provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" })),
      primaryActions: ["ask_tutor", "quiz", "review", "regenerate"],
      quality: { confidence: objective.readinessScore ?? null, sourceBacked: sourceRefs.length > 0, needsReview: isWeakPlanningLabel(objective.title) },
      generation: generationFromRecord(objective.successCriteriaJson),
    }));
  }

  const [tutorSession] = await ctx.db.db.select().from(tutorSessions).where(and(eq(tutorSessions.id, nodeId), eq(tutorSessions.notebookId, notebookId))).limit(1);
  if (tutorSession) {
    const turnRows = await ctx.db.db
      .select({
        id: tutorTurns.id,
        turnIndex: tutorTurns.turnIndex,
      })
      .from(tutorTurns)
      .where(eq(tutorTurns.sessionId, tutorSession.id))
      .orderBy(desc(tutorTurns.turnIndex))
      .limit(8);
    const orderedTurns = [...turnRows].sort((a, b) => a.turnIndex - b.turnIndex);
    const runtimeGoal = sessionGoalFromRuntimeContext(tutorSession.runtimeContextJson);
    const sessionRefs = parseNodeRefs(tutorSession.selectedNodeRefsJson);
    const sourceRefs = sessionRefs.filter((ref) => ref.refType === "source" || ref.refType === "chunk");
    return toLearnerFacingReferenceSurface(
      base({
        nodeRef: semanticRef("session", tutorSession.id, "Tutor session"),
        title: "Tutor session",
        surfaceType: "session",
        summary: runtimeGoal ?? (orderedTurns.length > 0 ? `${orderedTurns.length} recorded turns.` : null),
        status: tutorSession.status,
        blocks: [
          {
            id: "session_overview",
            kind: "metadata",
            title: "Session overview",
            content: {
              mode: tutorSession.mode,
              status: tutorSession.status,
              turnCount: orderedTurns.length,
              startedAt: tutorSession.startedAt,
              endedAt: tutorSession.endedAt,
            },
            evidenceRefs: [],
          },
        ],
        scopeRefs: sessionRefs,
        sourceRefs,
        provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" as const })),
        primaryActions: ["ask_tutor", "review", "regenerate"],
        quality: { confidence: null, sourceBacked: sourceRefs.length > 0, needsReview: tutorSession.status !== "completed" && orderedTurns.length === 0 },
      }),
    );
  }

  const [sessionPlan] = await ctx.db.db.select().from(sessionPlans).where(and(eq(sessionPlans.id, nodeId), eq(sessionPlans.notebookId, notebookId))).limit(1);
  if (sessionPlan) {
    const regeneratedMarkdown = jsonString(sessionPlan.recommendationReasonJson, "regeneratedMarkdown");
    const objectiveRefs = (sessionPlan.plannedObjectiveIds ?? []).map((id) => semanticRef("objective", id));
    const sessionObjectiveRows = sessionPlan.plannedObjectiveIds.length
      ? await ctx.db.db
          .select({
            id: objectives.id,
            title: objectives.title,
            status: objectives.status,
            successCriteriaJson: objectives.successCriteriaJson,
          })
          .from(objectives)
          .where(and(eq(objectives.notebookId, notebookId), inArray(objectives.id, sessionPlan.plannedObjectiveIds)))
      : [];
    const objectiveOrder = new Map(sessionPlan.plannedObjectiveIds.map((id, index) => [id, index] as const));
    const sessionObjectives = [...sessionObjectiveRows].sort((a, b) => (objectiveOrder.get(a.id) ?? 0) - (objectiveOrder.get(b.id) ?? 0));
    return toLearnerFacingReferenceSurface(base({
      nodeRef: semanticRef("session_plan", sessionPlan.id, sessionPlan.title),
      title: sessionPlan.title,
      surfaceType: "session",
      summary: sessionPlan.sessionGoal,
      status: sessionPlan.status,
      blocks: [
        regeneratedMarkdown
          ? { id: "overview", kind: "markdown", title: "Overview", content: regeneratedMarkdown, evidenceRefs: [] }
          : { id: "goal", kind: "summary", title: "Session goal", content: sessionPlan.sessionGoal ?? `${sessionPlan.title} session reference.`, evidenceRefs: [] },
        { id: "session_objectives", kind: "step_list", title: "Session objectives", content: sessionObjectives.map((objective) => ({
          title: objective.title,
          status: objective.status,
          successCriteria: objective.successCriteriaJson ?? {},
        })), evidenceRefs: [] },
        { id: "opener", kind: "metadata", title: "Opener", content: sessionPlan.openerJson ?? {}, evidenceRefs: [] },
        { id: "exit", kind: "metadata", title: "Exit criteria", content: sessionPlan.exitCriteriaJson ?? {}, evidenceRefs: [] },
      ],
      scopeRefs: [
        semanticRef("curriculum", sessionPlan.curriculumId),
        semanticRef("curriculum_module", sessionPlan.moduleId),
        ...objectiveRefs,
      ],
      primaryActions: ["ask_tutor", "review", "regenerate"],
      quality: { confidence: null, sourceBacked: false, needsReview: isWeakPlanningLabel(sessionPlan.title) },
      generation: generationFromRecord(sessionPlan.recommendationReasonJson),
    }));
  }

  if (openTarget.kind === "artifact" && openTarget.entity) {
    const artifact = openTarget.entity;
    const view = buildLearningArtifactView({
      id: artifact.id,
      notebookId: artifact.notebookId,
      artifactType: artifact.artifactType,
      title: artifact.title,
      status: artifact.status,
      payloadJson: artifact.payloadJson ?? {},
      sourceNodeRefsJson: artifact.sourceNodeRefsJson ?? [],
      sourceClaimIds: artifact.sourceClaimIds ?? [],
      sourceChunkIds: artifact.sourceChunkIds ?? [],
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    });
    const sourceRefs = view.sourceRefs;
    const blocks = view.sections.map(sectionToReferenceBlock);
    return withInteractiveBlocks(
      ctx,
      base({
        nodeRef: semanticRef("artifact", artifact.id, view.title),
        title: view.title,
        surfaceType: "artifact",
        summary: `${view.purpose} ${view.studentAction}`,
        status: learnerFacingSurfaceStatus({
          surfaceType: "artifact",
          status: artifact.status,
          quality: {
            confidence: view.confidence,
            sourceBacked: view.quality.sourceBacked,
            needsReview: view.quality.needsReview,
          },
        }),
        blocks,
        sourceRefs,
        provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" })),
        primaryActions: artifact.artifactType === "quiz" ? ["ask_tutor", "quiz", "regenerate", "open_provenance"] : ["ask_tutor", "review", "regenerate", "open_provenance"],
        quality: { confidence: view.confidence, sourceBacked: view.quality.sourceBacked, needsReview: view.quality.needsReview },
        generation: generationFromRecord(artifact.payloadJson),
      }),
      {
        artifact: {
          id: artifact.id,
          notebookId: artifact.notebookId,
          artifactType: artifact.artifactType,
          title: artifact.title,
          status: artifact.status,
          payloadJson: artifact.payloadJson ?? {},
          sourceNodeRefsJson: artifact.sourceNodeRefsJson,
          sourceClaimIds: artifact.sourceClaimIds,
          sourceChunkIds: artifact.sourceChunkIds,
        },
        ...(options.userId ? { userId: options.userId } : {}),
      },
    );
  }

  if (openTarget.kind === "source" && openTarget.entity) {
    const source = openTarget.entity;
    const sourceNodeRef = semanticRef("source", source.id, source.title);
    const chunkEvidence = await loadSourceChunkEvidence(ctx, source.id);
    const sourceReaderBlockId = `interactive_source_reader_${sourceNodeRef.refId}`;
    const sourceReaderState = options.userId
      ? await loadInteractiveBlockState(ctx, notebookId, sourceReaderBlockId)
      : {};
    const sourceReaderBlock = buildSourceReaderBlock(
      {
        notebookId,
        surfaceType: "source",
        nodeRef: sourceNodeRef,
        title: source.title,
        sourceRefs: [sourceNodeRef],
        evidenceRefs: chunkEvidence,
      },
      chunkEvidence,
      sourceReaderState,
    );
    return toLearnerFacingReferenceSurface(
      base({
        nodeRef: sourceNodeRef,
        title: source.title,
        surfaceType: "source",
        status: source.status,
        blocks: [
          {
            id: "document",
            kind: "callout",
            title: "Original document",
            content: {
              body: "Open the original source document as the primary reference. Extracted text and Evidence are available when the original cannot be inspected directly.",
              sourceType: source.sourceType,
              status: source.status,
            },
            evidenceRefs: [],
          },
        ],
        interactiveBlocks: [sourceReaderBlock],
        primaryActions: ["open_source", "ask_tutor"],
        quality: { confidence: null, sourceBacked: true, needsReview: source.status !== "tutoring_ready" },
      }),
    );
  }

  return toLearnerFacingReferenceSurface(
    base({
      nodeRef: { refType: "whiteboard_node", refId: nodeId },
      title: "Reference needs review",
      surfaceType: "fallback",
      summary: "This node does not have a dedicated reference surface yet.",
      blocks: [{ id: "fallback", kind: "summary", title: "Reference", content: "Open the tutor chat for teaching, or enable Dev mode to inspect raw graph details.", evidenceRefs: [] }],
      quality: { confidence: null, sourceBacked: false, needsReview: true },
    }),
  );
}

export async function buildNodeEvidence(
  ctx: AppContext,
  notebookId: string,
  nodeId: string,
  options: { devMode?: boolean } = {},
): Promise<EvidenceReadModel> {
  const target = await resolveNodeOpenTarget(ctx, notebookId, nodeId);
  const devMode = options.devMode === true;

  if (target.kind === "concept" && target.entity) {
    const concept = target.entity;
    const claimIds = await loadConceptClaimIds(ctx, concept.id);
    const evidence = await buildEvidenceFromClaimAndChunkIds(ctx, claimIds, []);
    return {
      nodeId: concept.id,
      entityType: "concept",
      entity: {
        id: concept.id,
        title: concept.canonicalName,
        conceptType: concept.conceptType,
        description: concept.description,
        confidence: concept.confidence,
      },
      ...evidenceForMode(evidence, devMode),
    };
  }

  if (target.kind === "wiki_page" && target.entity) {
    const wikiPage = target.entity;
    const evidence = await buildEvidenceFromClaimAndChunkIds(
      ctx,
      wikiPage.sourceClaimIds ?? [],
      wikiPage.sourceChunkIds ?? [],
    );
    return {
      nodeId: wikiPage.id,
      entityType: "wiki_page",
      entity: { id: wikiPage.id, title: wikiPage.title, status: wikiPage.status, markdown: wikiPage.markdown },
      ...evidenceForMode(evidence, devMode),
    };
  }

  if (target.kind === "artifact" && target.entity) {
    const artifact = target.entity;
    const evidence = await buildEvidenceFromClaimAndChunkIds(
      ctx,
      artifact.sourceClaimIds ?? [],
      artifact.sourceChunkIds ?? [],
    );
    return {
      nodeId: artifact.id,
      entityType: "artifact",
      entity: { id: artifact.id, title: artifact.title, artifactType: artifact.artifactType, status: artifact.status },
      ...evidenceForMode(evidence, devMode),
    };
  }

  if (target.kind === "source" && target.entity) {
    const source = target.entity;
    const learnerRefs = await loadSourceChunkEvidence(ctx, source.id);
    return {
      nodeId: source.id,
      entityType: "source",
      entity: { id: source.id, title: source.title, status: source.status, sourceType: source.sourceType },
      learnerRefs: sanitizeLearnerEvidenceRefs(learnerRefs, devMode),
      developerRefs: [],
    };
  }

  return {
    nodeId,
    entityType: null,
    entity: null,
    learnerRefs: [],
    developerRefs: [],
  };
}

function evidenceForMode(
  evidence: Pick<EvidenceReadModel, "learnerRefs" | "developerRefs">,
  devMode: boolean,
): Pick<EvidenceReadModel, "learnerRefs" | "developerRefs"> {
  return {
    learnerRefs: sanitizeLearnerEvidenceRefs(evidence.learnerRefs, devMode),
    developerRefs: devMode ? evidence.developerRefs : [],
  };
}

function semanticRef(refType: NodeRef["refType"], refId: string, title?: string | null): NodeRef {
  const trimmedTitle = title?.trim();
  return {
    refType,
    refId,
    ...(trimmedTitle ? { handle: trimmedTitle, title: trimmedTitle, label: trimmedTitle } : {}),
  };
}

export function readablePlanningSummary(summary: string | null | undefined, title: string): string | null {
  const trimmed = summary?.trim();
  if (!trimmed) return null;
  if (/^bootstrap module generated from\b/i.test(trimmed)) return `Review the source-grounded scope for ${title}.`;
  return trimmed;
}

function isWeakPlanningLabel(title: string): boolean {
  return (
    /^(objective|module|session)\s+\d+\b/i.test(title) ||
    /\b(current teaching session|active objective list|living study plan)\b/i.test(title) ||
    /^[a-z]+_[a-z0-9_]+$/i.test(title)
  );
}

function sectionToReferenceBlock(section: ReturnType<typeof buildLearningArtifactView>["sections"][number]): ReferenceBlock {
  if (section.kind === "markdown") {
    return { id: section.id, kind: "markdown", title: section.title, content: String(section.content ?? section.emptyMessage ?? ""), evidenceRefs: [] };
  }
  if (section.kind === "questions") {
    return { id: section.id, kind: "question_list", title: section.title, content: section.content, evidenceRefs: [] };
  }
  if (section.kind === "flashcards") {
    return { id: section.id, kind: "flashcard_list", title: section.title, content: section.content, evidenceRefs: [] };
  }
  if (section.kind === "formulae") {
    return { id: section.id, kind: "formula_table", title: section.title, content: section.content, evidenceRefs: [] };
  }
  if (section.kind === "comparison" || section.kind === "table") {
    return { id: section.id, kind: "comparison_table", title: section.title, content: section.content, evidenceRefs: [] };
  }
  if (section.kind === "steps" || section.kind === "timeline" || section.kind === "key_points") {
    return { id: section.id, kind: "step_list", title: section.title, content: section.content, evidenceRefs: [] };
  }
  if (section.kind === "empty") {
    return { id: section.id, kind: "summary", title: section.title, content: section.emptyMessage ?? "No content recorded yet.", evidenceRefs: [] };
  }
  return { id: section.id, kind: "summary", title: section.title, content: section.content, evidenceRefs: [] };
}

function sessionGoalFromRuntimeContext(runtimeContextJson: unknown): string | null {
  if (!isJsonRecord(runtimeContextJson)) return null;
  return typeof runtimeContextJson.sessionGoal === "string"
    ? runtimeContextJson.sessionGoal
    : typeof runtimeContextJson.currentSessionGoal === "string"
      ? runtimeContextJson.currentSessionGoal
      : null;
}

function markdownPage(title: string, summary: string): string {
  return [`# ${title}`, "", "## Overview", summary].join("\n");
}

function objectiveSuccessSummary(value: unknown): string {
  if (!isJsonRecord(value)) return "Study this objective, then check understanding in tutor chat.";
  const statements = Object.entries(value)
    .flatMap(([key, entry]) => {
      if (typeof entry === "string") return [`${labelFromKey(key)}: ${entry}`];
      if (Array.isArray(entry)) return entry.filter((item): item is string => typeof item === "string");
      return [];
    })
    .slice(0, 3);
  return statements.length ? statements.join(" ") : "Study this objective, then check understanding in tutor chat.";
}

function labelFromKey(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function parseNodeRefs(value: unknown): NodeRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isJsonRecord(item)) return [];
    const refType = typeof item.refType === "string" ? item.refType : null;
    const refId = typeof item.refId === "string" ? item.refId : null;
    return refType && refId ? [{ refType: refType as NodeRef["refType"], refId }] : [];
  });
}

function parseSourceRefs(value: unknown): Array<{ refType: "source" | "chunk"; refId: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isJsonRecord(item)) return [];
    const refId = typeof item.refId === "string" ? item.refId : typeof item.id === "string" ? item.id : null;
    if (!refId) return [];
    return [{ refType: item.refType === "chunk" ? "chunk" : "source", refId }];
  });
}

function jsonString(value: unknown, key: string): string | null {
  if (!isJsonRecord(value)) return null;
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : null;
}

async function loadWikiPageReadinessByKey(
  ctx: AppContext,
  notebookId: string,
  pageKey: string,
  fallback: PageReadiness = "still_improving",
): Promise<PageReadiness> {
  const [page] = await ctx.db.db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.notebookId, notebookId), eq(wikiPages.pageKey, pageKey)))
    .limit(1);
  if (!page) return fallback;
  return resolvePageReadinessFromWikiPage({
    status: page.status,
    qualityScore: page.qualityScore,
    sourceClaimIds: page.sourceClaimIds,
    structuredJson: page.structuredJson,
  });
}

function wikiPageReadinessStatus(
  page:
    | {
        status: string;
        qualityScore?: number | null;
        sourceClaimIds?: string[];
        structuredJson?: Record<string, unknown> | null;
      }
    | null
    | undefined,
  evidenceCount = 0,
): PageReadiness {
  if (!page) {
    return evidenceCount > 0 ? "still_improving" : "needs_more_source_support";
  }
  return resolvePageReadinessFromWikiPage({
    status: page.status,
    qualityScore: page.qualityScore ?? null,
    sourceClaimIds: page.sourceClaimIds ?? [],
    structuredJson: page.structuredJson ?? {},
  });
}

function generationFromRecord(value: unknown): ReferenceSurface["generation"] {
  if (!isJsonRecord(value)) return null;
  const hasGenerationMetadata =
    value.generationMode !== undefined ||
    value.regeneratedMode !== undefined ||
    value.regeneratedAt !== undefined ||
    value.lastPolishedAt !== undefined ||
    typeof value.regeneratedMarkdown === "string";
  if (!hasGenerationMetadata) return null;
  const generationMode = resolveGenerationModeFromWikiRecord(value);
  const mode = generationMode === "heuristic" ? "heuristic" : "ai";
  const labelByMode = {
    heuristic: "Heuristic",
    llm_polished: "LLM polished",
    llm_repair: "LLM repair",
    tutor_touch: "Tutor touch",
    rolling_module_build: "Rolling module build",
    initial_build: "Initial build",
  } as const;
  return {
    mode,
    label: labelByMode[generationMode],
    generatedAt:
      typeof value.regeneratedAt === "string"
        ? value.regeneratedAt
        : typeof value.lastPolishedAt === "string"
          ? value.lastPolishedAt
          : null,
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
