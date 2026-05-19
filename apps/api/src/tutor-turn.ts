import { and, eq, max } from "drizzle-orm";
import { appendEvent, agentRuns, claims, objectiveLists, objectives, studyPlans, toolCalls, tutorSessions, tutorTurns } from "@studyagent/db";
import {
  classifyRuntimeError,
  compactStudyAgentContext,
  createAgUiEventMapper,
  createRuntimeRun,
  mapPiSessionEventToAppendInput,
  replaceStudyAgentTutorRuntime,
  runStudyAgentTutorSession,
  type AgUiEvent,
  type StudyAgentPromptContext,
} from "@studyagent/agent-runtime";
import { extractValidatedReducerResultForTool } from "@studyagent/tools";
import { combineConfidence, extractClaimIdsFromText, reinforcementSignalFromCount } from "@studyagent/wiki-core";
import type { AppContext } from "./context.js";
import type { TutorContextSelection } from "./tutor-tool-provider.js";
import { shouldCompactTutorContext, shouldEmitDigestDraftUpdate } from "./tutor-turn-helpers.js";
import { buildMasteryRuntimeContextPatch } from "./mastery-session.js";
import { loadNotebookStudyState } from "./study-state.js";

type TutorLogger = {
  info: (data: Record<string, unknown>, message: string) => void;
  warn: (data: Record<string, unknown>, message: string) => void;
  error: (data: Record<string, unknown>, message: string) => void;
};

export type TutorTurnExecutionInput = {
  ctx: AppContext;
  notebookId: string;
  sessionId: string;
  userId: string;
  activeMode: StudyAgentPromptContext["activeMode"];
  selectedNodeRefs: StudyAgentPromptContext["selectedNodeRefs"];
  action: "prompt" | "steer" | "followUp";
  message: string;
  promptContext: StudyAgentPromptContext;
  studyState: Awaited<ReturnType<typeof loadNotebookStudyState>>;
  openArtifact?: { id: string; artifactType: string; title: string; status: string } | null;
  contextSelection?: TutorContextSelection | null;
  previousRuntimeContext?: Record<string, unknown> | null;
  toolRegistry: any;
  emitStreamEvent: (event: AgUiEvent) => void | Promise<void>;
  logger: TutorLogger;
  run?: ReturnType<typeof createRuntimeRun>;
};

export type TutorTurnExecutionResult = {
  sessionId: string;
  runId: string;
  turnId: string;
  status: "completed" | "failed";
  assistantMessage: string;
  toolSummary: Array<{ toolCallId: string; toolName: string; status: string; latencyMs?: number }>;
  artifactProposalIds: string[];
  failure?: { code: string; error: string };
};

