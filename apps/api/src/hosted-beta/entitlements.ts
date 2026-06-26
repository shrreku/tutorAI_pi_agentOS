import { and, desc, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { betaConsents, userProductState, users } from "@studyagent/db";
import type { Actor } from "../auth.js";
import { AuthError, requireActor } from "../auth.js";
import type { AppContext } from "../context.js";

export type UserProductState = typeof userProductState.$inferSelect;
export type BetaConsent = typeof betaConsents.$inferSelect;

export class EntitlementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 403,
  ) {
    super(message);
    this.name = "EntitlementError";
  }
}

export async function getUserProductState(
  ctx: AppContext,
  userId: string,
): Promise<UserProductState | null> {
  const [row] = await ctx.db.db
    .select()
    .from(userProductState)
    .where(eq(userProductState.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function ensureUserProductState(ctx: AppContext, userId: string): Promise<UserProductState> {
  const existing = await getUserProductState(ctx, userId);
  if (existing) {
    return existing;
  }

  const now = new Date();
  await ctx.db.db.insert(userProductState).values({
    userId,
    studyAccess: 1,
    ingestionAccess: 0,
    adminAccess: 0,
    pilotTagsJson: [],
    onboardingJson: {},
    createdAt: now,
    updatedAt: now,
  });

  const created = await getUserProductState(ctx, userId);
  if (!created) {
    throw new Error(`Failed to create user product state for ${userId}`);
  }
  return created;
}

export async function isUserDisabled(ctx: AppContext, userId: string): Promise<boolean> {
  const [row] = await ctx.db.db
    .select({ disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(row?.disabledAt);
}

export async function hasStudyAccess(ctx: AppContext, userId: string): Promise<boolean> {
  if (await isUserDisabled(ctx, userId)) {
    return false;
  }
  const state = await getUserProductState(ctx, userId);
  return (state?.studyAccess ?? 0) > 0;
}

export async function hasIngestionAccess(ctx: AppContext, userId: string): Promise<boolean> {
  if (await isUserDisabled(ctx, userId)) {
    return false;
  }
  const state = await getUserProductState(ctx, userId);
  return (state?.ingestionAccess ?? 0) > 0;
}

export async function hasAdminAccess(ctx: AppContext, userId: string): Promise<boolean> {
  if (await isUserDisabled(ctx, userId)) {
    return false;
  }
  const state = await getUserProductState(ctx, userId);
  return (state?.adminAccess ?? 0) > 0;
}

export async function hasAcceptedBetaConsent(ctx: AppContext, userId: string): Promise<boolean> {
  const version = ctx.env.BETA_CONSENT_VERSION;
  const [row] = await ctx.db.db
    .select({ id: betaConsents.id })
    .from(betaConsents)
    .where(and(eq(betaConsents.userId, userId), eq(betaConsents.consentVersion, version)))
    .limit(1);
  return Boolean(row);
}

export async function getLatestBetaConsent(ctx: AppContext, userId: string): Promise<BetaConsent | null> {
  const [row] = await ctx.db.db
    .select()
    .from(betaConsents)
    .where(eq(betaConsents.userId, userId))
    .orderBy(desc(betaConsents.acceptedAt))
    .limit(1);
  return row ?? null;
}

export async function acceptBetaConsent(ctx: AppContext, userId: string): Promise<BetaConsent> {
  const version = ctx.env.BETA_CONSENT_VERSION;
  const existing = await getLatestBetaConsent(ctx, userId);
  if (existing?.consentVersion === version) {
    return existing;
  }

  const now = new Date();
  const id = `bc_${crypto.randomUUID().replaceAll("-", "")}`;
  await ctx.db.db
    .insert(betaConsents)
    .values({
      id,
      userId,
      consentVersion: version,
      acceptedAt: now,
    })
    .onConflictDoNothing({
      target: [betaConsents.userId, betaConsents.consentVersion],
    });

  const [row] = await ctx.db.db
    .select()
    .from(betaConsents)
    .where(and(eq(betaConsents.userId, userId), eq(betaConsents.consentVersion, version)))
    .limit(1);

  if (!row) {
    throw new Error(`Failed to record beta consent for ${userId}`);
  }
  return row;
}

async function assertEntitlement(
  allowed: boolean,
  code: string,
  message: string,
  statusCode = 403,
): Promise<void> {
  if (!allowed) {
    throw new EntitlementError(code, message, statusCode);
  }
}

export async function requireStudyAccess(
  ctx: AppContext,
  request: FastifyRequest,
): Promise<{ actor: Actor; productState: UserProductState }> {
  const actor = await requireActor(ctx, request);
  const productState = await ensureUserProductState(ctx, actor.id);
  await assertEntitlement(
    productState.studyAccess > 0 && !(await isUserDisabled(ctx, actor.id)),
    "study_access_required",
    "Study access is required.",
  );
  return { actor, productState };
}

export async function requireIngestionAccess(
  ctx: AppContext,
  request: FastifyRequest,
): Promise<{ actor: Actor; productState: UserProductState }> {
  const actor = await requireActor(ctx, request);
  const productState = await ensureUserProductState(ctx, actor.id);
  await assertEntitlement(
    productState.ingestionAccess > 0 && !(await isUserDisabled(ctx, actor.id)),
    "ingestion_access_required",
    "Ingestion access is required.",
  );
  return { actor, productState };
}

export async function requireAdminAccess(
  ctx: AppContext,
  request: FastifyRequest,
): Promise<{ actor: Actor; productState: UserProductState }> {
  const actor = await requireActor(ctx, request);
  const productState = await ensureUserProductState(ctx, actor.id);
  await assertEntitlement(
    productState.adminAccess > 0 && !(await isUserDisabled(ctx, actor.id)),
    "admin_access_required",
    "Admin access is required.",
  );
  return { actor, productState };
}

export async function requireBetaConsent(
  ctx: AppContext,
  request: FastifyRequest,
): Promise<{ actor: Actor; consentVersion: string }> {
  const actor = await requireActor(ctx, request);
  const accepted = await hasAcceptedBetaConsent(ctx, actor.id);
  await assertEntitlement(
    accepted,
    "beta_consent_required",
    `Beta consent version ${ctx.env.BETA_CONSENT_VERSION} is required.`,
  );
  return { actor, consentVersion: ctx.env.BETA_CONSENT_VERSION };
}

export function sendAuthOrEntitlementError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof AuthError || error instanceof EntitlementError) {
    return reply.status(error.statusCode).send({ code: error.code, message: error.message });
  }
  throw error;
}
