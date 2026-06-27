import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { loadEnv } from "@studyagent/config";
import { pingDatabase } from "@studyagent/db";
import {
  captureException,
  initializeLangfuseTracing,
  initSentry,
  recordHttpRequestMetric,
  shutdownLangfuseTracing,
} from "@studyagent/observability";
import { createContext, closeContext, type AppContext } from "./context.js";
import { registerNotebookRoutes } from "./routes/notebooks.js";
import { registerInteractiveLearningRoutes } from "./routes/interactive-learning.js";
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
import { registerAuthRoutes } from "./routes/auth.js";
import { isWorkOSConfigured } from "./auth.js";
import { registerHostedBetaRoutes } from "./routes/hosted-beta.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerStudyTemplateRoutes } from "./routes/study-templates.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerProductAnalyticsRoutes } from "./routes/product-analytics.js";
import { registerFeedbackRoutes } from "./routes/feedback.js";
import { registerAccessCodeRoutes } from "./routes/access-codes.js";
import { registerStripeCheckoutRoutes } from "./routes/stripe-checkout.js";
import { registerMetricsRoute } from "./routes/metrics.js";
import {
  getRequestCorrelationContext,
  registerRequestCorrelationHooks,
} from "./request-correlation.js";
import { ensureObjectStorageBucket } from "./storage-bootstrap.js";
import { probeOpenRouterConnectivity } from "./openrouter-connectivity.js";

const requestStartTimes = new WeakMap<object, number>();
const PROVIDER_HEALTH_CACHE_TTL_MS = 60_000;

let providerHealthCache: {
  checkedAt: number;
  reachable: boolean;
  latencyMs?: number;
  error?: string;
} | null = null;

export async function buildServer(): Promise<{
  app: ReturnType<typeof Fastify>;
  ctx: AppContext;
  env: ReturnType<typeof loadEnv>;
}> {
  const env = loadEnv();
  initializeLangfuseTracing("studyagent-api", env);
  initSentry(env.SENTRY_DSN, env.SENTRY_ENVIRONMENT, env.SENTRY_RELEASE ?? env.LANGFUSE_RELEASE);
  const ctx = createContext(env);
  await ensureObjectStorageBucket(ctx);

  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    disableRequestLogging: true,
    bodyLimit: 25 * 1024 * 1024,
  });
  registerRequestCorrelationHooks(app);
  registerHttpMetricsHooks(app);
  registerSentryErrorHook(app);

  await app.register(cors, {
    origin: process.env.NODE_ENV === "production" ? env.PUBLIC_WEB_BASE_URL : true,
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
    limits: { fileSize: env.MAX_UPLOAD_BYTES },
  });

  await registerMetricsRoute(app);
  app.get("/health", async (_request, reply) => {
    const checks: Record<string, string> = {
      auth: ctx.env.DISABLE_AUTH
        ? "dev_disabled_auth"
        : isWorkOSConfigured(ctx)
          ? "workos"
          : "unconfigured",
      ingestionTrigger:
        ctx.env.INGESTION_TRIGGER_MODE === "external"
          ? ctx.env.INGESTION_TRIGGER_URL && ctx.env.INGESTION_TRIGGER_TOKEN
            ? "external_configured"
            : "external_unconfigured"
          : ctx.env.INGESTION_TRIGGER_MODE,
    };
    let ok = true;
    if (
      checks.ingestionTrigger === "external_unconfigured" &&
      process.env.NODE_ENV === "production"
    ) {
      ok = false;
    }

    if (!ctx.env.OPENROUTER_API_KEY) {
      checks.provider = "missing";
      if (process.env.NODE_ENV === "production") {
        ok = false;
      }
    } else {
      const provider = await readProviderHealth(ctx);
      checks.provider = provider.reachable ? "reachable" : "unreachable";
      if (provider.latencyMs != null) {
        checks.providerLatencyMs = String(provider.latencyMs);
      }
      if (!provider.reachable) {
        checks.providerFallback = "local_fallback_available";
        checks.providerError = provider.error ?? "provider_unreachable";
        if (process.env.NODE_ENV === "production") {
          ok = false;
        }
      }
    }

    try {
      await pingDatabase(ctx.db);
      checks.database = "ok";
    } catch (error) {
      checks.database = "error";
      checks.databaseError = error instanceof Error ? error.message : "database_unavailable";
      ok = false;
    }

    if (ctx.s3) {
      try {
        await ctx.s3.send(new HeadBucketCommand({ Bucket: ctx.env.OBJECT_STORAGE_BUCKET }));
        checks.objectStorage = "ok";
      } catch (error) {
        checks.objectStorage = "error";
        checks.objectStorageError =
          error instanceof Error ? error.message : "object_storage_unavailable";
        ok = false;
      }
    } else {
      checks.objectStorage = "unconfigured";
      if (process.env.NODE_ENV === "production") {
        ok = false;
      }
    }

    if (process.env.NODE_ENV === "production" && !isWorkOSConfigured(ctx)) {
      ok = false;
    }

    if (!ok) {
      reply.status(503);
    }
    return { ok, checks };
  });
  await registerAuthRoutes(app, ctx);

  await app.register(
    async (r) => {
      await registerEvalSourceFixtureRoutes(r, ctx);
      await registerEvalRunRoutes(r, ctx);
      await registerEvalEvidenceSnapshotRoutes(r, ctx);
      await registerNotebookRoutes(r, ctx);
      await registerInteractiveLearningRoutes(r, ctx);
      await registerSourceRoutes(r, ctx);
      await registerStudentProfileRoutes(r, ctx);
      await registerLearnerTraitRoutes(r, ctx);
      await registerSearchRoutes(r, ctx);
      await registerGraphRoutes(r, ctx);
      await registerEventStreamRoutes(r, ctx);
      await registerTutorRoutes(r, ctx);
      await registerDeveloperTimelineRoutes(r, ctx);
      await registerHostedBetaRoutes(r, ctx);
      await registerStudyTemplateRoutes(r, ctx);
      await registerAdminRoutes(r, ctx);
      await registerProductAnalyticsRoutes(r, ctx);
      await registerFeedbackRoutes(r, ctx);
      await registerAccessCodeRoutes(r, ctx);
      await registerStripeCheckoutRoutes(r, ctx);
      await registerWorkspaceRoutes(r, ctx);
      await registerAccountRoutes(r, ctx);
    },
    { prefix: "/api/v1" },
  );

  app.addHook("onClose", async () => {
    await closeContext(ctx);
    await shutdownLangfuseTracing();
  });

  return { app, ctx, env };
}

