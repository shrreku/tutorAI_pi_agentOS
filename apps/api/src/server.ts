import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { loadEnv } from "@studyagent/config";
import { initializeLangfuseTracing, shutdownLangfuseTracing } from "@studyagent/observability";
import { createContext, closeContext, type AppContext } from "./context.js";
import { registerNotebookRoutes } from "./routes/notebooks.js";
import { registerGraphRoutes } from "./routes/graph.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerSourceRoutes } from "./routes/sources.js";
import { registerStudentProfileRoutes } from "./routes/student-profile.js";
import { registerEventStreamRoutes } from "./routes/events-stream.js";
import { registerTutorRoutes } from "./routes/tutor.js";
import { registerDeveloperTimelineRoutes } from "./routes/developer-timeline.js";
import { ensureObjectStorageBucket } from "./storage-bootstrap.js";

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
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(
    async (r) => {
      await registerNotebookRoutes(r, ctx);
      await registerSourceRoutes(r, ctx);
      await registerStudentProfileRoutes(r, ctx);
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
