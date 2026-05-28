import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { notebooks, tutorSessions } from "@studyagent/db";
import { serializeAgUiEventToSse } from "@studyagent/agent-runtime";
import { nodeRefSchema, sourceScopePolicySchema } from "@studyagent/schemas";
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
import { recordLearnerTraitSignal } from "../learner-trait-store.js";
import { executeTutorTurn } from "../tutor-turn.js";
import { extractLatestUserMessage, mergeSelectedNodeRefs, prepareTutorTurn } from "../tutor-turn-preparation.js";

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
      const prepared = await prepareTutorTurn(ctx, {
        notebookId,
        userId: actor.id,
        notebookTitle: notebook.title || "Untitled",
        message,
        activeMode,
        selectedNodeRefs: data.selectedNodeRefs,
        sourceScopePolicy,
        ...(data.sessionId ? { requestedSessionId: data.sessionId } : {}),
      });
      const sessionId = prepared.sessionId;
      const run = prepared.run;

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-StudyAgent-Session-Id": sessionId,
        "X-StudyAgent-Run-Id": run.runId,
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
        if (turnResult.status === "completed" && turnResult.assistantMessage.trim()) {
          await recordExplicitPreferenceSignalsFromMessage(ctx, {
            notebookId,
            userId: actor.id,
            sessionId,
            turnId: turnResult.turnId,
            runId: turnResult.runId,
            message,
          });
        }
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
      return reply.send({ sessionId: result.sessionId, status: "completed", artifactId: result.artifactId });
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

async function recordExplicitPreferenceSignalsFromMessage(
  ctx: AppContext,
  input: { notebookId: string; userId: string; sessionId: string; turnId: string; runId: string; message: string },
): Promise<void> {
  const text = input.message.toLowerCase();
  const candidates: Array<{ trait: string; value: string; notes: string }> = [];

  if (/\b(go\s+)?slower\b|\bslow\s+(down|pace)\b|\bno rush\b/.test(text)) {
    candidates.push({ trait: "pacePreference", value: "slow", notes: "Learner explicitly requested a slower pace." });
  } else if (/\bfaster\b|\bquickly\b|\bspeed up\b|\bbrief\b|\bconcise\b/.test(text)) {
    candidates.push({ trait: "pacePreference", value: "fast", notes: "Learner explicitly requested a faster or more concise pace." });
  }
  if (/\bvisual\b|\bdiagram\b|\bgraph\b/.test(text)) {
    candidates.push({ trait: "examplePreference", value: "visual", notes: "Learner explicitly requested visual examples." });
  }
  if (/\bconcrete example\b|\breal[- ]world example\b|\bworked example\b|\bexample preference\b/.test(text)) {
    candidates.push({ trait: "examplePreference", value: "concrete", notes: "Learner explicitly requested concrete examples." });
  }
  if (/\bquiz\b|\btest me\b|\bpractice questions?\b/.test(text)) {
    candidates.push({ trait: "assessmentPreference", value: "quiz", notes: "Learner explicitly requested quiz-style practice." });
  }
  if (/\bworked problem\b|\bworked example\b|\bstep[- ]by[- ]step problem\b/.test(text)) {
    candidates.push({ trait: "assessmentPreference", value: "worked_problem", notes: "Learner explicitly requested worked-problem practice." });
  }
  if (/\bexam\b|\btest tomorrow\b|\bdeadline\b|\btomorrow\b/.test(text)) {
    candidates.push({ trait: "urgencyContext", value: "exam_prep", notes: "Learner explicitly described exam or deadline urgency." });
  }

  for (const candidate of dedupePreferenceCandidates(candidates)) {
    await recordLearnerTraitSignal(ctx.db, {
      id: `lts_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: input.notebookId,
      userId: input.userId,
      source: "explicit_self_report",
      trait: candidate.trait,
      suggestedValue: candidate.value,
      strength: 0.95,
      confidence: 0.9,
      evidenceRefs: [
        {
          refType: "session_trace",
          refId: input.sessionId,
          summary: `Explicit learner self-report after tutor turn ${input.turnId} in run ${input.runId}.`,
        },
      ],
      sessionId: input.sessionId,
      turnId: input.turnId,
      runId: input.runId,
      internalVisibility: true,
      observedAt: new Date().toISOString(),
      notes: candidate.notes,
    } as Parameters<typeof recordLearnerTraitSignal>[1]);
  }
}

function dedupePreferenceCandidates<T extends { trait: string }>(candidates: T[]): T[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.trait)) return false;
    seen.add(candidate.trait);
    return true;
  });
}

export { mergeSelectedNodeRefs };
