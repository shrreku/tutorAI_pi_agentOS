import type { FastifyInstance } from "fastify";
import { renderPrometheusMetrics } from "@studyagent/observability";

export async function registerMetricsRoute(app: FastifyInstance): Promise<void> {
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return reply.send(renderPrometheusMetrics());
  });
}
