import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  buildAgenticCacheKey,
  chunks,
  concepts,
  curricula,
  curriculumModules,
  events,
  learningState,
  notebooks,
  objectiveLists,
  objectives,
  sessionPlans,
  sourceVersions,
  sources,
  studentProfiles,
  studyPlans,
  getAgenticCacheEntry,
  setAgenticCacheEntry,
  wikiPages,
  type DbClient,
} from "@studyagent/db";
import { createNeo4jDriver, queryConceptNeighborhood, querySourceWikiMapSimple, queryStudyMapSimple } from "@studyagent/graph";
import type { EntityRefType, GraphRelationType, GraphNodeType, SourceScopePolicy } from "@studyagent/schemas";
import { parseSourceScopePolicy } from "@studyagent/schemas";
import {
  expandRetrievalChunksWithParents,
  hybridSearchNotebook,
  lexicalSearchNotebook,
  unifiedSearchResultsToWikiRows,
  type HybridSearchContext,
  type UnifiedSearchResult,
} from "@studyagent/search";
import { ToolError, type GraphPayloadToolOutput, type RuntimeReadToolProvider } from "@studyagent/tools";
import { recordAgenticCacheMetric, recordSearchRetrievalFallbackMetric, startMetricTimer } from "@studyagent/observability";
import type { AppContext } from "./context.js";
import { loadNotebookStudyState } from "./study-state.js";
import {
  buildModuleMilestoneSignals,
  buildStandingBoundarySignals,
  buildWikiSearchBoundarySignals,
} from "./boundary-signals.js";

type SimpleGraphNode = {
  id: string;
  labels: string[];
  props: Record<string, unknown>;
};

type SimpleGraphEdge = {
  type: string;
  startId: string;
  endId: string;
  props: Record<string, unknown>;
};

type Neo4jSession = Parameters<typeof queryStudyMapSimple>[0];

type SourceSpanRow = {
  chunkId: string;
  text: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  sourceVersionId: string;
  pageStart: number | null;
  pageEnd: number | null;
  headingPath: string[] | null;
};

export type TutorContextSelection = {
  strategy: string;
  query: string;
  retrievalMode: "hybrid" | "lexical" | "lexical_fallback";
  maxChunks: number;
  selectedNodeRefs: Array<{ refType: string; refId: string }>;
  objectiveTitle: string | null;
  weakConceptNames: string[];
  selectedChunkIds: string[];
  selectedSourceIds: string[];
  objectivePathConceptIds: string[];
  recentMistakeConceptIds: string[];
  sourceScopePolicy: SourceScopePolicy;
  usedSourceScopeFallback: boolean;
  sourceCoverageGap: boolean;
  reason: string;
};

export type TutorContextSelectionPlan = {
  query: string;
  strategy: TutorContextSelection["strategy"];
  objectiveTitle: string | null;
  weakConceptNames: string[];
  selectedNodeRefs: Array<{ refType: string; refId: string }>;
  selectedSourceIds: string[];
  objectivePathConceptIds: string[];
  openArtifactSummary: string | null;
  recentMistakeConceptIds: string[];
};

const TUTOR_RETRIEVAL_ROWS_CACHE_NAMESPACE = "tutor_turn.retrieval_rows";
const TUTOR_RETRIEVAL_ROWS_CACHE_TTL_MS = 10 * 60_000;
const HYBRID_SEARCH_FALLBACK_TIMEOUT_MS = 4500;
type RetrievalMode = TutorContextSelection["retrievalMode"];
type RetrievalFallbackReason = "timeout" | "http_error" | "missing_api_key" | "dimension_mismatch" | "unknown";

function refHandle(refType: EntityRefType, refId: string, title?: string | null) {
  const label = title?.trim() || refId;
  return {
    id: refId,
    ref: { refType, refId, handle: label, title: title ?? undefined },
    handle: label,
    ...(title ? { title } : {}),
    label,
  };
}

function conceptHandle(concept: { id: string; name?: string | null; title?: string | null }) {
  const name = concept.name ?? concept.title ?? concept.id;
  return {
    ...refHandle("concept", concept.id, name),
    name,
  };
}

function objectiveHandle(objective: {
  id: string;
  title: string;
  status: string;
  orderIndex?: number;
  targetConceptIds?: string[];
  prerequisiteConceptIds?: string[];
}) {
  return {
    ...refHandle("objective", objective.id, objective.title),
    title: objective.title,
    status: objective.status,
    ...(objective.orderIndex !== undefined ? { orderIndex: objective.orderIndex } : {}),
    targetConcepts: (objective.targetConceptIds ?? []).map((id) => conceptHandle({ id })),
    prerequisiteConcepts: (objective.prerequisiteConceptIds ?? []).map((id) => conceptHandle({ id })),
  };
}

export { createWikiWriteHandlers } from "./tutor-write-wiki.js";

export const WIKI_TOUCH_WRITE_TOOL_NAMES = [
  "wiki.ensure_concept_page",
  "wiki.ensure_topic_page",
  "wiki.touch_concept",
  "wiki.touch_topic",
] as const;

