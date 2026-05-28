import { and, desc, eq } from "drizzle-orm";
import {
  appendEvent,
  artifacts,
  claims,
  concepts,
  curricula,
  curriculumModules,
  objectiveLists,
  objectives,
  sessionPlans,
  sources,
  studyPlans,
  tutorSessions,
  wikiPages,
} from "@studyagent/db";
import {
  createRuntimeRun,
  createRuntimeToolRegistry,
  type StudyAgentPromptContext,
} from "@studyagent/agent-runtime";
import { nodeRefSchema, type NodeRef } from "@studyagent/schemas";
import { z } from "zod";
import type { AppContext } from "./context.js";
import { buildIntentRoutingInstruction, detectLearnerIntent } from "./tutor-intent.js";
import { createTutorReadToolProvider, selectContextForTutor, type TutorContextSelection } from "./tutor-tool-provider.js";
import { createTutorWriteToolProvider } from "./tutor-write-provider.js";
import { formatLearnerProgressForDigest } from "./learner-progress.js";
import { formatLearnerStateSummary, formatStudyPlanSummary, loadNotebookStudyState } from "./study-state.js";
import { loadPersonalizationRecommendationsForTutorContext } from "./learner-trait-estimation.js";

export type PreparedTutorTurn = {
  session: Awaited<ReturnType<typeof getOrCreateTutorSession>>;
  sessionId: string;
  studyState: Awaited<ReturnType<typeof loadNotebookStudyState>>;
  openArtifact: { id: string; artifactType: string; title: string; status: string } | null;
  previousRuntimeContext: Record<string, unknown> | null;
  runtimeContextForTurn: Record<string, unknown> | null;
  promptContext: StudyAgentPromptContext;
  contextSelection: TutorContextSelection | null;
  selectedNodeRefs: StudyAgentPromptContext["selectedNodeRefs"];
  run: ReturnType<typeof createRuntimeRun>;
  toolRegistry: ReturnType<typeof createRuntimeToolRegistry>;
};

