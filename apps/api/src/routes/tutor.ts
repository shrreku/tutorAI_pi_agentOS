import type { FastifyInstance } from "fastify";
import { and, desc, eq, max } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { agentRuns, appendEvent, claims, notebooks, toolCalls, tutorSessions, tutorTurns } from "@studyagent/db";
import {
  createAgUiEventMapper,
  classifyRuntimeError,
  compactStudyAgentContext,
  createRuntimeRun,
  createRuntimeToolRegistry,
  disposeStudyAgentTutorSession,
  runStudyAgentTutorSession,
  mapPiSessionEventToAppendInput,
  runTelemetryPayload,
  serializeAgUiEventToSse,
  type StudyAgentPromptContext,
} from "@studyagent/agent-runtime";
import { combineConfidence, extractClaimIdsFromText, reinforcementSignalFromCount } from "@studyagent/wiki-core";
import { nodeRefSchema } from "@studyagent/schemas";
import { startActiveObservation } from "@studyagent/observability";
import { z } from "zod";
import { resolveActor } from "../auth.js";
import { buildIntentRoutingInstruction, detectLearnerIntent } from "../tutor-intent.js";
import { createTutorReadToolProvider, selectContextForTutor } from "../tutor-tool-provider.js";
import type { TutorContextSelection } from "../tutor-tool-provider.js";
import { createTutorWriteToolProvider } from "../tutor-write-provider.js";
import { crystallizeTutorSession, upsertTutorSessionDigestArtifact } from "../phase7.js";
import { formatLearnerStateSummary, formatStudyPlanSummary, loadNotebookStudyState } from "../study-state.js";

const tutorSessionInputSchema = z.object({
  message: z.string().min(1),
  activeMode: z.enum(["learn", "practice", "revise", "explore", "wiki_maintenance"]).default("learn"),
  selectedNodeRefs: z.array(nodeRefSchema).default([]),
});

const tutorChatRequestSchema = z.object({
  messages: z.array(z.unknown()).default([]),
  data: z
    .object({
      activeMode: z.enum(["learn", "practice", "revise", "explore", "wiki_maintenance"]).default("learn"),
      selectedNodeRefs: z.array(nodeRefSchema).default([]),
      sessionId: z.string().min(1).optional(),
      action: z.enum(["prompt", "steer", "followUp"]).default("prompt"),
    })
    .default({
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
    }),
});

const tutorSessionLifecycleSchema = z.object({
  sessionId: z.string().min(1).optional(),
});

