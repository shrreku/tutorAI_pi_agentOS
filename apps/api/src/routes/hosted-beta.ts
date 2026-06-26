import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  getCreditSummaryForLearner,
  grantTrialBudgetIfNeeded,
  userProductState,
  users,
} from "@studyagent/db";
import type { AppContext } from "../context.js";
import { AuthError, buildWorkOSAuthorizeUrl, isWorkOSConfigured, requireActor } from "../auth.js";
import {
  acceptBetaConsent,
  ensureUserProductState,
  getLatestBetaConsent,
  hasAcceptedBetaConsent,
  sendAuthOrEntitlementError,
} from "../hosted-beta/entitlements.js";
import { recordProductAnalytics } from "../hosted-beta/product-analytics.js";

export async function registerHostedBetaRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/auth/workos/login", async (_request, reply) => {
    if (!isWorkOSConfigured(ctx)) {
      return reply
        .status(503)
        .send({ code: "workos_unconfigured", message: "WorkOS login is not configured" });
    }
    const authorizeUrl = buildWorkOSAuthorizeUrl(ctx);
    return reply.redirect(authorizeUrl);
  });

  app.get("/me", async (request, reply) => {
    try {
      const actor = await requireActor(ctx, request);
      const [user] = await ctx.db.db.select().from(users).where(eq(users.id, actor.id)).limit(1);
      const productState = await ensureUserProductState(ctx, actor.id);
      const consentAccepted = await hasAcceptedBetaConsent(ctx, actor.id);

      await grantTrialBudgetIfNeeded(ctx.db, actor.id, ctx.env);
      const credits = await getCreditSummaryForLearner(ctx.db, actor.id);

      return reply.send({
        actor: { id: actor.id, email: actor.email },
        user: {
          id: actor.id,
          email: actor.email,
          displayName: user?.displayName ?? null,
        },
        authenticated: true,
        disabled: Boolean(user?.disabledAt),
        productState: {
          studyAccess: productState.studyAccess,
          ingestionAccess: productState.ingestionAccess,
          adminAccess: productState.adminAccess,
        },
        entitlements: {
          studyAccess: productState.studyAccess > 0,
          ingestionAccess: productState.ingestionAccess > 0,
          adminAccess: productState.adminAccess > 0,
        },
        consent: {
          accepted: consentAccepted,
          requiredVersion: ctx.env.BETA_CONSENT_VERSION,
        },
        consentAccepted,
        consentVersion: consentAccepted ? ctx.env.BETA_CONSENT_VERSION : null,
        credits: {
          percentRemaining: credits.percentRemaining,
          exhausted: credits.exhausted,
        },
        onboardingJson: productState.onboardingJson ?? {},
        onboarding: {
          completed: Boolean(
            productState.onboardingJson?.completed || productState.onboardingJson?.skipped,
          ),
          studyGoal:
            typeof productState.onboardingJson?.studyGoal === "string"
              ? productState.onboardingJson.studyGoal
              : undefined,
          level:
            typeof productState.onboardingJson?.level === "string"
              ? productState.onboardingJson.level
              : undefined,
          skipped: Boolean(productState.onboardingJson?.skipped),
        },
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({ code: error.code, message: error.message });
      }
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.post("/consent", async (request, reply) => {
    try {
      const actor = await requireActor(ctx, request);
      const consent = await acceptBetaConsent(ctx, actor.id);
      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: "consent_accepted",
        properties: {
          consentVersion: consent.consentVersion,
        },
      });
      return reply.status(201).send({
        ok: true,
        consentVersion: consent.consentVersion,
        acceptedAt: consent.acceptedAt,
      });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.get("/consent/status", async (request, reply) => {
    try {
      const actor = await requireActor(ctx, request);
      const accepted = await hasAcceptedBetaConsent(ctx, actor.id);
      const latest = await getLatestBetaConsent(ctx, actor.id);
      return reply.send({
        accepted,
        requiredVersion: ctx.env.BETA_CONSENT_VERSION,
        latestVersion: latest?.consentVersion ?? null,
      });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.get("/credits", async (request, reply) => {
    try {
      const actor = await requireActor(ctx, request);
      await grantTrialBudgetIfNeeded(ctx.db, actor.id, ctx.env);
      const summary = await getCreditSummaryForLearner(ctx.db, actor.id);
      return reply.send({
        percentRemaining: summary.percentRemaining,
        exhausted: summary.exhausted,
      });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.patch<{
    Body: {
      studyGoal?: string;
      level?: string;
      skipped?: boolean;
    };
  }>("/me/onboarding", async (request, reply) => {
    try {
      const actor = await requireActor(ctx, request);
      const productState = await ensureUserProductState(ctx, actor.id);
      const body = request.body ?? {};
      const current = productState.onboardingJson ?? {};
      const now = new Date().toISOString();
      const onboardingJson: Record<string, unknown> = {
        ...current,
        ...(body.skipped
          ? { skipped: true, completed: true, completedAt: now }
          : {
              studyGoal: body.studyGoal?.trim() || current.studyGoal,
              level: body.level?.trim() || current.level,
              completed: Boolean(body.studyGoal?.trim()),
              completedAt: body.studyGoal?.trim() ? now : current.completedAt,
            }),
      };

      await ctx.db.db
        .update(userProductState)
        .set({ onboardingJson, updatedAt: new Date() })
        .where(eq(userProductState.userId, actor.id));

      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: body.skipped ? "onboarding_skipped" : "onboarding_submitted",
        properties: {
          level: onboardingJson.level ?? null,
          hasStudyGoal: Boolean(onboardingJson.studyGoal),
        },
      });

      return reply.send({
        onboarding: {
          completed: Boolean(onboardingJson.completed || onboardingJson.skipped),
          studyGoal:
            typeof onboardingJson.studyGoal === "string" ? onboardingJson.studyGoal : undefined,
          level: typeof onboardingJson.level === "string" ? onboardingJson.level : undefined,
          skipped: Boolean(onboardingJson.skipped),
        },
      });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });
}