export async function prepareTutorTurn(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    notebookTitle: string;
    message: string;
    activeMode: StudyAgentPromptContext["activeMode"];
    selectedNodeRefs: NodeRef[];
    sourceScopePolicy: "soft_source_scope" | "strict_source_scope";
    requestedSessionId?: string;
  },
): Promise<PreparedTutorTurn> {
  const selectedNodeRefs = await filterSelectedNodeRefsForNotebook(ctx, input.notebookId, input.selectedNodeRefs);
  const session = await getOrCreateTutorSession(ctx, {
    notebookId: input.notebookId,
    userId: input.userId,
    activeMode: input.activeMode,
    selectedNodeRefs,
    ...(input.requestedSessionId ? { requestedSessionId: input.requestedSessionId } : {}),
  });
  const sessionId = session.id;
  const studyState = await loadNotebookStudyState(ctx.db, input.notebookId, input.userId);
  const openArtifact = await loadSelectedArtifactContext(ctx, input.notebookId, selectedNodeRefs);
  const previousRuntimeContext = isJsonRecord(session.runtimeContextJson) ? session.runtimeContextJson : null;
  const promptContext = createPromptContext({
    notebookTitle: input.notebookTitle || "Untitled",
    activeMode: input.activeMode,
    selectedNodeRefs,
    studyState,
    openArtifact,
    previousRuntimeContext,
  });

  const recommendations = await loadPersonalizationRecommendationsForTutorContext(ctx.db, {
    notebookId: input.notebookId,
    userId: input.userId,
  });
  if (recommendations.length) {
    promptContext.additionalInstructions = [
      ...(promptContext.additionalInstructions ?? []),
      "[Personalization Recommendations]",
      ...recommendations.map((recommendation) => `- ${recommendation.recommendation}`),
      "Use these as tutor-facing adaptation guidance only. Do not reveal raw inferred trait labels, confidence scores, or evidence IDs to the learner.",
    ];
  }

  const intent = detectLearnerIntent(input.message);
  const hasCurrentObjective = studyState?.studyPlan?.currentObjective !== null;
  const currentObjectiveTitle = studyState?.studyPlan?.currentObjective?.title;
  const intentRoutingInstruction = buildIntentRoutingInstruction(intent, hasCurrentObjective, currentObjectiveTitle);
  if (intentRoutingInstruction) {
    promptContext.additionalInstructions = [
      ...(promptContext.additionalInstructions ?? []),
      "[Intent-Based Opener]",
      intentRoutingInstruction,
    ];
  }

  let contextSelection: TutorContextSelection | undefined;
  try {
    contextSelection = await selectContextForTutor(ctx, {
      notebookId: input.notebookId,
      message: input.message,
      selectedNodeRefs,
      studyState,
      openArtifact,
      previousRuntimeContext,
      maxChunks: 6,
      sourceScopePolicy: input.sourceScopePolicy,
    });
    if (input.sourceScopePolicy === "strict_source_scope") {
      promptContext.additionalInstructions = [
        ...(promptContext.additionalInstructions ?? []),
        "[Source scope]",
        "Stay within the selected sources. If support is missing, qualify the answer and surface a source coverage gap instead of inventing source-specific claims.",
      ];
    }
    if (contextSelection?.reason) {
      promptContext.additionalInstructions = [
        ...(promptContext.additionalInstructions ?? []),
        "[Context Selection Reasoning]",
        contextSelection.reason,
      ];
      if (contextSelection.selectedChunkIds?.length) {
        promptContext.additionalInstructions.push(`[Selected chunks] ${contextSelection.selectedChunkIds.join(", ")}`);
      }
    }
  } catch (error) {
    contextSelection = undefined;
    await appendEvent(ctx.db, {
      notebookId: input.notebookId,
      sessionId,
      eventType: "session.context.selection_failed",
      payload: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  const effectiveSelectedNodeRefs = mergeSelectedNodeRefs(selectedNodeRefs, contextSelection);
  promptContext.selectedNodeRefs = effectiveSelectedNodeRefs;
  const run = createRuntimeRun({
    notebookId: input.notebookId,
    sessionId,
    userId: input.userId,
    selectedNodeRefs: effectiveSelectedNodeRefs,
    activeMode: input.activeMode,
    modelConfig: { model: ctx.env.DEFAULT_TUTOR_MODEL },
  });

  return {
    session,
    sessionId,
    studyState,
    openArtifact,
    previousRuntimeContext,
    runtimeContextForTurn: previousRuntimeContext,
    promptContext,
    contextSelection: contextSelection ?? null,
    selectedNodeRefs: effectiveSelectedNodeRefs,
    run,
    toolRegistry: createRuntimeToolRegistry({
      readProvider: createTutorReadToolProvider(ctx),
      writeProvider: createTutorWriteToolProvider(ctx),
    }),
  };
}

async function getOrCreateTutorSession(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    activeMode: "learn" | "practice" | "revise" | "explore" | "wiki_maintenance";
    selectedNodeRefs: Array<{ refType: string; refId: string }>;
    requestedSessionId?: string;
  },
) {
  const existing = await resolveTutorSession(ctx, {
    notebookId: input.notebookId,
    userId: input.userId,
    ...(input.requestedSessionId ? { requestedSessionId: input.requestedSessionId } : {}),
    allowedStatuses: ["active", "paused"],
  });

  if (existing) {
    await ctx.db.db
      .update(tutorSessions)
      .set({
        mode: input.activeMode,
        status: "active",
        selectedNodeRefsJson: input.selectedNodeRefs as unknown[],
        runtimeContextJson: isJsonRecord(existing.runtimeContextJson)
          ? { ...existing.runtimeContextJson, updatedAt: new Date().toISOString() }
          : { updatedAt: new Date().toISOString() },
      })
      .where(eq(tutorSessions.id, existing.id));

    return { ...existing, mode: input.activeMode, status: "active" };
  }

  const sessionId = `sess_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date();
  await ctx.db.db.insert(tutorSessions).values({
    id: sessionId,
    notebookId: input.notebookId,
    userId: input.userId,
    mode: input.activeMode,
    status: "active",
    selectedNodeRefsJson: input.selectedNodeRefs as unknown[],
    runtimeContextJson: {},
    startedAt: now,
  });

  await appendEvent(ctx.db, {
    notebookId: input.notebookId,
    sessionId,
    eventType: "session.started",
    payload: {
      sessionId,
      mode: input.activeMode,
    },
  });

  return {
    id: sessionId,
    notebookId: input.notebookId,
    userId: input.userId,
    mode: input.activeMode,
    status: "active",
    selectedNodeRefsJson: input.selectedNodeRefs,
    runtimeContextJson: {},
    startedAt: now,
    endedAt: null,
  };
}

export async function resolveTutorSession(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    requestedSessionId?: string;
    allowedStatuses: string[];
  },
) {
  if (input.requestedSessionId) {
    const [requested] = await ctx.db.db
      .select()
      .from(tutorSessions)
      .where(
        and(
          eq(tutorSessions.id, input.requestedSessionId),
          eq(tutorSessions.notebookId, input.notebookId),
          eq(tutorSessions.userId, input.userId),
        ),
      )
      .limit(1);
    if (!requested) return null;
    if (requested.notebookId !== input.notebookId || requested.userId !== input.userId) return null;
    return input.allowedStatuses.includes(requested.status) ? requested : null;
  }

  const rows = await ctx.db.db
    .select()
    .from(tutorSessions)
    .where(and(eq(tutorSessions.notebookId, input.notebookId), eq(tutorSessions.userId, input.userId)))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(5);
  return rows.find((row) => input.allowedStatuses.includes(row.status)) ?? null;
}

export function createPromptContext(input: {
  notebookTitle: string;
  activeMode: StudyAgentPromptContext["activeMode"];
  selectedNodeRefs: StudyAgentPromptContext["selectedNodeRefs"];
  studyState: Awaited<ReturnType<typeof loadNotebookStudyState>>;
  openArtifact?: { id: string; artifactType: string; title: string; status: string } | null;
  previousRuntimeContext?: Record<string, unknown> | null;
}): StudyAgentPromptContext {
  const plan = input.studyState.studyPlan;
  const curriculum = input.studyState.curriculum;
  const moduleRow = input.studyState.module;
  const objectiveList = input.studyState.objectiveList;
  const sessionPlan = input.studyState.sessionPlan;
  const studyPlanSummary = formatStudyPlanSummary(input.studyState);
  const learnerStateSummary = formatLearnerStateSummary(input.studyState);
  const learnerProgressSummary = formatLearnerProgressForDigest(input.studyState);

  return {
    notebookTitle: input.notebookTitle,
    activeMode: input.activeMode,
    selectedNodeRefs: input.selectedNodeRefs,
    ...(curriculum ? { curriculumTrackSummary: `${curriculum.title} (${curriculum.status})` } : {}),
    ...(moduleRow ? { moduleSummary: `${moduleRow.title}${moduleRow.summary ? ` · ${moduleRow.summary}` : ""}` } : {}),
    ...(objectiveList
      ? {
          objectiveListSummary: `${objectiveList.title}${objectiveList.currentObjectiveId ? ` · current ${objectiveList.currentObjectiveId}` : ""}`,
        }
      : {}),
    ...(sessionPlan ? { sessionPlanSummary: `${sessionPlan.title}${sessionPlan.sessionGoal ? ` · ${sessionPlan.sessionGoal}` : ""}` } : {}),
    currentObjective: plan?.currentObjective?.title ?? "Explore notebook resources",
    completedObjectivesCount: plan?.completedObjectives.length ?? 0,
    nextObjectives: plan?.upcomingObjectives.slice(0, 2).map((objective) => objective.title) ?? [],
    ...(studyPlanSummary ? { studyPlanSummary } : {}),
    ...(learnerStateSummary ? { learnerStateSummary } : {}),
    ...(learnerProgressSummary ? { learnerProgressSummary } : {}),
    additionalInstructions: [
      "[Host-State Rehydration]",
      "Treat the notebook, curriculum, module, objective, session-plan, learner-state, selected-ref, and artifact-proposal state above as freshly loaded product state for this run. Do not rely on older Pi memory when it conflicts with this host state.",
      ...(input.studyState.studentProfile
        ? [
            "[Student Profile Behavioral Guidance]",
            `Adapt your teaching to the student's profile: ${formatLearnerStateSummary(input.studyState) ?? "no preferences set"}`,
            "Instructions:",
            "- Pace preference: If 'slow', break explanations into smaller steps and check understanding frequently. If 'fast', you may cover more material quickly.",
            "- Depth preference: If 'foundational', focus on core concepts and avoid advanced tangents. If 'advanced', include deeper theoretical connections.",
            "- Example preferences: Include worked examples, analogies, or comparisons according to the student's stated preferences.",
            "- Assessment preference: Adjust quiz difficulty and frequency based on the student's assessment preferences.",
            "- Constraints: Respect time budgets or exam deadlines mentioned in constraints.",
          ]
        : []),
      ...(input.openArtifact
        ? [
            "[Open Artifact Context]",
            `The learner currently has artifact "${input.openArtifact.title}" (${input.openArtifact.artifactType}, ${input.openArtifact.status}) in focus. Prefer explaining with direct references to this artifact and insert or update artifacts cohesively instead of switching context abruptly.`,
          ]
        : []),
      ...(input.previousRuntimeContext && typeof input.previousRuntimeContext.compressedContext === "string"
        ? [
            "[Prior Session Context]",
            `Prior compressed tutoring context: ${String(input.previousRuntimeContext.compressedContext)}`,
          ]
        : []),
      ...(input.previousRuntimeContext && isJsonRecord(input.previousRuntimeContext.sessionDigestDraft)
        ? [
            "[Prior Session Digest Draft]",
            `Use this persisted draft context to maintain continuity: ${JSON.stringify(input.previousRuntimeContext.sessionDigestDraft)}`,
          ]
        : []),
      ...(sessionPlan && sessionPlan.teachingArcTitles.length > 0
        ? [
            "[Active Teaching Arcs]",
            `Prefer this session's teaching arcs when structuring explanation flow and checkpoints: ${sessionPlan.teachingArcTitles.slice(0, 4).join(" | ")}`,
            ...(sessionPlan.teachingArcBlockTypes.length > 0
              ? [`Arc blocks available: ${sessionPlan.teachingArcBlockTypes.join(", ")}. Adapt block emphasis when learner struggles (misconception_warning/checkpoint/transfer_prompt).`]
              : []),
          ]
        : []),
      ...(input.previousRuntimeContext &&
      Array.isArray(input.previousRuntimeContext.recentMistakeConceptIds) &&
      input.previousRuntimeContext.recentMistakeConceptIds.length > 0
        ? [
            "[Arc Adaptation Hook]",
            "Recent mistake concepts are present. Reorder the arc to prioritize misconception repair, concrete example, and checkpoint blocks before moving forward.",
          ]
        : []),
    ],
  };
}

