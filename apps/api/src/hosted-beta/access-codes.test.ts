import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accessCodeRedemptions,
  accessCodes,
  createDb,
  creditLedgerEntries,
  userProductState,
  users,
} from "@studyagent/db";
import {
  AccessCodeError,
  createAccessCode,
  redeemAccessCode,
  revokeAccessCode,
} from "./access-codes.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://studyagent:studyagent@127.0.0.1:5433/studyagent";
const shouldRun = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe("access codes unit", () => {
  it("rejects invalid campaign configuration", async () => {
    if (!shouldRun) return;

    const dbClient = createDb(DATABASE_URL);
    try {
      await expect(
        createAccessCode(dbClient, {
          codeType: "campaign",
          grants: { studyAccess: true },
        }),
      ).rejects.toBeInstanceOf(AccessCodeError);
    } finally {
      await dbClient.sql.end();
    }
  });
});

describe("access codes integration", () => {
  it("redeems single-use codes and applies grants atomically", async () => {
    if (!shouldRun) return;

    const dbClient = createDb(DATABASE_URL);
    const suffix = `${Date.now()}`;
    const userId = `usr_ac_${suffix}`;
    const now = new Date();

    try {
      await dbClient.db.insert(users).values({
        id: userId,
        email: `ac_${suffix}@example.com`,
        displayName: "Access Code User",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });

      const created = await createAccessCode(dbClient, {
        code: `TB-TEST-${suffix}`,
        codeType: "single_use",
        grants: {
          ingestionAccess: true,
          tutorCreditsCents: 50,
          pilotTags: ["pilot-a"],
          templateIds: ["st_template_1"],
        },
      });

      const first = await redeemAccessCode(dbClient, userId, created.code);
      expect(first.grants.ingestionAccess).toBe(true);

      const [state] = await dbClient.db
        .select()
        .from(userProductState)
        .where(eq(userProductState.userId, userId))
        .limit(1);
      expect(state?.ingestionAccess).toBe(1);
      expect(state?.pilotTagsJson).toContain("pilot-a");
      expect(state?.onboardingJson).toMatchObject({ grantedTemplateIds: ["st_template_1"] });

      const ledger = await dbClient.db
        .select()
        .from(creditLedgerEntries)
        .where(eq(creditLedgerEntries.userId, userId));
      expect(ledger.some((entry) => entry.amountCents === 50)).toBe(true);

      await expect(redeemAccessCode(dbClient, userId, created.code)).rejects.toMatchObject({
        code: "already_redeemed",
      });

      const revokedCode = await createAccessCode(dbClient, {
        code: `TB-REV-${suffix}`,
        codeType: "single_use",
        grants: { studyAccess: true },
      });
      await revokeAccessCode(dbClient, revokedCode.id);
      const otherUserId = `usr_ac_other_${suffix}`;
      await dbClient.db.insert(users).values({
        id: otherUserId,
        email: `other_${suffix}@example.com`,
        displayName: "Other User",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });
      await expect(redeemAccessCode(dbClient, otherUserId, revokedCode.code)).rejects.toMatchObject(
        {
          code: "code_revoked",
        },
      );
      await dbClient.db.delete(users).where(eq(users.id, otherUserId));
    } finally {
      await dbClient.db
        .delete(accessCodeRedemptions)
        .where(eq(accessCodeRedemptions.userId, userId));
      await dbClient.db.delete(creditLedgerEntries).where(eq(creditLedgerEntries.userId, userId));
      await dbClient.db.delete(userProductState).where(eq(userProductState.userId, userId));
      await dbClient.db.delete(accessCodes).where(eq(accessCodes.code, `TB-TEST-${suffix}`));
      await dbClient.db.delete(users).where(eq(users.id, userId));
      await dbClient.sql.end();
    }
  });

  it("enforces campaign max redemptions", async () => {
    if (!shouldRun) return;

    const dbClient = createDb(DATABASE_URL);
    const suffix = `${Date.now()}`;
    const userA = `usr_ac_a_${suffix}`;
    const userB = `usr_ac_b_${suffix}`;
    const userC = `usr_ac_c_${suffix}`;
    const now = new Date();

    try {
      for (const userId of [userA, userB, userC]) {
        await dbClient.db.insert(users).values({
          id: userId,
          email: `${userId}@example.com`,
          displayName: "Campaign User",
          settingsJson: {},
          createdAt: now,
          updatedAt: now,
        });
      }

      const created = await createAccessCode(dbClient, {
        code: `TB-CAMP-${suffix}`,
        codeType: "campaign",
        maxRedemptions: 2,
        grants: { studyAccess: true },
      });

      await redeemAccessCode(dbClient, userA, created.code);
      await redeemAccessCode(dbClient, userB, created.code);
      await expect(redeemAccessCode(dbClient, userC, created.code)).rejects.toMatchObject({
        code: "code_exhausted",
      });
    } finally {
      for (const userId of [userA, userB, userC]) {
        await dbClient.db
          .delete(accessCodeRedemptions)
          .where(eq(accessCodeRedemptions.userId, userId));
        await dbClient.db.delete(userProductState).where(eq(userProductState.userId, userId));
        await dbClient.db.delete(users).where(eq(users.id, userId));
      }
      await dbClient.db.delete(accessCodes).where(eq(accessCodes.code, `TB-CAMP-${suffix}`));
      await dbClient.sql.end();
    }
  });
});
