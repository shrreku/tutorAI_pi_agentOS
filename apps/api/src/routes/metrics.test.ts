import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MetricRegistry, recordHttpRequestMetric, resetObservabilityForTests } from "@studyagent/observability";
import { registerMetricsRoute } from "./metrics.js";

describe("metrics route", () => {
  let app = Fastify();

  beforeEach(async () => {
    resetObservabilityForTests();
    app = Fastify();
    await registerMetricsRoute(app);
  });

  afterEach(async () => {
    await app.close();
    resetObservabilityForTests();
  });

  it("exposes Prometheus text metrics", async () => {
    recordHttpRequestMetric({
      method: "GET",
      route: "/health",
      statusCode: 200,
      durationMs: 12,
    });

    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain; version=0.0.4");
    expect(response.body).toContain("# TYPE studyagent_http_requests_total counter");
    expect(response.body).toContain('studyagent_http_requests_total{method="GET",route="/health",status_class="2xx"} 1');
  });

  it("can render a standalone registry for tests and isolated processes", () => {
    const registry = new MetricRegistry();
    recordHttpRequestMetric({ method: "GET", route: "/health", statusCode: 200, durationMs: 1, registry });

    expect(registry.renderPrometheus()).toContain('studyagent_http_requests_total{method="GET",route="/health",status_class="2xx"} 1');
  });
});
