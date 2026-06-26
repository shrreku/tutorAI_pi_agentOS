import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import {
  AuthError,
  buildWorkOSAuthorizeUrl,
  clearSession,
  createSession,
  createWorkOSSession,
  exchangeWorkOSCode,
  isWorkOSConfigured,
  parseWorkOSCallbackCodeForDev,
  resolveActor,
  upsertHostedUser,
} from "../auth.js";
import { eq } from "drizzle-orm";
import { users } from "@studyagent/db";
import { recordProductAnalytics } from "../hosted-beta/product-analytics.js";

export async function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/auth/session", async (request, reply) => {
    try {
      const actor = await resolveActor(ctx, request);
      return reply.send({
        authenticated: true,
        actor,
        mode: ctx.env.DISABLE_AUTH ? "dev" : "hosted",
        workosConfigured: isWorkOSConfigured(ctx),
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({
          authenticated: false,
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  });

  if (ctx.env.DISABLE_AUTH) {
    app.post<{ Body: { userId?: string; email?: string } }>("/auth/dev-login", async (request, reply) => {
      const body = request.body ?? {};
      let actor;

      if (typeof body.userId === "string" && body.userId.length > 0) {
        const [row] = await ctx.db.db.select().from(users).where(eq(users.id, body.userId)).limit(1);
        if (!row) {
          return reply.status(404).send({ code: "not_found", message: "User not found" });
        }
        actor = { id: row.id, email: row.email };
      } else if (typeof body.email === "string" && body.email.length > 0) {
        actor = await upsertHostedUser(ctx, { email: body.email });
      } else {
        actor = await resolveActor(ctx, request);
      }

      createSession(reply, ctx, actor);
      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: "login",
        properties: { method: "dev" },
      });
      return reply.send({ authenticated: true, actor });
    });
  }

  app.post("/auth/logout", async (_request, reply) => {
    clearSession(reply, ctx);
    return reply.send({ ok: true });
  });

  if (isWorkOSConfigured(ctx)) {
    app.get("/auth/login", async (_request, reply) => {
      const authorizeUrl = buildWorkOSAuthorizeUrl(ctx);
      return reply.redirect(authorizeUrl);
    });
  }

  app.get<{ Querystring: { code?: string } }>("/auth/callback", async (request, reply) => {
    const code = request.query.code;
    if (!code || code.trim().length === 0) {
      return reply.status(400).send({ code: "bad_request", message: "code query parameter is required" });
    }

    try {
      const identity = isWorkOSConfigured(ctx)
        ? await exchangeWorkOSCode(ctx, code)
        : process.env.NODE_ENV === "production"
          ? (() => {
              throw new AuthError("workos_unconfigured", "WorkOS must be configured in production.", 503);
            })()
          : parseWorkOSCallbackCodeForDev(code);

      const actor = await upsertHostedUser(ctx, {
        email: identity.email,
        workosUserId: identity.workosUserId,
        displayName: identity.displayName ?? null,
      });
      if (identity.sealedSession) {
        createWorkOSSession(reply, ctx, identity.sealedSession);
      } else {
        createSession(reply, ctx, actor, { workosUserId: identity.workosUserId });
      }
      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: "login",
        properties: { method: identity.sealedSession ? "workos" : "dev_callback" },
      });

      const redirectTarget = `${ctx.env.PUBLIC_WEB_BASE_URL.replace(/\/$/, "")}/app`;
      return reply.redirect(redirectTarget);
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({ code: error.code, message: error.message });
      }
      throw error;
    }
  });
}
