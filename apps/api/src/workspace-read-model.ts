import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  GraphCanvasEdge,
  GraphCanvasNode,
  NodeRef,
  ProjectionHealth,
  SourceWikiTopicGroup,
  WorkspaceGraphReadModel,
  WorkspaceNodeDescriptor,
  WorkspaceVisibility,
} from "@studyagent/schemas";
import { presentSourceWikiCanvas, presentStudyMapCanvas } from "@studyagent/graph";
import {
  buildSourceWikiLearnerView,
  graphRelationSemantics,
  learnerSafeValue,
  pageReadinessLabel,
  type PageReadiness,
} from "@studyagent/schemas";
import { resolvePageReadinessFromWikiPage, topicPageBelongsToSource } from "@studyagent/wiki-core";
import {
  artifacts,
  chunks,
  claims,
  concepts,
  learningState,
  objectiveLists,
  objectives,
  studyPlans,
  toolCalls,
  tutorSessions,
  tutorTurns,
  wikiPages,
} from "@studyagent/db";
import type { AppContext } from "./context.js";
import { learnerVisibilityForArtifact } from "./artifact-lifecycle.js";

export type WorkspaceViewMode = "study_map" | "source_wiki_map";

const LOW_SIGNAL_STUDY_MAP_TYPES = new Set([
  "claim",
  "source_section",
  "coverage_item",
  "coverage_record",
  "objective_list",
]);

const CURRICULUM_ONLY_STUDY_MAP_TYPES = new Set([
  "objective",
  "study_plan",
  "studyplan",
  "objective_list",
  "session_plan",
  "weak_concept",
]);

const LOW_SIGNAL_SOURCE_WIKI_TYPES = new Set([
  "claim",
  "coverage_item",
  "coverage_record",
  "weak_concept",
  "objective_list",
  "session_plan",
]);

const INTERNAL_ARTIFACT_TYPES = new Set([
  "teaching_arc",
  "study_plan",
  "session_plan",
  "session_digest",
]);

const REFERENCE_SURFACE_NODE_TYPES = new Set([
  "source",
  "concept",
  "wiki_page",
  "artifact",
  "curriculum",
  "curriculum_module",
  "objective",
  "session_plan",
  "study_plan",
  "studyplan",
]);

const PAGE_READINESS_NODE_TYPES = new Set([
  "wiki_page",
  "concept",
  "topic",
  "curriculum",
  "curriculum_module",
]);

export type StudyPlanContext = {
  currentObjectiveId: string | null;
  currentModuleId: string | null;
  currentPathConceptIds: string[];
};

export async function loadStudyPlanContext(
  ctx: AppContext,
  notebookId: string,
  userId: string,
  canvas: { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] },
): Promise<StudyPlanContext> {
  const [plan] = await ctx.db.db
    .select({
      currentObjectiveId: studyPlans.currentObjectiveId,
    })
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, notebookId), eq(studyPlans.userId, userId)))
    .limit(1);

  const currentObjectiveId = plan?.currentObjectiveId ?? null;
  let currentModuleId: string | null = null;

  if (currentObjectiveId) {
    const [objective] = await ctx.db.db
      .select({ id: objectives.id })
      .from(objectives)
      .where(and(eq(objectives.notebookId, notebookId), eq(objectives.id, currentObjectiveId)))
      .limit(1);

    if (objective) {
      const lists = await ctx.db.db
        .select({
          moduleId: objectiveLists.moduleId,
          objectiveIdsOrdered: objectiveLists.objectiveIdsOrdered,
        })
        .from(objectiveLists)
        .where(eq(objectiveLists.notebookId, notebookId));

      for (const list of lists) {
        const ids = Array.isArray(list.objectiveIdsOrdered) ? list.objectiveIdsOrdered : [];
        if (ids.includes(currentObjectiveId)) {
          currentModuleId = list.moduleId;
          break;
        }
      }
    }
  }

  const currentPathConceptIds: string[] = [];
  if (currentObjectiveId) {
    for (const edge of canvas.edges) {
      if (edge.source === currentObjectiveId) {
        const target = canvas.nodes.find(
          (node) => node.id === edge.target && node.nodeType === "concept",
        );
        if (target) currentPathConceptIds.push(target.id);
      }
      if (edge.target === currentObjectiveId) {
        const source = canvas.nodes.find(
          (node) => node.id === edge.source && node.nodeType === "concept",
        );
        if (source) currentPathConceptIds.push(source.id);
      }
    }
  }

  return { currentObjectiveId, currentModuleId, currentPathConceptIds };
}

