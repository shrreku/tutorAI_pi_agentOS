import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import {
  AccessCodeError,
  createAccessCode,
  listAccessCodes,
  listAccessCodeRedemptions,
  redeemAccessCode,
  revokeAccessCode,
  type AccessCodeGrants,
  type AccessCodeType,
} from "../hosted-beta/access-codes.js";
import { requireAdminAccess, requireBetaConsent, requireStudyAccess, sendAuthOrEntitlementError } from "../hosted-beta/entitlements.js";
import { recordProductAnalytics } from "../hosted-beta/product-analytics.js";

function sendAccessCodeError(reply: Parameters<typeof sendAuthOrEntitlementError>[0], error: unknown) {
  if (error instanceof AccessCodeError) {
    return reply.status(error.statusCode).send({ code: error.code, message: error.message });
  }
  return sendAuthOrEntitlementError(reply, error);
}

export async function registerAccessCodeRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post<{ Body: { code: string } }>("/access-codes/redeem", async (request, reply) => {
    let actorId: string | undefined;
    try {
      const { actor } = await requireStudyAccess(ctx, request);
      actorId = actor.id;
      await requireBetaConsent(ctx, request);

      const code = request.body?.code;
      if (!code || typeof code !== "string") {
        return reply.status(400).send({ code: "bad_request", message: "code is required" });
      }

      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: "access_code_redeem_attempt",
        properties: { codeLength: code.trim().length },
      });

      const result = await redeemAccessCode(ctx.db, actor.id, code);

      // Post-grant analytics must never fail a successful redemption.
      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: "access_code_redeemed",
        properties: {
          accessCodeId: result.accessCodeId,
          grants: result.grants,
        },
      }).catch(() => undefined);
      if ((result.grants.tutorCreditsCents ?? 0) > 0 || (result.grants.ingestionCreditsCents ?? 0) > 0) {
        await recordProductAnalytics(ctx, {
          userId: actor.id,
          eventName: "credit_top_up",
          properties: {
            source: "access_code",
            accessCodeId: result.accessCodeId,
            tutorCreditsCents: result.grants.tutorCreditsCents ?? 0,
            ingestionCreditsCents: result.grants.ingestionCreditsCents ?? 0,
          },
        }).catch(() => undefined);
      }

      return reply.send({ ok: true, grants: result.grants });
    } catch (error) {
      if (error instanceof AccessCodeError && actorId) {
        await recordProductAnalytics(ctx, {
          userId: actorId,
          eventName: "access_code_redeem_failed",
          properties: { reason: error.code },
        }).catch(() => undefined);
      }
      return sendAccessCodeError(reply, error);
    }
  });

  app.post<{
    Body: {
      code?: string;
      codeType: AccessCodeType;
      grants: AccessCodeGrants;
      maxRedemptions?: number;
      expiresAt?: string;
    };
  }>("/admin/access-codes", async (request, reply) => {
    try {
      const { actor } = await requireAdminAccess(ctx, request);
      const body = request.body;
      if (!body?.codeType || !body.grants) {
        return reply.status(400).send({ code: "bad_request", message: "codeType and grants are required" });
      }

      const created = await createAccessCode(ctx.db, {
        ...(body.code ? { code: body.code } : {}),
        codeType: body.codeType,
        grants: body.grants,
        ...(typeof body.maxRedemptions === "number" ? { maxRedemptions: body.maxRedemptions } : {}),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdByUserId: actor.id,
      });

      return reply.status(201).send({ accessCode: created });
    } catch (error) {
      return sendAccessCodeError(reply, error);
    }
  });

  app.get("/admin/access-codes", async (request, reply) => {
    try {
      await requireAdminAccess(ctx, request);
      const [accessCodes, redemptions] = await Promise.all([
        listAccessCodes(ctx.db),
        listAccessCodeRedemptions(ctx.db),
      ]);
      return reply.send({ accessCodes, redemptions });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.delete<{ Params: { id: string } }>("/admin/access-codes/:id", async (request, reply) => {
    try {
      await requireAdminAccess(ctx, request);
      const revoked = await revokeAccessCode(ctx.db, request.params.id);
      return reply.send({ accessCode: revoked });
    } catch (error) {
      return sendAccessCodeError(reply, error);
    }
  });
}