export function createTutorReadToolProvider(appCtx: AppContext): RuntimeReadToolProvider {
  return {
    async notebookGetContext(input, toolCtx) {
      const [notebook] = await appCtx.db.db
        .select({
          id: notebooks.id,
          title: notebooks.title,
          description: notebooks.description,
          goal: notebooks.goal,
          defaultMode: notebooks.defaultMode,
          settings: notebooks.settingsJson,
        })
        .from(notebooks)
        .where(eq(notebooks.id, toolCtx.notebookId))
        .limit(1);

      if (!notebook) {
        throw new ToolError("notebook_not_found", `Notebook not found: ${toolCtx.notebookId}`);
      }

      const recentEvents = input.includeRecentActivity
        ? (
            await appCtx.db.db
              .select({
                id: events.id,
                eventType: events.eventType,
                sequenceNo: events.sequenceNo,
                createdAt: events.createdAt,
              })
              .from(events)
              .where(eq(events.notebookId, toolCtx.notebookId))
              .orderBy(desc(events.sequenceNo))
              .limit(10)
          )
            .reverse()
            .map((eventRow) => ({
              id: eventRow.id,
              eventType: eventRow.eventType,
              sequenceNo: eventRow.sequenceNo,
              createdAt: eventRow.createdAt.toISOString(),
            }))
        : [];

      return {
        notebook: {
          id: notebook.id,
          ref: { refType: "notebook", refId: notebook.id, handle: notebook.title, title: notebook.title },
          handle: notebook.title,
          title: notebook.title,
          description: notebook.description,
          goal: notebook.goal,
          defaultMode: notebook.defaultMode,
          settings: notebook.settings ?? {},
        },
        selectedNodeRefs: toolCtx.selectedNodeRefs,
        recentEvents,
      };
    },

    async wikiSearch(input, toolCtx) {
      const notebookId = toolCtx.notebookId;
      const limit = input.maxResults;
      const selectedNodeRefs = dedupeRefs([...toolCtx.selectedNodeRefs, ...input.selectedNodeRefs]);
      const retrieval = await loadTutorRetrievalRows(appCtx, {
        notebookId,
        retrievalMode: appCtx.env.OPENROUTER_API_KEY ? "hybrid" : "lexical",
        query: input.query,
        limit,
        selectedNodeRefs,
        objectivePathConceptIds: input.conceptIds ?? [],
      });

      const results = unifiedSearchResultsToWikiRows(retrieval.rows);
      const warnings = buildWikiSearchWarnings({
        query: input.query,
        results,
        retrievalMode: retrieval.retrievalMode,
        ...(retrieval.fallbackReason ? { fallbackReason: retrieval.fallbackReason } : {}),
      });
      const boundarySignals = await buildWikiSearchBoundarySignals(appCtx.db, {
        notebookId,
        query: input.query,
        results,
        requestedSection: extractRequestedSectionNumber(input.query),
      });
      logWikiSearchDiagnostic("completed", {
        notebookId,
        query: input.query,
        retrievalMode: retrieval.retrievalMode,
        fallbackReason: retrieval.fallbackReason,
        resultCount: results.length,
        warningCodes: warnings.map((warning) => warning.code),
        boundarySignalTypes: boundarySignals.map((signal) => signal.type),
        topRefs: results.slice(0, 5).map((result) => `${result.refType}:${result.refId}`),
      });
      return {
        results,
        retrievalMode: retrieval.retrievalMode,
        ...(retrieval.fallbackReason ? { fallbackReason: retrieval.fallbackReason } : {}),
        boundarySignals,
        warnings,
      };
    },

    async wikiGetPage(input, toolCtx) {
      const [page] = await appCtx.db.db
        .select({
          id: wikiPages.id,
          notebookId: wikiPages.notebookId,
          pageType: wikiPages.pageType,
          pageKey: wikiPages.pageKey,
          title: wikiPages.title,
          version: wikiPages.version,
          status: wikiPages.status,
          markdown: wikiPages.markdown,
          structured: wikiPages.structuredJson,
          sourceClaimIds: wikiPages.sourceClaimIds,
          sourceChunkIds: wikiPages.sourceChunkIds,
        })
        .from(wikiPages)
        .where(and(eq(wikiPages.id, input.pageId), eq(wikiPages.notebookId, toolCtx.notebookId)))
        .limit(1);

      return {
        page: page
          ? {
              id: page.id,
              notebookId: page.notebookId,
              pageType: page.pageType,
              pageKey: page.pageKey,
              title: page.title,
              version: page.version,
              status: page.status,
              markdown: page.markdown,
              structured: page.structured ?? {},
              sourceClaimIds: page.sourceClaimIds ?? [],
              sourceChunkIds: page.sourceChunkIds ?? [],
            }
          : null,
      };
    },

    async sourceGetSpan(input, toolCtx) {
      const sourceLookupInput = {
        ...(input.sourceId ? { sourceId: input.sourceId } : {}),
        ...(input.sourceVersionId ? { sourceVersionId: input.sourceVersionId } : {}),
        ...(input.pageStart !== undefined ? { pageStart: input.pageStart } : {}),
        ...(input.pageEnd !== undefined ? { pageEnd: input.pageEnd } : {}),
      };
      const row = input.chunkId
        ? await getChunkSpanById(appCtx.db, toolCtx.notebookId, input.chunkId)
        : await getChunkSpanBySource(appCtx.db, toolCtx.notebookId, sourceLookupInput);

      if (!row) {
        const fallback = await getSourceCitationFallback(appCtx.db, toolCtx.notebookId, {
          ...(input.sourceId ? { sourceId: input.sourceId } : {}),
          ...(input.sourceVersionId ? { sourceVersionId: input.sourceVersionId } : {}),
        });
        if (!fallback) {
          throw new ToolError("source_span_not_found", "Source span not found in notebook scope");
        }

        return {
          text: "",
          sourceId: fallback.sourceId,
          sourceVersionId: fallback.sourceVersionId,
          pageStart: input.pageStart,
          pageEnd: input.pageEnd,
          headingPath: [],
          citation: {
            sourceTitle: fallback.sourceTitle,
            sourceType: fallback.sourceType,
          },
        };
      }

      return {
        text: row.text,
        sourceId: row.sourceId,
        sourceVersionId: row.sourceVersionId,
        pageStart: row.pageStart ?? input.pageStart,
        pageEnd: row.pageEnd ?? input.pageEnd,
        headingPath: row.headingPath ?? [],
        citation: {
          sourceTitle: row.sourceTitle,
          sourceType: row.sourceType,
        },
      };
    },

    async graphGetSubgraph(input, toolCtx) {
      if (!input.nodeRefs.length) {
        return emptyGraph(["No node refs provided"]);
      }

      return withNeo4jGraph(appCtx, async (session) => {
        const payloads: GraphPayloadToolOutput[] = [];

        for (const ref of input.nodeRefs) {
          if (ref.refType === "concept") {
            const neighborhood = await queryConceptNeighborhood(session, toolCtx.notebookId, ref.refId, input.maxNodes);
            payloads.push(conceptNeighborhoodToPayload(toolCtx.notebookId, neighborhood));
            continue;
          }

          if (ref.refType === "source") {
            const map = await querySourceWikiMapSimple(session, toolCtx.notebookId, ref.refId, input.maxNodes);
            payloads.push(simpleGraphToPayload(toolCtx.notebookId, map));
            continue;
          }

          payloads.push(emptyGraph([`Subgraph lookup is not implemented yet for refType "${ref.refType}"`]));
        }

        const merged = mergeGraphPayloads(payloads);
        return applyGraphFilters(merged, input.relationTypes, input.maxNodes);
      });
    },

    async graphGetStudyMap(_input, toolCtx) {
      return withNeo4jGraph(appCtx, async (session) => {
        const map = await queryStudyMapSimple(session, toolCtx.notebookId, 120);
        return simpleGraphToPayload(toolCtx.notebookId, map);
      });
    },

    async graphGetSourceWikiMap(input, toolCtx) {
      return withNeo4jGraph(appCtx, async (session) => {
        const sourceIds =
          input.sourceIds.length > 0
            ? input.sourceIds
            : (
                await appCtx.db.db
                  .select({ id: sources.id })
                  .from(sources)
                  .where(eq(sources.notebookId, toolCtx.notebookId))
                  .orderBy(desc(sources.updatedAt))
                  .limit(3)
              ).map((row) => row.id);

        if (!sourceIds.length) {
          return emptyGraph(["No sources available in notebook"]);
        }

        const maps = await Promise.all(
          sourceIds.map((sourceId: string) => querySourceWikiMapSimple(session, toolCtx.notebookId, sourceId, 80)),
        );

        return mergeGraphPayloads(
          maps.map((map: Awaited<ReturnType<typeof querySourceWikiMapSimple>>) => simpleGraphToPayload(toolCtx.notebookId, map)),
        );
      });
    },

    async curriculumGet(input, toolCtx) {
      const [curriculum] = await appCtx.db.db
        .select({
          id: curricula.id,
          notebookId: curricula.notebookId,
          title: curricula.title,
          curriculumType: curricula.curriculumType,
          status: curricula.status,
          sourceIds: curricula.sourceIds,
        })
        .from(curricula)
        .where(
          and(
            eq(curricula.notebookId, toolCtx.notebookId),
            input.curriculumId ? eq(curricula.id, input.curriculumId) : sql`true`,
          ),
        )
        .orderBy(desc(curricula.updatedAt))
        .limit(1);

      if (!curriculum) {
        return { curriculum: null };
      }

      const objectiveRows = await appCtx.db.db
        .select({
          id: objectives.id,
          title: objectives.title,
          status: objectives.status,
          orderIndex: objectives.orderIndex,
          targetConceptIds: objectives.targetConceptIds,
          prerequisiteConceptIds: objectives.prerequisiteConceptIds,
        })
        .from(objectives)
        .where(and(eq(objectives.notebookId, toolCtx.notebookId), eq(objectives.curriculumId, curriculum.id)))
        .orderBy(asc(objectives.orderIndex));

      return {
        curriculum: {
          id: curriculum.id,
          notebookId: curriculum.notebookId,
          title: curriculum.title,
          curriculumType: curriculum.curriculumType,
          status: curriculum.status,
          sourceIds: curriculum.sourceIds ?? [],
              objectiveIds: objectiveRows.map((row) => row.id),
              objectives: objectiveRows.map((row) =>
                objectiveHandle({
                  id: row.id,
                  title: row.title,
                  status: row.status,
                  orderIndex: row.orderIndex,
                  targetConceptIds: row.targetConceptIds,
                  prerequisiteConceptIds: row.prerequisiteConceptIds,
                }),
              ),
            },
      };
    },

    async studentProfileGet(input, toolCtx) {
      const userId = input.userId ?? toolCtx.userId;
      const [row] = await appCtx.db.db
        .select({
          id: studentProfiles.id,
          notebookId: studentProfiles.notebookId,
          userId: studentProfiles.userId,
          goalSummary: studentProfiles.goalSummary,
          backgroundSummary: studentProfiles.backgroundSummary,
          pacePreference: studentProfiles.pacePreference,
          depthPreference: studentProfiles.depthPreference,
          examplePreferencesJson: studentProfiles.examplePreferencesJson,
          assessmentPreferenceJson: studentProfiles.assessmentPreferenceJson,
          constraintsJson: studentProfiles.constraintsJson,
          createdAt: studentProfiles.createdAt,
          updatedAt: studentProfiles.updatedAt,
        })
        .from(studentProfiles)
        .where(and(eq(studentProfiles.notebookId, toolCtx.notebookId), eq(studentProfiles.userId, userId)))
        .limit(1);

      return {
        studentProfile: row
          ? {
              id: row.id,
              notebookId: row.notebookId,
              userId: row.userId,
              goalSummary: row.goalSummary ?? null,
              backgroundSummary: row.backgroundSummary ?? null,
              pacePreference: row.pacePreference ?? null,
              depthPreference: row.depthPreference ?? null,
              examplePreferencesJson: row.examplePreferencesJson ?? {},
              assessmentPreferenceJson: row.assessmentPreferenceJson ?? {},
              constraintsJson: row.constraintsJson ?? {},
              createdAt: row.createdAt.toISOString(),
              updatedAt: row.updatedAt.toISOString(),
            }
          : null,
      };
    },

    async studyPlanGetCurrent(input, toolCtx) {
      const studyState = await loadNotebookStudyState(appCtx.db, toolCtx.notebookId, input.userId ?? toolCtx.userId);
      const boundarySignals = [
        ...buildStandingBoundarySignals(studyState),
        ...(await buildModuleMilestoneSignals(appCtx.db, { notebookId: toolCtx.notebookId, state: studyState })),
      ];
      const studyPlan = studyState.studyPlan;
      const [curriculumRow] =
        studyState.curriculum
          ? await appCtx.db.db
              .select()
              .from(curricula)
              .where(and(eq(curricula.id, studyState.curriculum.id), eq(curricula.notebookId, toolCtx.notebookId)))
              .limit(1)
          : [null];
      const [moduleRow] =
        studyState.module
          ? await appCtx.db.db
              .select()
              .from(curriculumModules)
              .where(and(eq(curriculumModules.id, studyState.module.id), eq(curriculumModules.notebookId, toolCtx.notebookId)))
              .limit(1)
          : [null];
      const [objectiveListRow] =
        studyState.objectiveList
          ? await appCtx.db.db
              .select()
              .from(objectiveLists)
              .where(and(eq(objectiveLists.id, studyState.objectiveList.id), eq(objectiveLists.notebookId, toolCtx.notebookId)))
              .limit(1)
          : [null];
      const [sessionPlanRow] =
        studyState.sessionPlan
          ? await appCtx.db.db
              .select()
              .from(sessionPlans)
              .where(and(eq(sessionPlans.id, studyState.sessionPlan.id), eq(sessionPlans.notebookId, toolCtx.notebookId)))
              .limit(1)
          : [null];
      return {
        studentProfile: studyState.studentProfile
          ? {
              id: studyState.studentProfile.id,
              ref: { refType: "user", refId: input.userId ?? toolCtx.userId, handle: "learner_profile", label: "Learner profile" },
              handle: "learner_profile",
              notebookId: toolCtx.notebookId,
              userId: input.userId ?? toolCtx.userId,
              goalSummary: studyState.studentProfile.goalSummary,
              backgroundSummary: studyState.studentProfile.backgroundSummary,
              pacePreference: studyState.studentProfile.pacePreference,
              depthPreference: studyState.studentProfile.depthPreference,
              examplePreferencesJson: studyState.studentProfile.examplePreferencesJson,
              assessmentPreferenceJson: studyState.studentProfile.assessmentPreferenceJson,
              constraintsJson: studyState.studentProfile.constraintsJson,
              createdAt: studyState.studentProfile.createdAt,
              updatedAt: studyState.studentProfile.updatedAt,
            }
          : null,
        curriculum: studyState.curriculum
          ? {
              id: studyState.curriculum.id,
              ref: { refType: "curriculum", refId: studyState.curriculum.id, handle: studyState.curriculum.title, title: studyState.curriculum.title },
              handle: studyState.curriculum.title,
              notebookId: toolCtx.notebookId,
              title: studyState.curriculum.title,
              curriculumType: curriculumRow?.curriculumType ?? "structured",
              status: studyState.curriculum.status,
              activeModuleId: studyState.curriculum.activeModuleId,
              sourceIds: curriculumRow?.sourceIds ?? [],
              objectiveIds: [],
            }
          : null,
        module: studyState.module
          ? {
              id: studyState.module.id,
              ref: { refType: "curriculum_module", refId: studyState.module.id, handle: studyState.module.title, title: studyState.module.title },
              handle: studyState.module.title,
              notebookId: toolCtx.notebookId,
              curriculumId: studyState.curriculum?.id ?? "",
              title: studyState.module.title,
              summary: studyState.module.summary,
              orderIndex: moduleRow?.orderIndex ?? 0,
              status: studyState.module.status,
              sourceRefsJson: moduleRow?.sourceRefsJson ?? [],
              targetConceptIds: moduleRow?.targetConceptIds ?? [],
              prerequisiteModuleIds: moduleRow?.prerequisiteModuleIds ?? [],
              estimatedSessionCount: moduleRow?.estimatedSessionCount ?? 1,
              coverageRequirementsJson: moduleRow?.coverageRequirementsJson ?? {},
              masteryGateJson: moduleRow?.masteryGateJson ?? {},
              createdAt: moduleRow?.createdAt.toISOString() ?? new Date().toISOString(),
              updatedAt: moduleRow?.updatedAt.toISOString() ?? new Date().toISOString(),
            }
          : null,
        objectiveList: studyState.objectiveList
          ? {
              id: studyState.objectiveList.id,
              ref: { refType: "objective_list", refId: studyState.objectiveList.id, handle: studyState.objectiveList.title, title: studyState.objectiveList.title },
              handle: studyState.objectiveList.title,
              notebookId: toolCtx.notebookId,
              curriculumId: studyState.curriculum?.id ?? "",
              moduleId: studyState.module?.id ?? "",
              title: studyState.objectiveList.title,
              status: studyState.objectiveList.status,
              currentObjectiveId: studyState.objectiveList.currentObjectiveId,
              objectiveIdsOrdered: studyState.objectiveList.objectiveIdsOrdered,
              currentObjective: studyPlan?.currentObjective
                ? objectiveHandle(studyPlan.currentObjective)
                : null,
              objectivesOrdered: [
                ...(studyPlan?.currentObjective ? [studyPlan.currentObjective] : []),
                ...(studyPlan?.upcomingObjectives ?? []),
                ...(studyPlan?.completedObjectives ?? []),
              ].map(objectiveHandle),
              coverageSnapshotJson: objectiveListRow?.coverageSnapshotJson ?? {},
              createdByRunId: objectiveListRow?.createdByRunId ?? null,
              createdAt: objectiveListRow?.createdAt.toISOString() ?? new Date().toISOString(),
              updatedAt: objectiveListRow?.updatedAt.toISOString() ?? new Date().toISOString(),
            }
          : null,
        sessionPlan: studyState.sessionPlan
          ? {
              id: studyState.sessionPlan.id,
              ref: { refType: "session_plan", refId: studyState.sessionPlan.id, handle: studyState.sessionPlan.title, title: studyState.sessionPlan.title },
              handle: studyState.sessionPlan.title,
              notebookId: toolCtx.notebookId,
              curriculumId: studyState.curriculum?.id ?? "",
              moduleId: studyState.module?.id ?? "",
              objectiveListId: studyState.objectiveList?.id ?? "",
              title: studyState.sessionPlan.title,
              status: studyState.sessionPlan.status,
              sessionGoal: studyState.sessionPlan.sessionGoal,
              plannedObjectiveIds: studyState.sessionPlan.plannedObjectiveIds,
              plannedObjectives: (studyPlan
                ? [
                    ...(studyPlan.currentObjective ? [studyPlan.currentObjective] : []),
                    ...studyPlan.upcomingObjectives,
                    ...studyPlan.completedObjectives,
                  ].filter((objective) => studyState.sessionPlan?.plannedObjectiveIds.includes(objective.id))
                : []
              ).map(objectiveHandle),
              openerJson: sessionPlanRow?.openerJson ?? {},
              diagnosticQuestionIds: sessionPlanRow?.diagnosticQuestionIds ?? [],
              teachingArcIds: sessionPlanRow?.teachingArcIds ?? [],
              artifactRefsJson: sessionPlanRow?.artifactRefsJson ?? [],
              exitCriteriaJson: sessionPlanRow?.exitCriteriaJson ?? {},
              recommendationReasonJson: sessionPlanRow?.recommendationReasonJson ?? {},
              createdByRunId: sessionPlanRow?.createdByRunId ?? null,
              createdAt: sessionPlanRow?.createdAt.toISOString() ?? new Date().toISOString(),
              updatedAt: sessionPlanRow?.updatedAt.toISOString() ?? new Date().toISOString(),
            }
          : null,
        studyPlan: studyPlan
          ? {
              id: studyPlan.id,
              ref: { refType: "study_plan", refId: studyPlan.id, handle: studyPlan.title, title: studyPlan.title },
              handle: studyPlan.title,
              notebookId: toolCtx.notebookId,
              userId: input.userId ?? toolCtx.userId,
              title: studyPlan.title,
              status: studyPlan.status,
              currentObjectiveId: studyPlan.currentObjective?.id ?? null,
              upcomingObjectiveIds: studyPlan.upcomingObjectives.map((objective) => objective.id),
              completedObjectiveIds: studyPlan.completedObjectives.map((objective) => objective.id),
              weakConceptIds: studyPlan.weakConcepts.map((concept) => concept.id),
              currentObjective: studyPlan.currentObjective ? objectiveHandle(studyPlan.currentObjective) : null,
              upcomingObjectives: studyPlan.upcomingObjectives.map(objectiveHandle),
              completedObjectives: studyPlan.completedObjectives.map(objectiveHandle),
              weakConcepts: studyPlan.weakConcepts.map(conceptHandle),
            }
          : null,
        boundarySignals,
      };
    },

    async learningGetState(input, toolCtx) {
      const userId = input.userId ?? toolCtx.userId;
      const conditions = [eq(learningState.notebookId, toolCtx.notebookId), eq(learningState.userId, userId)];
      if (input.conceptIds.length > 0) {
        conditions.push(inArray(learningState.conceptId, input.conceptIds));
      }

      const rows = await appCtx.db.db
        .select({
          conceptId: learningState.conceptId,
          masteryScore: learningState.masteryScore,
          confidence: learningState.confidence,
          nextReviewAt: learningState.nextReviewAt,
          misconception: learningState.misconceptionJson,
        })
        .from(learningState)
        .where(and(...conditions));
      const conceptIds = [...new Set(rows.map((row) => row.conceptId))];
      const conceptRows = conceptIds.length
        ? await appCtx.db.db
            .select({
              id: concepts.id,
              title: concepts.canonicalName,
            })
            .from(concepts)
            .where(and(eq(concepts.notebookId, toolCtx.notebookId), inArray(concepts.id, conceptIds)))
        : [];
      const conceptTitleById = new Map(conceptRows.map((row) => [row.id, row.title]));

      return {
        conceptStates: rows.map((row) => {
          const title = conceptTitleById.get(row.conceptId);
          return {
            conceptId: row.conceptId,
            ref: conceptHandle({ id: row.conceptId, ...(title ? { name: title } : {}) }).ref,
            handle: title ?? row.conceptId,
            ...(title ? { title } : {}),
            masteryScore: row.masteryScore,
            confidence: row.confidence,
            nextReviewAt: row.nextReviewAt?.toISOString(),
            misconception: row.misconception ?? null,
          };
        }),
      };
    },
  };
}