export async function executeTutorTurn(input: TutorTurnExecutionInput): Promise<TutorTurnExecutionResult> {
  const run =
    input.run ??
    createRuntimeRun({
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      userId: input.userId,
      selectedNodeRefs: input.selectedNodeRefs,
      activeMode: input.activeMode,
      modelConfig: { model: input.ctx.env.DEFAULT_TUTOR_MODEL },
    });

  await replaceStudyAgentTutorRuntime({ previousSessionId: input.sessionId, nextRun: run });

  const [existingTurn] = await input.ctx.db.db.select({ maxTurnIndex: max(tutorTurns.turnIndex) }).from(tutorTurns).where(eq(tutorTurns.sessionId, input.sessionId));
  const turnIndex = (existingTurn?.maxTurnIndex ?? -1) + 1;
  const turnId = `turn_${crypto.randomUUID().replaceAll("-", "")}`;

  await input.ctx.db.db.insert(tutorTurns).values({
    id: turnId,
    sessionId: input.sessionId,
    turnIndex,
    userMessage: input.message,
    selectedNodeRefsJson: input.selectedNodeRefs as unknown[],
  });

  await input.ctx.db.db.insert(agentRuns).values({
    id: run.runId,
    sessionId: input.sessionId,
    turnId,
    runType: "tutor_turn",
    status: "running",
    modelConfigJson: run.modelConfig,
    budgetJson: run.budgets,
    traceId: run.traceId,
  });

  input.logger.info({ notebookId: input.notebookId, sessionId: input.sessionId, runId: run.runId, turnId, activeMode: input.activeMode }, "tutor run started");

  await input.emitStreamEvent({
    type: "SESSION_STARTED",
    sessionId: input.sessionId,
    runId: run.runId,
    timestamp: Date.now(),
  });

  const agui = createAgUiEventMapper(run);
  const toolSummary: Array<{ toolCallId: string; toolName: string; status: string; latencyMs?: number }> = [];
  const artifactProposalIds: string[] = [];
  let lastAssistantText = "";
  let streamedRunFailure: { error: string; code: string } | undefined;

  try {
    for await (const sessionEvent of runStudyAgentTutorSession({
      run,
      promptContext: input.promptContext,
      userMessage: input.message,
      toolRegistry: input.toolRegistry,
      action: input.action,
      config: {
        ...(input.ctx.env.OPENROUTER_API_KEY ? { providerApiKey: input.ctx.env.OPENROUTER_API_KEY } : {}),
        baseUrl: input.ctx.env.OPENROUTER_BASE_URL,
      },
      onToolLifecycleEvent: async (event) => {
        if (event.phase === "started") {
          await input.ctx.db.db.insert(toolCalls).values({
            id: event.toolCallId,
            runId: run.runId,
            sessionId: input.sessionId,
            turnId,
            toolName: event.toolName,
            sideEffectClass: event.sideEffectClass,
            inputJson: toJsonRecord(event.input),
            status: "started",
          });
          upsertToolSummary(toolSummary, { toolCallId: event.toolCallId, toolName: event.toolName, status: "started" });
          return;
        }

        if (event.phase === "completed") {
          await input.ctx.db.db
            .update(toolCalls)
            .set({
              outputJson: toJsonRecord(event.output),
              status: "completed",
              latencyMs: event.latencyMs,
              reducerResultJson: extractValidatedReducerResultForTool(event.toolName, event.output),
            })
            .where(eq(toolCalls.id, event.toolCallId));
          upsertToolSummary(toolSummary, {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            status: "completed",
            latencyMs: event.latencyMs,
          });
          const artifactId = extractArtifactProposalId(event.output);
          if (artifactId) artifactProposalIds.push(artifactId);
          input.logger.info(
            { notebookId: input.notebookId, sessionId: input.sessionId, runId: run.runId, toolCallId: event.toolCallId, toolName: event.toolName, latencyMs: event.latencyMs },
            "tutor tool completed",
          );
          return;
        }

        await input.ctx.db.db
          .update(toolCalls)
          .set({
            status: "failed",
            latencyMs: event.latencyMs,
            outputJson: { error: event.error, code: event.code, ...(event.details !== undefined ? { details: event.details } : {}) },
          })
          .where(eq(toolCalls.id, event.toolCallId));
        upsertToolSummary(toolSummary, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: "failed",
          latencyMs: event.latencyMs,
        });
        input.logger.warn(
          { notebookId: input.notebookId, sessionId: input.sessionId, runId: run.runId, toolCallId: event.toolCallId, toolName: event.toolName, code: event.code, error: event.error, details: event.details },
          "tutor tool failed",
        );
      },
    })) {
      if (sessionEvent.type === "message_complete") {
        lastAssistantText = sessionEvent.data.text;
      }
      if (sessionEvent.type === "run_error") {
        streamedRunFailure = sessionEvent.data;
      }

      const appendInput = mapPiSessionEventToAppendInput(sessionEvent, run);
      if (appendInput) {
        await appendEvent(input.ctx.db, appendInput);
      }

      for (const chunk of agui.map(sessionEvent)) {
        await input.emitStreamEvent(chunk);
      }
    }

    if (streamedRunFailure) {
      await input.ctx.db.db
        .update(agentRuns)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(agentRuns.id, run.runId));
      await input.ctx.db.db
        .update(tutorTurns)
        .set({ assistantMessage: lastAssistantText || streamedRunFailure.error, toolSummaryJson: { tools: toolSummary } })
        .where(eq(tutorTurns.id, turnId));
      return {
        sessionId: input.sessionId,
        runId: run.runId,
        turnId,
        status: "failed",
        assistantMessage: lastAssistantText || streamedRunFailure.error,
        toolSummary,
        artifactProposalIds,
        failure: streamedRunFailure,
      };
    }

    await reinforceCitedClaims(input.ctx, input.notebookId, [input.message, lastAssistantText]);
    await persistTutorTurnSummary(input.ctx, {
      sessionId: input.sessionId,
      turnId,
      turnIndex,
      runId: run.runId,
      run,
      message: input.message,
      assistantMessage: lastAssistantText,
      selectedNodeRefs: input.selectedNodeRefs,
      promptContext: input.promptContext,
      toolSummary,
      artifactProposalIds,
      contextSelection: input.contextSelection ?? null,
      openArtifact: input.openArtifact ?? null,
      activeSessionPlanId: input.studyState.sessionPlan?.id ?? null,
      currentObjectiveId: input.studyState.studyPlan?.currentObjective?.id ?? null,
      previousRuntimeContext: input.previousRuntimeContext ?? {},
    });

    input.logger.info({ notebookId: input.notebookId, sessionId: input.sessionId, runId: run.runId, status: "completed" }, "tutor run finished");
    return {
      sessionId: input.sessionId,
      runId: run.runId,
      turnId,
      status: "completed",
      assistantMessage: lastAssistantText,
      toolSummary,
      artifactProposalIds,
    };
  } catch (error) {
    const failure = classifyRuntimeError(error);
    input.logger.error({ notebookId: input.notebookId, sessionId: input.sessionId, runId: run.runId, code: failure.code, error: failure.safeMessage }, "tutor run failed");
    await input.ctx.db.db
      .update(agentRuns)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(agentRuns.id, run.runId));
    await input.ctx.db.db
      .update(tutorTurns)
      .set({ assistantMessage: lastAssistantText || failure.safeMessage, toolSummaryJson: { tools: toolSummary } })
      .where(eq(tutorTurns.id, turnId));
    await input.emitStreamEvent({
      type: "RUN_ERROR",
      runId: run.runId,
      model: run.modelConfig.model,
      timestamp: Date.now(),
      error: { message: failure.safeMessage, code: failure.code },
    });
    return {
      sessionId: input.sessionId,
      runId: run.runId,
      turnId,
      status: "failed",
      assistantMessage: lastAssistantText,
      toolSummary,
      artifactProposalIds,
      failure: { code: failure.code, error: failure.safeMessage },
    };
  }
}