export async function augmentStudyMapCanvas(
  ctx: AppContext,
  notebookId: string,
  userId: string,
  base: { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] },
): Promise<{ nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] }> {
  const nodes = [...base.nodes];
  const edges = [...base.edges];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const learningRows = await ctx.db.db
    .select({
      conceptId: learningState.conceptId,
      masteryScore: learningState.masteryScore,
      confidence: learningState.confidence,
    })
    .from(learningState)
    .where(and(eq(learningState.notebookId, notebookId), eq(learningState.userId, userId)));

  const masteryByConceptId = new Map(learningRows.map((row) => [row.conceptId, row]));
  for (const node of nodes) {
    if (node.nodeType !== "concept") continue;
    const mastery = masteryByConceptId.get(node.id);
    if (!mastery) continue;
    node.properties = {
      ...node.properties,
      masteryScore: mastery.masteryScore,
      learningConfidence: mastery.confidence,
      status:
        mastery.masteryScore < 0.45 ? "weak" : mastery.masteryScore >= 0.75 ? "mastered" : "active",
    };
  }

  const [studyPlan] = await ctx.db.db
    .select({
      id: studyPlans.id,
      weakConceptIds: studyPlans.weakConceptIds,
      currentObjectiveId: studyPlans.currentObjectiveId,
    })
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, notebookId), eq(studyPlans.userId, userId)))
    .limit(1);

  if (studyPlan?.currentObjectiveId) {
    for (const node of nodes) {
      if (node.nodeType !== "objective") continue;
      if (node.id === studyPlan.currentObjectiveId) {
        node.properties = { ...node.properties, status: "current" };
      }
    }
  }

  const recentSessions = await ctx.db.db
    .select({
      id: tutorSessions.id,
      mode: tutorSessions.mode,
      status: tutorSessions.status,
      selectedNodeRefsJson: tutorSessions.selectedNodeRefsJson,
      runtimeContextJson: tutorSessions.runtimeContextJson,
      startedAt: tutorSessions.startedAt,
      endedAt: tutorSessions.endedAt,
    })
    .from(tutorSessions)
    .where(and(eq(tutorSessions.notebookId, notebookId), eq(tutorSessions.userId, userId)))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(8);

  const recentSessionIds = recentSessions.map((session) => session.id);
  const sessionTurns = recentSessionIds.length
    ? await ctx.db.db
        .select({
          sessionId: tutorTurns.sessionId,
          turnIndex: tutorTurns.turnIndex,
          selectedNodeRefsJson: tutorTurns.selectedNodeRefsJson,
          citationRefsJson: tutorTurns.citationRefsJson,
          userMessage: tutorTurns.userMessage,
          assistantMessage: tutorTurns.assistantMessage,
        })
        .from(tutorTurns)
        .where(inArray(tutorTurns.sessionId, recentSessionIds))
    : [];
  const sessionTools = recentSessionIds.length
    ? await ctx.db.db
        .select({
          sessionId: toolCalls.sessionId,
          inputJson: toolCalls.inputJson,
          outputJson: toolCalls.outputJson,
          reducerResultJson: toolCalls.reducerResultJson,
        })
        .from(toolCalls)
        .where(inArray(toolCalls.sessionId, recentSessionIds))
    : [];
  const turnsBySessionId = groupBy(sessionTurns, (turn) => turn.sessionId);
  const toolsBySessionId = groupBy(sessionTools, (tool) => tool.sessionId);
  const sessionRefsById = new Map<string, NodeRef[]>();

  for (const session of recentSessions) {
    const turns = turnsBySessionId.get(session.id) ?? [];
    const turnCount = turns.length;
    const firstPrompt = turns
      .slice()
      .sort((a, b) => a.turnIndex - b.turnIndex)
      .find((turn) => typeof turn.userMessage === "string" && turn.userMessage.trim())?.userMessage;
    if (!nodeMap.has(session.id)) {
      const title =
        typeof firstPrompt === "string" && firstPrompt.trim()
          ? compactSessionTitle(firstPrompt)
          : `Tutor session ${new Date(session.startedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}`;
      const sessionNode: GraphCanvasNode = {
        id: session.id,
        nodeType: "tutor_session",
        labels: ["TutorSession"],
        properties: {
          title,
          mode: session.mode,
          status: session.status,
          startedAt: session.startedAt.toISOString(),
          ...(session.endedAt ? { endedAt: session.endedAt.toISOString() } : {}),
          summary: turnCount ? `${turnCount} ${turnCount === 1 ? "turn" : "turns"}` : null,
        },
      };
      nodes.push(sessionNode);
      nodeMap.set(session.id, sessionNode);
    }

    const runtimeRefs = refsFromRuntimeContext(session.runtimeContextJson);
    const selectedRefs = nodeRefsFromPayload({ selectedNodeRefs: session.selectedNodeRefsJson });
    const turnRefs = turns.flatMap((turn) =>
      nodeRefsFromPayload(
        { selectedNodeRefs: turn.selectedNodeRefsJson },
        { nodeRefs: turn.citationRefsJson },
      ),
    );
    const toolRefs = (toolsBySessionId.get(session.id) ?? []).flatMap((tool) =>
      nodeRefsFromPayload(
        tool.inputJson,
        tool.outputJson ?? undefined,
        tool.reducerResultJson ?? undefined,
      ),
    );
    const refs = uniqueNodeRefs([...runtimeRefs, ...selectedRefs, ...turnRefs, ...toolRefs]).filter(
      (ref) => ref.refType !== "session" || ref.refId !== session.id,
    );
    sessionRefsById.set(session.id, refs);

    for (const ref of refs) {
      const targetId = ref.refId;
      if (!nodeMap.has(targetId)) continue;
      edges.push({
        id: `session-${session.id}-${ref.refType}-${targetId}`,
        source: session.id,
        target: targetId,
        relationType: sessionRelationForRef(ref.refType),
        properties: { refType: ref.refType, projectedBy: "workspace_read_model.session_refs" },
      });
    }
  }

  const recentArtifacts = await ctx.db.db
    .select({
      id: artifacts.id,
      title: artifacts.title,
      artifactType: artifacts.artifactType,
      status: artifacts.status,
      payloadJson: artifacts.payloadJson,
      sourceNodeRefsJson: artifacts.sourceNodeRefsJson,
    })
    .from(artifacts)
    .where(eq(artifacts.notebookId, notebookId))
    .orderBy(desc(artifacts.updatedAt))
    .limit(12);

  const studyPlanNode = nodes.find(
    (node) => node.nodeType === "studyplan" || node.nodeType === "study_plan",
  );
  for (const artifact of recentArtifacts) {
    if (INTERNAL_ARTIFACT_TYPES.has(artifact.artifactType)) continue;
    if (
      learnerVisibilityForArtifact({
        artifactType: artifact.artifactType,
        status: artifact.status,
      }) === "hidden"
    ) {
      continue;
    }
    if (!nodeMap.has(artifact.id)) {
      const artifactNode: GraphCanvasNode = {
        id: artifact.id,
        nodeType: "artifact",
        labels: ["Artifact"],
        properties: {
          title: artifact.title,
          artifactType: artifact.artifactType,
          status: artifact.status,
        },
      };
      nodes.push(artifactNode);
      nodeMap.set(artifact.id, artifactNode);
    }

    const conceptIds = conceptIdsForArtifactPayload(artifact.payloadJson);

    for (const conceptId of conceptIds) {
      if (!nodeMap.has(conceptId)) continue;
      edges.push({
        id: `artifact-${artifact.id}-${conceptId}`,
        source: artifact.id,
        target: conceptId,
        relationType: artifact.artifactType === "quiz" ? "TESTS_MASTERY" : "DERIVED_FROM",
        properties: {},
      });
    }

    const scopedRefs = Array.isArray(artifact.sourceNodeRefsJson)
      ? artifact.sourceNodeRefsJson
      : [];
    const attachedScopeIds = new Set<string>();
    for (const ref of scopedRefs) {
      if (typeof ref !== "object" || ref === null) continue;
      const record = ref as Record<string, unknown>;
      const refId = typeof record.refId === "string" ? record.refId : null;
      const refType = typeof record.refType === "string" ? record.refType : null;
      if (!refId || !nodeMap.has(refId)) continue;
      if (
        ![
          "source",
          "curriculum",
          "curriculum_module",
          "session_plan",
          "session",
          "objective",
          "concept",
        ].includes(refType ?? "")
      )
        continue;
      attachedScopeIds.add(refId);
      edges.push({
        id: `artifact-scope-${artifact.id}-${refId}`,
        source: refId,
        target: artifact.id,
        relationType:
          refType === "objective" || refType === "concept" || refType === "curriculum_module"
            ? "COVERS"
            : "DERIVED_FROM",
        properties: { scope: refType },
      });
    }

    if (studyPlanNode && attachedScopeIds.size === 0) {
      edges.push({
        id: `studyplan-${studyPlanNode.id}-${artifact.id}`,
        source: studyPlanNode.id,
        target: artifact.id,
        relationType: "COMPLETED_BY",
        properties: {},
      });
    }
  }

  for (const [sessionId, refs] of sessionRefsById) {
    for (const ref of refs) {
      if (ref.refType !== "artifact" || !nodeMap.has(ref.refId)) continue;
      edges.push({
        id: `session-${sessionId}-artifact-${ref.refId}`,
        source: sessionId,
        target: ref.refId,
        relationType: "COMPLETED_BY",
        properties: { refType: "artifact", projectedBy: "workspace_read_model.session_artifacts" },
      });
    }
  }

  for (const sessionNode of nodes) {
    if (sessionNode.nodeType !== "session_plan") continue;
    const moduleId =
      typeof sessionNode.properties.moduleId === "string" ? sessionNode.properties.moduleId : null;
    if (!moduleId || !nodeMap.has(moduleId)) continue;
    edges.push({
      id: `module-${moduleId}-session-${sessionNode.id}`,
      source: moduleId,
      target: sessionNode.id,
      relationType: "PLANS",
      properties: { projectedBy: "workspace_read_model.module_session_link" },
    });
  }

  const seenEdgeIds = new Set<string>();
  return {
    nodes,
    edges: edges.filter((edge) => {
      if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return false;
      if (seenEdgeIds.has(edge.id)) return false;
      seenEdgeIds.add(edge.id);
      return true;
    }),
  };
}