function buildEmbeddingOptions(appCtx: AppContext) {
  if (!appCtx.env.OPENROUTER_API_KEY) {
    throw new ToolError("embedding_unavailable", "OPENROUTER_API_KEY is required for hybrid tutor search");
  }

  const baseUrl = (appCtx.env.EMBEDDING_API_BASE_URL?.trim() || appCtx.env.OPENROUTER_BASE_URL).replace(/\/+$/, "");
  return {
    baseUrl,
    apiKey: appCtx.env.OPENROUTER_API_KEY,
    model: appCtx.env.EMBEDDING_MODEL,
    dimensions: appCtx.env.EMBEDDING_DIMENSIONS,
  };
}

function buildHybridContext(
  selectedNodeRefs: Array<{ refType: string; refId: string }>,
  conceptIds: string[],
): HybridSearchContext | undefined {
  if (!selectedNodeRefs.length && !conceptIds.length) {
    return undefined;
  }

  return {
    ...(selectedNodeRefs.length ? { selectedNodeRefs } : {}),
    ...(conceptIds.length ? { conceptIds } : {}),
  };
}

type TutorRetrievalResult = {
  rows: UnifiedSearchResult[];
  retrievalMode: RetrievalMode;
  fallbackReason?: RetrievalFallbackReason;
};

