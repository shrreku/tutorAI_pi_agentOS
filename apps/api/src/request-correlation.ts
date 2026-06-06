import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createCorrelationContext, type CorrelationContext } from "@studyagent/observability";

const requestCorrelationContexts = new WeakMap<FastifyRequest, CorrelationContext>();

export function registerRequestCorrelationHooks(app: FastifyInstance): void {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const context = getOrCreateRequestCorrelationContext(request);
    applyCorrelationHeaders(reply, context);
  });
}

export function getRequestCorrelationContext(request: FastifyRequest): CorrelationContext | undefined {
  return requestCorrelationContexts.get(request);
}

export function getOrCreateRequestCorrelationContext(request: FastifyRequest): CorrelationContext {
  const existing = getRequestCorrelationContext(request);
  if (existing) return existing;
  const traceparent = firstHeader(request.headers.traceparent);
  const context = createCorrelationContext({
    ...(traceparent ? { traceparent } : {}),
    requestId: firstHeader(request.headers["x-request-id"]) ?? request.id,
  });
  requestCorrelationContexts.set(request, context);
  return context;
}

export function applyCorrelationHeaders(reply: FastifyReply, context: CorrelationContext): void {
  reply.header("X-StudyAgent-Trace-Id", context.traceId);
  reply.header("X-StudyAgent-Request-Id", context.requestId);
  reply.header("traceparent", context.traceparent);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