export function mergeSelectedNodeRefs(
  baseRefs: StudyAgentPromptContext["selectedNodeRefs"],
  contextSelection?: TutorContextSelection,
): StudyAgentPromptContext["selectedNodeRefs"] {
  const merged: StudyAgentPromptContext["selectedNodeRefs"] = [...baseRefs];
  const seen = new Set(merged.map((ref) => `${ref.refType}:${ref.refId}`));
  for (const rawRef of contextSelection?.selectedNodeRefs ?? []) {
    const parsed = nodeRefSchema.safeParse(rawRef);
    if (!parsed.success) continue;
    const ref = parsed.data;
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ref);
  }
  for (const chunkId of contextSelection?.selectedChunkIds ?? []) {
    const key = `chunk:${chunkId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ refType: "chunk", refId: chunkId });
  }
  for (const sourceId of contextSelection?.selectedSourceIds ?? []) {
    const key = `source:${sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ refType: "source", refId: sourceId });
  }
  return merged;
}

async function filterSelectedNodeRefsForNotebook(ctx: AppContext, notebookId: string, refs: NodeRef[]): Promise<NodeRef[]> {
  const out: NodeRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) continue;
    if (await selectedNodeRefBelongsToNotebook(ctx, notebookId, ref)) {
      out.push(ref);
      seen.add(key);
    }
  }
  return out;
}