function groupBy<T, K extends string>(items: T[], keyFor: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function compactSessionTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}...` : normalized;
}

function refsFromRuntimeContext(value: Record<string, unknown> | null | undefined): NodeRef[] {
  if (!value) return [];
  const refs: NodeRef[] = [];
  const activeSessionPlanId = value.activeSessionPlanId;
  const currentObjectiveId = value.currentObjectiveId;
  if (typeof activeSessionPlanId === "string" && activeSessionPlanId) {
    refs.push({ refType: "session_plan", refId: activeSessionPlanId });
  }
  if (typeof currentObjectiveId === "string" && currentObjectiveId) {
    refs.push({ refType: "objective", refId: currentObjectiveId });
  }
  return refs;
}

function nodeRefsFromPayload(...payloads: Array<Record<string, unknown> | undefined>): NodeRef[] {
  const refs: NodeRef[] = [];
  const push = (refType: NodeRef["refType"], refId: unknown) => {
    if (typeof refId === "string" && refId.trim()) {
      refs.push({ refType, refId });
    }
  };
  for (const payload of payloads) {
    if (!payload) continue;
    for (const key of ["nodeRefs", "selectedNodeRefs", "sourceNodeRefs"] as const) {
      const candidateRefs = payload[key];
      if (!Array.isArray(candidateRefs)) continue;
      for (const ref of candidateRefs) {
        if (!ref || typeof ref !== "object") continue;
        const record = ref as Record<string, unknown>;
        const refType = record.refType;
        const refId = record.refId;
        if (isStudyMapRefType(refType) && typeof refId === "string") {
          refs.push({ refType, refId });
        }
      }
    }
    push("artifact", payload.artifactId);
    push("source", payload.sourceId);
    push("concept", payload.conceptId);
    push("objective", payload.objectiveId);
    push("session_plan", payload.sessionPlanId);
    const insertedArtifactId = payload.insertedArtifactId;
    push("artifact", insertedArtifactId);
  }
  return uniqueNodeRefs(refs);
}

function isStudyMapRefType(value: unknown): value is NodeRef["refType"] {
  return (
    value === "source" ||
    value === "concept" ||
    value === "claim" ||
    value === "curriculum" ||
    value === "curriculum_module" ||
    value === "objective" ||
    value === "session_plan" ||
    value === "study_plan" ||
    value === "wiki_page" ||
    value === "artifact" ||
    value === "session"
  );
}

function sessionRelationForRef(refType: NodeRef["refType"]): string {
  if (refType === "artifact") return "COMPLETED_BY";
  if (refType === "source" || refType === "claim" || refType === "wiki_page") return "CITES";
  if (refType === "session_plan" || refType === "study_plan") return "PLANS";
  return "COVERS";
}

function conceptIdsForArtifactPayload(
  payload: Record<string, unknown> | null | undefined,
): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim().length > 0) ids.add(value);
  };
  const addMany = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const item of value) add(item);
  };
  addMany(payload?.conceptIds);
  add(payload?.conceptId);

  const questions = Array.isArray(payload?.questions) ? payload.questions : [];
  for (const question of questions) {
    if (typeof question !== "object" || question === null) continue;
    const record = question as Record<string, unknown>;
    add(record.conceptId);
    addMany(record.conceptIds);
  }

  const cards = Array.isArray(payload?.cards) ? payload.cards : [];
  for (const card of cards) {
    if (typeof card !== "object" || card === null) continue;
    const record = card as Record<string, unknown>;
    add(record.conceptId);
    addMany(record.conceptIds);
  }

  return [...ids];
}

export function nodeRefForCanvasNode(node: GraphCanvasNode): NodeRef | null {
  const refType = mapCanvasNodeTypeToRefType(node.nodeType);
  if (!refType) return null;
  const title = titleForCanvasNode(node);
  return {
    refType,
    refId: node.id,
    ...(title ? { handle: title, title, label: title } : {}),
  };
}

export function titleForCanvasNode(node: GraphCanvasNode): string | null {
  const candidates = [
    node.properties.title,
    node.properties.name,
    node.properties.canonicalName,
    node.properties.canonical_name,
    node.properties.label,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0 && !isWeakPlanningTitle(trimmed)) return trimmed;
  }
  const fallbackTitleByType: Record<string, string> = {
    objective_list: "Objective sequence",
    session_plan: "Lesson plan",
    study_plan: "Live Plan",
    studyplan: "Live Plan",
    curriculum_module: "Course module",
    curriculum: "Course",
    tutor_session: "Tutor session",
  };
  return fallbackTitleByType[node.nodeType] ?? null;
}

export function mapCanvasNodeTypeToRefType(nodeType: string): NodeRef["refType"] | null {
  const byType: Record<string, NodeRef["refType"]> = {
    source: "source",
    source_section: "source_section",
    topic: "topic",
    concept: "concept",
    weak_concept: "weak_concept",
    claim: "claim",
    curriculum: "curriculum",
    curriculum_module: "curriculum_module",
    objective: "objective",
    objective_list: "objective_list",
    session_plan: "session_plan",
    coverage_item: "coverage_item",
    coverage_record: "coverage_record",
    study_plan: "study_plan",
    studyplan: "study_plan",
    wiki_page: "wiki_page",
    artifact: "artifact",
    tutor_session: "session",
  };
  return byType[nodeType] ?? null;
}

export function workspaceVisibilityForNode(
  viewMode: WorkspaceViewMode,
  node: GraphCanvasNode,
  devMode: boolean,
): WorkspaceVisibility {
  if (devMode) return "learner";

  if (viewMode === "study_map" && CURRICULUM_ONLY_STUDY_MAP_TYPES.has(node.nodeType)) {
    return "hidden";
  }

  if (viewMode === "study_map" && LOW_SIGNAL_STUDY_MAP_TYPES.has(node.nodeType)) {
    return "dev_only";
  }
  if (viewMode === "source_wiki_map" && LOW_SIGNAL_SOURCE_WIKI_TYPES.has(node.nodeType)) {
    return "dev_only";
  }
  if (node.nodeType === "artifact") {
    const artifactType =
      typeof node.properties.artifactType === "string"
        ? node.properties.artifactType
        : typeof node.properties.artifact_type === "string"
          ? node.properties.artifact_type
          : "";
    const status = typeof node.properties.status === "string" ? node.properties.status : "";
    if (INTERNAL_ARTIFACT_TYPES.has(artifactType)) return "hidden";
    if (learnerVisibilityForArtifact({ artifactType, status }) === "hidden") return "hidden";
    return "learner";
  }

  if (
    node.nodeType === "wiki_page" &&
    ["failed", "archived", "rejected"].includes(String(node.properties.status ?? ""))
  ) {
    return "hidden";
  }

  return "learner";
}

export function referenceSurfaceTargetForNode(
  node: GraphCanvasNode,
  visibility: WorkspaceVisibility,
): NodeRef | null {
  if (visibility === "hidden") return null;
  if (!REFERENCE_SURFACE_NODE_TYPES.has(node.nodeType)) return null;
  return nodeRefForCanvasNode(node);
}

export function evidenceAvailableForNode(node: GraphCanvasNode): boolean {
  if (node.nodeType === "concept" || node.nodeType === "wiki_page" || node.nodeType === "source") {
    return true;
  }
  if (node.nodeType === "artifact") {
    const status = typeof node.properties.status === "string" ? node.properties.status : "";
    return status === "ready" || status === "proposed";
  }
  return false;
}

export function nodeEmphasis(
  node: GraphCanvasNode,
  context: StudyPlanContext,
): WorkspaceNodeDescriptor["emphasis"] {
  if (context.currentObjectiveId && node.id === context.currentObjectiveId) {
    return "current_objective";
  }
  if (context.currentModuleId && node.id === context.currentModuleId) {
    return "current_module";
  }
  if (context.currentPathConceptIds.includes(node.id)) {
    return "current_path";
  }
  return "none";
}

type WikiPageRow = {
  id: string;
  pageType: string;
  pageKey: string;
  title: string;
  status: string;
  qualityScore: number | null;
  sourceClaimIds: string[];
  structuredJson: Record<string, unknown>;
};

export async function augmentCanvasWithPageReadiness(
  ctx: AppContext,
  notebookId: string,
  nodes: GraphCanvasNode[],
): Promise<GraphCanvasNode[]> {
  const pageRows = await ctx.db.db
    .select()
    .from(wikiPages)
    .where(eq(wikiPages.notebookId, notebookId));
  const pages = (Array.isArray(pageRows) ? pageRows : []) as WikiPageRow[];
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const pageByKey = new Map(pages.map((page) => [page.pageKey, page]));
  const pageByConceptId = new Map<string, WikiPageRow>();

  for (const page of pages) {
    if (page.pageType !== "concept") continue;
    const conceptId =
      typeof page.structuredJson?.conceptId === "string"
        ? page.structuredJson.conceptId
        : page.pageKey.startsWith("concept:")
          ? page.pageKey.slice("concept:".length)
          : null;
    if (conceptId) pageByConceptId.set(conceptId, page);
  }

  return nodes.map((node) => {
    if (!PAGE_READINESS_NODE_TYPES.has(node.nodeType)) return node;

    let page: WikiPageRow | undefined;
    if (node.nodeType === "wiki_page") {
      page = pageById.get(node.id);
    } else if (node.nodeType === "concept") {
      page = pageByConceptId.get(node.id) ?? pageByKey.get(`concept:${node.id}`);
    } else if (node.nodeType === "curriculum_module") {
      page = pageByKey.get(`module:${node.id}`);
    } else if (node.nodeType === "curriculum") {
      page = pageByKey.get(`curriculum:${node.id}`);
    } else if (node.nodeType === "topic") {
      const title = typeof node.properties.title === "string" ? node.properties.title.trim() : "";
      page = pages.find((candidate) => candidate.pageType === "topic" && candidate.title === title);
    }

    const readiness: PageReadiness = page
      ? resolvePageReadinessFromWikiPage({
          status: page.status,
          qualityScore: page.qualityScore,
          sourceClaimIds: page.sourceClaimIds,
          structuredJson: page.structuredJson,
        })
      : node.nodeType === "curriculum" || node.nodeType === "curriculum_module"
        ? "still_improving"
        : "needs_more_source_support";

    return {
      ...node,
      properties: {
        ...node.properties,
        pageReadiness: readiness,
        pageReadinessLabel: pageReadinessLabel(readiness),
      },
    };
  });
}

export function buildNodeCatalog(
  viewMode: WorkspaceViewMode,
  canvas: { nodes: GraphCanvasNode[] },
  context: StudyPlanContext,
  devMode: boolean,
): WorkspaceNodeDescriptor[] {
  return canvas.nodes.map((node) => {
    const visibility = workspaceVisibilityForNode(viewMode, node, devMode);
    return {
      node: sanitizeLearnerNodeLabel(node),
      visibility,
      referenceSurfaceTarget: referenceSurfaceTargetForNode(node, visibility),
      emphasis: nodeEmphasis(node, context),
      evidenceAvailable: evidenceAvailableForNode(node),
    };
  });
}

export function filterCanvasByVisibility(
  canvas: { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] },
  catalog: WorkspaceNodeDescriptor[],
  devMode: boolean,
): { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] } {
  const visibleIds = new Set(
    catalog
      .filter((entry) => devMode || entry.visibility === "learner")
      .map((entry) => entry.node.id),
  );
  const nodes = catalog.filter((entry) => visibleIds.has(entry.node.id)).map((entry) => entry.node);
  const edges = canvas.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
  return { nodes, edges };
}

export function buildSourceWikiTopicGroups(
  canvas: { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] },
  sourceId: string,
  catalog: WorkspaceNodeDescriptor[],
): SourceWikiTopicGroup[] {
  const visibleById = new Map(catalog.map((entry) => [entry.node.id, entry]));
  const topicPages = canvas.nodes.filter(
    (node) => node.nodeType === "wiki_page" && node.properties.pageType === "topic",
  );

  if (topicPages.length > 0) {
    return topicPages.map((topicPage) => {
      const topicNodeId = findLinkedTopicNodeId(canvas.edges, topicPage.id);
      const topicNode = topicNodeId
        ? (canvas.nodes.find((node) => node.id === topicNodeId && node.nodeType === "topic") ??
          null)
        : null;
      const title =
        typeof topicPage.properties.title === "string" &&
        topicPage.properties.title.trim().length > 0
          ? topicPage.properties.title.trim()
          : typeof topicNode?.properties.title === "string" &&
              topicNode.properties.title.trim().length > 0
            ? topicNode.properties.title.trim()
            : "Ungrouped";

      const conceptIds = uniqueIds(
        canvas.edges
          .filter(
            (edge) =>
              edge.source === topicPage.id &&
              graphRelationSemantics(edge.relationType)?.canonical === "contains_concept",
          )
          .map((edge) => edge.target)
          .filter((id) => visibleById.get(id)?.visibility !== "hidden"),
      );
      const pageIds = uniqueIds(
        canvas.edges
          .filter(
            (edge) =>
              edge.source === topicPage.id &&
              graphRelationSemantics(edge.relationType)?.canonical === "contains_page",
          )
          .map((edge) => edge.target)
          .filter((id) => id !== topicPage.id)
          .filter((id) => visibleById.get(id)?.visibility !== "hidden"),
      );

      const referenceSurfaceTargets = uniqueNodeRefs(
        [...conceptIds, ...pageIds]
          .map((id) => visibleById.get(id))
          .filter((entry): entry is WorkspaceNodeDescriptor =>
            Boolean(entry?.referenceSurfaceTarget),
          )
          .map((entry) => entry.referenceSurfaceTarget!),
      ).slice(0, 8);

      const defaultOpenNodeId = conceptIds[0] ?? pageIds[0] ?? null;
      const evidenceAvailable = [...conceptIds, ...pageIds].some(
        (id) => visibleById.get(id)?.evidenceAvailable,
      );

      return {
        id: topicPage.id,
        title,
        sourceId,
        conceptCount: conceptIds.length,
        pageCount: pageIds.length,
        conceptIds,
        pageIds,
        defaultOpenNodeId,
        evidenceAvailable,
        referenceSurfaceTargets,
      };
    });
  }

  const topicNodes = canvas.nodes.filter((node) => node.nodeType === "topic");

  if (topicNodes.length > 0) {
    return topicNodes.map((topicNode) => {
      const title =
        typeof topicNode.properties.title === "string" &&
        topicNode.properties.title.trim().length > 0
          ? topicNode.properties.title.trim()
          : "Ungrouped";
      const conceptIds = uniqueIds(
        canvas.edges
          .filter(
            (edge) =>
              edge.source === topicNode.id &&
              graphRelationSemantics(edge.relationType)?.canonical === "contains_concept",
          )
          .map((edge) => edge.target)
          .filter((id) => visibleById.get(id)?.visibility !== "hidden"),
      );
      const pageIds = uniqueIds(
        canvas.edges
          .filter(
            (edge) =>
              edge.source === topicNode.id &&
              graphRelationSemantics(edge.relationType)?.canonical === "contains_page",
          )
          .map((edge) => edge.target)
          .filter((id) => visibleById.get(id)?.visibility !== "hidden"),
      );

      const referenceSurfaceTargets = uniqueNodeRefs(
        [...conceptIds, ...pageIds]
          .map((id) => visibleById.get(id))
          .filter((entry): entry is WorkspaceNodeDescriptor =>
            Boolean(entry?.referenceSurfaceTarget),
          )
          .map((entry) => entry.referenceSurfaceTarget!),
      ).slice(0, 8);

      const defaultOpenNodeId = conceptIds[0] ?? pageIds[0] ?? null;
      const evidenceAvailable = [...conceptIds, ...pageIds].some(
        (id) => visibleById.get(id)?.evidenceAvailable,
      );

      return {
        id: topicNode.id,
        title,
        sourceId,
        conceptCount: conceptIds.length,
        pageCount: pageIds.length,
        conceptIds,
        pageIds,
        defaultOpenNodeId,
        evidenceAvailable,
        referenceSurfaceTargets,
      };
    });
  }

  return [];
}

export async function buildStudyMapReadModel(
  ctx: AppContext,
  notebookId: string,
  userId: string,
  canvas: { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] },
  options: {
    devMode: boolean;
    projectionWarning?: string | null;
    projectionHealth?: ProjectionHealth;
  },
): Promise<WorkspaceGraphReadModel & { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] }> {
  const augmented = await augmentStudyMapCanvas(ctx, notebookId, userId, canvas);
  const readinessNodes = await augmentCanvasWithPageReadiness(ctx, notebookId, augmented.nodes);
  const readinessCanvas = { ...augmented, nodes: readinessNodes };
  const context = await loadStudyPlanContext(ctx, notebookId, userId, readinessCanvas);
  const presented = presentStudyMapCanvas(readinessCanvas);
  const nodeCatalog = buildNodeCatalog("study_map", readinessCanvas, context, options.devMode);
  const filtered = filterCanvasByVisibility(presented, nodeCatalog, options.devMode);

  if (context.currentObjectiveId) {
    for (const entry of nodeCatalog) {
      if (entry.node.id !== context.currentObjectiveId) continue;
      entry.node = {
        ...entry.node,
        properties: { ...entry.node.properties, status: "current" },
      };
    }
  }

  return learnerSafeValue(
    {
      viewMode: "study_map",
      devMode: options.devMode,
      emphasis: {
        currentModuleId: context.currentModuleId,
        currentObjectiveId: context.currentObjectiveId,
        currentPathConceptIds: context.currentPathConceptIds,
      },
      nodeCatalog,
      projectionWarning: options.projectionWarning ?? null,
      ...(options.projectionHealth ? { projectionHealth: options.projectionHealth } : {}),
      nodes: filtered.nodes,
      edges: filtered.edges,
    },
    { devMode: options.devMode },
  );
}

export async function buildSourceWikiReadModel(
  ctx: AppContext,
  notebookId: string,
  userId: string,
  canvas: { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] },
  sourceId: string,
  options: {
    devMode: boolean;
    projectionWarning?: string | null;
    projectionHealth?: ProjectionHealth;
  },
): Promise<WorkspaceGraphReadModel & { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] }> {
  const context = await loadStudyPlanContext(ctx, notebookId, userId, canvas);
  const readinessNodes = await augmentCanvasWithPageReadiness(ctx, notebookId, canvas.nodes);
  const presented = presentSourceWikiCanvas({ ...canvas, nodes: readinessNodes });
  const nodeCatalog = buildNodeCatalog("source_wiki_map", presented, context, options.devMode);
  const filtered = filterCanvasByVisibility(presented, nodeCatalog, options.devMode);
  const topics = buildSourceWikiTopicGroups(canvas, sourceId, nodeCatalog);
  const sourceWikiPages = await buildSourceWikiPageViews(
    ctx,
    notebookId,
    sourceId,
    options.devMode,
    options.projectionWarning ?? null,
  );

  return learnerSafeValue(
    {
      viewMode: "source_wiki_map",
      devMode: options.devMode,
      emphasis: {
        currentModuleId: context.currentModuleId,
        currentObjectiveId: context.currentObjectiveId,
        currentPathConceptIds: context.currentPathConceptIds,
      },
      nodeCatalog,
      topics,
      sourceWikiPages,
      projectionWarning: options.projectionWarning ?? null,
      ...(options.projectionHealth ? { projectionHealth: options.projectionHealth } : {}),
      nodes: filtered.nodes,
      edges: filtered.edges,
    },
    { devMode: options.devMode },
  );
}

export async function buildSourceWikiPageViews(
  ctx: AppContext,
  notebookId: string,
  sourceId: string,
  devMode: boolean,
  projectionWarning: string | null,
) {
  const pages = await ctx.db.db
    .select()
    .from(wikiPages)
    .where(eq(wikiPages.notebookId, notebookId));
  const sourceClaimRows = await ctx.db.db
    .select()
    .from(claims)
    .where(and(eq(claims.notebookId, notebookId), eq(claims.sourceId, sourceId)));
  const sourceClaims = Array.isArray(sourceClaimRows) ? sourceClaimRows : [];
  const sourceClaimIds = new Set(sourceClaims.map((claim) => claim.id));
  const sourcePages = (Array.isArray(pages) ? pages : []).filter((page) => {
    if (page.pageType === "source_summary" && page.pageKey === `source:${sourceId}`) return true;
    if (page.pageType === "topic" && topicPageBelongsToSource(page, sourceId)) return true;
    if (page.structuredJson?.bootstrapSourceId === sourceId) return true;
    return page.sourceClaimIds.some((claimId) => sourceClaimIds.has(claimId));
  });
  const claimIds = [...new Set(sourcePages.flatMap((page) => page.sourceClaimIds))];
  const chunkIds = [...new Set(sourcePages.flatMap((page) => page.sourceChunkIds))];
  const claimRows = claimIds.length
    ? sourceClaims.filter((claim) => claimIds.includes(claim.id))
    : [];
  const chunkRows = chunkIds.length
    ? await ctx.db.db
        .select({ id: chunks.id, text: chunks.text })
        .from(chunks)
        .where(inArray(chunks.id, chunkIds))
    : [];
  const excerptByChunkId = new Map(chunkRows.map((chunk) => [chunk.id, chunk.text.slice(0, 360)]));

  return sourcePages.map((page) =>
    buildSourceWikiLearnerView({
      page: { id: page.id, title: page.title, status: page.status, markdown: page.markdown },
      devMode,
      projectionWarning,
      claims: claimRows
        .filter((claim) => page.sourceClaimIds.includes(claim.id))
        .map((claim) => ({
          id: claim.id,
          status: claim.status,
          claimText: claim.claimText,
          confidence: claim.confidence,
          supportScore: claim.supportScore,
          evidence: claim.sourceChunkIds
            .map((chunkId) => ({
              sourceRef: `chunk:${chunkId}`,
              excerpt: excerptByChunkId.get(chunkId) ?? "",
            }))
            .filter((entry) => entry.excerpt.length > 0),
        })),
    }),
  );
}

function topicTitleFromHeading(props: Record<string, unknown>): string {
  const headingPath = props.headingPath;
  if (!Array.isArray(headingPath) || headingPath.length === 0) return "Ungrouped";
  const head = headingPath[0];
  if (typeof head !== "string") return "Ungrouped";
  const trimmed = head.trim();
  return trimmed.length > 0 ? trimmed : "Ungrouped";
}

function slugTopicKey(topic: string): string {
  return (
    topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "ungrouped"
  );
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function uniqueNodeRefs(refs: NodeRef[]): NodeRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findLinkedTopicNodeId(edges: GraphCanvasEdge[], topicPageId: string): string | null {
  const edge = edges.find(
    (entry) =>
      entry.target === topicPageId &&
      graphRelationSemantics(entry.relationType)?.canonical === "contains_page",
  );
  return edge?.source ?? null;
}

function isWeakPlanningTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return (
    /^(objective|module|session)\s+\d+\b/i.test(title) ||
    /\b(current teaching session|active objective list|living study plan)\b/i.test(title) ||
    /^[a-z]+_[a-z0-9_]+$/i.test(title)
  );
}

function sanitizeLearnerNodeLabel(node: GraphCanvasNode): GraphCanvasNode {
  const title = typeof node.properties.title === "string" ? node.properties.title : null;
  const nextTitle = titleForCanvasNode(node);
  if (!nextTitle) return node;
  return {
    ...node,
    properties: {
      ...node.properties,
      title: nextTitle,
      handle: nextTitle,
      displayTitle: nextTitle,
      ...(nextTitle !== title ? { needsReview: true } : {}),
    },
  };
}