export async function registerTutorRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post<{
    Params: { notebookId: string };
    Body: z.infer<typeof tutorChatRequestSchema>;
  }>(
    "/notebooks/:notebookId/tutor/chat",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;

      const [notebook] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!notebook) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }
      if (!ctx.env.OPENROUTER_API_KEY) {
        return reply.status(503).send({ code: "pi_unavailable", message: "OPENROUTER_API_KEY is required for Pi tutor sessions" });
      }

      const parsed = tutorChatRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ code: "bad_request", message: parsed.error.flatten() });
      }

      const { messages, data } = parsed.data;
      const message = extractLatestUserMessage(messages);
      if (!message) {
        return reply.status(400).send({ code: "bad_request", message: "A user message is required" });
      }

      const activeMode = data.activeMode;
      const selectedNodeRefs = data.selectedNodeRefs;
      const action = data.action;
      const session = await getOrCreateTutorSession(ctx, {
        notebookId,
        userId: actor.id,
        activeMode,
        selectedNodeRefs,
        ...(data.sessionId ? { requestedSessionId: data.sessionId } : {}),
      });
      const sessionId = session.id;

      const run = createRuntimeRun({
        notebookId,
        sessionId,
        userId: actor.id,
        selectedNodeRefs,
        activeMode,
      });

      const studyState = await loadNotebookStudyState(ctx.db, notebookId, actor.id);
      const promptContext = createPromptContext({
        notebookTitle: notebook.title || "Untitled",
        activeMode,
        selectedNodeRefs,
        studyState,
      });

      // Detect intent and add routing instructions if curriculum-ready
      const intent = detectLearnerIntent(message);
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
          notebookId,
          message,
          selectedNodeRefs,
          studyState,
          maxChunks: 6,
        });
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
      } catch {
        contextSelection = undefined;
      }

      const toolRegistry = createRuntimeToolRegistry({
        readProvider: createTutorReadToolProvider(ctx),
        writeProvider: createTutorWriteToolProvider(ctx),
      });

      const [existingTurn] = await ctx.db.db.select({ maxTurnIndex: max(tutorTurns.turnIndex) }).from(tutorTurns).where(eq(tutorTurns.sessionId, sessionId));
      const turnIndex = (existingTurn?.maxTurnIndex ?? -1) + 1;
      const turnId = `turn_${crypto.randomUUID().replaceAll("-", "")}`;

      await ctx.db.db.insert(tutorTurns).values({
        id: turnId,
        sessionId,
        turnIndex,
        userMessage: message,
        selectedNodeRefsJson: selectedNodeRefs as unknown[],
      });

      await ctx.db.db.insert(agentRuns).values({
        id: run.runId,
        sessionId,
        turnId,
        runType: "tutor_turn",
        status: "running",
        modelConfigJson: run.modelConfig,
        budgetJson: run.budgets,
        traceId: run.traceId,
      });

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-StudyAgent-Session-Id": sessionId,
        "X-StudyAgent-Run-Id": run.runId,
      });

      // Send session metadata as first event so client can capture sessionId
      reply.raw.write(
        serializeAgUiEventToSse({
          type: "SESSION_STARTED",
          sessionId,
          runId: run.runId,
          timestamp: Date.now(),
        }),
      );

      const agui = createAgUiEventMapper(run);
      let lastAssistantText = "";
      let streamedRunFailure: { error: string; code: string } | undefined;
      const toolSummary: Array<{ toolCallId: string; toolName: string; status: string; latencyMs?: number }> = [];
      const artifactProposalIds: string[] = [];

      try {
        for await (const sessionEvent of runStudyAgentTutorSession({
          run,
          promptContext,
          userMessage: message,
          toolRegistry,
          action,
          config: {
            ...(ctx.env.OPENROUTER_API_KEY ? { providerApiKey: ctx.env.OPENROUTER_API_KEY } : {}),
            baseUrl: ctx.env.OPENROUTER_BASE_URL,
          },
          onToolLifecycleEvent: async (event) => {
            if (event.phase === "started") {
              await ctx.db.db.insert(toolCalls).values({
                id: event.toolCallId,
                runId: run.runId,
                sessionId,
                turnId,
                toolName: event.toolName,
                sideEffectClass: event.sideEffectClass,
                inputJson: toJsonRecord(event.input),
                status: "started",
              });
              upsertToolSummary(toolSummary, {
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                status: "started",
              });
              return;
            }

            if (event.phase === "completed") {
              await ctx.db.db
                .update(toolCalls)
                .set({
                  outputJson: toJsonRecord(event.output),
                  status: "completed",
                  latencyMs: event.latencyMs,
                  reducerResultJson: extractReducerResult(event.output),
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
              return;
            }

            await ctx.db.db
              .update(toolCalls)
              .set({
                status: "failed",
                latencyMs: event.latencyMs,
                outputJson: { error: event.error, code: event.code },
              })
              .where(eq(toolCalls.id, event.toolCallId));
            upsertToolSummary(toolSummary, {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              status: "failed",
              latencyMs: event.latencyMs,
            });
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
            await appendEvent(ctx.db, appendInput);
          }

          for (const chunk of agui.map(sessionEvent)) {
            reply.raw.write(serializeAgUiEventToSse(chunk));
          }
        }

        if (streamedRunFailure) {
          await ctx.db.db
            .update(agentRuns)
            .set({
              status: "failed",
              completedAt: new Date(),
            })
            .where(eq(agentRuns.id, run.runId));
          await ctx.db.db
            .update(tutorTurns)
            .set({
              assistantMessage: lastAssistantText || streamedRunFailure.error,
              toolSummaryJson: { tools: toolSummary },
            })
            .where(eq(tutorTurns.id, turnId));
        } else {
          await reinforceCitedClaims(ctx, notebookId, [message, lastAssistantText]);
          await persistTutorTurnSummary(ctx, {
            sessionId,
            turnId,
            runId: run.runId,
            run,
            message,
            assistantMessage: lastAssistantText,
            selectedNodeRefs,
            promptContext,
            toolSummary,
            artifactProposalIds,
            contextSelection: contextSelection ?? null,
          });
        }

      } catch (error) {
        const failure = classifyRuntimeError(error);
        await ctx.db.db
          .update(agentRuns)
          .set({
            status: "failed",
            completedAt: new Date(),
          })
          .where(eq(agentRuns.id, run.runId));
        reply.raw.write(
          serializeAgUiEventToSse({
            type: "RUN_ERROR",
            runId: run.runId,
            model: run.modelConfig.model,
            timestamp: Date.now(),
            error: { message: failure.safeMessage, code: failure.code },
          }),
        );
      } finally {
        reply.raw.end();
      }
    },
  );

  app.post<{
    Params: { notebookId: string };
    Body: z.infer<typeof tutorSessionLifecycleSchema>;
  }>(
    "/notebooks/:notebookId/tutor/session/pause",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;
      const parsed = tutorSessionLifecycleSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ code: "bad_request", message: parsed.error.flatten() });
      }

      const session = await resolveTutorSession(ctx, {
        notebookId,
        userId: actor.id,
        ...(parsed.data.sessionId ? { requestedSessionId: parsed.data.sessionId } : {}),
        allowedStatuses: ["active"],
      });
      if (!session) {
        return reply.status(404).send({ code: "not_found", message: "Active tutor session not found" });
      }

      await ctx.db.db
        .update(tutorSessions)
        .set({ status: "paused" })
        .where(eq(tutorSessions.id, session.id));
      await disposeStudyAgentTutorSession(session.id);

      await appendEvent(ctx.db, {
        notebookId,
        sessionId: session.id,
        eventType: "session.focus.updated",
        payload: { action: "paused", sessionId: session.id },
      });

      return reply.send({ sessionId: session.id, status: "paused" });
    },
  );

  app.post<{
    Params: { notebookId: string };
    Body: z.infer<typeof tutorSessionLifecycleSchema>;
  }>(
    "/notebooks/:notebookId/tutor/session/resume",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;
      const parsed = tutorSessionLifecycleSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ code: "bad_request", message: parsed.error.flatten() });
      }

      const session = await resolveTutorSession(ctx, {
        notebookId,
        userId: actor.id,
        ...(parsed.data.sessionId ? { requestedSessionId: parsed.data.sessionId } : {}),
        allowedStatuses: ["paused", "active"],
      });
      if (!session) {
        return reply.status(404).send({ code: "not_found", message: "Tutor session not found" });
      }

      await ctx.db.db
        .update(tutorSessions)
        .set({ status: "active" })
        .where(eq(tutorSessions.id, session.id));

      await appendEvent(ctx.db, {
        notebookId,
        sessionId: session.id,
        eventType: "session.focus.updated",
        payload: { action: "resumed", sessionId: session.id },
      });

      return reply.send({ sessionId: session.id, status: "active" });
    },
  );

  app.post<{
    Params: { notebookId: string };
    Body: z.infer<typeof tutorSessionLifecycleSchema>;
  }>(
    "/notebooks/:notebookId/tutor/session/end",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;
      const parsed = tutorSessionLifecycleSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ code: "bad_request", message: parsed.error.flatten() });
      }

      const session = await resolveTutorSession(ctx, {
        notebookId,
        userId: actor.id,
        ...(parsed.data.sessionId ? { requestedSessionId: parsed.data.sessionId } : {}),
        allowedStatuses: ["active", "paused"],
      });
      if (!session) {
        return reply.status(404).send({ code: "not_found", message: "Tutor session not found" });
      }

      const [lastTurn] = await ctx.db.db
        .select()
        .from(tutorTurns)
        .where(eq(tutorTurns.sessionId, session.id))
        .orderBy(desc(tutorTurns.turnIndex))
        .limit(1);

      if (!lastTurn || !lastTurn.userMessage || !lastTurn.assistantMessage) {
        await ctx.db.db
          .update(tutorSessions)
          .set({ status: "completed", endedAt: new Date() })
          .where(eq(tutorSessions.id, session.id));
        await disposeStudyAgentTutorSession(session.id);
        await appendEvent(ctx.db, {
          notebookId,
          sessionId: session.id,
          eventType: "session.completed",
          payload: { sessionId: session.id, reason: "ended_without_turns" },
        });
        return reply.send({ sessionId: session.id, status: "completed", artifactId: null });
      }

      const runtimeCtx = isJsonRecord(session.runtimeContextJson) ? session.runtimeContextJson : {};
      const sourceIds = Array.isArray(runtimeCtx.sourceIds) ? runtimeCtx.sourceIds.filter((v): v is string => typeof v === "string") : [];
      const citationIds = Array.isArray(runtimeCtx.citationIds) ? runtimeCtx.citationIds.filter((v): v is string => typeof v === "string") : [];
      const artifactProposalIds = Array.isArray(runtimeCtx.artifactProposalIds)
        ? runtimeCtx.artifactProposalIds.filter((v): v is string => typeof v === "string")
        : [];
      const currentObjective = typeof runtimeCtx.currentObjective === "string" ? runtimeCtx.currentObjective : undefined;

      const digest = await crystallizeTutorSession(ctx.db, {
        notebookId,
        userId: actor.id,
        sessionId: session.id,
        assistantMessage: lastTurn.assistantMessage,
        userMessage: lastTurn.userMessage,
        sourceIds,
        citationIds,
        artifactProposalIds,
        ...(currentObjective ? { currentObjective } : {}),
      });

      await disposeStudyAgentTutorSession(session.id);
      return reply.send({ sessionId: session.id, status: "completed", artifactId: digest.artifactId });
    },
  );

  // Get recent tutor sessions
  app.get<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/tutor/sessions",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;

      const [notebook] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!notebook) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      const recentSessions = await ctx.db.db
        .select()
        .from(tutorSessions)
        .where(and(eq(tutorSessions.notebookId, notebookId), eq(tutorSessions.userId, actor.id)))
        .orderBy(desc(tutorSessions.startedAt))
        .limit(10);

      return reply.send({ sessions: recentSessions });
    },
  );
}

