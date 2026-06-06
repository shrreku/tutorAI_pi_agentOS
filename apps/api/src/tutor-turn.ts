import { and, eq, max } from "drizzle-orm";
import { appendEvent, agentRuns, claims, objectiveLists, objectives, studyPlans, toolCalls, tutorSessions, tutorTurns } from "@studyagent/db";
import {
  classifyRuntimeError,
  compactStudyAgentContext,
  createAgUiEventMapper,
  createRuntimeRun,
  buildStudyAgentHostStateSignature,
  disposeStudyAgentTutorSession,
  getStudyAgentTutorRuntimeBinding,
  isRecoverablePiSessionDispatchError,
  mapPiSessionEventToAppendInput,
  replaceStudyAgentTutorRuntime,
  runStudyAgentTutorSession,
  type AgUiEvent,
  type StudyAgentPromptContext,
} from "@studyagent/agent-runtime";
import { extractValidatedReducerResultForTool } from "@studyagent/tools";
import { combineConfidence, extractClaimIdsFromText, reinforcementSignalFromCount } from "@studyagent/wiki-core";
import {
  DurableEventSummaryCollector,
  observeAgenticSpan,
  recordDurableEventMetric,
  startAgenticObservation,
  startMetricTimer,
  type ObservationLike,
  type TraceContext,
} from "@studyagent/observability";
import type { AppContext } from "./context.js";
import { processCompletedTutorTurnLearnerTraitSignals } from "./learner-trait/index.js";
import { extractContextRefsFromToolSummary } from "./mastery-context-refs.js";
import type { TutorContextSelection } from "./tutor-tool-provider.js";
import { shouldCompactTutorContext } from "./tutor-turn-helpers.js";
import {
  buildMasteryRuntimeContextPatch,
  buildMasterySnapshot,
  prepareRuntimeMasteryEvaluation,
  summarizeToolMasteryEvidenceForContext,
} from "./mastery-session.js";
import { loadNotebookStudyState } from "./study-state.js";
import { applyMasteryEvidenceObjectiveProgression } from "./objective-progression.js";
import { loadRehydrationTranscript } from "./pi-session-rehydration.js";

type TutorLogger = {
  info: (data: Record<string, unknown>, message: string) => void;
  warn: (data: Record<string, unknown>, message: string) => void;
  error: (data: Record<string, unknown>, message: string) => void;
};

type TurnToolSummary = {
  toolCallId: string;
  toolName: string;
  status: string;
  latencyMs?: number;
  contextRefs?: Array<{ refType: string; refId: string }>;
  diagnostics?: Record<string, unknown>;
};

function getOriginalRuntimeErrorMessage(details: unknown): string | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const originalMessage = (details as Record<string, unknown>).originalMessage;
  return typeof originalMessage === "string" ? originalMessage : undefined;
}

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
  systemPrompt?: string;
  systemPromptFingerprint?: string;
  studyState: Awaited<ReturnType<typeof loadNotebookStudyState>>;
  openArtifact?: { id: string; artifactType: string; title: string; status: string } | null;
  contextSelection?: TutorContextSelection | null;
  previousRuntimeContext?: Record<string, unknown> | null;
  toolRegistry: any;
  emitStreamEvent: (event: AgUiEvent) => void | Promise<void>;
  logger: TutorLogger;
  run?: ReturnType<typeof createRuntimeRun>;
  correlationContext?: Pick<TraceContext, "traceId" | "requestId" | "traceparent">;
};

export type TutorTurnExecutionResult = {
  sessionId: string;
  runId: string;
  turnId: string;
  status: "completed" | "failed";
  assistantMessage: string;
  toolSummary: TurnToolSummary[];
  artifactProposalIds: string[];
  failure?: { code: string; error: string };
};