type TutorRetrievalRowsCacheValue = Record<string, unknown> & {
  schemaVersion: 1 | 2;
  rows: UnifiedSearchResult[];
  retrievalMode?: RetrievalMode;
  fallbackReason?: RetrievalFallbackReason;
};

async function loadTutorRetrievalRows(
  appCtx: AppContext,
  input: {
    notebookId: string;
    retrievalMode: TutorContextSelection["retrievalMode"];
    query: string;
    limit: number;
    selectedNodeRefs: Array<{ refType: string; refId: string }>;
    objectivePathConceptIds: string[];
  },
): Promise<TutorRetrievalResult> {
  const cacheScope = await resolveTutorRetrievalRowsCacheScope(appCtx, input);
  if (cacheScope) {
    const cached = await getTutorRetrievalRowsCacheValue(appCtx, cacheScope.cacheKey, input.retrievalMode);
    if (cached) return cached;
  }

  const result = await runTutorRetrievalSearch(appCtx, input);
  if (cacheScope) {
    await setTutorRetrievalRowsCacheValue(appCtx, cacheScope, result);
  }
  return result;
}

async function runTutorRetrievalSearch(
  appCtx: AppContext,
  input: {
    notebookId: string;
    retrievalMode: TutorContextSelection["retrievalMode"];
    query: string;
    limit: number;
    selectedNodeRefs: Array<{ refType: string; refId: string }>;
    objectivePathConceptIds: string[];
  },
): Promise<TutorRetrievalResult> {
  const search = await runSearchWithLexicalFallback(appCtx, {
    notebookId: input.notebookId,
    query: input.query,
    limit: input.limit,
    useHybrid: input.retrievalMode === "hybrid",
    ...(buildHybridContext(input.selectedNodeRefs, input.objectivePathConceptIds)
      ? { hybridCtx: buildHybridContext(input.selectedNodeRefs, input.objectivePathConceptIds) }
      : {}),
  });
  const rows = await expandRetrievalChunksWithParents(appCtx.db, search.rows);
  return {
    rows,
    retrievalMode: search.retrievalMode,
    ...(search.fallbackReason ? { fallbackReason: search.fallbackReason } : {}),
  };
}