/** When the tutor cites `clm_*` ids, bump reinforcement for GF-0405 / retrieval freshness. */
async function reinforceCitedClaims(ctx: AppContext, notebookId: string, texts: string[]): Promise<void> {
  const corpus = texts.join("\n");
  const ids = extractClaimIdsFromText(corpus);
  if (!ids.length) return;

  const now = new Date();
  for (const claimId of ids) {
    const [row] = await ctx.db.db
      .select()
      .from(claims)
      .where(and(eq(claims.id, claimId), eq(claims.notebookId, notebookId)))
      .limit(1);
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
      .set({
        reinforcementCount: n,
        confidenceComponentsJson: components,
        confidence,
        qualityScore: confidence,
        updatedAt: now,
      })
      .where(eq(claims.id, claimId));
  }
}

async function persistTutorTurnSummary(
  ctx: AppContext,
  input: {
    sessionId: string;
    turnId: string;
    runId: string;
    run: ReturnType<typeof createRuntimeRun>;
    message: string;
    assistantMessage: string;
    selectedNodeRefs: Array<{ refType: string; refId: string }>;
    promptContext: StudyAgentPromptContext;
    toolSummary: Array<{ toolCallId: string; toolName: string; status: string; latencyMs?: number }>;
    artifactProposalIds: string[];
    contextSelection?: TutorContextSelection | null;
  },
): Promise<void> {
  const citationIds = extractClaimIdsFromText([input.message, input.assistantMessage].join("\n"));
  const sourceIds = input.selectedNodeRefs.filter((ref) => ref.refType === "source").map((ref) => ref.refId);
  const activeConceptIds = input.selectedNodeRefs.filter((ref) => ref.refType === "concept").map((ref) => ref.refId);

  const compactionStarted = await appendEvent(ctx.db, {
    notebookId: input.run.notebookId,
    sessionId: input.sessionId,
    runId: input.runId,
    eventType: "agent.compaction.started",
    payload: {
      traceId: input.run.traceId,
      ...runTelemetryPayload(input.run),
    },
  });

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

  const compactionCompleted = await appendEvent(ctx.db, {
    notebookId: input.run.notebookId,
    sessionId: input.sessionId,
    runId: input.runId,
    eventType: "agent.compaction.completed",
    payload: {
      compressedContext: compacted.compressedContext,
      sourceIds,
      citationIds,
      artifactProposalIds: input.artifactProposalIds,
      traceId: input.run.traceId,
      ...runTelemetryPayload(input.run),
    },
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

  await ctx.db.db
    .update(tutorTurns)
    .set({
      assistantMessage: input.assistantMessage,
      toolSummaryJson: {
        tools: input.toolSummary,
        compactionEventIds: [compactionStarted.id, compactionCompleted.id],
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
              reason: input.contextSelection.reason,
            }
          : null,
      },
      citationRefsJson: citationIds.map((claimId) => ({ refType: "claim", refId: claimId })),
    })
    .where(eq(tutorTurns.id, input.turnId));

  await ctx.db.db
    .update(tutorSessions)
    .set({
      runtimeContextJson: {
        compressedContext: compacted.compressedContext,
        activeConceptIds,
        sourceIds,
        selectedChunkIds: input.contextSelection?.selectedChunkIds ?? [],
        selectedSourceIds: input.contextSelection?.selectedSourceIds ?? [],
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
              reason: input.contextSelection.reason,
            }
          : null,
        citationIds,
        artifactProposalIds: input.artifactProposalIds,
        currentObjective: input.promptContext.currentObjective,
            studyPlanSummary: input.promptContext.studyPlanSummary ?? null,
            learnerStateSummary: input.promptContext.learnerStateSummary ?? null,
            sessionDigestDraft: {
              summary: input.assistantMessage,
              currentObjective: input.promptContext.currentObjective,
              studyPlanSummary: input.promptContext.studyPlanSummary ?? null,
              learnerStateSummary: input.promptContext.learnerStateSummary ?? null,
              citationIds,
              sourceIds,
              artifactProposalIds: input.artifactProposalIds,
              updatedAt: new Date().toISOString(),
            },
        lastRunId: input.runId,
        updatedAt: new Date().toISOString(),
      },
    })
    .where(eq(tutorSessions.id, input.sessionId));

  const digestDraft = await upsertTutorSessionDigestArtifact(ctx.db, {
    notebookId: input.run.notebookId,
    sessionId: input.sessionId,
    runId: input.runId,
    assistantMessage: input.assistantMessage,
    userMessage: input.message,
    ...(input.promptContext.currentObjective ? { currentObjective: input.promptContext.currentObjective } : {}),
    sourceIds,
    citationIds,
    artifactProposalIds: input.artifactProposalIds,
    ...(input.promptContext.studyPlanSummary ? { studyPlanSummary: input.promptContext.studyPlanSummary } : {}),
    ...(input.promptContext.learnerStateSummary ? { learnerStateSummary: input.promptContext.learnerStateSummary } : {}),
    turnId: input.turnId,
    status: "draft",
  });

  await appendEvent(ctx.db, {
    notebookId: input.run.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: digestDraft.created ? "artifact.created" : "artifact.updated",
    payload: {
      artifactId: digestDraft.artifactId,
      artifactType: "session_digest",
      status: "draft",
    },
  });

  await ctx.db.db
    .update(agentRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(agentRuns.id, input.runId));

  await ctx.db.db
    .update(tutorSessions)
    .set({
      runtimeContextJson: {
        compressedContext: compacted.compressedContext,
        activeConceptIds,
        sourceIds,
        selectedChunkIds: input.contextSelection?.selectedChunkIds ?? [],
        selectedSourceIds: input.contextSelection?.selectedSourceIds ?? [],
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
              reason: input.contextSelection.reason,
            }
          : null,
        citationIds,
        artifactProposalIds: input.artifactProposalIds,
        currentObjective: input.promptContext.currentObjective,
            studyPlanSummary: input.promptContext.studyPlanSummary ?? null,
            learnerStateSummary: input.promptContext.learnerStateSummary ?? null,
            sessionDigestDraft: {
              summary: input.assistantMessage,
              currentObjective: input.promptContext.currentObjective,
              studyPlanSummary: input.promptContext.studyPlanSummary ?? null,
              learnerStateSummary: input.promptContext.learnerStateSummary ?? null,
              citationIds,
              sourceIds,
              artifactProposalIds: input.artifactProposalIds,
              updatedAt: new Date().toISOString(),
            },
        lastRunId: input.runId,
        updatedAt: new Date().toISOString(),
      },
    })
    .where(eq(tutorSessions.id, input.sessionId));
}