async function reinforceCitedClaims(ctx: AppContext, notebookId: string, texts: string[]): Promise<void> {
  const corpus = texts.join("\n");
  const ids = extractClaimIdsFromText(corpus);
  if (!ids.length) return;

  const now = new Date();
  for (const claimId of ids) {
    const [row] = await ctx.db.db.select().from(claims).where(and(eq(claims.id, claimId), eq(claims.notebookId, notebookId))).limit(1);
    if (!row) continue;
    if (row.status === "superseded" || row.status === "deprecated" || row.status === "archived") continue;

    const n = (row.reinforcementCount ?? 0) + 1;
    const prev = (row.confidenceComponentsJson ?? {}) as Record<string, unknown>;
    const components = {
      sourceSupport: Number(prev.sourceSupport ?? 0.72),
      extractionConfidence: Number(prev.extractionConfidence ?? 0.68),
      recency: Number(prev.recency ?? 0.88),
      humanApproval: Number(prev.humanApproval ?? 0),
      contradictionPenalty: Number(prev.contradictionPenalty ?? 0),
      reinforcementSignal: reinforcementSignalFromCount(n),
    };
    const confidence = combineConfidence(components);
    await ctx.db.db
      .update(claims)
      .set({ reinforcementCount: n, confidenceComponentsJson: components, confidence, qualityScore: confidence, updatedAt: now })
      .where(eq(claims.id, claimId));
  }
}

