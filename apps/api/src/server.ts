import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { loadEnv } from "@studyagent/config";
import {
  initializeLangfuseTracing,
  recordHttpRequestMetric,
  shutdownLangfuseTracing,
} from "@studyagent/observability";
import { createContext, closeContext, type AppContext } from "./context.js";
import { registerNotebookRoutes } from "./routes/notebooks.js";
import { registerEvalSourceFixtureRoutes } from "./routes/eval-source-fixtures.js";
import { registerEvalRunRoutes } from "./routes/eval-runs.js";
import { registerEvalEvidenceSnapshotRoutes } from "./routes/eval-evidence-snapshot.js";
import { registerGraphRoutes } from "./routes/graph.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerSourceRoutes } from "./routes/sources.js";
import { registerStudentProfileRoutes } from "./routes/student-profile.js";
import { registerLearnerTraitRoutes } from "./routes/learner-traits.js";
import { registerEventStreamRoutes } from "./routes/events-stream.js";
import { registerTutorRoutes } from "./routes/tutor.js";
import { registerDeveloperTimelineRoutes } from "./routes/developer-timeline.js";
import { registerMetricsRoute } from "./routes/metrics.js";
import { registerRequestCorrelationHooks } from "./request-correlation.js";
import { ensureObjectStorageBucket } from "./storage-bootstrap.js";

const requestStartTimes = new WeakMap<object, number>();

export async function buildServer(): Promise<{
  app: ReturnType<typeof Fastify>;
  ctx: AppContext;
  env: ReturnType<typeof loadEnv>;
}> {
  const env = loadEnv();
  initializeLangfuseTracing("studyagent-api", env);
  const ctx = createContext(env);
  await ensureObjectStorageBucket(ctx);

  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    disableRequestLogging: true,
    bodyLimit: 25 * 1024 * 1024,
  });
  registerRequestCorrelationHooks(app);
  registerHttpMetricsHooks(app);

  await app.register(cors, {
    origin: true,
    credentials: true,
    exposedHeaders: [
      "X-StudyAgent-Session-Id",
      "X-StudyAgent-Run-Id",
      "X-StudyAgent-Trace-Id",
      "X-StudyAgent-Request-Id",
      "traceparent",
    ],
  });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  await registerMetricsRoute(app);
  app.get("/health", async () => ({ ok: true }));

  await app.register(
    async (r) => {
      await registerEvalSourceFixtureRoutes(r, ctx);
      await registerEvalRunRoutes(r, ctx);
      await registerEvalEvidenceSnapshotRoutes(r, ctx);
      await registerNotebookRoutes(r, ctx);
      await registerSourceRoutes(r, ctx);
      await registerStudentProfileRoutes(r, ctx);
      await registerLearnerTraitRoutes(r, ctx);
      await registerSearchRoutes(r, ctx);
      await registerGraphRoutes(r, ctx);
      await registerEventStreamRoutes(r, ctx);
      await registerTutorRoutes(r, ctx);
      await registerDeveloperTimelineRoutes(r, ctx);
    },
    { prefix: "/api/v1" },
  );

  app.addHook("onClose", async () => {
    await closeContext(ctx);
    await shutdownLangfuseTracing();
  });

  return { app, ctx, env };
}

function registerHttpMetricsHooks(app: FastifyInstance): void {
  app.addHook("onRequest", async (request: FastifyRequest) => {
    requestStartTimes.set(request, Date.now());
  });

  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const started = requestStartTimes.get(request) ?? Date.now();
    requestStartTimes.delete(request);
    const route = request.routeOptions?.url ?? request.url.split("?", 1)[0] ?? "unknown";
    recordHttpRequestMetric({
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs: Date.now() - started,
    });
  });
}
