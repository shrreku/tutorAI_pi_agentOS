import { pathToFileURL } from "node:url";
import { buildServer } from "./server.js";

const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);

async function main() {
  const { app, env } = await buildServer();
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.log.info(`API listening on http://0.0.0.0:${env.API_PORT}`);
}

if (isMain) {
  void main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