async function persistTutorTurnSummary(
  ctx: AppContext,
  input: {
    sessionId: string;
    turnId: string;
    turnIndex: number;
    runId: string;
    run: ReturnType<typeof createRuntimeRun>;
    message: string;
    assistantMessage: string;
    selectedNodeRefs: Array<{ refType: string; refId: string }>;
    promptContext: StudyAgentPromptContext;
    toolSummary: Array<{ toolCallId: string; toolName: string; status: string; latencyMs?: number }>;
    artifactProposalIds: string[];
    contextSelection?: TutorContextSelection | null;
    openArtifact?: { id: string; artifactType: string; title: string; status: string } | null;
    activeSessionPlanId?: string | null;
    currentObjectiveId?: string | null;
    previousRuntimeContext: Record<string, unknown>;
  },
): Promise<void> {
  const citationIds = extractClaimIdsFromText([input.message, input.assistantMessage].join("\n"));
  const sourceIds = input.selectedNodeRefs.filter((ref) => ref.refType === "source").map((ref) => ref.refId);
  const activeConceptIds = [
    ...new Set([
      ...input.selectedNodeRefs.filter((ref) => ref.refType === "concept").map((ref) => ref.refId),
      ...(input.contextSelection?.objectivePathConceptIds ?? []),
      ...(input.contextSelection?.recentMistakeConceptIds ?? []),
    ]),
  ];

  const compacted = compactStudyAgentContext({
    notebookId: input.run.notebookId,
    activeMode: input.run.activeMode,
    selectedNodeRefs: input.selectedNodeRefs,
    activeConceptIds,
    activeObjectiveIds: [],
    latestLearnerMessage: input.message,
    latestTutorQuestion: input.assistantMessage.includes("?") ? input.assistantMessage : undefined,
    recentCheckpointState: {},
    sourceIds,
    citationIds,
    currentLearningStateSummary: input.promptContext.currentObjective,
    openArtifactProposals: input.artifactProposalIds.map((artifactId) => ({ artifactId })),
  });

  if (input.contextSelection && (input.contextSelection.selectedChunkIds?.length || input.contextSelection.selectedSourceIds?.length)) {
    await appendEvent(ctx.db, {
      notebookId: input.run.notebookId,
      sessionId: input.sessionId,
      runId: input.runId,
      eventType: "session.context.selected",
      payload: {
        strategy: input.contextSelection.strategy,
        query: input.contextSelection.query,
        retrievalMode: input.contextSelection.retrievalMode,
        maxChunks: input.contextSelection.maxChunks,
        selectedNodeRefs: input.contextSelection.selectedNodeRefs,
        selectedChunkIds: input.contextSelection.selectedChunkIds ?? [],
        selectedSourceIds: input.contextSelection.selectedSourceIds ?? [],
        objectiveTitle: input.contextSelection.objectiveTitle,
        weakConceptNames: input.contextSelection.weakConceptNames,
        reason: input.contextSelection.reason ?? null,
      },
    });
  }

  const [existingSession] = await ctx.db.db.select({ runtimeContextJson: tutorSessions.runtimeContextJson }).from(tutorSessions).where(eq(tutorSessions.id, input.sessionId)).limit(1);
  const previousRuntimeContext = isJsonRecord(existingSession?.runtimeContextJson) ? existingSession.runtimeContextJson : {};
  const previousDraft = asDigestDraft(previousRuntimeContext.sessionDigestDraft);
  const nextDraft = {
    summary: input.assistantMessage,
    currentObjective: input.promptContext.currentObjective ?? null,
    studyPlanSummary: input.promptContext.studyPlanSummary ?? null,
    learnerStateSummary: input.promptContext.learnerStateSummary ?? null,
    learnerProgressSummary: input.promptContext.learnerProgressSummary ?? null,
    citationIds,
    sourceIds,
    artifactProposalIds: input.artifactProposalIds,
  };
  const compactionDecision = shouldCompactTutorContext({
    turnIndex: input.turnIndex,
    previousRuntimeContext,
    message: input.message,
    assistantMessage: input.assistantMessage,
    currentObjective: input.promptContext.currentObjective ?? null,
    studyPlanSummary: input.promptContext.studyPlanSummary ?? null,
    learnerStateSummary: input.promptContext.learnerStateSummary ?? null,
    selectedNodeRefs: input.selectedNodeRefs,
    sourceIds,
    citationIds,
    artifactProposalIds: input.artifactProposalIds,
    activeSessionPlanId: input.activeSessionPlanId ?? null,
    openArtifact: input.openArtifact ?? null,
    contextSelection: input.contextSelection ?? null,
    toolSummary: input.toolSummary,
  });
  const compactionEventIds: string[] = [];
  if (compactionDecision.shouldCompact) {
    const compactionStarted = await appendEvent(ctx.db, {
      notebookId: input.run.notebookId,
      sessionId: input.sessionId,
      runId: input.runId,
      eventType: "agent.compaction.started",
      payload: { turnId: input.turnId, turnIndex: input.turnIndex, reasons: compactionDecision.reasons, estimatedChars: compactionDecision.estimatedChars },
    });
    const compactionCompleted = await appendEvent(ctx.db, {
      notebookId: input.run.notebookId,
      sessionId: input.sessionId,
      runId: input.runId,
      eventType: "agent.compaction.completed",
      payload: {
        turnId: input.turnId,
        turnIndex: input.turnIndex,
        reasons: compactionDecision.reasons,
        compressedContext: compacted.compressedContext,
        activeConceptIds: compacted.activeConceptIds,
        sourceIds: compacted.sourceIds,
        citationIds: compacted.citationIds,
      },
    });
    compactionEventIds.push(compactionStarted.id, compactionCompleted.id);
  }

  await ctx.db.db
    .update(tutorTurns)
    .set({
      assistantMessage: input.assistantMessage,
      toolSummaryJson: {
        tools: input.toolSummary,
        compactionEventIds,
        compaction: {
          ran: compactionDecision.shouldCompact,
          reasons: compactionDecision.reasons,
          estimatedChars: compactionDecision.estimatedChars,
        },
        contextSelection: input.contextSelection
          ? {
              strategy: input.contextSelection.strategy,
              query: input.contextSelection.query,
              retrievalMode: input.contextSelection.retrievalMode,
              maxChunks: input.contextSelection.maxChunks,
              selectedNodeRefs: input.contextSelection.selectedNodeRefs,
              objectiveTitle: input.contextSelection.objectiveTitle,
              weakConceptNames: input.contextSelection.weakConceptNames,
              selectedChunkIds: input.contextSelection.selectedChunkIds,
              selectedSourceIds: input.contextSelection.selectedSourceIds,
              sourceScopePolicy: input.contextSelection.sourceScopePolicy,
              usedSourceScopeFallback: input.contextSelection.usedSourceScopeFallback,
              sourceCoverageGap: input.contextSelection.sourceCoverageGap,
              reason: input.contextSelection.reason,
            }
          : null,
      },
      citationRefsJson: citationIds.map((claimId) => ({ refType: "claim", refId: claimId })),
    })
    .where(eq(tutorTurns.id, input.turnId));

  if (compactionDecision.shouldCompact && shouldEmitDigestDraftUpdate(previousDraft, nextDraft)) {
    await appendEvent(ctx.db, {
      notebookId: input.run.notebookId,
      sessionId: input.sessionId,
      ...(input.runId ? { runId: input.runId } : {}),
      eventType: "session.digest.draft.updated",
      payload: { status: "draft", ...nextDraft, turnId: input.turnId },
    });
  }

  await applyDeterministicTutorProgression(ctx, {
    notebookId: input.run.notebookId,
    userId: input.run.userId,
    sessionId: input.sessionId,
    runId: input.runId,
    turnId: input.turnId,
    learnerMessage: input.message,
    assistantMessage: input.assistantMessage,
  });

  await ctx.db.db
    .update(agentRuns)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(agentRuns.id, input.runId));

  const masteryRuntimePatch = buildMasteryRuntimeContextPatch({
    previousRuntimeContext,
    turnId: input.turnId,
    assistantMessage: input.assistantMessage,
    conceptIds: activeConceptIds,
    objectiveId: input.currentObjectiveId ?? null,
  });

  await ctx.db.db
    .update(tutorSessions)
    .set({
      runtimeContextJson: {
        ...masteryRuntimePatch,
        compressedContext: compacted.compressedContext,
        activeConceptIds,
        sourceIds,
        selectedChunkIds: input.contextSelection?.selectedChunkIds ?? [],
        selectedSourceIds: input.contextSelection?.selectedSourceIds ?? [],
        recentMistakeConceptIds: input.contextSelection?.recentMistakeConceptIds ?? [],
        contextSelection: input.contextSelection
          ? {
              strategy: input.contextSelection.strategy,
              query: input.contextSelection.query,
              retrievalMode: input.contextSelection.retrievalMode,
              maxChunks: input.contextSelection.maxChunks,
              selectedNodeRefs: input.contextSelection.selectedNodeRefs,
              objectiveTitle: input.contextSelection.objectiveTitle,
              weakConceptNames: input.contextSelection.weakConceptNames,
              selectedChunkIds: input.contextSelection.selectedChunkIds,
              selectedSourceIds: input.contextSelection.selectedSourceIds,
              recentMistakeConceptIds: input.contextSelection.recentMistakeConceptIds,
              reason: input.contextSelection.reason,
            }
          : null,
        citationIds,
        artifactProposalIds: input.artifactProposalIds,
        currentObjective: input.promptContext.currentObjective,
        activeSessionPlanId: input.activeSessionPlanId ?? null,
        openArtifact: input.openArtifact ?? null,
        studyPlanSummary: input.promptContext.studyPlanSummary ?? null,
        learnerStateSummary: input.promptContext.learnerStateSummary ?? null,
        sessionDigestDraft: { ...nextDraft, updatedAt: new Date().toISOString() },
        lastCompaction: compactionDecision.shouldCompact
          ? { turnIndex: input.turnIndex, runId: input.runId, reasons: compactionDecision.reasons, estimatedChars: compactionDecision.estimatedChars, updatedAt: new Date().toISOString() }
          : isJsonRecord(previousRuntimeContext.lastCompaction)
            ? previousRuntimeContext.lastCompaction
            : null,
        lastRunId: input.runId,
        updatedAt: new Date().toISOString(),
      },
    })
    .where(eq(tutorSessions.id, input.sessionId));
}

