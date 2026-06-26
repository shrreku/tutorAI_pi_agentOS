import { createDb } from "@studyagent/db";
import { resumePendingBackgroundWikiPolishes } from "@studyagent/wiki-generation";
import { pathToFileURL } from "node:url";
import { buildServer } from "./server.js";
import {
  formatOpenRouterConnectivityWarning,
  probeOpenRouterConnectivity,
} from "./openrouter-connectivity.js";

const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);

async function main() {
  const { app, env } = await buildServer();
  const dbClient = createDb(env.DATABASE_URL);
  void resumePendingBackgroundWikiPolishes(env, dbClient, { maxPages: 5 }).catch((error) => {
    app.log.warn({ err: error }, "Failed to resume pending background wiki polishes on startup");
  });
  if (env.OPENROUTER_API_KEY) {
    const connectivity = await probeOpenRouterConnectivity(env);
    if (!connectivity.reachable) {
      app.log.warn(formatOpenRouterConnectivityWarning(connectivity));
    } else if (connectivity.latencyMs != null) {
      app.log.info(
        { latencyMs: connectivity.latencyMs },
        "OpenRouter connectivity probe succeeded",
      );
    }
  }
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.log.info(`API listening on http://0.0.0.0:${env.API_PORT}`);
}

if (isMain) {
  void main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
