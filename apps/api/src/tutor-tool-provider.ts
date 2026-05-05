import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  chunks,
  curricula,
  events,
  learningState,
  notebooks,
  objectives,
  sourceVersions,
  sources,
  studentProfiles,
  studyPlans,
  wikiPages,
  type DbClient,
} from "@studyagent/db";
import { createNeo4jDriver, queryConceptNeighborhood, querySourceWikiMapSimple, queryStudyMapSimple } from "@studyagent/graph";
import type { GraphRelationType, GraphNodeType } from "@studyagent/schemas";
import {
  embedTextsOpenRouter,
  expandRetrievalChunksWithParents,
  hybridSearchNotebook,
  lexicalSearchNotebook,
  unifiedSearchResultsToWikiRows,
  type HybridSearchContext,
} from "@studyagent/search";
import { ToolError, type GraphPayloadToolOutput, type RuntimeReadToolProvider } from "@studyagent/tools";
import type { AppContext } from "./context.js";
import { loadNotebookStudyState } from "./study-state.js";

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
  retrievalMode: "hybrid" | "lexical";
  maxChunks: number;
  selectedNodeRefs: Array<{ refType: string; refId: string }>;
  objectiveTitle: string | null;
  weakConceptNames: string[];
  selectedChunkIds: string[];
  selectedSourceIds: string[];
  reason: string;
};

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
      const hybridCtx = buildHybridContext(selectedNodeRefs, input.conceptIds);

      let rows;
      if (appCtx.env.OPENROUTER_API_KEY) {
        rows = await hybridSearchNotebook(appCtx.db, notebookId, input.query, limit, buildEmbeddingOptions(appCtx), hybridCtx);
      } else {
        rows = await lexicalSearchNotebook(appCtx.db, notebookId, input.query, limit);
      }

      rows = await expandRetrievalChunksWithParents(appCtx.db, rows);
      return { results: unifiedSearchResultsToWikiRows(rows) };
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
          sourceIds.map((sourceId) => querySourceWikiMapSimple(session, toolCtx.notebookId, sourceId, 80)),
        );

        return mergeGraphPayloads(maps.map((map) => simpleGraphToPayload(toolCtx.notebookId, map)));
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
        .select({ id: objectives.id })
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
      const studyPlan = studyState.studyPlan;
      return {
        studentProfile: studyState.studentProfile
          ? {
              id: studyState.studentProfile.id,
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
              notebookId: toolCtx.notebookId,
              title: studyState.curriculum.title,
              curriculumType: "unknown",
              status: studyState.curriculum.status,
              activeModuleId: studyState.curriculum.activeModuleId,
              sourceIds: [],
              objectiveIds: [],
            }
          : null,
        module: studyState.module
          ? {
              id: studyState.module.id,
              notebookId: toolCtx.notebookId,
              curriculumId: studyState.curriculum?.id ?? "",
              title: studyState.module.title,
              summary: studyState.module.summary,
              orderIndex: 0,
              status: studyState.module.status,
              sourceRefsJson: [],
              targetConceptIds: [],
              prerequisiteModuleIds: [],
              estimatedSessionCount: 1,
              coverageRequirementsJson: {},
              masteryGateJson: {},
              createdAt: new Date(0).toISOString(),
              updatedAt: new Date(0).toISOString(),
            }
          : null,
        objectiveList: studyState.objectiveList
          ? {
              id: studyState.objectiveList.id,
              notebookId: toolCtx.notebookId,
              curriculumId: studyState.curriculum?.id ?? "",
              moduleId: studyState.module?.id ?? "",
              title: studyState.objectiveList.title,
              status: studyState.objectiveList.status,
              currentObjectiveId: studyState.objectiveList.currentObjectiveId,
              objectiveIdsOrdered: studyState.objectiveList.objectiveIdsOrdered,
              coverageSnapshotJson: {},
              createdByRunId: null,
              createdAt: new Date(0).toISOString(),
              updatedAt: new Date(0).toISOString(),
            }
          : null,
        sessionPlan: studyState.sessionPlan
          ? {
              id: studyState.sessionPlan.id,
              notebookId: toolCtx.notebookId,
              curriculumId: studyState.curriculum?.id ?? "",
              moduleId: studyState.module?.id ?? "",
              objectiveListId: studyState.objectiveList?.id ?? "",
              title: studyState.sessionPlan.title,
              status: studyState.sessionPlan.status,
              sessionGoal: studyState.sessionPlan.sessionGoal,
              plannedObjectiveIds: studyState.sessionPlan.plannedObjectiveIds,
              openerJson: {},
              diagnosticQuestionIds: [],
              teachingArcIds: [],
              artifactRefsJson: [],
              exitCriteriaJson: {},
              recommendationReasonJson: {},
              createdByRunId: null,
              createdAt: new Date(0).toISOString(),
              updatedAt: new Date(0).toISOString(),
            }
          : null,
        studyPlan: studyPlan
          ? {
              id: studyPlan.id,
              notebookId: toolCtx.notebookId,
              userId: input.userId ?? toolCtx.userId,
              title: studyPlan.title,
              status: studyPlan.status,
              currentObjectiveId: studyPlan.currentObjective?.id ?? null,
              upcomingObjectiveIds: studyPlan.upcomingObjectives.map((objective) => objective.id),
              completedObjectiveIds: studyPlan.completedObjectives.map((objective) => objective.id),
              weakConceptIds: studyPlan.weakConcepts.map((concept) => concept.id),
            }
          : null,
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

      return {
        conceptStates: rows.map((row) => ({
          conceptId: row.conceptId,
          masteryScore: row.masteryScore,
          confidence: row.confidence,
          nextReviewAt: row.nextReviewAt?.toISOString(),
          misconception: row.misconception ?? null,
        })),
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

export async function selectContextForTutor(
  appCtx: AppContext,
  input: {
    notebookId: string;
    message?: string;
    selectedNodeRefs: Array<{ refType: string; refId: string }>;
    studyState?: Awaited<ReturnType<typeof loadNotebookStudyState>> | null;
    maxChunks?: number;
  },
) {
  const notebookId = input.notebookId;
  const selectedNodeRefs = dedupeRefs(input.selectedNodeRefs ?? []);
  const maxChunks = input.maxChunks ?? 6;

  const objectiveTitle = input.studyState?.studyPlan?.currentObjective?.title ?? "";
  const weakConceptNames = (input.studyState?.studyPlan?.weakConcepts ?? []).map((c) => c.name);
  const weakConcepts = weakConceptNames.join(" ");

  const queryParts: string[] = [];
  if (input.message) queryParts.push(input.message);
  if (objectiveTitle) queryParts.push(`objective: ${objectiveTitle}`);
  if (weakConcepts) queryParts.push(`weak concepts: ${weakConcepts}`);
  if (selectedNodeRefs.length) queryParts.push(`selected refs: ${selectedNodeRefs.map((r) => `${r.refType}:${r.refId}`).join(", ")}`);

  const query = queryParts.filter(Boolean).join(" | ") || "";

  let rows = [] as any[];
  const retrievalMode: TutorContextSelection["retrievalMode"] = appCtx.env.OPENROUTER_API_KEY ? "hybrid" : "lexical";
  try {
    if (retrievalMode === "hybrid") {
      rows = await hybridSearchNotebook(appCtx.db, notebookId, query, maxChunks, buildEmbeddingOptions(appCtx), buildHybridContext(selectedNodeRefs, []));
    } else {
      rows = await lexicalSearchNotebook(appCtx.db, notebookId, query, maxChunks);
    }
    rows = await expandRetrievalChunksWithParents(appCtx.db, rows);
  } catch (err) {
    return {
      strategy: selectedNodeRefs.length ? "selected-nodes-current-objective-weak-concepts-notebook" : "objective-weak-concepts-notebook",
      query,
      retrievalMode,
      maxChunks,
      selectedNodeRefs,
      objectiveTitle: objectiveTitle || null,
      weakConceptNames,
      selectedChunkIds: [],
      selectedSourceIds: [],
      reason: `Failed to run retrieval: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const chunkIds = rows.map((r) => r.id).filter(Boolean);
  const sourceIds = rows.map((r) => r.sourceId).filter(Boolean);

  const reasonParts: string[] = [];
  reasonParts.push(`Strategy: ${selectedNodeRefs.length ? "selected nodes first" : "objective/weak concepts first"}, then notebook context`);
  if (selectedNodeRefs.length) {
    reasonParts.push(`Prioritized selected node refs: ${selectedNodeRefs.map((r) => `${r.refType}:${r.refId}`).join(", ")}`);
  }
  if (objectiveTitle) reasonParts.push(`Used current objective: ${objectiveTitle}`);
  if (weakConcepts) reasonParts.push(`Included weak concepts: ${weakConcepts}`);
  if (query) reasonParts.push(`Search query: ${query}`);
  reasonParts.push(`Retrieved ${chunkIds.length} chunks (capped at ${maxChunks}).`);

  return {
    strategy: selectedNodeRefs.length ? "selected-nodes-current-objective-weak-concepts-notebook" : "objective-weak-concepts-notebook",
    query,
    retrievalMode,
    maxChunks,
    selectedNodeRefs,
    objectiveTitle: objectiveTitle || null,
    weakConceptNames,
    selectedChunkIds: chunkIds,
    selectedSourceIds: Array.from(new Set(sourceIds)),
    reason: reasonParts.join("; "),
  };
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
    ? payload.edges.filter((edge) => allowed.has(edge.relationType) || allowed.has(String(edge.metadata.originalRelationType ?? "").toLowerCase()))
    : payload.edges;

  const nodes = payload.nodes.slice(0, maxNodes);
  const allowedNodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: edges.filter((edge) => allowedNodeIds.has(edge.sourceNodeId) && allowedNodeIds.has(edge.targetNodeId)),
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
      ref: { refType: refTypeForNodeType(nodeType), refId: node.id },
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
      ref: { refType: "concept" as const, refId: neighborhood.center.id },
      title: neighborhood.center.name,
      metadata: { role: "center" },
    },
    ...neighborhood.prerequisites.map((concept) => ({
      id: concept.id,
      notebookId,
      nodeType: "concept" as const,
      ref: { refType: "concept" as const, refId: concept.id },
      title: concept.name,
      metadata: { role: "prerequisite" },
    })),
    ...neighborhood.examples.map((concept) => ({
      id: concept.id,
      notebookId,
      nodeType: "concept" as const,
      ref: { refType: "concept" as const, refId: concept.id },
      title: concept.name,
      metadata: { role: "example" },
    })),
    ...neighborhood.contradicts.map((concept) => ({
      id: concept.id,
      notebookId,
      nodeType: "concept" as const,
      ref: { refType: "concept" as const, refId: concept.id },
      title: concept.name,
      metadata: { role: "contradiction" },
    })),
    ...neighborhood.wikiPages.map((page) => ({
      id: page.id,
      notebookId,
      nodeType: "wiki_page" as const,
      ref: { refType: "wiki_page" as const, refId: page.id },
      title: page.title,
      metadata: {},
    })),
    ...neighborhood.artifacts.map((artifact) => ({
      id: artifact.id,
      notebookId,
      nodeType: "artifact" as const,
      ref: { refType: "artifact" as const, refId: artifact.id },
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
  if (nodeType === "study_plan") return "Study Plan";
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
