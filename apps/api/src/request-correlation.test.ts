import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getOrCreateRequestCorrelationContext,
  getRequestCorrelationContext,
  registerRequestCorrelationHooks,
} from "./request-correlation.js";

describe("request correlation", () => {
  let app = Fastify();

  beforeEach(() => {
    app = Fastify();
  });

  afterEach(async () => {
    await app.close();
  });

  it("adds correlation context and headers to ordinary Fastify responses", async () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    registerRequestCorrelationHooks(app);
    app.get("/ping", async (request) => {
      const context = getRequestCorrelationContext(request);
      return { traceId: context?.traceId, requestId: context?.requestId };
    });

    const response = await app.inject({
      method: "GET",
      url: "/ping",
      headers: {
        traceparent: `00-${traceId}-00f067aa0ba902b7-01`,
        "x-request-id": "request_1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ traceId, requestId: "request_1" });
    expect(response.headers["x-studyagent-trace-id"]).toBe(traceId);
    expect(response.headers["x-studyagent-request-id"]).toBe("request_1");
    expect(response.headers.traceparent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
  });

  it("creates a stable fallback context for routes mounted without the server hook", async () => {
    app.get("/fallback", async (request) => {
      const first = getOrCreateRequestCorrelationContext(request);
      const second = getOrCreateRequestCorrelationContext(request);
      return { same: first === second, traceId: first.traceId, requestId: first.requestId };
    });

    const response = await app.inject({ method: "GET", url: "/fallback" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      same: true,
      traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      requestId: expect.any(String),
    });
  });
});