async function resolveTutorSession(
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

function extractReducerResult(output: unknown): Record<string, unknown> | undefined {
  if (!output || typeof output !== "object") return undefined;
  const value = (output as { reducerResult?: unknown }).reducerResult;
  return isJsonRecord(value) ? value : undefined;
}

function extractArtifactProposalId(output: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const artifactId = (output as { artifactId?: unknown }).artifactId;
  return typeof artifactId === "string" ? artifactId : undefined;
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return isJsonRecord(value) ? value : { value };
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

function extractLatestUserMessage(messages: unknown[]): string {
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

function createPromptContext(input: {
  notebookTitle: string;
  activeMode: StudyAgentPromptContext["activeMode"];
  selectedNodeRefs: StudyAgentPromptContext["selectedNodeRefs"];
  studyState: Awaited<ReturnType<typeof loadNotebookStudyState>>;
}): StudyAgentPromptContext {
  const plan = input.studyState.studyPlan;
  const curriculum = input.studyState.curriculum;
  const moduleRow = input.studyState.module;
  const objectiveList = input.studyState.objectiveList;
  const sessionPlan = input.studyState.sessionPlan;
  const studyPlanSummary = formatStudyPlanSummary(input.studyState);
  const learnerStateSummary = formatLearnerStateSummary(input.studyState);

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
    additionalInstructions: [
      "[Host-State Rehydration]",
      "Treat the notebook, curriculum, module, objective, session-plan, learner-state, selected-ref, and artifact-proposal state above as freshly loaded product state for this run. Do not rely on older Pi memory when it conflicts with this host state.",
    ],
  };
}