async function selectedNodeRefBelongsToNotebook(ctx: AppContext, notebookId: string, ref: NodeRef): Promise<boolean> {
  const row = await findSelectedNodeRefRow(ctx, ref);
  if (!row) return false;
  return row.notebookId === notebookId;
}

async function findSelectedNodeRefRow(ctx: AppContext, ref: NodeRef): Promise<{ id: string; notebookId: string } | null> {
  const table =
    ref.refType === "source" ? sources
      : ref.refType === "artifact" ? artifacts
        : ref.refType === "claim" ? claims
          : ref.refType === "concept" ? concepts
            : ref.refType === "objective" ? objectives
              : ref.refType === "objective_list" ? objectiveLists
                : ref.refType === "session_plan" ? sessionPlans
                  : ref.refType === "study_plan" ? studyPlans
                    : ref.refType === "curriculum" ? curricula
                      : ref.refType === "curriculum_module" ? curriculumModules
                        : ref.refType === "wiki_page" ? wikiPages
                          : null;
  if (!table) return null;

  const [row] = await ctx.db.db
    .select({ id: table.id, notebookId: table.notebookId })
    .from(table)
    .where(eq(table.id, ref.refId))
    .limit(1);

  return row ?? null;
}

async function loadSelectedArtifactContext(
  ctx: AppContext,
  notebookId: string,
  selectedNodeRefs: Array<{ refType: string; refId: string }>,
): Promise<{ id: string; artifactType: string; title: string; status: string } | null> {
  const artifactRef = selectedNodeRefs.find((ref) => ref.refType === "artifact");
  if (!artifactRef) return null;
  const [artifact] = await ctx.db.db
    .select({ id: artifacts.id, artifactType: artifacts.artifactType, title: artifacts.title, status: artifacts.status })
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactRef.refId), eq(artifacts.notebookId, notebookId)))
    .limit(1);
  return artifact ?? null;
}

export function extractLatestUserMessage(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    if ((message as { role?: unknown }).role !== "user") continue;

    const directContent = (message as { content?: unknown }).content;
    if (typeof directContent === "string" && directContent.trim()) {
      return directContent.trim();
    }

    const parts = (message as { parts?: unknown }).parts;
    if (Array.isArray(parts)) {
      const text = parts
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          if ((part as { type?: unknown }).type !== "text") return "";
          const content = (part as { content?: unknown }).content;
          return typeof content === "string" ? content : "";
        })
        .join("\n")
        .trim();

      if (text) return text;
    }
  }
  return "";
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
