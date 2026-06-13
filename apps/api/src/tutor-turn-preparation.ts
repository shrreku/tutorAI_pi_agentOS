import { and, eq } from "drizzle-orm";
import {
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
  wikiPages,
} from "@studyagent/db";
import {
  createRuntimeRun,
  createRuntimeToolRegistry,
  type StudyAgentPromptContext,
} from "@studyagent/agent-runtime";
import { nodeRefSchema, type NodeRef } from "@studyagent/schemas";
import type { TraceContext } from "@studyagent/observability";
import type { AppContext } from "./context.js";
import { createTutorReadToolProvider, type TutorContextSelection } from "./tutor-tool-provider.js";
import { createTutorWriteToolProvider } from "./tutor-write-provider.js";
import type { NotebookStudyState } from "./study-state.js";
import { loadInteractiveLearningTutorContext } from "./interactive-learning-tutor-context.js";
import { loadNotebookStudyState } from "./study-state.js";
import { loadPersonalizationRecommendationsForTutorContext } from "./learner-trait/index.js";
import { getOrCreateTutorSession, resolveTutorSession } from "./tutor-session-store.js";
import { buildIntentRoutingInstruction, detectLearnerIntent } from "./tutor-intent.js";

export { resolveTutorSession } from "./tutor-session-store.js";

export type PreparedTutorTurn = {
  session: Awaited<ReturnType<typeof getOrCreateTutorSession>>["session"];
  sessionId: string;
  studyState: NotebookStudyState;
  openArtifact: { id: string; artifactType: string; title: string; status: string } | null;
  previousRuntimeContext: Record<string, unknown> | null;
  runtimeContextForTurn: Record<string, unknown> | null;
  promptContext: StudyAgentPromptContext;
  contextSelection: TutorContextSelection | null;
  selectedNodeRefs: StudyAgentPromptContext["selectedNodeRefs"];
  isNewSession: boolean;
  run: ReturnType<typeof createRuntimeRun>;
  toolRegistry: ReturnType<typeof createRuntimeToolRegistry>;
};