export async function executeTutorTurn(input: TutorTurnExecutionInput): Promise<TutorTurnExecutionResult> {
  const durableEventCollector = createDurableEventCollector();
  const run =
    input.run ??
    createRuntimeRun({
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      userId: input.userId,
      selectedNodeRefs: input.selectedNodeRefs,
      activeMode: input.activeMode,
      ...(input.correlationContext?.traceId ? { traceId: input.correlationContext.traceId } : {}),
      ...(input.correlationContext?.requestId ? { requestId: input.correlationContext.requestId } : {}),
      ...(input.correlationContext?.traceparent ? { traceparent: input.correlationContext.traceparent } : {}),
      modelConfig: { model: input.ctx.env.DEFAULT_TUTOR_MODEL },
      budgets: {
        maxToolCalls: input.ctx.env.TUTOR_MAX_TOOL_CALLS,
        maxContextTokens: 16_000,
      },
    });

  const runtimeRun = run.hostStateSignature
    ? run
    : {
        ...run,
        hostStateSignature: buildStudyAgentHostStateSignature(input.promptContext, {
          promptTemplateVersion: input.systemPromptFingerprint
            ? `${run.modelConfig.promptTemplateVersion}:${input.systemPromptFingerprint}`
            : run.modelConfig.promptTemplateVersion,
        }),
      };

  const previousBinding = getStudyAgentTutorRuntimeBinding(input.sessionId);
  const replacement = await replaceStudyAgentTutorRuntime({ previousSessionId: input.sessionId, nextRun: runtimeRun });

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
    id: runtimeRun.runId,
    sessionId: input.sessionId,
    turnId,
    runType: "tutor_turn",
    status: "running",
    modelConfigJson: {
      ...runtimeRun.modelConfig,
      ...(runtimeRun.managedPrompt ? { managedPrompt: runtimeRun.managedPrompt } : {}),
    },
    budgetJson: runtimeRun.budgets,
    traceId: runtimeRun.traceId,
  });

  if (replacement?.replaced) {
    await appendEvent(input.ctx.db, {
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      runId: runtimeRun.runId,
      eventType: "session.runtime.replaced",
      payload: {
        reason: replacement.binding?.reason ?? "unknown",
        disposedSessionId: replacement.disposedSessionId,
        previousHostStateSignature: previousBinding?.hostStateSignature ?? null,
        hostStateSignature: replacement.binding?.hostStateSignature ?? runtimeRun.hostStateSignature,
      },
    });
  }

  let runtimeContextForTurn = input.previousRuntimeContext ?? {};
  try {
    const runtimeEvaluation = await prepareRuntimeMasteryEvaluation(input.ctx, {
      notebookId: input.notebookId,
      userId: input.userId,
      sessionId: input.sessionId,
      runId: runtimeRun.runId,
      learnerMessage: input.message,
      runtimeContext: input.previousRuntimeContext ?? null,
      masterySnapshot: await buildMasterySnapshot(input.ctx.db, input.notebookId, input.userId),
      sourceRefs: input.selectedNodeRefs.filter((ref) => ref.refType === "source"),
    });
    runtimeContextForTurn = runtimeEvaluation.evaluated ? runtimeEvaluation.runtimeContext : runtimeContextForTurn;
  } catch (error) {
    await appendEvent(input.ctx.db, {
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      runId: runtimeRun.runId,
      eventType: "learning.mastery_evaluation.failed",
      payload: {
        message: error instanceof Error ? error.message : String(error),
        phase: "runtime_auto",
      },
    });
  }

  const correlationFields = correlationLogFields(runtimeRun);
  const turnStartedAt = Date.now();
  input.logger.info(
    {
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      runId: runtimeRun.runId,
      turnId,
      activeMode: input.activeMode,
      modelTimeoutMs: input.ctx.env.TUTOR_MODEL_TIMEOUT_MS,
      maxToolCalls: runtimeRun.budgets.maxToolCalls,
      ...correlationFields,
    },
    "tutor run started",
  );

  await input.emitStreamEvent({
    type: "SESSION_STARTED",
    sessionId: input.sessionId,
    runId: runtimeRun.runId,
    timestamp: Date.now(),
  });

  const agui = createAgUiEventMapper(runtimeRun);
  const toolSummary: TurnToolSummary[] = [];
  const toolObservations = new Map<string, ObservationLike>();
  const artifactProposalIds: string[] = [];
  const completedAssistantMessages: string[] = [];
  let lastAssistantText = "";
  let streamedRunFailure: { error: string; code: string; retryable?: boolean; details?: Record<string, unknown> } | undefined;
  let initialMessages = getStudyAgentTutorRuntimeBinding(input.sessionId)
    ? undefined
    : await loadRehydrationTranscript(
        input.ctx.db,
        input.sessionId,
        input.ctx.env.TUTOR_REHYDRATE_TURN_LIMIT ?? 5,
      );
  let sessionRetried = false;

  try {
    await observeAgenticSpan(
      "model.run",
      {
        input: {
          action: input.action,
          userMessage: input.message,
        },
        model: runtimeRun.modelConfig.model,
        modelParameters: {
          temperature: runtimeRun.modelConfig.temperature,
          topP: runtimeRun.modelConfig.topP,
          maxOutputTokens: runtimeRun.modelConfig.maxOutputTokens,
        },
        ...(runtimeRun.managedPrompt?.version
          ? {
              prompt: {
                name: runtimeRun.managedPrompt.name,
                version: runtimeRun.managedPrompt.version,
                isFallback: runtimeRun.managedPrompt.isFallback,
              },
            }
          : {}),
        metadata: {
          notebookId: input.notebookId,
          sessionId: input.sessionId,
          runId: runtimeRun.runId,
          turnId,
          managedPrompt: runtimeRun.managedPrompt ?? null,
          modelTimeoutMs: input.ctx.env.TUTOR_MODEL_TIMEOUT_MS,
          maxToolCalls: runtimeRun.budgets.maxToolCalls,
        },
      },
      async (modelObservation) => {
        sessionLoop: while (true) {
          for await (const sessionEvent of runStudyAgentTutorSession({
          run: runtimeRun,
          turnId,
          promptContext: input.promptContext,
          ...(initialMessages?.length ? { initialMessages } : {}),
          ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
          userMessage: input.message,
          toolRegistry: input.toolRegistry,
          action: input.action,
          config: {
            ...(input.ctx.env.OPENROUTER_API_KEY ? { providerApiKey: input.ctx.env.OPENROUTER_API_KEY } : {}),
            baseUrl: input.ctx.env.OPENROUTER_BASE_URL,
            modelTimeoutMs: input.ctx.env.TUTOR_MODEL_TIMEOUT_MS,
          },
          onToolLifecycleEvent: async (event) => {
            if (event.phase === "started") {
              toolObservations.set(
                event.toolCallId,
                startAgenticObservation("tool.call", {
                  input: {
                    toolName: event.toolName,
                    args: event.input,
                  },
                  metadata: {
                    notebookId: input.notebookId,
                    sessionId: input.sessionId,
                    runId: runtimeRun.runId,
                    turnId,
                    sideEffectClass: event.sideEffectClass,
                  },
                }),
              );
              await input.ctx.db.db.insert(toolCalls).values({
                id: event.toolCallId,
                runId: runtimeRun.runId,
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
              finishToolObservation(toolObservations, event.toolCallId, {
                output: { status: "completed", latencyMs: event.latencyMs, result: event.output },
              });
              {
                const completedSummary: TurnToolSummary = {
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  status: "completed",
                  latencyMs: event.latencyMs,
                };
                const contextRefs = extractToolContextRefs(event.toolName, event.output);
                if (contextRefs) completedSummary.contextRefs = contextRefs;
                const diagnostics = extractToolDiagnostics(event.toolName, event.output);
                if (diagnostics) completedSummary.diagnostics = diagnostics;
                upsertToolSummary(toolSummary, completedSummary);
              }
              if (event.toolName === "learning.evaluate_response") {
                const masteryPatch = summarizeToolMasteryEvidenceForContext(event.input, event.output);
                if (masteryPatch) {
                  const objectiveId =
                    ("objectiveId" in masteryPatch && typeof masteryPatch.objectiveId === "string"
                      ? masteryPatch.objectiveId
                      : null)
                    ?? input.studyState.studyPlan?.currentObjective?.id
                    ?? null;
                  runtimeContextForTurn = {
                    ...runtimeContextForTurn,
                    lastRuntimeMasteryEvidence: objectiveId ? { ...masteryPatch, objectiveId } : masteryPatch,
                    lastRuntimeMasteryEvaluationAt: new Date().toISOString(),
                  };
                }
              }
              const artifactId = extractArtifactProposalId(event.output);
              if (artifactId) artifactProposalIds.push(artifactId);
              input.logger.info(
                { notebookId: input.notebookId, sessionId: input.sessionId, runId: runtimeRun.runId, toolCallId: event.toolCallId, toolName: event.toolName, latencyMs: event.latencyMs, ...correlationFields },
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
            finishToolObservation(toolObservations, event.toolCallId, {
              level: "ERROR",
              statusMessage: event.error,
              output: { status: "failed", code: event.code, error: event.error, latencyMs: event.latencyMs },
            });
            upsertToolSummary(toolSummary, {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              status: "failed",
              latencyMs: event.latencyMs,
            });
            input.logger.warn(
              {
                notebookId: input.notebookId,
                sessionId: input.sessionId,
                runId: runtimeRun.runId,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                code: event.code,
                error: event.error,
                details: event.details,
                ...(getOriginalRuntimeErrorMessage(event.details) ? { originalMessage: getOriginalRuntimeErrorMessage(event.details) } : {}),
                ...correlationFields,
              },
              "tutor tool failed",
            );
          },
        })) {
          if (sessionEvent.type === "message_complete") {
            lastAssistantText = sessionEvent.data.text;
            completedAssistantMessages.push(sessionEvent.data.text);
            modelObservation.update({ output: { text: sessionEvent.data.text, stopReason: sessionEvent.data.stopReason } });
          }
          if (sessionEvent.type === "run_complete") {
            modelObservation.update({
              usageDetails: usageDetailsFromRuntimeUsage(sessionEvent.data.usage),
              output: { status: "completed", runId: sessionEvent.data.runId },
            });
          }
          if (sessionEvent.type === "run_error") {
            streamedRunFailure = sessionEvent.data;
            const originalMessage = getOriginalRuntimeErrorMessage(sessionEvent.data.details) ?? sessionEvent.data.error;
            const shouldRetrySession =
              !sessionRetried
              && (sessionEvent.data.retryable || isRecoverablePiSessionDispatchError(new Error(originalMessage)))
              && toolSummary.length === 0;
            if (shouldRetrySession) {
              sessionRetried = true;
              streamedRunFailure = undefined;
              await disposeStudyAgentTutorSession(input.sessionId);
              initialMessages = await loadRehydrationTranscript(
                input.ctx.db,
                input.sessionId,
                input.ctx.env.TUTOR_REHYDRATE_TURN_LIMIT ?? 5,
              );
              input.logger.warn(
                {
                  notebookId: input.notebookId,
                  sessionId: input.sessionId,
                  runId: runtimeRun.runId,
                  turnId,
                  code: sessionEvent.data.code,
                  originalMessage,
                  ...correlationFields,
                },
                "retrying tutor session after recoverable runtime dispatch failure",
              );
              continue sessionLoop;
            }
            modelObservation.update({
              level: "ERROR",
              statusMessage: sessionEvent.data.error,
              output: {
                status: "failed",
                code: sessionEvent.data.code,
                error: sessionEvent.data.error,
                retryable: sessionEvent.data.retryable ?? false,
                toolCount: toolSummary.length,
                completedToolCount: toolSummary.filter((tool) => tool.status === "completed").length,
                failedToolCount: toolSummary.filter((tool) => tool.status === "failed").length,
                ...(sessionEvent.data.details ?? {}),
              },
            });
          }

          const appendInput = mapPiSessionEventToAppendInput(sessionEvent, runtimeRun);
          if (appendInput) {
            await appendObservedEvent(input.ctx, appendInput, durableEventCollector);
          }

          for (const chunk of agui.map(sessionEvent)) {
            await input.emitStreamEvent(chunk);
          }
        }
        break sessionLoop;
        }
      },
    );

    if (streamedRunFailure) {
      input.logger.warn(
        {
          notebookId: input.notebookId,
          sessionId: input.sessionId,
          runId: runtimeRun.runId,
          turnId,
          code: streamedRunFailure.code,
          error: streamedRunFailure.error,
          durationMs: Date.now() - turnStartedAt,
          toolCount: toolSummary.length,
          completedToolCount: toolSummary.filter((tool) => tool.status === "completed").length,
          failedToolCount: toolSummary.filter((tool) => tool.status === "failed").length,
          modelTimeoutMs: input.ctx.env.TUTOR_MODEL_TIMEOUT_MS,
          maxToolCalls: runtimeRun.budgets.maxToolCalls,
          failureDetails: streamedRunFailure.details ?? null,
          ...correlationFields,
        },
        "tutor run failed",
      );
      await input.ctx.db.db
        .update(agentRuns)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(agentRuns.id, runtimeRun.runId));
      await input.ctx.db.db
        .update(tutorTurns)
        .set({ assistantMessage: lastAssistantText || streamedRunFailure.error, toolSummaryJson: { tools: toolSummary } })
        .where(eq(tutorTurns.id, turnId));
      await durableEventCollector.flush({
        traceId: runtimeRun.traceId,
        sessionId: input.sessionId,
        runId: runtimeRun.runId,
        metadata: { notebookId: input.notebookId, turnId },
      });
      return {
        sessionId: input.sessionId,
        runId: runtimeRun.runId,
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
      runId: runtimeRun.runId,
      run: runtimeRun,
      message: input.message,
      assistantMessage: lastAssistantText,
      selectedNodeRefs: input.selectedNodeRefs,
      promptContext: input.promptContext,
      toolSummary,
      artifactProposalIds,
      durableEventCollector,
      contextSelection: input.contextSelection ?? null,
      openArtifact: input.openArtifact ?? null,
      activeSessionPlanId: input.studyState.sessionPlan?.id ?? null,
      currentObjectiveId: input.studyState.studyPlan?.currentObjective?.id ?? null,
      previousRuntimeContext: runtimeContextForTurn,
    });

    if (lastAssistantText.trim()) {
      await processCompletedTutorTurnLearnerTraitSignals(input.ctx, {
        notebookId: input.notebookId,
        userId: input.userId,
        sessionId: input.sessionId,
        turnId,
        runId: runtimeRun.runId,
        userMessage: input.message,
        assistantMessage: lastAssistantText,
      });
    }

    input.logger.info({ notebookId: input.notebookId, sessionId: input.sessionId, runId: runtimeRun.runId, status: "completed", ...correlationFields }, "tutor run finished");
    await durableEventCollector.flush({
      traceId: runtimeRun.traceId,
      sessionId: input.sessionId,
      runId: runtimeRun.runId,
      metadata: { notebookId: input.notebookId, turnId },
    });
    return {
      sessionId: input.sessionId,
      runId: runtimeRun.runId,
      turnId,
      status: "completed",
      assistantMessage: lastAssistantText,
      toolSummary,
      artifactProposalIds,
    };
  } catch (error) {
    const failure = classifyRuntimeError(error);
    finishPendingToolObservations(toolObservations, failure.safeMessage);
    input.logger.error({ notebookId: input.notebookId, sessionId: input.sessionId, runId: runtimeRun.runId, code: failure.code, error: failure.safeMessage, ...correlationFields }, "tutor run failed");
    await input.ctx.db.db
      .update(agentRuns)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(agentRuns.id, runtimeRun.runId));
    await input.ctx.db.db
      .update(tutorTurns)
      .set({ assistantMessage: lastAssistantText || failure.safeMessage, toolSummaryJson: { tools: toolSummary } })
      .where(eq(tutorTurns.id, turnId));
    await input.emitStreamEvent({
      type: "RUN_ERROR",
      runId: runtimeRun.runId,
      model: runtimeRun.modelConfig.model,
      timestamp: Date.now(),
      error: { message: failure.safeMessage, code: failure.code },
    });
    await durableEventCollector.flush({
      traceId: runtimeRun.traceId,
      sessionId: input.sessionId,
      runId: runtimeRun.runId,
      metadata: { notebookId: input.notebookId, turnId },
    });
    return {
      sessionId: input.sessionId,
      runId: runtimeRun.runId,
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
    toolSummary: TurnToolSummary[];
    artifactProposalIds: string[];
    durableEventCollector: DurableEventSummaryCollector;
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

  const [existingSession] = await ctx.db.db.select({ runtimeContextJson: tutorSessions.runtimeContextJson }).from(tutorSessions).where(eq(tutorSessions.id, input.sessionId)).limit(1);
  const previousRuntimeContext = isJsonRecord(existingSession?.runtimeContextJson) ? existingSession.runtimeContextJson : {};
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
    const compactionStarted = await appendObservedEvent(ctx, {
      notebookId: input.run.notebookId,
      sessionId: input.sessionId,
      runId: input.runId,
      eventType: "agent.compaction.started",
      payload: { turnId: input.turnId, turnIndex: input.turnIndex, reasons: compactionDecision.reasons, estimatedChars: compactionDecision.estimatedChars },
    }, input.durableEventCollector);
    const compactionCompleted = await appendObservedEvent(ctx, {
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
    }, input.durableEventCollector);
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
      },
      citationRefsJson: citationIds.map((claimId) => ({ refType: "claim", refId: claimId })),
    })
    .where(eq(tutorTurns.id, input.turnId));

  await applyMasteryEvidenceObjectiveProgression(ctx.db, {
    notebookId: input.run.notebookId,
    userId: input.run.userId,
    sessionId: input.sessionId,
    runId: input.runId,
    turnId: input.turnId,
    assistantMessage: input.assistantMessage,
    runtimeContext: input.previousRuntimeContext ?? {},
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
    sourceRefs: sourceIds.map((sourceId) => ({ refType: "source" as const, refId: sourceId })),
    contextRefs: extractContextRefsFromToolSummary({ tools: input.toolSummary }),
    ...(input.contextSelection?.sourceScopePolicy ? { sourceScopePolicy: input.contextSelection.sourceScopePolicy } : {}),
  });

  await ctx.db.db
    .update(tutorSessions)
    .set({
      runtimeContextJson: {
        ...masteryRuntimePatch,
        compressedContext: compacted.compressedContext,
        activeConceptIds,
        sourceIds,
        citationIds,
        artifactProposalIds: input.artifactProposalIds,
        currentObjective: input.promptContext.currentObjective,
        activeSessionPlanId: input.activeSessionPlanId ?? null,
        openArtifact: input.openArtifact ?? null,
        studyPlanSummary: input.promptContext.studyPlanSummary ?? null,
        learnerStateSummary: input.promptContext.learnerStateSummary ?? null,
        sessionDigestDraft: null,
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

function correlationLogFields(run: ReturnType<typeof createRuntimeRun>): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      traceId: run.traceId,
      requestId: run.requestId,
      traceparent: run.traceparent,
    }).filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as Record<string, string>;
}

function finishToolObservation(
  observations: Map<string, ObservationLike>,
  toolCallId: string,
  payload: Record<string, unknown>,
): void {
  const observation = observations.get(toolCallId);
  observations.delete(toolCallId);
  observation?.update(payload);
  observation?.end();
}

function finishPendingToolObservations(observations: Map<string, ObservationLike>, error: string): void {
  for (const [toolCallId] of observations) {
    finishToolObservation(observations, toolCallId, {
      level: "ERROR",
      statusMessage: error,
      output: { status: "failed", error },
    });
  }
}

function usageDetailsFromRuntimeUsage(usage: unknown): Record<string, number> | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const details: Record<string, number> = {};
  for (const [target, keys] of Object.entries({
    input: ["input", "promptTokens", "prompt_tokens"],
    output: ["output", "completionTokens", "completion_tokens"],
    total: ["totalTokens", "total_tokens", "total"],
    cacheRead: ["cacheRead", "cache_read"],
    cacheWrite: ["cacheWrite", "cache_write"],
  })) {
    const value = keys.map((key) => record[key]).find((candidate) => typeof candidate === "number");
    if (typeof value === "number" && Number.isFinite(value)) {
      details[target] = value;
    }
  }
  return Object.keys(details).length ? details : undefined;
}

