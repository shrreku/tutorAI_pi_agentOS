import type { FastifyInstance, FastifyRequest } from "fastify";
import { getActivationSummary } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { requireActor } from "../auth.js";
import { requireBetaConsent, requireAdminAccess, sendAuthOrEntitlementError } from "../hosted-beta/entitlements.js";
import { recordProductAnalytics } from "../hosted-beta/product-analytics.js";

const PUBLIC_ANALYTICS_EVENTS = new Set([
  "visitor_page_view",
  "login_redirect",
]);
const CLIENT_ANALYTICS_EVENTS = new Set([
  "workspace_page_view",
  "credits_page_view",
  "support_page_view",
  "account_page_view",
]);

export async function registerProductAnalyticsRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/analytics/replay-policy", async (request, reply) => {
    try {
      await requireActor(ctx, request);
      await requireBetaConsent(ctx, request);
      const disabledUntil = ctx.env.POSTHOG_REPLAY_DISABLED_UNTIL;
      const spendGuardActive = Boolean(disabledUntil && new Date(disabledUntil).getTime() > Date.now());
      return reply.send({
        enabled: ctx.env.POSTHOG_REPLAY_ENABLED && !spendGuardActive,
        sampleRate: ctx.env.POSTHOG_REPLAY_SAMPLE_RATE,
        disabledUntil: disabledUntil ?? null,
      });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.post<{
    Body: {
      eventName: string;
      properties?: Record<string, unknown>;
    };
  }>("/analytics/public-events", async (request, reply) => {
    const body = request.body;
    if (!body?.eventName || typeof body.eventName !== "string") {
      return reply.status(400).send({ code: "bad_request", message: "eventName is required" });
    }
    if (!PUBLIC_ANALYTICS_EVENTS.has(body.eventName)) {
      return reply.status(400).send({ code: "bad_request", message: "Unsupported public analytics event" });
    }

    const result = await recordProductAnalytics(ctx, {
      eventName: body.eventName,
      properties: sanitizePublicAnalyticsProperties({
        ...(body.properties ?? {}),
        path: safePath(request.headers.referer),
      }),
    });
    return reply.status(201).send({ ok: true, id: result.id });
  });

  app.post<{
    Body: {
      userId?: string;
      eventName: string;
      properties?: Record<string, unknown>;
    };
  }>("/analytics/events", async (request, reply) => {
    try {
      const actor = await requireActor(ctx, request);
      await requireBetaConsent(ctx, request);
      const body = request.body;
      if (!body?.eventName || typeof body.eventName !== "string") {
        return reply.status(400).send({ code: "bad_request", message: "eventName is required" });
      }
      if (!CLIENT_ANALYTICS_EVENTS.has(body.eventName)) {
        return reply.status(400).send({
          code: "unsupported_analytics_event",
          message: "This analytics event must be recorded by the server-owned product workflow.",
        });
      }
      if (body.userId && body.userId !== actor.id) {
        return reply.status(403).send({ code: "forbidden", message: "userId must match the authenticated actor" });
      }

      const result = await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: body.eventName,
        ...(body.properties ? { properties: body.properties } : {}),
      });
      return reply.status(201).send({ ok: true, id: result.id });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.get("/admin/analytics/activation-summary", async (request, reply) => {
    try {
      await requireAdminAccess(ctx, request);
      const summary = await getActivationSummary(ctx.db);
      return reply.send({ summary });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });
}

function safePath(referer: string | string[] | undefined): string | null {
  const value = Array.isArray(referer) ? referer[0] : referer;
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    return parsed.pathname;
  } catch {
    return null;
  }
}

function sanitizePublicAnalyticsProperties(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      output[key] = value.slice(0, 160);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      output[key] = value;
    }
  }
  return output;
}

export async function trackAnalyticsFromRequest(
  ctx: AppContext,
  request: FastifyRequest,
  input: {
    userId?: string;
    eventName: string;
    properties?: Record<string, unknown>;
  },
): Promise<void> {
  await recordProductAnalytics(ctx, input);
}