export async function bootstrapTutorTurn(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    notebookTitle: string;
    message: string;
    activeMode: StudyAgentPromptContext["activeMode"];
    selectedNodeRefs: NodeRef[];
    sourceScopePolicy: "soft_source_scope";
    requestedSessionId?: string;
    correlationContext?: Pick<TraceContext, "traceId" | "requestId" | "traceparent">;
  },
): Promise<PreparedTutorTurn> {
  const selectedNodeRefs = await filterSelectedNodeRefsForNotebook(ctx, input.notebookId, input.selectedNodeRefs);
  const { session, created } = await getOrCreateTutorSession(ctx.db, {
    notebookId: input.notebookId,
    userId: input.userId,
    activeMode: input.activeMode,
    selectedNodeRefs,
    ...(input.requestedSessionId ? { requestedSessionId: input.requestedSessionId } : {}),
  });
  const sessionId = session.id;
  const studyState = await loadNotebookStudyState(ctx.db, input.notebookId, input.userId);
  const openArtifact = await loadSelectedArtifactContext(ctx, input.notebookId, selectedNodeRefs);
  const personalizationRecommendations = await loadPersonalizationRecommendationsForTutorContext(ctx.db, {
    notebookId: input.notebookId,
    userId: input.userId,
  });
  const previousRuntimeContext = isJsonRecord(session.runtimeContextJson) ? session.runtimeContextJson : null;
  const promptContext = buildThinPromptContext({
    notebookId: input.notebookId,
    notebookTitle: input.notebookTitle || "Untitled",
    activeMode: input.activeMode,
    selectedNodeRefs,
    openArtifact,
  });
  promptContext.notebookId = input.notebookId;
  promptContext.userId = input.userId;
  promptContext.sessionId = sessionId;
  promptContext.sourceScopePolicy = input.sourceScopePolicy;

  if (personalizationRecommendations.length) {
    promptContext.personalizationRecommendations = personalizationRecommendations.map((recommendation) => recommendation.recommendation);
    promptContext.additionalInstructions = [
      ...(promptContext.additionalInstructions ?? []),
      "[Personalization Recommendations]",
      ...personalizationRecommendations.map((recommendation) => `- ${recommendation.recommendation}`),
      "Use these as tutor-facing adaptation guidance only. Do not reveal raw inferred trait labels, confidence scores, or evidence IDs to the learner.",
    ];
  }
  const currentObjectiveTitle = studyState.studyPlan?.currentObjective?.title;
  const intentInstruction = buildIntentRoutingInstruction(
    detectLearnerIntent(input.message),
    Boolean(currentObjectiveTitle),
    currentObjectiveTitle,
  );
  if (intentInstruction) {
    promptContext.additionalInstructions = [
      ...(promptContext.additionalInstructions ?? []),
      "[Learner Intent Routing]",
      intentInstruction,
    ];
  }
  if (created) {
    promptContext.additionalInstructions = [
      ...(promptContext.additionalInstructions ?? []),
      "[New session]",
      "This session was just created. Prior chat context is not in memory yet. Re-read the notebook state and any needed sources with tools before relying on assumptions from earlier sessions.",
    ];
  }
  const interactiveLearningLines = await loadInteractiveLearningTutorContext(ctx, {
    notebookId: input.notebookId,
    sessionId,
    limit: 6,
  });
  if (interactiveLearningLines.length > 0) {
    promptContext.additionalInstructions = [
      ...(promptContext.additionalInstructions ?? []),
      "[Submitted Interactive Learning Actions]",
      ...interactiveLearningLines,
      "Use only submitted learner actions above for tutor steering. Do not infer mastery from passive UI interactions.",
    ];
  }
  const run = createRuntimeRun({
    notebookId: input.notebookId,
    sessionId,
    userId: input.userId,
    selectedNodeRefs,
    activeMode: input.activeMode,
    ...(input.correlationContext?.traceId ? { traceId: input.correlationContext.traceId } : {}),
    ...(input.correlationContext?.requestId ? { requestId: input.correlationContext.requestId } : {}),
    ...(input.correlationContext?.traceparent ? { traceparent: input.correlationContext.traceparent } : {}),
    modelConfig: { model: ctx.env.DEFAULT_TUTOR_MODEL },
    budgets: {
      maxToolCalls: ctx.env.TUTOR_MAX_TOOL_CALLS,
      maxContextTokens: 16_000,
    },
  });

  return {
    session,
    sessionId,
    studyState,
    openArtifact,
    previousRuntimeContext,
    runtimeContextForTurn: previousRuntimeContext,
    promptContext,
    contextSelection: null,
    selectedNodeRefs,
    isNewSession: created,
    run,
    toolRegistry: createRuntimeToolRegistry({
      readProvider: createTutorReadToolProvider(ctx),
      writeProvider: createTutorWriteToolProvider(ctx),
    }),
  };
}

export const prepareTutorTurn = bootstrapTutorTurn;

export function buildThinPromptContext(input: {
  notebookId: string;
  notebookTitle: string;
  activeMode: StudyAgentPromptContext["activeMode"];
  selectedNodeRefs: StudyAgentPromptContext["selectedNodeRefs"];
  openArtifact?: { id: string; artifactType: string; title: string; status: string } | null;
}): StudyAgentPromptContext {
  return {
    notebookId: input.notebookId,
    notebookTitle: input.notebookTitle,
    activeMode: input.activeMode,
    selectedNodeRefs: input.selectedNodeRefs,
    sourceScopePolicy: "soft_source_scope",
    openArtifact: input.openArtifact ?? null,
    additionalInstructions: [
      "[Turn Bootstrap]",
      `Notebook ID: ${input.notebookId}`,
      input.selectedNodeRefs.length
        ? `Selected refs: ${input.selectedNodeRefs.map((ref) => `${ref.refType}:${ref.refId}`).join(", ")}`
        : "Selected refs: none",
      ...(input.openArtifact
        ? [
            "[Open Artifact Context]",
            `The learner currently has artifact "${input.openArtifact.title}" (${input.openArtifact.artifactType}, ${input.openArtifact.status}) in focus. Prefer explaining with direct references to this artifact and insert or update artifacts cohesively instead of switching context abruptly.`,
          ]
        : []),
    ],
  };
}

export const createPromptContext = buildThinPromptContext;

export function mergeSelectedNodeRefs(
  baseRefs: StudyAgentPromptContext["selectedNodeRefs"],
  contextSelection?: TutorContextSelection | null,
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