async function runSearchWithLexicalFallback(
  appCtx: AppContext,
  input: {
    notebookId: string;
    query: string;
    limit: number;
    useHybrid: boolean;
    hybridCtx?: HybridSearchContext | undefined;
  },
): Promise<{ rows: UnifiedSearchResult[]; retrievalMode: RetrievalMode; fallbackReason?: RetrievalFallbackReason }> {
  if (!input.useHybrid) {
    return {
      rows: await lexicalSearchNotebook(appCtx.db, input.notebookId, input.query, input.limit),
      retrievalMode: "lexical",
    };
  }

  try {
    return {
      rows: await withTimeout(
        hybridSearchNotebook(
          appCtx.db,
          input.notebookId,
          input.query,
          input.limit,
          buildEmbeddingOptions(appCtx),
          input.hybridCtx,
        ),
        HYBRID_SEARCH_FALLBACK_TIMEOUT_MS,
      ),
      retrievalMode: "hybrid",
    };
  } catch (error) {
    const fallbackReason = classifyRetrievalFallbackReason(error);
    recordSearchRetrievalFallbackMetric({ reason: fallbackReason });
    logWikiSearchDiagnostic("hybrid_fallback", {
      notebookId: input.notebookId,
      reason: fallbackReason,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      rows: await lexicalSearchNotebook(appCtx.db, input.notebookId, input.query, input.limit),
      retrievalMode: "lexical_fallback",
      fallbackReason,
    };
  }
}

function classifyRetrievalFallbackReason(error: unknown): RetrievalFallbackReason {
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("timed out")) return "timeout";
  if (message.includes("aborted")) return "timeout";
  if (message.includes("api key")) return "missing_api_key";
  if (message.includes("dimension")) return "dimension_mismatch";
  if (message.includes("http") || message.includes("status") || message.includes("openrouter failed")) return "http_error";
  return "unknown";
}

function buildWikiSearchWarnings(input: {
  query: string;
  results: Array<{ title?: string | undefined; snippet: string; refType: string; refId: string }>;
  retrievalMode: RetrievalMode;
  fallbackReason?: RetrievalFallbackReason | undefined;
}): Array<{ code: string; message: string }> {
  const warnings: Array<{ code: string; message: string }> = [];
  if (input.retrievalMode === "lexical_fallback") {
    warnings.push({
      code: "hybrid_retrieval_fallback",
      message: `Hybrid retrieval failed (${input.fallbackReason ?? "unknown"}); results came from lexical fallback.`,
    });
  }
  if (input.results.length === 0) {
    warnings.push({
      code: "no_retrieval_results",
      message: "No notebook source or wiki rows matched this search query.",
    });
  }
  const requestedSection = extractRequestedSectionNumber(input.query);
  if (requestedSection && input.results.length > 0) {
    const found = input.results.some((result) => resultMentionsSection(result, requestedSection));
    if (!found) {
      warnings.push({
        code: "requested_section_not_found",
        message: `No returned result explicitly matched section ${requestedSection}. Do not claim that section's source content was found unless another tool retrieves it.`,
      });
    }
  }
  return warnings;
}

function extractRequestedSectionNumber(query: string): string | null {
  const match = query.match(/\b(?:section\s*)?(\d+(?:\.\d+){1,4})\b/i);
  return match?.[1] ?? null;
}

function resultMentionsSection(result: { title?: string | undefined; snippet: string }, section: string): boolean {
  const haystack = `${result.title ?? ""}\n${result.snippet}`.toLowerCase();
  return haystack.includes(section.toLowerCase());
}