async function applyDeterministicTutorProgression(
  ctx: AppContext,
  input: { notebookId: string; userId: string; sessionId: string; runId: string; turnId: string; learnerMessage: string; assistantMessage: string },
): Promise<void> {
  if (!isLearnerConfirmation(input.learnerMessage)) return;
  const state = await loadNotebookStudyState(ctx.db, input.notebookId, input.userId);
  const current = state.studyPlan?.currentObjective;
  if (!state.studyPlan || !current) return;
  if (state.studyPlan.completedObjectives.some((objective) => objective.id === current.id)) return;

  const upcomingIds = state.studyPlan.upcomingObjectives.map((objective) => objective.id);
  const nextObjectiveId = upcomingIds[0] ?? null;
  const completedIds = [...new Set([...state.studyPlan.completedObjectives.map((objective) => objective.id), current.id])];
  const remainingUpcomingIds = upcomingIds.filter((id) => id !== nextObjectiveId);

  await ctx.db.db.update(objectives).set({ status: "completed", updatedAt: new Date() }).where(eq(objectives.id, current.id));
  await ctx.db.db
    .update(studyPlans)
    .set({
      currentObjectiveId: nextObjectiveId,
      upcomingObjectiveIds: remainingUpcomingIds,
      completedObjectiveIds: completedIds,
      progressSummaryJson: {
        lastCompletedObjectiveId: current.id,
        lastCompletedObjectiveTitle: current.title,
        lastProgressTurnId: input.turnId,
        lastAssistantSummary: input.assistantMessage.slice(0, 400),
      },
      updatedAt: new Date(),
    })
    .where(eq(studyPlans.id, state.studyPlan.id));

  if (state.objectiveList?.id) {
    await ctx.db.db.update(objectiveLists).set({ currentObjectiveId: nextObjectiveId, updatedAt: new Date() }).where(eq(objectiveLists.id, state.objectiveList.id));
  }

  await appendEvent(ctx.db, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    runId: input.runId,
    eventType: "objective.completed",
    payload: { objectiveId: current.id, title: current.title, nextObjectiveId, reason: "learner_confirmation" },
  });
  await appendEvent(ctx.db, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    runId: input.runId,
    eventType: "study_plan.updated",
    payload: { studyPlanId: state.studyPlan.id, currentObjectiveId: nextObjectiveId, completedObjectiveIds: completedIds, reason: "deterministic_tutor_progression" },
  });
}

