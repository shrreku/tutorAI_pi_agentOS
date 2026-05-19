import { and, desc, eq, inArray } from "drizzle-orm";
import {
  artifacts,
  concepts,
  claimConceptLinks,
  claims,
  curricula,
  curriculumModules,
  objectiveLists,
  chunks,
  objectives,
  sessionPlans,
  tutorSessions,
  tutorTurns,
  sourceVersions,
  sources,
  wikiPages,
} from "@studyagent/db";
import type { AppContext } from "./context.js";
import { buildLearningArtifactView } from "./artifact-view.js";
import type { EvidenceReadModel, EvidenceRef, ReferenceBlock, ReferenceSurface, NodeRef } from "@studyagent/schemas";
import { learnerFacingSurfaceStatus } from "@studyagent/schemas";

export function toLearnerFacingReferenceSurface(surface: ReferenceSurface): ReferenceSurface {
  return {
    ...surface,
    quality: {
      ...surface.quality,
      confidence: null,
    },
    blocks: surface.blocks.map((block) => ({
      ...block,
      evidenceRefs: sanitizeLearnerEvidenceRefs(block.evidenceRefs ?? [], false),
    })),
  };
}

export async function buildReferenceSurface(ctx: AppContext, notebookId: string, nodeId: string): Promise<ReferenceSurface> {
  const base = (overrides: Partial<ReferenceSurface> & Pick<ReferenceSurface, "nodeRef" | "title" | "surfaceType">): ReferenceSurface => ({
    id: `surface_${nodeId}`,
    notebookId,
    summary: null,
    status: null,
    blocks: [],
    scopeRefs: [],
    sourceRefs: [],
    provenanceRefs: [],
    coverageRefs: [],
    primaryActions: ["ask_tutor"],
    quality: { confidence: null, sourceBacked: false, needsReview: false },
    generation: null,
    ...overrides,
  });

  const [concept] = await ctx.db.db.select().from(concepts).where(and(eq(concepts.id, nodeId), eq(concepts.notebookId, notebookId))).limit(1);
  if (concept) {
    const [conceptWikiPage] = await ctx.db.db
      .select()
      .from(wikiPages)
      .where(and(eq(wikiPages.notebookId, notebookId), eq(wikiPages.pageType, "concept"), eq(wikiPages.pageKey, `concept:${concept.id}`)))
      .limit(1);
    const links = await ctx.db.db.select({ claimId: claimConceptLinks.claimId }).from(claimConceptLinks).where(eq(claimConceptLinks.conceptId, nodeId));
    const claimIds = links.map((link) => link.claimId);
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
    return toLearnerFacingReferenceSurface(base({
      nodeRef: { refType: "concept", refId: concept.id },
      title: concept.canonicalName,
      surfaceType: "concept",
      summary: concept.description,
      status: "active",
      blocks: conceptBlocks,
      sourceRefs: chunkEvidence.map((item) => ({ refType: "chunk", refId: item.id })),
      provenanceRefs: [
        ...chunkEvidence.map((item) => ({ refType: "chunk" as const, refId: item.id, role: "derived_from" as const })),
      ],
      primaryActions: ["ask_tutor", "quiz", "open_provenance"],
      quality: { confidence: conceptWikiPage?.qualityScore ?? concept.confidence ?? null, sourceBacked: chunkEvidence.length > 0 || (conceptWikiPage?.sourceChunkIds ?? []).length > 0, needsReview: acceptedClaims.length === 0 || claimRows.some((claim) => claim.status === "candidate") },
      generation: generationFromRecord(conceptWikiPage?.structuredJson),
    }));
  }

  const [wikiPage] = await ctx.db.db.select().from(wikiPages).where(and(eq(wikiPages.id, nodeId), eq(wikiPages.notebookId, notebookId))).limit(1);
  if (wikiPage) {
    const sourceRefs = (wikiPage.sourceChunkIds ?? []).map((id) => ({ refType: "chunk" as const, refId: id }));
    const learnerEvidence = [
      ...toChunkEvidenceRefs(
        await mapChunkRefsWithSourceTitles(
          ctx,
          sourceRefs.filter((ref) => ref.refType === "chunk").map((ref) => ({ id: ref.refId, chunkType: "chunk", text: "", pageStart: null, pageEnd: null, sourceVersionId: "" })),
        ),
        "learner",
      ),
    ];
    return toLearnerFacingReferenceSurface(base({
      nodeRef: { refType: "wiki_page", refId: wikiPage.id },
      title: wikiPage.title,
      surfaceType: "wiki_page",
      status: wikiPage.status,
      blocks: [{ id: "markdown", kind: "markdown", title: "Reference", content: wikiPage.markdown, evidenceRefs: learnerEvidence }],
      sourceRefs,
      provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" })),
      primaryActions: ["ask_tutor", "open_provenance"],
      quality: { confidence: wikiPage.qualityScore ?? null, sourceBacked: sourceRefs.length > 0, needsReview: wikiPage.status !== "published" },
      generation: generationFromRecord(wikiPage.structuredJson),
    }));
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
    return toLearnerFacingReferenceSurface(base({
      nodeRef: { refType: "curriculum", refId: curriculum.id },
      title: curriculum.title,
      surfaceType: "curriculum",
      summary: curriculumSummary,
      status: curriculum.status,
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
      primaryActions: ["ask_tutor", "review"],
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
    return toLearnerFacingReferenceSurface(base({
      nodeRef: { refType: "curriculum_module", refId: module.id },
      title: module.title,
      surfaceType: "module",
      summary: moduleSummary,
      status: module.status,
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
      scopeRefs: [{ refType: "curriculum", refId: module.curriculumId }],
      sourceRefs,
      provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" })),
      primaryActions: ["ask_tutor", "review"],
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
      nodeRef: { refType: "objective_list", refId: objectiveList.id },
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
      scopeRefs: [{ refType: "curriculum", refId: objectiveList.curriculumId }, { refType: "curriculum_module", refId: objectiveList.moduleId }],
      sourceRefs,
      provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" })),
      primaryActions: ["ask_tutor", "review"],
      quality: { confidence: null, sourceBacked: sourceRefs.length > 0, needsReview: isWeakPlanningLabel(objectiveList.title) },
      generation: generationFromRecord(objectiveList.coverageSnapshotJson),
    }));
  }

  const [objective] = await ctx.db.db.select().from(objectives).where(and(eq(objectives.id, nodeId), eq(objectives.notebookId, notebookId))).limit(1);
  if (objective) {
    const conceptRefs = [...(objective.prerequisiteConceptIds ?? []), ...(objective.targetConceptIds ?? [])].map((id) => ({ refType: "concept" as const, refId: id }));
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
      nodeRef: { refType: "objective", refId: objective.id },
      title: objective.title,
      surfaceType: "objective",
      summary: null,
      status: objective.status,
      blocks: [
        ...(regeneratedMarkdown ? [{ id: "overview", kind: "markdown" as const, title: "Overview", content: regeneratedMarkdown, evidenceRefs: [] }] : []),
        { id: "success", kind: "metadata", title: "Success criteria", content: objective.successCriteriaJson ?? {}, evidenceRefs: [] },
        { id: "concepts", kind: "metadata", title: "Concepts", content: { prerequisites: objective.prerequisiteConceptIds, targets: objective.targetConceptIds }, evidenceRefs: [] },
        { id: "linked_artifacts", kind: "metadata", title: "Linked artifacts", content: linkedArtifacts, evidenceRefs: [] },
      ],
      scopeRefs: [{ refType: "curriculum", refId: objective.curriculumId }, ...conceptRefs],
      sourceRefs,
      provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" })),
      primaryActions: ["ask_tutor", "quiz", "review"],
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
        userMessage: tutorTurns.userMessage,
        assistantMessage: tutorTurns.assistantMessage,
      })
      .from(tutorTurns)
      .where(eq(tutorTurns.sessionId, tutorSession.id))
      .orderBy(desc(tutorTurns.turnIndex))
      .limit(8);
    const orderedTurns = [...turnRows].sort((a, b) => a.turnIndex - b.turnIndex);
    const runtimeGoal = sessionGoalFromRuntimeContext(tutorSession.runtimeContextJson);
    const sessionRefs = parseNodeRefs(tutorSession.selectedNodeRefsJson);
    const sourceRefs = sessionRefs.filter((ref) => ref.refType === "source" || ref.refType === "chunk");
    const taughtItems = buildSessionInsightItems(orderedTurns, "assistant", {
      emptyTitle: "No teaching notes yet",
      emptyBody: "Start a tutoring turn to capture what was explained in this session.",
    });
    const doubtItems = buildSessionInsightItems(orderedTurns, "user", {
      emptyTitle: "No explicit doubts captured",
      emptyBody: "User questions and uncertainty will surface here as the session grows.",
    });
    return toLearnerFacingReferenceSurface(
      base({
        nodeRef: { refType: "session", refId: tutorSession.id },
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
          { id: "taught", kind: "step_list", title: "What was taught", content: taughtItems, evidenceRefs: [] },
          { id: "doubts", kind: "step_list", title: "Doubts and friction", content: doubtItems, evidenceRefs: [] },
          {
            id: "next_steps",
            kind: "step_list",
            title: "Next steps",
            content: [
              {
                title: runtimeGoal ? "Session goal" : "Continue in tutor chat",
                body: runtimeGoal ?? "Ask for the next explanation, practice problem, or source-backed review.",
              },
            ],
            evidenceRefs: [],
          },
        ],
        scopeRefs: sessionRefs,
        sourceRefs,
        provenanceRefs: sourceRefs.map((ref) => ({ ...ref, role: "derived_from" as const })),
        primaryActions: ["ask_tutor", "review"],
        quality: { confidence: null, sourceBacked: sourceRefs.length > 0, needsReview: tutorSession.status !== "completed" && orderedTurns.length === 0 },
      }),
    );
  }

  const [sessionPlan] = await ctx.db.db.select().from(sessionPlans).where(and(eq(sessionPlans.id, nodeId), eq(sessionPlans.notebookId, notebookId))).limit(1);
  if (sessionPlan) {
    const regeneratedMarkdown = jsonString(sessionPlan.recommendationReasonJson, "regeneratedMarkdown");
    const objectiveRefs = (sessionPlan.plannedObjectiveIds ?? []).map((id) => ({ refType: "objective" as const, refId: id }));
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
      nodeRef: { refType: "session_plan", refId: sessionPlan.id },
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
      scopeRefs: [{ refType: "curriculum", refId: sessionPlan.curriculumId }, { refType: "curriculum_module", refId: sessionPlan.moduleId }, ...objectiveRefs],
      primaryActions: ["ask_tutor", "review"],
      quality: { confidence: null, sourceBacked: false, needsReview: isWeakPlanningLabel(sessionPlan.title) },
      generation: generationFromRecord(sessionPlan.recommendationReasonJson),
    }));
  }

  const [artifact] = await ctx.db.db.select().from(artifacts).where(and(eq(artifacts.id, nodeId), eq(artifacts.notebookId, notebookId))).limit(1);
  if (artifact) {
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
    return toLearnerFacingReferenceSurface(base({
      nodeRef: { refType: "artifact", refId: artifact.id },
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
      primaryActions: artifact.artifactType === "quiz" ? ["ask_tutor", "quiz", "open_provenance"] : ["ask_tutor", "review", "open_provenance"],
      quality: { confidence: view.confidence, sourceBacked: view.quality.sourceBacked, needsReview: view.quality.needsReview },
      generation: generationFromRecord(artifact.payloadJson),
    }));
  }

  const [source] = await ctx.db.db.select().from(sources).where(and(eq(sources.id, nodeId), eq(sources.notebookId, notebookId))).limit(1);
  if (source) {
    return toLearnerFacingReferenceSurface(base({
      nodeRef: { refType: "source", refId: source.id },
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
      primaryActions: ["open_source", "ask_tutor"],
      quality: { confidence: null, sourceBacked: true, needsReview: source.status !== "tutoring_ready" },
    }));
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
  const [concept] = await ctx.db.db.select().from(concepts).where(and(eq(concepts.id, nodeId), eq(concepts.notebookId, notebookId))).limit(1);
  if (concept) {
    const links = await ctx.db.db.select({ claimId: claimConceptLinks.claimId }).from(claimConceptLinks).where(eq(claimConceptLinks.conceptId, nodeId));
    const claimIds = links.map((link) => link.claimId);
    const evidence = await buildEvidenceFromClaimAndChunkIds(ctx, claimIds, []);

    return {
      nodeId: concept.id,
      entityType: "concept",
      entity: { id: concept.id, title: concept.canonicalName, conceptType: concept.conceptType, description: concept.description, confidence: concept.confidence },
      ...evidenceForMode(evidence, options.devMode === true),
    };
  }

  const [wikiPage] = await ctx.db.db.select().from(wikiPages).where(and(eq(wikiPages.id, nodeId), eq(wikiPages.notebookId, notebookId))).limit(1);
  if (wikiPage) {
    const evidence = await buildEvidenceFromClaimAndChunkIds(ctx, wikiPage.sourceClaimIds ?? [], wikiPage.sourceChunkIds ?? []);
    return {
      nodeId: wikiPage.id,
      entityType: "wiki_page",
      entity: { id: wikiPage.id, title: wikiPage.title, status: wikiPage.status, markdown: wikiPage.markdown },
      ...evidenceForMode(evidence, options.devMode === true),
    };
  }

  const [artifact] = await ctx.db.db.select().from(artifacts).where(and(eq(artifacts.id, nodeId), eq(artifacts.notebookId, notebookId))).limit(1);
  if (artifact) {
    const evidence = await buildEvidenceFromClaimAndChunkIds(ctx, artifact.sourceClaimIds ?? [], artifact.sourceChunkIds ?? []);
    return {
      nodeId: artifact.id,
      entityType: "artifact",
      entity: { id: artifact.id, title: artifact.title, artifactType: artifact.artifactType, status: artifact.status },
      ...evidenceForMode(evidence, options.devMode === true),
    };
  }

  const [source] = await ctx.db.db.select().from(sources).where(and(eq(sources.id, nodeId), eq(sources.notebookId, notebookId))).limit(1);
  if (source) {
    const [latestVersion] = await ctx.db.db
      .select()
      .from(sourceVersions)
      .where(eq(sourceVersions.sourceId, nodeId))
      .orderBy(desc(sourceVersions.version))
      .limit(1);
    const chunkRows = latestVersion
      ? await ctx.db.db
          .select({ id: chunks.id, chunkType: chunks.chunkType, text: chunks.text, pageStart: chunks.pageStart, pageEnd: chunks.pageEnd, sourceVersionId: chunks.sourceVersionId })
          .from(chunks)
          .where(eq(chunks.sourceVersionId, latestVersion.id))
          .limit(10)
      : [];
    const learnerRefs = toChunkEvidenceRefs(await mapChunkRefsWithSourceTitles(ctx, chunkRows), "learner");
    return {
      nodeId: source.id,
      entityType: "source",
      entity: { id: source.id, title: source.title, status: source.status, sourceType: source.sourceType },
      learnerRefs: sanitizeLearnerEvidenceRefs(learnerRefs, options.devMode === true),
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

async function buildEvidenceFromClaimAndChunkIds(
  ctx: AppContext,
  claimIds: string[],
  chunkIds: string[],
): Promise<Pick<EvidenceReadModel, "learnerRefs" | "developerRefs">> {
  const claimRows = claimIds.length ? await ctx.db.db.select().from(claims).where(inArray(claims.id, claimIds)).limit(20) : [];
  const linkedChunkIds = Array.from(new Set([...chunkIds, ...claimRows.flatMap((claim) => claim.sourceChunkIds ?? [])]));
  const chunkRows = linkedChunkIds.length
    ? await ctx.db.db
        .select({ id: chunks.id, chunkType: chunks.chunkType, text: chunks.text, pageStart: chunks.pageStart, pageEnd: chunks.pageEnd, sourceVersionId: chunks.sourceVersionId })
        .from(chunks)
        .where(inArray(chunks.id, linkedChunkIds))
        .limit(10)
    : [];
  const learnerChunks = toChunkEvidenceRefs(await mapChunkRefsWithSourceTitles(ctx, chunkRows), "learner");
  const learnerClaims = toClaimEvidenceRefs(claimRows.filter((claim) => isLearnerSafeClaim(claim)), "learner");
  const developerClaims = toClaimEvidenceRefs(
    claimRows.filter((claim) => !isLearnerSafeClaim(claim)),
    "developer",
  );
  return { learnerRefs: [...learnerChunks, ...learnerClaims], developerRefs: developerClaims };
}

function isLearnerSafeClaim(claim: { status: string; confidence: number; sourceChunkIds?: string[] | null }): boolean {
  return ["accepted", "active", "published"].includes(claim.status) && claim.confidence >= 0.45 && (claim.sourceChunkIds ?? []).length > 0;
}

function toClaimEvidenceRefs(
  claimRows: Array<{ id: string; claimText: string; confidence: number; status: string; sourceChunkIds?: string[] | null }>,
  visibility: "learner" | "developer",
): EvidenceRef[] {
  return claimRows.map((claim) => ({
    id: claim.id,
    kind: "claim",
    visibility,
    label: "Supporting note",
    text: claim.claimText,
    confidence: claim.confidence,
    status: claim.status,
    statementKind: classifyClaimStatement(claim),
    chunkType: null,
    pageStart: null,
    pageEnd: null,
    sourceId: null,
    sourceTitle: null,
    metadata: { sourceChunkCount: claim.sourceChunkIds?.length ?? 0 },
  }));
}

function toLearnerClaimEvidenceRefs(
  claimRows: Array<{ id: string; claimText: string; confidence: number; status: string; sourceChunkIds?: string[] | null }>,
): EvidenceRef[] {
  return sanitizeLearnerEvidenceRefs(toClaimEvidenceRefs(claimRows, "learner"), false);
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

function sanitizeLearnerEvidenceRefs(refs: EvidenceRef[], devMode: boolean): EvidenceRef[] {
  if (devMode) return refs;
  return refs.map((ref) => {
    if (ref.kind !== "claim") return ref;
    return {
      ...ref,
      id: `evidence_${stableHash(ref.id)}`,
      confidence: null,
      status: null,
      metadata: {},
    };
  });
}

function stableHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function toChunkEvidenceRefs(
  chunkRows: Array<{ id: string; chunkType: string; text: string; pageStart: number | null; pageEnd: number | null; sourceId: string | null; sourceTitle: string | null }>,
  visibility: "learner" | "developer",
): EvidenceRef[] {
  return chunkRows.map((chunk) => ({
    id: chunk.id,
    kind: "chunk",
    visibility,
    label: chunk.sourceTitle ?? chunk.id,
    text: chunk.text.slice(0, 400),
    confidence: null,
    status: null,
    chunkType: chunk.chunkType,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    sourceId: chunk.sourceId,
    sourceTitle: chunk.sourceTitle,
    metadata: {},
  }));
}

function classifyClaimStatement(claim: { sourceChunkIds?: string[] | null; confidence: number; status: string }): "source_backed" | "inferred" | "generated" {
  if ((claim.sourceChunkIds ?? []).length > 0 && ["accepted", "active", "published"].includes(claim.status) && claim.confidence >= 0.45) {
    return "source_backed";
  }
  if ((claim.sourceChunkIds ?? []).length > 0) return "inferred";
  return "generated";
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

function buildSessionInsightItems(
  turnRows: Array<{ turnIndex: number; userMessage: string | null; assistantMessage: string | null }>,
  role: "user" | "assistant",
  empty: { emptyTitle: string; emptyBody: string },
): Array<{ title: string; body: string }> {
  const items: Array<{ title: string; body: string }> = [];
  for (const turn of turnRows) {
    const message = role === "assistant" ? turn.assistantMessage : turn.userMessage;
    if (!message || !message.trim()) continue;
    if (role === "user" && !isSessionDoubt(message)) continue;
    const summary = summarizeSessionMessage(message, 150);
    if (!summary) continue;
    items.push({ title: `Turn ${turn.turnIndex + 1}`, body: summary });
    if (items.length >= 4) break;
  }
  return items.length > 0 ? items : [{ title: empty.emptyTitle, body: empty.emptyBody }];
}

function summarizeSessionMessage(text: string, maxLength: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function isSessionDoubt(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return /\?|confus|stuck|unclear|don't understand|do not understand|why|how/.test(normalized);
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

function generationFromRecord(value: unknown): ReferenceSurface["generation"] {
  if (!isJsonRecord(value)) return null;
  const mode = value.regeneratedMode === "ai" ? "ai" : value.regeneratedMode === "heuristic" || typeof value.regeneratedMarkdown === "string" ? "heuristic" : null;
  if (!mode) return null;
  return {
    mode,
    label: mode === "ai" ? "AI" : "Heuristic",
    generatedAt: typeof value.regeneratedAt === "string" ? value.regeneratedAt : null,
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function mapChunkRefsWithSourceTitles(
  ctx: AppContext,
  chunkRows: Array<{ id: string; chunkType: string; text: string; pageStart: number | null; pageEnd: number | null; sourceVersionId: string }>,
): Promise<Array<{ id: string; chunkType: string; text: string; pageStart: number | null; pageEnd: number | null; sourceId: string | null; sourceTitle: string | null }>> {
  const versionIds = Array.from(new Set(chunkRows.map((chunk) => chunk.sourceVersionId)));
  if (!versionIds.length) {
    return chunkRows.map((chunk) => ({
      id: chunk.id,
      chunkType: chunk.chunkType,
      text: chunk.text.slice(0, 400),
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      sourceId: null,
      sourceTitle: null,
    }));
  }

  const versions = await ctx.db.db
    .select({ id: sourceVersions.id, sourceId: sourceVersions.sourceId })
    .from(sourceVersions)
    .where(inArray(sourceVersions.id, versionIds));
  const sourceIds = Array.from(new Set(versions.map((version) => version.sourceId)));
  const sourceRows = sourceIds.length
    ? await ctx.db.db.select({ id: sources.id, title: sources.title }).from(sources).where(inArray(sources.id, sourceIds))
    : [];
  const sourceIdByVersionId = new Map(versions.map((version) => [version.id, version.sourceId] as const));
  const sourceTitleById = new Map(sourceRows.map((source) => [source.id, source.title] as const));

  return chunkRows.map((chunk) => {
    const sourceId = sourceIdByVersionId.get(chunk.sourceVersionId) ?? null;
    return {
      id: chunk.id,
      chunkType: chunk.chunkType,
      text: chunk.text.slice(0, 400),
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      sourceId,
      sourceTitle: sourceId ? sourceTitleById.get(sourceId) ?? null : null,
    };
  });
}