async function readProviderHealth(ctx: AppContext): Promise<{
  reachable: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const now = Date.now();
  if (providerHealthCache && now - providerHealthCache.checkedAt < PROVIDER_HEALTH_CACHE_TTL_MS) {
    return providerHealthCache;
  }

  const status = await probeOpenRouterConnectivity(ctx.env, 1500);
  providerHealthCache = {
    checkedAt: now,
    reachable: status.reachable,
    ...(status.latencyMs != null ? { latencyMs: status.latencyMs } : {}),
    ...(status.error ? { error: status.error } : {}),
  };
  return providerHealthCache;
}

function registerSentryErrorHook(app: FastifyInstance): void {
  app.addHook("onError", async (request, _reply, error) => {
    const correlation = getRequestCorrelationContext(request);
    // Never forward credential-bearing headers (Authorization, Cookie/session token)
    // to the error monitor. Record only their presence for debugging.
    captureException(error, {
      method: request.method,
      route: request.routeOptions?.url ?? "unmatched",
      requestId: correlation?.requestId,
      traceId: correlation?.traceId,
      hasAuthorizationHeader: Boolean(request.headers.authorization),
      hasSessionCookie: Boolean(request.headers.cookie),
    });
  });
}

function registerHttpMetricsHooks(app: FastifyInstance): void {
  app.addHook("onRequest", async (request: FastifyRequest) => {
    requestStartTimes.set(request, Date.now());
  });

  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const started = requestStartTimes.get(request) ?? Date.now();
    requestStartTimes.delete(request);
    // Only the matched route template (e.g. /notebooks/:notebookId) is a bounded label.
    // For unmatched requests (404s) the raw URL contains arbitrary, attacker-controllable
    // segments, so collapse them into a single constant to keep metric cardinality bounded.
    const route = request.routeOptions?.url ?? "unmatched";
    recordHttpRequestMetric({
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs: Date.now() - started,
    });
  });
}
