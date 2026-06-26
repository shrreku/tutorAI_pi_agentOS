import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  accessCodeRedemptions,
  accessCodes,
  creditLedgerEntries,
  type DbClient,
  userProductState,
} from "@studyagent/db";

export type AccessCodeGrants = {
  studyAccess?: boolean;
  ingestionAccess?: boolean;
  tutorCreditsCents?: number;
  ingestionCreditsCents?: number;
  pilotTags?: string[];
  templateIds?: string[];
};

export type AccessCodeType = "single_use" | "campaign";

export class AccessCodeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "AccessCodeError";
  }
}

export type CreateAccessCodeInput = {
  code?: string;
  codeType: AccessCodeType;
  grants: AccessCodeGrants;
  maxRedemptions?: number;
  expiresAt?: Date | null;
  createdByUserId?: string;
};

export type AccessCodeRecord = typeof accessCodes.$inferSelect;
export type AccessCodeRedemptionRecord = typeof accessCodeRedemptions.$inferSelect;

function newAccessCodeId(): string {
  return `ac_${crypto.randomUUID().replaceAll("-", "")}`;
}

function newRedemptionId(): string {
  return `acr_${crypto.randomUUID().replaceAll("-", "")}`;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function generateCode(): string {
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  return `TB-${token}`;
}

function resolveMaxRedemptions(codeType: AccessCodeType, maxRedemptions?: number): number {
  if (codeType === "single_use") {
    return 1;
  }
  if (!maxRedemptions || maxRedemptions < 1) {
    throw new AccessCodeError("invalid_campaign", "Campaign codes require maxRedemptions >= 1");
  }
  return maxRedemptions;
}

export async function createAccessCode(
  dbClient: DbClient,
  input: CreateAccessCodeInput,
): Promise<AccessCodeRecord> {
  const code = normalizeCode(input.code ?? generateCode());
  const maxRedemptions = resolveMaxRedemptions(input.codeType, input.maxRedemptions);
  const now = new Date();
  const id = newAccessCodeId();

  const [row] = await dbClient.db
    .insert(accessCodes)
    .values({
      id,
      code,
      codeType: input.codeType,
      grantsJson: input.grants,
      maxRedemptions,
      redemptionCount: 0,
      expiresAt: input.expiresAt ?? null,
      createdByUserId: input.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create access code");
  }
  return row;
}

async function applyGrants(
  tx: Parameters<Parameters<DbClient["db"]["transaction"]>[0]>[0],
  userId: string,
  grants: AccessCodeGrants,
  accessCodeId: string,
): Promise<void> {
  const [state] = await tx
    .select()
    .from(userProductState)
    .where(eq(userProductState.userId, userId))
    .limit(1);

  const now = new Date();
  const pilotTags = new Set(state?.pilotTagsJson ?? []);
  for (const tag of grants.pilotTags ?? []) {
    pilotTags.add(tag);
  }

  const updates = {
    studyAccess: grants.studyAccess ? 1 : (state?.studyAccess ?? 1),
    ingestionAccess: grants.ingestionAccess ? 1 : (state?.ingestionAccess ?? 0),
    pilotTagsJson: [...pilotTags],
    onboardingJson: mergeGrantedTemplateIds(state?.onboardingJson ?? {}, grants.templateIds ?? []),
    updatedAt: now,
  };

  if (state) {
    await tx.update(userProductState).set(updates).where(eq(userProductState.userId, userId));
  } else {
    await tx.insert(userProductState).values({
      userId,
      studyAccess: updates.studyAccess,
      ingestionAccess: updates.ingestionAccess,
      adminAccess: 0,
      pilotTagsJson: updates.pilotTagsJson,
      onboardingJson: updates.onboardingJson,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (grants.tutorCreditsCents && grants.tutorCreditsCents > 0) {
    await grantCreditsInTransaction(tx, userId, "tutor", grants.tutorCreditsCents, "access_code", {
      accessCodeId,
    });
  }

  if (grants.ingestionCreditsCents && grants.ingestionCreditsCents > 0) {
    await grantCreditsInTransaction(
      tx,
      userId,
      "ingestion",
      grants.ingestionCreditsCents,
      "access_code",
      {
        accessCodeId,
      },
    );
  }
}

async function grantCreditsInTransaction(
  tx: Parameters<Parameters<DbClient["db"]["transaction"]>[0]>[0],
  userId: string,
  creditType: "tutor" | "ingestion",
  amountCents: number,
  reason: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await tx.insert(creditLedgerEntries).values({
    id: `cled_${crypto.randomUUID().replaceAll("-", "")}`,
    userId,
    creditType,
    entryType: "grant",
    amountCents,
    reason,
    metadataJson: metadata,
  });
}

function mergeGrantedTemplateIds(
  onboardingJson: Record<string, unknown>,
  templateIds: string[],
): Record<string, unknown> {
  if (!templateIds.length) {
    return onboardingJson;
  }
  const existing = Array.isArray(onboardingJson.grantedTemplateIds)
    ? onboardingJson.grantedTemplateIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    ...onboardingJson,
    grantedTemplateIds: [...new Set([...existing, ...templateIds])],
  };
}

function parseGrants(value: unknown): AccessCodeGrants {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const grants = value as Record<string, unknown>;
  const parsed: AccessCodeGrants = {};
  if (grants.studyAccess === true) parsed.studyAccess = true;
  if (grants.ingestionAccess === true) parsed.ingestionAccess = true;
  if (typeof grants.tutorCreditsCents === "number")
    parsed.tutorCreditsCents = grants.tutorCreditsCents;
  if (typeof grants.ingestionCreditsCents === "number") {
    parsed.ingestionCreditsCents = grants.ingestionCreditsCents;
  }
  if (Array.isArray(grants.pilotTags)) {
    parsed.pilotTags = grants.pilotTags.filter((tag): tag is string => typeof tag === "string");
  }
  if (Array.isArray(grants.templateIds)) {
    parsed.templateIds = grants.templateIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
  }
  return parsed;
}

export async function redeemAccessCode(
  dbClient: DbClient,
  userId: string,
  rawCode: string,
): Promise<{ accessCodeId: string; grants: AccessCodeGrants }> {
  const code = normalizeCode(rawCode);
  if (!code) {
    throw new AccessCodeError("invalid_code", "Access code is required");
  }

  return dbClient.db.transaction(async (tx) => {
    const [row] = await tx.select().from(accessCodes).where(eq(accessCodes.code, code)).limit(1);

    if (!row) {
      throw new AccessCodeError("invalid_code", "This access code is not valid");
    }
    if (row.revokedAt) {
      throw new AccessCodeError("code_revoked", "This access code is no longer active");
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw new AccessCodeError("code_expired", "This access code has expired");
    }

    const [existingRedemption] = await tx
      .select({ id: accessCodeRedemptions.id })
      .from(accessCodeRedemptions)
      .where(
        and(
          eq(accessCodeRedemptions.accessCodeId, row.id),
          eq(accessCodeRedemptions.userId, userId),
        ),
      )
      .limit(1);

    if (existingRedemption) {
      throw new AccessCodeError("already_redeemed", "You have already redeemed this access code");
    }

    const maxRedemptions = row.maxRedemptions ?? 1;
    if (row.redemptionCount >= maxRedemptions) {
      throw new AccessCodeError("code_exhausted", "This access code has already been used");
    }

    const grants = parseGrants(row.grantsJson);
    await applyGrants(tx, userId, grants, row.id);

    const updated = await tx
      .update(accessCodes)
      .set({
        redemptionCount: sql`${accessCodes.redemptionCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(accessCodes.id, row.id),
          isNull(accessCodes.revokedAt),
          sql`${accessCodes.redemptionCount} < ${maxRedemptions}`,
        ),
      )
      .returning({ id: accessCodes.id, redemptionCount: accessCodes.redemptionCount });

    if (!updated[0]) {
      throw new AccessCodeError("code_exhausted", "This access code has already been used");
    }

    await tx.insert(accessCodeRedemptions).values({
      id: newRedemptionId(),
      accessCodeId: row.id,
      userId,
      redeemedAt: new Date(),
    });

    return { accessCodeId: row.id, grants };
  });
}

export async function revokeAccessCode(
  dbClient: DbClient,
  accessCodeId: string,
): Promise<AccessCodeRecord> {
  const now = new Date();
  const [row] = await dbClient.db
    .update(accessCodes)
    .set({ revokedAt: now, updatedAt: now })
    .where(eq(accessCodes.id, accessCodeId))
    .returning();

  if (!row) {
    throw new AccessCodeError("not_found", "Access code not found", 404);
  }
  return row;
}

export async function listAccessCodes(
  dbClient: DbClient,
  limit = 100,
): Promise<AccessCodeRecord[]> {
  return dbClient.db
    .select()
    .from(accessCodes)
    .orderBy(sql`${accessCodes.createdAt} desc`)
    .limit(limit);
}

export async function listAccessCodeRedemptions(
  dbClient: DbClient,
  limit = 500,
): Promise<AccessCodeRedemptionRecord[]> {
  return dbClient.db
    .select()
    .from(accessCodeRedemptions)
    .orderBy(desc(accessCodeRedemptions.redeemedAt))
    .limit(limit);
}
