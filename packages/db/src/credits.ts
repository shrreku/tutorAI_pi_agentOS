import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { DbClient } from "./client.js";
import {
  chunks,
  creditLedgerEntries,
  creditReservations,
  sources,
  userProductState,
} from "./schema/index.js";

export const TRIAL_BUDGET_CENTS = 100;

export type CreditType = "tutor" | "ingestion";
export type CreditEntryType = "grant" | "reservation_hold" | "debit" | "release" | "adjustment";

const BALANCE_ENTRY_TYPES: CreditEntryType[] = ["grant", "debit", "adjustment"];

export type CreditLedgerEntry = {
  id: string;
  userId: string;
  creditType: CreditType;
  entryType: CreditEntryType;
  amountCents: number;
  reservationId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
};

export type CreditReservation = {
  id: string;
  userId: string;
  creditType: CreditType;
  reservedCents: number;
  settledCents: number;
  status: string;
  referenceType: string | null;
  referenceId: string | null;
};

export type LearnerCreditSummary = {
  percentRemaining: number;
  exhausted: boolean;
  tutorCreditsCents: number;
  ingestionCreditsCents: number;
};

function newLedgerId(): string {
  return `cled_${crypto.randomUUID().replaceAll("-", "")}`;
}

function newReservationId(): string {
  return `cres_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function getCreditBalance(
  dbClient: DbClient,
  userId: string,
  creditType: CreditType,
): Promise<number> {
  const [row] = await dbClient.db
    .select({
      balance: sql<number>`coalesce(sum(${creditLedgerEntries.amountCents}), 0)`,
    })
    .from(creditLedgerEntries)
    .where(
      and(
        eq(creditLedgerEntries.userId, userId),
        eq(creditLedgerEntries.creditType, creditType),
        inArray(creditLedgerEntries.entryType, BALANCE_ENTRY_TYPES),
      ),
    );
  return Number(row?.balance ?? 0);
}

export async function getActiveReservedCents(
  dbClient: DbClient,
  userId: string,
  creditType: CreditType,
): Promise<number> {
  const [row] = await dbClient.db
    .select({
      reserved: sql<number>`coalesce(sum(${creditReservations.reservedCents} - ${creditReservations.settledCents}), 0)`,
    })
    .from(creditReservations)
    .where(
      and(
        eq(creditReservations.userId, userId),
        eq(creditReservations.creditType, creditType),
        eq(creditReservations.status, "active"),
        or(isNull(creditReservations.expiresAt), gt(creditReservations.expiresAt, new Date())),
      ),
    );
  return Number(row?.reserved ?? 0);
}

export async function getAvailableCredits(
  dbClient: DbClient,
  userId: string,
  creditType: CreditType,
): Promise<number> {
  const [balance, reserved] = await Promise.all([
    getCreditBalance(dbClient, userId, creditType),
    getActiveReservedCents(dbClient, userId, creditType),
  ]);
  return balance - reserved;
}

export async function expireStaleCreditReservations(
  dbClient: DbClient,
  input: { userId?: string; creditType?: CreditType; now?: Date } = {},
): Promise<number> {
  const now = input.now ?? new Date();
  return dbClient.db.transaction(async (tx) => {
    const stale = await tx
      .select()
      .from(creditReservations)
      .where(
        and(
          eq(creditReservations.status, "active"),
          lt(creditReservations.expiresAt, now),
          ...(input.userId ? [eq(creditReservations.userId, input.userId)] : []),
          ...(input.creditType ? [eq(creditReservations.creditType, input.creditType)] : []),
        ),
      );
    let expired = 0;
    for (const reservation of stale) {
      const [updated] = await tx
        .update(creditReservations)
        .set({ status: "expired", updatedAt: now })
        .where(and(eq(creditReservations.id, reservation.id), eq(creditReservations.status, "active")))
        .returning();
      if (!updated) continue;
      expired += 1;
      const releasedCents = reservation.reservedCents - reservation.settledCents;
      if (releasedCents > 0) {
        await tx.insert(creditLedgerEntries).values({
          id: newLedgerId(),
          userId: reservation.userId,
          creditType: reservation.creditType,
          entryType: "release",
          amountCents: releasedCents,
          reservationId: reservation.id,
          referenceType: reservation.referenceType,
          referenceId: reservation.referenceId,
          reason: "reservation_expired",
          metadataJson: { expiredAt: now.toISOString() },
        });
      }
    }
    return expired;
  });
}

export async function calculateIngestionSettlementCents(
  dbClient: DbClient,
  sourceId: string,
  sourceVersionId: string,
): Promise<{ cents: number; sizeBytes: number; chunkCount: number }> {
  const [[source], [chunkCountRow]] = await Promise.all([
    dbClient.db
      .select({ metadataJson: sources.metadataJson })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .limit(1),
    dbClient.db
      .select({ count: sql<number>`count(*)::int` })
      .from(chunks)
      .where(eq(chunks.sourceVersionId, sourceVersionId)),
  ]);
  const sizeBytes =
    typeof source?.metadataJson?.sizeBytes === "number"
      ? Math.max(0, source.metadataJson.sizeBytes)
      : 0;
  const chunkCount = Number(chunkCountRow?.count ?? 0);
  const sizeCents = Math.ceil(sizeBytes / (5 * 1024 * 1024));
  const chunkCents = Math.ceil(chunkCount / 100);
  return {
    cents: Math.max(1, Math.min(5, sizeCents + chunkCents)),
    sizeBytes,
    chunkCount,
  };
}

export async function grantTrialBudgetIfNeeded(
  dbClient: DbClient,
  userId: string,
  env: { TRIAL_TUTOR_BUDGET_CENTS: number },
): Promise<{ granted: boolean; amountCents: number }> {
  const amountCents = env.TRIAL_TUTOR_BUDGET_CENTS;
  const now = new Date();
  let granted = false;

  await dbClient.db.transaction(async (tx) => {
    const [state] = await tx
      .select({ trialBudgetGrantedAt: userProductState.trialBudgetGrantedAt })
      .from(userProductState)
      .where(eq(userProductState.userId, userId))
      .limit(1);

    if (state?.trialBudgetGrantedAt) {
      return;
    }

    if (!state) {
      await tx.insert(userProductState).values({
        userId,
        trialBudgetGrantedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await tx
        .update(userProductState)
        .set({ trialBudgetGrantedAt: now, updatedAt: now })
        .where(and(eq(userProductState.userId, userId), sql`${userProductState.trialBudgetGrantedAt} is null`));
    }

    const [after] = await tx
      .select({ trialBudgetGrantedAt: userProductState.trialBudgetGrantedAt })
      .from(userProductState)
      .where(eq(userProductState.userId, userId))
      .limit(1);

    if (!after?.trialBudgetGrantedAt) {
      return;
    }

    const [existingGrant] = await tx
      .select({ id: creditLedgerEntries.id })
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.userId, userId),
          eq(creditLedgerEntries.creditType, "tutor"),
          eq(creditLedgerEntries.entryType, "grant"),
          eq(creditLedgerEntries.reason, "trial_tutor_budget"),
        ),
      )
      .limit(1);

    if (existingGrant) {
      return;
    }

    await tx.insert(creditLedgerEntries).values({
      id: newLedgerId(),
      userId,
      creditType: "tutor",
      entryType: "grant",
      amountCents,
      reason: "trial_tutor_budget",
      metadataJson: { source: "trial_budget" },
    });
    granted = true;
  });

  return { granted, amountCents: granted ? amountCents : 0 };
}

export async function grantCredits(
  dbClient: DbClient,
  userId: string,
  creditType: CreditType,
  amountCents: number,
  reason: string,
  metadata: Record<string, unknown> = {},
): Promise<CreditLedgerEntry> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("grant amountCents must be a positive integer");
  }

  const id = newLedgerId();
  const [row] = await dbClient.db
    .insert(creditLedgerEntries)
    .values({
      id,
      userId,
      creditType,
      entryType: "grant",
      amountCents,
      reason,
      metadataJson: metadata,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to append credit grant");
  }

  return mapLedgerEntry(row);
}

export async function getCreditSummaryForLearner(
  dbClient: DbClient,
  userId: string,
): Promise<LearnerCreditSummary> {
  await expireStaleCreditReservations(dbClient, { userId });
  const [tutorAvailable, ingestionAvailable, tutorGranted] = await Promise.all([
    getAvailableCredits(dbClient, userId, "tutor"),
    getAvailableCredits(dbClient, userId, "ingestion"),
    getTotalGrantedCents(dbClient, userId, "tutor"),
  ]);

  const percentRemaining =
    tutorGranted > 0
      ? Math.min(100, Math.max(0, Math.round((tutorAvailable / tutorGranted) * 100)))
      : 0;

  return {
    percentRemaining,
    exhausted: tutorAvailable <= 0,
    tutorCreditsCents: tutorAvailable,
    ingestionCreditsCents: ingestionAvailable,
  };
}

export async function getCreditLedgerForAdmin(
  dbClient: DbClient,
  userId: string,
  limit = 100,
): Promise<CreditLedgerEntry[]> {
  const rows = await dbClient.db
    .select()
    .from(creditLedgerEntries)
    .where(eq(creditLedgerEntries.userId, userId))
    .orderBy(desc(creditLedgerEntries.createdAt))
    .limit(limit);

  return rows.map((row) => mapLedgerEntry(row));
}

export async function appendCreditLedgerEntry(
  dbClient: DbClient,
  input: {
    userId: string;
    creditType: CreditType;
    entryType: CreditEntryType;
    amountCents: number;
    reservationId?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<CreditLedgerEntry> {
  const [row] = await dbClient.db
    .insert(creditLedgerEntries)
    .values({
      id: newLedgerId(),
      userId: input.userId,
      creditType: input.creditType,
      entryType: input.entryType,
      amountCents: input.amountCents,
      reservationId: input.reservationId ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      reason: input.reason ?? null,
      metadataJson: input.metadata ?? {},
    })
    .returning();

  if (!row) {
    throw new Error("Failed to append credit ledger entry");
  }

  return mapLedgerEntry(row);
}

export async function settleCreditReservation(
  dbClient: DbClient,
  reservationId: string,
  actualCents: number | null,
  metadata: Record<string, unknown> = {},
): Promise<CreditReservation> {
  if (actualCents !== null && (!Number.isInteger(actualCents) || actualCents < 0)) {
    throw new Error("actualCents must be a non-negative integer");
  }

  return dbClient.db.transaction(async (tx) => {
    const db = { db: tx } as unknown as DbClient;
    const [reservation] = await tx
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.id, reservationId))
      .limit(1);

    if (!reservation) {
      throw new Error(`Unknown credit reservation: ${reservationId}`);
    }
    if (reservation.status !== "active") {
      return mapReservation(reservation);
    }

    const settledCents = Math.min(actualCents ?? reservation.reservedCents, reservation.reservedCents);
    const releasedCents = reservation.reservedCents - settledCents;
    const now = new Date();

    const [updated] = await tx
      .update(creditReservations)
      .set({
        settledCents,
        status: "settled",
        updatedAt: now,
      })
      .where(and(eq(creditReservations.id, reservationId), eq(creditReservations.status, "active")))
      .returning();

    if (!updated) {
      const [current] = await tx
        .select()
        .from(creditReservations)
        .where(eq(creditReservations.id, reservationId))
        .limit(1);
      if (!current) throw new Error(`Unknown credit reservation: ${reservationId}`);
      return mapReservation(current);
    }

    if (settledCents > 0) {
      await appendCreditLedgerEntry(db, {
        userId: reservation.userId,
        creditType: reservation.creditType as CreditType,
        entryType: "debit",
        amountCents: -settledCents,
        reservationId,
        referenceType: reservation.referenceType,
        referenceId: reservation.referenceId,
        reason: "reservation_settled",
        metadata,
      });
    }

    if (releasedCents > 0) {
      await appendCreditLedgerEntry(db, {
        userId: reservation.userId,
        creditType: reservation.creditType as CreditType,
        entryType: "release",
        amountCents: releasedCents,
        reservationId,
        referenceType: reservation.referenceType,
        referenceId: reservation.referenceId,
        reason: "reservation_release_unused",
        metadata: { ...metadata, releasedCents, settledCents },
      });
    }

    return mapReservation(updated);
  });
}

export async function releaseCreditReservation(
  dbClient: DbClient,
  reservationId: string,
  metadata: Record<string, unknown> = {},
): Promise<CreditReservation> {
  return dbClient.db.transaction(async (tx) => {
    const db = { db: tx } as unknown as DbClient;
    const [reservation] = await tx
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.id, reservationId))
      .limit(1);

    if (!reservation) {
      throw new Error(`Unknown credit reservation: ${reservationId}`);
    }
    if (reservation.status !== "active") {
      return mapReservation(reservation);
    }

    const releasedCents = reservation.reservedCents - reservation.settledCents;
    const now = new Date();

    const [updated] = await tx
      .update(creditReservations)
      .set({
        status: "released",
        updatedAt: now,
      })
      .where(and(eq(creditReservations.id, reservationId), eq(creditReservations.status, "active")))
      .returning();

    if (!updated) {
      const [current] = await tx
        .select()
        .from(creditReservations)
        .where(eq(creditReservations.id, reservationId))
        .limit(1);
      if (!current) throw new Error(`Unknown credit reservation: ${reservationId}`);
      return mapReservation(current);
    }

    if (releasedCents > 0) {
      await appendCreditLedgerEntry(db, {
        userId: reservation.userId,
        creditType: reservation.creditType as CreditType,
        entryType: "release",
        amountCents: releasedCents,
        reservationId,
        referenceType: reservation.referenceType,
        referenceId: reservation.referenceId,
        reason: "reservation_released",
        metadata,
      });
    }

    return mapReservation(updated);
  });
}

async function getTotalGrantedCents(
  dbClient: DbClient,
  userId: string,
  creditType: CreditType,
): Promise<number> {
  const [row] = await dbClient.db
    .select({
      total: sql<number>`coalesce(sum(${creditLedgerEntries.amountCents}), 0)`,
    })
    .from(creditLedgerEntries)
    .where(
      and(
        eq(creditLedgerEntries.userId, userId),
        eq(creditLedgerEntries.creditType, creditType),
        eq(creditLedgerEntries.entryType, "grant"),
      ),
    );
  return Number(row?.total ?? 0);
}

function mapLedgerEntry(row: typeof creditLedgerEntries.$inferSelect): CreditLedgerEntry {
  return {
    id: row.id,
    userId: row.userId,
    creditType: row.creditType as CreditType,
    entryType: row.entryType as CreditEntryType,
    amountCents: row.amountCents,
    reservationId: row.reservationId,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    reason: row.reason,
    metadataJson: row.metadataJson,
    createdAt: row.createdAt,
  };
}

function mapReservation(row: typeof creditReservations.$inferSelect): CreditReservation {
  return {
    id: row.id,
    userId: row.userId,
    creditType: row.creditType as CreditType,
    reservedCents: row.reservedCents,
    settledCents: row.settledCents,
    status: row.status,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
  };
}