function isLearnerConfirmation(message: string): boolean {
  return /\b(understood|got it|i got this|clear|yes|continue|next|easy|done|makes sense)\b/i.test(message);
}

function asDigestDraft(value: unknown): {
  summary: string | null;
  currentObjective: string | null;
  studyPlanSummary: string | null;
  learnerStateSummary: string | null;
  citationIds: string[];
  sourceIds: string[];
  artifactProposalIds: string[];
} | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" ? record.summary : null,
    currentObjective: typeof record.currentObjective === "string" ? record.currentObjective : null,
    studyPlanSummary: typeof record.studyPlanSummary === "string" ? record.studyPlanSummary : null,
    learnerStateSummary: typeof record.learnerStateSummary === "string" ? record.learnerStateSummary : null,
    citationIds: Array.isArray(record.citationIds) ? record.citationIds.filter((v): v is string => typeof v === "string") : [],
    sourceIds: Array.isArray(record.sourceIds) ? record.sourceIds.filter((v): v is string => typeof v === "string") : [],
    artifactProposalIds: Array.isArray(record.artifactProposalIds) ? record.artifactProposalIds.filter((v): v is string => typeof v === "string") : [],
  };
}

function extractArtifactProposalId(output: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const artifactId = (output as { artifactId?: unknown }).artifactId;
  return typeof artifactId === "string" ? artifactId : undefined;
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : { value };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function upsertToolSummary(
  toolSummary: Array<{ toolCallId: string; toolName: string; status: string; latencyMs?: number }>,
  update: { toolCallId: string; toolName: string; status: string; latencyMs?: number },
): void {
  const index = toolSummary.findIndex((item) => item.toolCallId === update.toolCallId);
  if (index === -1) {
    toolSummary.push(update);
    return;
  }
  toolSummary[index] = { ...toolSummary[index], ...update };
}
