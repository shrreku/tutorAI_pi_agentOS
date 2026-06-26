import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, creditLedgerEntries, creditReservations, grantTrialBudgetIfNeeded, TRIAL_BUDGET_CENTS, userProductState, users } from "@studyagent/db";
import {
  costCentsFromRuntimeUsage,
  createReservation,
  InsufficientCreditsError,
  isCreditExhausted,
  releaseReservation,
  settleReservation,
  TUTOR_TURN_ESTIMATE_CENTS,
} from "./credit-reservation.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://studyagent:studyagent@127.0.0.1:5433/studyagent";
const shouldRun = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe("credit reservation", () => {
  it("converts runtime usage cost to integer cents", () => {
    expect(
      costCentsFromRuntimeUsage({
        input: 100,
        output: 50,
        cost: { total: 0.0734 },
      }),
    ).toBe(8);
    expect(costCentsFromRuntimeUsage(undefined)).toBe(TUTOR_TURN_ESTIMATE_CENTS);
  });

  it("reserves, settles, and releases tutor credits", async () => {
    if (!shouldRun) return;

    const dbClient = createDb(DATABASE_URL);
    const suffix = `${Date.now()}`;
    const userId = `usr_cres_${suffix}`;
    const now = new Date();

    try {
      await dbClient.db.insert(users).values({
        id: userId,
        email: `cres_${suffix}@example.com`,
        displayName: "Reservation Test User",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });
      await grantTrialBudgetIfNeeded(dbClient, userId, { TRIAL_TUTOR_BUDGET_CENTS: TRIAL_BUDGET_CENTS });

      expect(await isCreditExhausted(dbClient, userId, "tutor")).toBe(false);

      const reservation = await createReservation(
        dbClient,
        userId,
        "tutor",
        TUTOR_TURN_ESTIMATE_CENTS,
        "tutor_turn",
        `turn_${suffix}`,
      );
      expect(reservation.status).toBe("active");

      const settled = await settleReservation(dbClient, reservation.id, 7, { runId: "run_1" });
      expect(settled.status).toBe("settled");
      expect(settled.settledCents).toBe(7);

      const releaseReservationRecord = await createReservation(
        dbClient,
        userId,
        "tutor",
        TUTOR_TURN_ESTIMATE_CENTS,
        "tutor_turn",
        `turn_release_${suffix}`,
      );
      const released = await releaseReservation(dbClient, releaseReservationRecord.id, { outcome: "failed" });
      expect(released.status).toBe("released");
    } finally {
      await dbClient.db.delete(creditLedgerEntries).where(eq(creditLedgerEntries.userId, userId));
      await dbClient.db.delete(creditReservations).where(eq(creditReservations.userId, userId));
      await dbClient.db.delete(userProductState).where(eq(userProductState.userId, userId));
      await dbClient.db.delete(users).where(eq(users.id, userId));
      await dbClient.sql.end();
    }
  });

  it("rejects reservations when credits are insufficient", async () => {
    if (!shouldRun) return;

    const dbClient = createDb(DATABASE_URL);
    const suffix = `${Date.now()}`;
    const userId = `usr_cres_low_${suffix}`;
    const now = new Date();

    try {
      await dbClient.db.insert(users).values({
        id: userId,
        email: `cres_low_${suffix}@example.com`,
        displayName: "Low Credit User",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });
      await grantTrialBudgetIfNeeded(dbClient, userId, { TRIAL_TUTOR_BUDGET_CENTS: 5 });

      await expect(
        createReservation(dbClient, userId, "tutor", TUTOR_TURN_ESTIMATE_CENTS, "tutor_turn", `turn_${suffix}`),
      ).rejects.toBeInstanceOf(InsufficientCreditsError);
      expect(await isCreditExhausted(dbClient, userId, "tutor")).toBe(true);
    } finally {
      await dbClient.db.delete(creditLedgerEntries).where(eq(creditLedgerEntries.userId, userId));
      await dbClient.db.delete(creditReservations).where(eq(creditReservations.userId, userId));
      await dbClient.db.delete(userProductState).where(eq(userProductState.userId, userId));
      await dbClient.db.delete(users).where(eq(users.id, userId));
      await dbClient.sql.end();
    }
  });
});
