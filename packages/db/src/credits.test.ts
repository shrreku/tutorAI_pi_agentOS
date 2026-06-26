import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import {
  creditLedgerEntries,
  creditReservations,
  getAvailableCredits,
  getCreditBalance,
  getCreditLedgerForAdmin,
  getCreditSummaryForLearner,
  grantCredits,
  grantTrialBudgetIfNeeded,
  TRIAL_BUDGET_CENTS,
  userProductState,
  users,
} from "./index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://studyagent:studyagent@127.0.0.1:5433/studyagent";
const shouldRun = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe("credit constants", () => {
  it("stores trial budget in integer minor units", () => {
    expect(TRIAL_BUDGET_CENTS).toBe(100);
  });
});

describe("credits integration", () => {
  it("tracks balance, reservations, trial grant, and learner summary", async () => {
    if (!shouldRun) return;

    const dbClient = createDb(DATABASE_URL);
    const suffix = `${Date.now()}`;
    const userId = `usr_credit_${suffix}`;
    const now = new Date();

    try {
      await dbClient.db.insert(users).values({
        id: userId,
        email: `credit_${suffix}@example.com`,
        displayName: "Credit Test User",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });

      const firstGrant = await grantTrialBudgetIfNeeded(dbClient, userId, {
        TRIAL_TUTOR_BUDGET_CENTS: TRIAL_BUDGET_CENTS,
      });
      const secondGrant = await grantTrialBudgetIfNeeded(dbClient, userId, {
        TRIAL_TUTOR_BUDGET_CENTS: TRIAL_BUDGET_CENTS,
      });

      expect(firstGrant.granted).toBe(true);
      expect(secondGrant.granted).toBe(false);
      await expect(getCreditBalance(dbClient, userId, "tutor")).resolves.toBe(TRIAL_BUDGET_CENTS);

      await dbClient.db.insert(creditReservations).values({
        id: `cres_${suffix}`,
        userId,
        creditType: "tutor",
        reservedCents: 10,
        settledCents: 0,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await expect(getAvailableCredits(dbClient, userId, "tutor")).resolves.toBe(90);

      await grantCredits(dbClient, userId, "ingestion", 40, "pilot_grant");
      const summary = await getCreditSummaryForLearner(dbClient, userId);
      expect(summary.percentRemaining).toBe(90);
      expect(summary.exhausted).toBe(false);
      expect(summary.tutorCreditsCents).toBe(90);
      expect(summary.ingestionCreditsCents).toBe(40);

      const ledger = await getCreditLedgerForAdmin(dbClient, userId, 10);
      expect(
        ledger.some((entry) => entry.entryType === "grant" && entry.creditType === "tutor"),
      ).toBe(true);
      expect(
        ledger.some((entry) => entry.entryType === "grant" && entry.creditType === "ingestion"),
      ).toBe(true);
    } finally {
      await dbClient.db.delete(creditLedgerEntries).where(eq(creditLedgerEntries.userId, userId));
      await dbClient.db.delete(creditReservations).where(eq(creditReservations.userId, userId));
      await dbClient.db.delete(userProductState).where(eq(userProductState.userId, userId));
      await dbClient.db.delete(users).where(eq(users.id, userId));
      await dbClient.sql.end();
    }
  });
});
