import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { notebooks, tutorSessions } from "@studyagent/db";
import { serializeAgUiEventToSse } from "@studyagent/agent-runtime";
import { nodeRefSchema, sourceScopePolicySchema } from "@studyagent/schemas";
import { observeAgenticSpan } from "@studyagent/observability";
import { z } from "zod";
import { resolveActor } from "../auth.js";
import {
  completeTutorSessionLifecycleForRequest,
  pauseTutorSessionLifecycleForRequest,
  resumeTutorSessionLifecycleForRequest,
} from "../tutor-session-lifecycle.js";
import {
  createOpenRouterLearnerTraitEstimatorClient,
} from "../learner-trait-estimation.js";
import { resolveStudyAgentTutorSystemPrompt } from "../langfuse-prompts.js";
import { getOrCreateRequestCorrelationContext } from "../request-correlation.js";
import { executeTutorTurn } from "../tutor-turn.js";
import { bootstrapTutorTurn, extractLatestUserMessage, mergeSelectedNodeRefs } from "../tutor-turn-preparation.js";

const tutorChatRequestSchema = z.object({
  messages: z.array(z.unknown()).default([]),
  data: z
    .object({
      activeMode: z.enum(["learn", "practice", "revise", "explore", "wiki_maintenance"]).default("learn"),
      selectedNodeRefs: z.array(nodeRefSchema).default([]),
      sessionId: z.string().min(1).optional(),
      action: z.enum(["prompt", "steer", "followUp"]).default("prompt"),
      sourceScopePolicy: sourceScopePolicySchema.default("soft_source_scope"),
    })
    .default({
      activeMode: "learn",
      selectedNodeRefs: [],
      action: "prompt",
      sourceScopePolicy: "soft_source_scope",
    }),
});

const tutorSessionLifecycleSchema = z.object({
  sessionId: z.string().min(1).optional(),
  phase: z.enum(["full", "estimation", "crystallization"]).optional(),
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
      const sourceScopePolicy = data.sourceScopePolicy;
      const action = data.action;
      const correlationContext = getOrCreateRequestCorrelationContext(request);
      return await observeAgenticSpan(
        "tutor.turn",
        {
          input: {
            notebookId,
            userId: actor.id,
            activeMode,
            action,
            selectedNodeRefCount: data.selectedNodeRefs.length,
          },
          metadata: { route: "/notebooks/:notebookId/tutor/chat", traceId: correlationContext.traceId },
        },
        async (turnObservation) => {
          const prepared = await observeAgenticSpan(
            "tutor.turn.bootstrap",
            {
              input: {
                notebookId,
                userId: actor.id,
                activeMode,
                selectedNodeRefCount: data.selectedNodeRefs.length,
                requestedSessionId: data.sessionId ?? null,
              },
            },
            async (prepareObservation) => {
              const preparedTurn = await bootstrapTutorTurn(ctx, {
                notebookId,
                userId: actor.id,
                notebookTitle: notebook.title || "Untitled",
                message,
                activeMode,
                selectedNodeRefs: data.selectedNodeRefs,
                sourceScopePolicy,
                ...(data.sessionId ? { requestedSessionId: data.sessionId } : {}),
                correlationContext,
              });
              prepareObservation.update({
                output: {
                  sessionId: preparedTurn.sessionId,
                  selectedNodeRefCount: preparedTurn.selectedNodeRefs.length,
                  isNewSession: preparedTurn.isNewSession,
                  hasOpenArtifact: Boolean(preparedTurn.openArtifact),
                },
              });
              return preparedTurn;
            },
          );
          const sessionId = prepared.sessionId;
          const resolvedPrompt = await resolveStudyAgentTutorSystemPrompt(ctx.env, prepared.promptContext);
          const run = { ...prepared.run, managedPrompt: resolvedPrompt.metadata };

          turnObservation.updateTrace?.({
            name: "tutor.turn",
            userId: actor.id,
            sessionId,
            input: { notebookId, activeMode, action },
            metadata: {
              notebookId,
              runId: run.runId,
              requestId: run.requestId,
              managedPrompt: resolvedPrompt.metadata,
            },
            tags: ["studyagent", "tutor", "agentic"],
          });

          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
            "X-StudyAgent-Session-Id": sessionId,
            "X-StudyAgent-Run-Id": run.runId,
            "X-StudyAgent-Trace-Id": run.traceId,
            "X-StudyAgent-Request-Id": run.requestId ?? correlationContext.requestId,
            traceparent: run.traceparent ?? correlationContext.traceparent,
          });

          try {
            const turnResult = await executeTutorTurn({
              ctx,
              notebookId,
              sessionId,
              userId: actor.id,
              activeMode,
              selectedNodeRefs: prepared.selectedNodeRefs,
              action,
              message,
              promptContext: prepared.promptContext,
              systemPrompt: resolvedPrompt.prompt,
              systemPromptFingerprint: resolvedPrompt.fingerprint,
              studyState: prepared.studyState,
              openArtifact: prepared.openArtifact,
              contextSelection: prepared.contextSelection,
              previousRuntimeContext: prepared.runtimeContextForTurn,
              toolRegistry: prepared.toolRegistry,
              emitStreamEvent: (event) => {
                reply.raw.write(serializeAgUiEventToSse(event));
              },
              logger: app.log,
              run,
            });
            turnObservation.update({
              output: {
                status: turnResult.status,
                runId: turnResult.runId,
                turnId: turnResult.turnId,
                toolCount: turnResult.toolSummary.length,
              },
            });
          } finally {
            reply.raw.end();
          }
        },
      );
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

      const result = await pauseTutorSessionLifecycleForRequest(ctx.db, {
        notebookId,
        userId: actor.id,
        ...(parsed.data.sessionId ? { requestedSessionId: parsed.data.sessionId } : {}),
      });
      if (!result) {
        return reply.status(404).send({ code: "not_found", message: "Active tutor session not found" });
      }

      return reply.send(result);
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

      const result = await resumeTutorSessionLifecycleForRequest(ctx.db, {
        notebookId,
        userId: actor.id,
        ...(parsed.data.sessionId ? { requestedSessionId: parsed.data.sessionId } : {}),
        model: ctx.env.DEFAULT_TUTOR_MODEL,
      });
      if (!result) {
        return reply.status(404).send({ code: "not_found", message: "Tutor session not found" });
      }

      return reply.send(result);
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

      const result = await completeTutorSessionLifecycleForRequest(ctx.db, {
        notebookId,
        userId: actor.id,
        ...(parsed.data.sessionId ? { requestedSessionId: parsed.data.sessionId } : {}),
        ...(parsed.data.phase ? { phase: parsed.data.phase } : {}),
        ...(ctx.env.OPENROUTER_API_KEY
          ? {
              estimator: createOpenRouterLearnerTraitEstimatorClient({
                apiKey: ctx.env.OPENROUTER_API_KEY,
                baseUrl: ctx.env.OPENROUTER_BASE_URL,
                model: ctx.env.DEFAULT_EXTRACTION_MODEL,
                temperature: 0.1,
              }),
            }
          : {}),
      });
      if (!result) {
        return reply.status(404).send({ code: "not_found", message: "Tutor session not found" });
      }
      return reply.send({
        sessionId: result.sessionId,
        status: result.status,
        reason: result.reason,
        artifactId: result.artifactId,
      });
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

export { mergeSelectedNodeRefs };