function logWikiSearchDiagnostic(event: string, payload: Record<string, unknown>): void {
  console.info("[wiki.search.diagnostic]", {
    event,
    ...payload,
    query: typeof payload.query === "string" ? payload.query.slice(0, 240) : payload.query,
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function resolveTutorRetrievalRowsCacheScope(
  appCtx: AppContext,
  input: {
    notebookId: string;
    retrievalMode: TutorContextSelection["retrievalMode"];
    query: string;
    limit: number;
    selectedNodeRefs: Array<{ refType: string; refId: string }>;
    objectivePathConceptIds: string[];
  },
): Promise<{ cacheKey: string; version: string; scopeId: string } | null> {
  let materialVersion: string | null = null;
  try {
    materialVersion = await resolveTutorRetrievalMaterialVersion(appCtx, input.notebookId);
  } catch {
    materialVersion = null;
  }
  if (!materialVersion) return null;

  const version = `tutor-retrieval-rows-v1:${materialVersion}`;
  return {
    version,
    scopeId: input.notebookId,
    cacheKey: buildAgenticCacheKey({
      namespace: TUTOR_RETRIEVAL_ROWS_CACHE_NAMESPACE,
      scopeType: "notebook",
      scopeId: input.notebookId,
      version,
      parts: [
        { retrievalMode: input.retrievalMode },
        { query: normalizeRetrievalQuery(input.query) },
        { limit: input.limit },
        { selectedNodeRefs: input.selectedNodeRefs.map((ref) => `${ref.refType}:${ref.refId}`).sort() },
        { objectivePathConceptIds: [...input.objectivePathConceptIds].sort() },
        { embeddingModel: input.retrievalMode === "hybrid" ? appCtx.env.EMBEDDING_MODEL : null },
        { embeddingDimensions: input.retrievalMode === "hybrid" ? appCtx.env.EMBEDDING_DIMENSIONS ?? null : null },
      ],
    }),
  };
}

async function resolveTutorRetrievalMaterialVersion(
  appCtx: AppContext,
  notebookId: string,
): Promise<string | null> {
  const db = appCtx.db.db as unknown as { execute?: (query: unknown) => Promise<unknown> };
  if (typeof db.execute !== "function") return null;

  const rows = await db.execute(sql`
    select
      greatest(
        coalesce((select max(updated_at) from sources where notebook_id = ${notebookId}), 'epoch'::timestamptz),
        coalesce((select max(created_at) from source_versions where source_id in (select id from sources where notebook_id = ${notebookId})), 'epoch'::timestamptz),
        coalesce((select max(updated_at) from concepts where notebook_id = ${notebookId}), 'epoch'::timestamptz),
        coalesce((select max(updated_at) from claims where notebook_id = ${notebookId}), 'epoch'::timestamptz),
        coalesce((select max(created_at) from graph_relations where notebook_id = ${notebookId}), 'epoch'::timestamptz)
      ) as material_updated_at,
      coalesce(
        (
          select concat(
            count(*)::text,
            ':',
            md5(coalesce(string_agg(
              concat_ws(':',
                c.id,
                c.source_version_id,
                c.chunk_type,
                coalesce(c.token_count::text, ''),
                length(c.text)::text,
                coalesce(c.fts_vector, '')
              ),
              '|' order by c.id
            ), ''))
          )
          from chunks c
          inner join source_versions sv on c.source_version_id = sv.id
          inner join sources s on sv.source_id = s.id
          where s.notebook_id = ${notebookId}
        ),
        '0:'
      ) as chunk_fingerprint
  `);
  const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
  if (!row) return null;
  return [
    toCacheVersionComponent(row.material_updated_at),
    typeof row.chunk_fingerprint === "string" ? row.chunk_fingerprint : "0:",
  ].join(":");
}

async function getTutorRetrievalRowsCacheValue(
  appCtx: AppContext,
  cacheKey: string,
  defaultRetrievalMode: RetrievalMode,
): Promise<TutorRetrievalResult | null> {
  const stopTimer = startMetricTimer();
  try {
    const cached = await getAgenticCacheEntry<TutorRetrievalRowsCacheValue>(appCtx.db, { cacheKey });
    if (!isJsonRecord(cached) || !Array.isArray(cached.rows)) {
      recordAgenticCacheMetric({
        namespace: TUTOR_RETRIEVAL_ROWS_CACHE_NAMESPACE,
        operation: "get",
        outcome: "miss",
        durationMs: stopTimer(),
      });
      return null;
    }
    if (!cached.rows.every(isUnifiedSearchResult)) {
      recordAgenticCacheMetric({
        namespace: TUTOR_RETRIEVAL_ROWS_CACHE_NAMESPACE,
        operation: "get",
        outcome: "miss",
        durationMs: stopTimer(),
      });
      return null;
    }
    recordAgenticCacheMetric({
      namespace: TUTOR_RETRIEVAL_ROWS_CACHE_NAMESPACE,
      operation: "get",
      outcome: "hit",
      durationMs: stopTimer(),
    });
    return {
      rows: cached.rows,
      retrievalMode:
        cached.schemaVersion === 2 && typeof cached.retrievalMode === "string"
          ? cached.retrievalMode
          : defaultRetrievalMode,
      ...(cached.schemaVersion === 2 &&
      typeof cached.fallbackReason === "string" &&
      ["timeout", "http_error", "missing_api_key", "dimension_mismatch", "unknown"].includes(cached.fallbackReason)
        ? { fallbackReason: cached.fallbackReason as RetrievalFallbackReason }
        : {}),
    };
  } catch {
    recordAgenticCacheMetric({
      namespace: TUTOR_RETRIEVAL_ROWS_CACHE_NAMESPACE,
      operation: "get",
      outcome: "error",
      durationMs: stopTimer(),
    });
    return null;
  }
}

async function setTutorRetrievalRowsCacheValue(
  appCtx: AppContext,
  cacheScope: { cacheKey: string; version: string; scopeId: string },
  result: TutorRetrievalResult,
): Promise<void> {
  const stopTimer = startMetricTimer();
  try {
    await setAgenticCacheEntry(appCtx.db, {
      namespace: TUTOR_RETRIEVAL_ROWS_CACHE_NAMESPACE,
      scopeType: "notebook",
      scopeId: cacheScope.scopeId,
      version: cacheScope.version,
      cacheKey: cacheScope.cacheKey,
      ttlMs: TUTOR_RETRIEVAL_ROWS_CACHE_TTL_MS,
      value: {
        schemaVersion: 2,
        rows: result.rows,
        retrievalMode: result.retrievalMode,
        ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
      },
    });
    recordAgenticCacheMetric({
      namespace: TUTOR_RETRIEVAL_ROWS_CACHE_NAMESPACE,
      operation: "set",
      outcome: "success",
      durationMs: stopTimer(),
    });
  } catch {
    recordAgenticCacheMetric({
      namespace: TUTOR_RETRIEVAL_ROWS_CACHE_NAMESPACE,
      operation: "set",
      outcome: "error",
      durationMs: stopTimer(),
    });
    // Cache writes are best-effort; retrieval must remain correct without them.
  }
}

function isUnifiedSearchResult(value: unknown): value is UnifiedSearchResult {
  return (
    isJsonRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.snippet === "string" &&
    typeof value.score === "number" &&
    isJsonRecord(value.scoreDetails) &&
    Array.isArray(value.provenance)
  );
}

function normalizeRetrievalQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").slice(0, 1200);
}

function toCacheVersionComponent(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return "epoch";
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildTutorContextSelectionPlan(input: {
  message?: string;
  selectedNodeRefs: Array<{ refType: string; refId: string }>;
  studyState?: Awaited<ReturnType<typeof loadNotebookStudyState>> | null;
  objectivePathConceptIds?: string[];
  openArtifact?: { id: string; artifactType: string; title: string; status: string } | null;
  previousRuntimeContext?: Record<string, unknown> | null;
}): TutorContextSelectionPlan {
  const objectiveTitle = input.studyState?.studyPlan?.currentObjective?.title ?? null;
  const weakConceptNames = (input.studyState?.studyPlan?.weakConcepts ?? []).map((c) => c.name);
  const weakConcepts = weakConceptNames.join(" ");
  const openArtifactSummary = input.openArtifact
    ? `${input.openArtifact.title} (${input.openArtifact.artifactType}, ${input.openArtifact.status})`
    : null;
  const recentMistakeConceptIds = Array.isArray(input.previousRuntimeContext?.recentMistakeConceptIds)
    ? input.previousRuntimeContext.recentMistakeConceptIds
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .slice(0, 8)
    : [];
  const selectedSourceIds = dedupeStrings(
    input.selectedNodeRefs.filter((ref) => ref.refType === "source").map((ref) => ref.refId),
  );
  const queryParts: string[] = [];
  if (input.message?.trim()) queryParts.push(input.message.trim());
  if (objectiveTitle) queryParts.push(`objective: ${objectiveTitle}`);
  if (weakConcepts) queryParts.push(`weak concepts: ${weakConcepts}`);
  if ((input.objectivePathConceptIds ?? []).length) {
    queryParts.push(`objective path concepts: ${(input.objectivePathConceptIds ?? []).join(", ")}`);
  }
  if (recentMistakeConceptIds.length) {
    queryParts.push(`recent mistakes: ${recentMistakeConceptIds.join(", ")}`);
  }
  if (openArtifactSummary) {
    queryParts.push(`open artifact: ${openArtifactSummary}`);
  }
  if (input.selectedNodeRefs.length) {
    queryParts.push(
      `selected refs: ${input.selectedNodeRefs.map((r) => `${r.refType}:${r.refId}`).join(", ")}`,
    );
  }

  return {
    query: queryParts.join(" | "),
    strategy: input.selectedNodeRefs.length
      ? "selected-nodes-current-objective-weak-concepts-notebook"
      : "objective-weak-concepts-notebook",
    objectiveTitle,
    weakConceptNames,
    selectedNodeRefs: input.selectedNodeRefs,
    selectedSourceIds,
    objectivePathConceptIds: input.objectivePathConceptIds ?? [],
    openArtifactSummary,
    recentMistakeConceptIds,
  };
}

export function filterRowsBySelectedSources<T extends { sourceId?: string | null }>(
  rows: T[],
  selectedSourceIds: string[],
): T[] {
  if (!selectedSourceIds.length) return rows;
  const allowed = new Set(selectedSourceIds);
  return rows.filter((row) => typeof row.sourceId === "string" && allowed.has(row.sourceId));
}

export function resolveScopedRetrievalRows<T extends { sourceId?: string | null }>(
  rows: T[],
  selectedSourceIds: string[],
  sourceScopePolicy: SourceScopePolicy,
): {
  effectiveRows: T[];
  usedSourceScopeFallback: boolean;
  sourceCoverageGap: boolean;
} {
  const scopedRows = filterRowsBySelectedSources(rows, selectedSourceIds);
  const hasSelectedSources = selectedSourceIds.length > 0;
  const usedSourceScopeFallback =
    hasSelectedSources && scopedRows.length === 0 && sourceScopePolicy === "soft_source_scope";
  return {
    effectiveRows: usedSourceScopeFallback ? rows : scopedRows,
    usedSourceScopeFallback,
    sourceCoverageGap: false,
  };
}

export function buildTutorContextSelectionReason(input: {
  plan: TutorContextSelectionPlan;
  maxChunks: number;
  selectedChunkCount: number;
  usedSourceScopeFallback: boolean;
  sourceCoverageGap?: boolean;
  sourceScopePolicy?: SourceScopePolicy;
  sourceIds: string[];
}): string {
  const reasonParts: string[] = [];
  reasonParts.push(
    `Strategy: ${
      input.plan.selectedNodeRefs.length ? "selected nodes first" : "objective/weak concepts first"
    }, then notebook context`,
  );
  if (input.plan.selectedNodeRefs.length) {
    reasonParts.push(
      `Prioritized selected node refs: ${input.plan.selectedNodeRefs
        .map((r) => `${r.refType}:${r.refId}`)
        .join(", ")}`,
    );
  }
  if (input.plan.selectedSourceIds.length) {
    reasonParts.push(
      `Applied selected source scope (${input.sourceScopePolicy ?? "soft_source_scope"}): ${input.plan.selectedSourceIds.join(", ")}`,
    );
  }
  if (input.plan.objectiveTitle) reasonParts.push(`Used current objective: ${input.plan.objectiveTitle}`);
  if (input.plan.weakConceptNames.length) {
    reasonParts.push(`Included weak concepts: ${input.plan.weakConceptNames.join(", ")}`);
  }
  if (input.plan.objectivePathConceptIds.length) {
    reasonParts.push(`Bounded retrieval by objective-path concepts: ${input.plan.objectivePathConceptIds.join(", ")}`);
  }
  if (input.plan.recentMistakeConceptIds.length) {
    reasonParts.push(`Included recent mistake concepts: ${input.plan.recentMistakeConceptIds.join(", ")}`);
  }
  if (input.plan.openArtifactSummary) {
    reasonParts.push(`Included open artifact context: ${input.plan.openArtifactSummary}`);
  }
  if (input.plan.query) reasonParts.push(`Search query: ${input.plan.query}`);
  if (input.usedSourceScopeFallback) {
    reasonParts.push("No rows matched selected source scope; fell back to notebook-wide retrieval");
  }
  if (input.sourceCoverageGap) {
    reasonParts.push("Strict source scope blocked notebook-wide fallback; surfaced a source coverage gap");
  }
  reasonParts.push(
    `Retrieved ${input.selectedChunkCount} chunks (capped at ${input.maxChunks}) across sources: ${
      input.sourceIds.join(", ") || "none"
    }.`,
  );
  return reasonParts.join("; ");
}

function dedupeRefs(refs: Array<{ refType: string; refId: string }>): Array<{ refType: string; refId: string }> {
  const seen = new Set<string>();
  const out: Array<{ refType: string; refId: string }> = [];

  for (const ref of refs) {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }

  return out;
}

async function getChunkSpanById(
  dbClient: DbClient,
  notebookId: string,
  chunkId: string,
): Promise<SourceSpanRow | undefined> {
  const [row] = await dbClient.db
    .select({
      chunkId: chunks.id,
      text: chunks.text,
      sourceId: sources.id,
      sourceTitle: sources.title,
      sourceType: sources.sourceType,
      sourceVersionId: sourceVersions.id,
      pageStart: chunks.pageStart,
      pageEnd: chunks.pageEnd,
      headingPath: chunks.headingPath,
    })
    .from(chunks)
    .innerJoin(sourceVersions, eq(chunks.sourceVersionId, sourceVersions.id))
    .innerJoin(sources, eq(sourceVersions.sourceId, sources.id))
    .where(and(eq(chunks.id, chunkId), eq(sources.notebookId, notebookId)))
    .limit(1);

  return row ?? undefined;
}

async function getChunkSpanBySource(
  dbClient: DbClient,
  notebookId: string,
  input: {
    sourceId?: string;
    sourceVersionId?: string;
    pageStart?: number;
    pageEnd?: number;
  },
): Promise<SourceSpanRow | undefined> {
  const conditions = [eq(sources.notebookId, notebookId), eq(chunks.chunkType, "retrieval")];

  if (input.sourceId) {
    conditions.push(eq(sources.id, input.sourceId));
  }
  if (input.sourceVersionId) {
    conditions.push(eq(sourceVersions.id, input.sourceVersionId));
  }
  if (input.pageStart !== undefined) {
    conditions.push(sql`coalesce(${chunks.pageEnd}, ${chunks.pageStart}, 0) >= ${input.pageStart}`);
  }
  if (input.pageEnd !== undefined) {
    conditions.push(sql`coalesce(${chunks.pageStart}, ${chunks.pageEnd}, 2147483647) <= ${input.pageEnd}`);
  }

  const [row] = await dbClient.db
    .select({
      chunkId: chunks.id,
      text: chunks.text,
      sourceId: sources.id,
      sourceTitle: sources.title,
      sourceType: sources.sourceType,
      sourceVersionId: sourceVersions.id,
      pageStart: chunks.pageStart,
      pageEnd: chunks.pageEnd,
      headingPath: chunks.headingPath,
    })
    .from(chunks)
    .innerJoin(sourceVersions, eq(chunks.sourceVersionId, sourceVersions.id))
    .innerJoin(sources, eq(sourceVersions.sourceId, sources.id))
    .where(and(...conditions))
    .orderBy(desc(sourceVersions.version), asc(chunks.pageStart), asc(chunks.id))
    .limit(1);

  return row ?? undefined;
}

async function getSourceCitationFallback(
  dbClient: DbClient,
  notebookId: string,
  input: { sourceId?: string; sourceVersionId?: string },
): Promise<
  | {
      sourceId: string;
      sourceVersionId?: string;
      sourceTitle: string;
      sourceType: string;
    }
  | undefined
> {
  const sourceConditions = [eq(sources.notebookId, notebookId)];
  if (input.sourceId) {
    sourceConditions.push(eq(sources.id, input.sourceId));
  }

  if (input.sourceVersionId) {
    const [row] = await dbClient.db
      .select({
        sourceId: sources.id,
        sourceVersionId: sourceVersions.id,
        sourceTitle: sources.title,
        sourceType: sources.sourceType,
      })
      .from(sourceVersions)
      .innerJoin(sources, eq(sourceVersions.sourceId, sources.id))
      .where(and(eq(sourceVersions.id, input.sourceVersionId), ...sourceConditions))
      .limit(1);

    return row ?? undefined;
  }

  const [row] = await dbClient.db
    .select({
      sourceId: sources.id,
      sourceTitle: sources.title,
      sourceType: sources.sourceType,
    })
    .from(sources)
    .where(and(...sourceConditions))
    .limit(1);

  return row ?? undefined;
}

async function withNeo4jGraph(
  appCtx: AppContext,
  fn: (session: Neo4jSession) => Promise<GraphPayloadToolOutput>,
): Promise<GraphPayloadToolOutput> {
  if (!appCtx.env.NEO4J_URI || !appCtx.env.NEO4J_PASSWORD) {
    return emptyGraph(["Neo4j is not configured"]);
  }

  const driver = createNeo4jDriver(appCtx.env.NEO4J_URI, appCtx.env.NEO4J_USERNAME, appCtx.env.NEO4J_PASSWORD);
  const session = driver.session();
  try {
    return await fn(session);
  } finally {
    await session.close();
    await driver.close();
  }
}

function emptyGraph(warnings: string[] = []): GraphPayloadToolOutput {
  return { nodes: [], edges: [], warnings };
}

function mergeGraphPayloads(payloads: GraphPayloadToolOutput[]): GraphPayloadToolOutput {
  const nodeMap = new Map<string, GraphPayloadToolOutput["nodes"][number]>();
  const edgeMap = new Map<string, GraphPayloadToolOutput["edges"][number]>();
  const warnings: string[] = [];

  for (const payload of payloads) {
    for (const node of payload.nodes) {
      nodeMap.set(node.id, node);
    }
    for (const edge of payload.edges) {
      edgeMap.set(edge.id, edge);
    }
    warnings.push(...payload.warnings);
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    warnings: dedupeStrings(warnings),
  };
}

function applyGraphFilters(
  payload: GraphPayloadToolOutput,
  relationTypes: string[],
  maxNodes: number,
): GraphPayloadToolOutput {
  const allowed = new Set(relationTypes.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const edges = allowed.size
    ? payload.edges.filter((edge: GraphPayloadToolOutput["edges"][number]) => allowed.has(edge.relationType) || allowed.has(String(edge.metadata.originalRelationType ?? "").toLowerCase()))
    : payload.edges;

  const nodes = payload.nodes.slice(0, maxNodes);
  const allowedNodeIds = new Set(nodes.map((node: GraphPayloadToolOutput["nodes"][number]) => node.id));
  return {
    nodes,
    edges: edges.filter((edge: GraphPayloadToolOutput["edges"][number]) => allowedNodeIds.has(edge.sourceNodeId) && allowedNodeIds.has(edge.targetNodeId)),
    warnings: payload.warnings,
  };
}

function simpleGraphToPayload(
  notebookId: string,
  graph: { nodes: SimpleGraphNode[]; edges: SimpleGraphEdge[] },
): GraphPayloadToolOutput {
  const nodes = graph.nodes.map((node) => {
    const nodeType = normalizeGraphNodeType(node.labels);
    const title = pickNodeTitle(node.props, nodeType, node.id);
    const confidence = asUnitNumber(node.props.confidence);
    const status = typeof node.props.status === "string" ? node.props.status : undefined;

    return {
      id: node.id,
      notebookId,
      nodeType,
      ref: graphNodeRef(nodeType, node.id, title),
      title,
      ...(status ? { status } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      metadata: stripGraphNodeMeta(node.props),
    };
  });

  const edges = graph.edges.map((edge) => {
    const normalized = normalizeGraphRelationType(edge.type);
    const confidence = asUnitNumber(edge.props.confidence);
    const weight = asNumber(edge.props.weight);

    return {
      id: `edge_${edge.startId}_${edge.endId}_${normalized.relationType}`,
      notebookId,
      sourceNodeId: edge.startId,
      targetNodeId: edge.endId,
      relationType: normalized.relationType,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(weight !== undefined ? { weight } : {}),
      metadata: {
        ...(normalized.originalRelationType ? { originalRelationType: normalized.originalRelationType } : {}),
        ...edge.props,
      },
    };
  });

  return { nodes, edges, warnings: [] };
}

function conceptNeighborhoodToPayload(
  notebookId: string,
  neighborhood: Awaited<ReturnType<typeof queryConceptNeighborhood>>,
): GraphPayloadToolOutput {
  if (!neighborhood.center) {
    return emptyGraph(["Concept neighborhood not found"]);
  }

  const nodes = [
    {
      id: neighborhood.center.id,
      notebookId,
      nodeType: "concept" as const,
      ref: graphNodeRef("concept", neighborhood.center.id, neighborhood.center.name),
      title: neighborhood.center.name,
      metadata: { role: "center" },
    },
    ...neighborhood.prerequisites.map((concept) => ({
      id: concept.id,
      notebookId,
      nodeType: "concept" as const,
      ref: graphNodeRef("concept", concept.id, concept.name),
      title: concept.name,
      metadata: { role: "prerequisite" },
    })),
    ...neighborhood.examples.map((concept) => ({
      id: concept.id,
      notebookId,
      nodeType: "concept" as const,
      ref: graphNodeRef("concept", concept.id, concept.name),
      title: concept.name,
      metadata: { role: "example" },
    })),
    ...neighborhood.contradicts.map((concept) => ({
      id: concept.id,
      notebookId,
      nodeType: "concept" as const,
      ref: graphNodeRef("concept", concept.id, concept.name),
      title: concept.name,
      metadata: { role: "contradiction" },
    })),
    ...neighborhood.wikiPages.map((page) => ({
      id: page.id,
      notebookId,
      nodeType: "wiki_page" as const,
      ref: graphNodeRef("wiki_page", page.id, page.title),
      title: page.title,
      metadata: {},
    })),
    ...neighborhood.artifacts.map((artifact) => ({
      id: artifact.id,
      notebookId,
      nodeType: "artifact" as const,
      ref: graphNodeRef("artifact", artifact.id, artifact.title),
      title: artifact.title,
      metadata: {},
    })),
  ];

  const edges = neighborhood.edges.map((edge) => ({
    id: `edge_${edge.startId}_${edge.endId}_${edge.type.toLowerCase()}`,
    notebookId,
    sourceNodeId: edge.startId,
    targetNodeId: edge.endId,
    relationType: normalizeGraphRelationType(edge.type).relationType,
    metadata: { originalRelationType: edge.type },
  }));

  return mergeGraphPayloads([{ nodes, edges, warnings: [] }]);
}

function normalizeGraphNodeType(labels: string[]): GraphNodeType {
  const labelSet = new Set(labels.map((label) => label.toLowerCase()));
  if (labelSet.has("notebook")) return "notebook";
  if (labelSet.has("source")) return "source";
  if (labelSet.has("curriculum")) return "curriculum";
  if (labelSet.has("objective")) return "objective";
  if (labelSet.has("studyplan")) return "study_plan";
  if (labelSet.has("claim")) return "claim";
  if (labelSet.has("wikipage")) return "wiki_page";
  if (labelSet.has("artifact")) return "artifact";
  if (labelSet.has("session") || labelSet.has("tutorsession")) return "tutor_session";
  return "concept";
}

function refTypeForNodeType(
  nodeType: GraphNodeType,
): "notebook" | "source" | "chunk" | "concept" | "claim" | "curriculum" | "objective" | "study_plan" | "wiki_page" | "artifact" | "session" {
  switch (nodeType) {
    case "notebook":
      return "notebook";
    case "source":
      return "source";
    case "study_plan":
      return "study_plan";
    case "concept":
      return "concept";
    case "claim":
      return "claim";
    case "curriculum":
      return "curriculum";
    case "objective":
      return "objective";
    case "wiki_page":
      return "wiki_page";
    case "artifact":
      return "artifact";
    case "source_section":
      return "chunk";
    case "tutor_session":
      return "session";
    case "weak_concept":
      return "concept";
    case "quiz_attempt":
      return "artifact";
    default:
      return "concept";
  }
}

function graphNodeRef(nodeType: GraphNodeType, refId: string, title: string) {
  const trimmedTitle = title.trim();
  return {
    refType: refTypeForNodeType(nodeType),
    refId,
    ...(trimmedTitle ? { handle: trimmedTitle, title: trimmedTitle, label: trimmedTitle } : {}),
  };
}

function normalizeGraphRelationType(type: string): { relationType: GraphRelationType; originalRelationType?: string } {
  switch (type.toUpperCase()) {
    case "DEPENDS_ON":
      return { relationType: "depends_on" };
    case "SUPPORTS":
      return { relationType: "supports" };
    case "CONTRADICTS":
      return { relationType: "contradicts" };
    case "SUPERSEDES":
      return { relationType: "supersedes" };
    case "EXAMPLE_OF":
      return { relationType: "example_of" };
    case "TESTS_MASTERY":
      return { relationType: "tests_mastery" };
    case "REMEDIATES":
      return { relationType: "remediates" };
    case "DERIVED_FROM":
      return { relationType: "derived_from" };
    case "CITES":
      return { relationType: "cites" };
    case "COVERS":
      return { relationType: "covers" };
    case "SIMILAR_TO":
      return { relationType: "similar_to" };
    case "NEXT_OBJECTIVE":
      return { relationType: "next_objective" };
    case "COMPLETED_BY":
      return { relationType: "completed_by" };
    case "CONTAINS":
      return { relationType: "covers", originalRelationType: type };
    default:
      return { relationType: "derived_from", originalRelationType: type };
  }
}

function pickNodeTitle(props: Record<string, unknown>, nodeType: GraphNodeType, fallbackId: string): string {
  const title = typeof props.title === "string" ? props.title : undefined;
  const name = typeof props.name === "string" ? props.name : undefined;
  if (title) return title;
  if (name) return name;
  if (nodeType === "study_plan") return "Live Plan";
  return fallbackId;
}

function stripGraphNodeMeta(props: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, title: _title, name: _name, status: _status, confidence: _confidence, notebookId: _notebookId, ...rest } = props;
  return rest;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asUnitNumber(value: unknown): number | undefined {
  const number = asNumber(value);
  if (number === undefined) return undefined;
  if (number < 0 || number > 1) return undefined;
  return number;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}