function extractArtifactProposalId(output: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const artifactId = (output as { artifactId?: unknown }).artifactId;
  return typeof artifactId === "string" ? artifactId : undefined;
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : { value };
}

async function appendObservedEvent(
  ctx: AppContext,
  input: { notebookId: string; sessionId?: string; runId?: string; eventType: string; payload: Record<string, unknown> },
  collector: { recordSuccess(eventType: string): void; recordError(eventType: string): void },
): Promise<{ id: string; sequenceNo: number }> {
  const stopTimer = startMetricTimer();
  try {
    const event = await appendEvent(ctx.db, input);
    collector.recordSuccess(input.eventType);
    recordDurableEventMetric({
      eventType: input.eventType,
      outcome: "success",
      durationMs: stopTimer(),
    });
    return event;
  } catch (error) {
    collector.recordError(input.eventType);
    recordDurableEventMetric({
      eventType: input.eventType,
      outcome: "error",
      durationMs: stopTimer(),
    });
    throw error;
  }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createDurableEventCollector(): DurableEventSummaryCollector {
  return new DurableEventSummaryCollector();
}

function runtimeEventMetadata(run: ReturnType<typeof createRuntimeRun>): Record<string, unknown> {
  return {
    runId: run.runId,
    traceId: run.traceId,
    ...(run.requestId ? { requestId: run.requestId } : {}),
    ...(run.traceparent ? { traceparent: run.traceparent } : {}),
    model: run.modelConfig.model,
    provider: run.modelConfig.provider,
    promptTemplateVersion: run.modelConfig.promptTemplateVersion,
  };
}

function upsertToolSummary(
  toolSummary: TurnToolSummary[],
  update: TurnToolSummary,
): void {
  const index = toolSummary.findIndex((item) => item.toolCallId === update.toolCallId);
  if (index === -1) {
    toolSummary.push(update);
    return;
  }
  toolSummary[index] = { ...toolSummary[index], ...update };
}

function extractToolContextRefs(toolName: string, output: unknown): Array<{ refType: string; refId: string }> | undefined {
  if (toolName !== "wiki.search" || !isJsonRecord(output)) return undefined;
  const results = Array.isArray(output.results) ? output.results : [];
  const refs: Array<{ refType: string; refId: string }> = [];
  for (const result of results) {
    if (!isJsonRecord(result)) continue;
    if (typeof result.refType === "string" && typeof result.refId === "string") {
      refs.push({ refType: result.refType, refId: result.refId });
    }
    if (Array.isArray(result.provenanceRefs)) {
      for (const ref of result.provenanceRefs) {
        if (isJsonRecord(ref) && typeof ref.refType === "string" && typeof ref.refId === "string") {
          refs.push({ refType: ref.refType, refId: ref.refId });
        }
      }
    }
    if (Array.isArray(result.sourceRefs)) {
      for (const ref of result.sourceRefs) {
        if (isJsonRecord(ref) && typeof ref.sourceId === "string") {
          refs.push({ refType: "source", refId: ref.sourceId });
        }
        if (isJsonRecord(ref) && typeof ref.sourceVersionId === "string") {
          refs.push({ refType: "source_version", refId: ref.sourceVersionId });
        }
      }
    }
  }
  if (!refs.length) return undefined;
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractToolDiagnostics(toolName: string, output: unknown): Record<string, unknown> | undefined {
  if (toolName !== "wiki.search" || !isJsonRecord(output)) return undefined;
  const diagnostics: Record<string, unknown> = {};
  if (typeof output.retrievalMode === "string") diagnostics.retrievalMode = output.retrievalMode;
  if (typeof output.fallbackReason === "string") diagnostics.fallbackReason = output.fallbackReason;
  if (Array.isArray(output.results)) diagnostics.resultCount = output.results.length;
  if (Array.isArray(output.warnings)) {
    diagnostics.warningCodes = output.warnings
      .filter(isJsonRecord)
      .map((warning) => warning.code)
      .filter((code): code is string => typeof code === "string");
  }
  return Object.keys(diagnostics).length ? diagnostics : undefined;
}
