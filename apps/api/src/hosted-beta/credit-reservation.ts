import { and, eq } from "drizzle-orm";
import { normalizeTraceUsage } from "@studyagent/observability";
import {
  appendCreditLedgerEntry,
  creditReservations,
  expireStaleCreditReservations,
  releaseCreditReservation,
  settleCreditReservation,
  getAvailableCredits,
  userProductState,
  type CreditType,
  type DbClient,
} from "@studyagent/db";

export const TUTOR_TURN_ESTIMATE_CENTS = 10;
export const INGESTION_JOB_ESTIMATE_CENTS = 5;

export type CreditReservationRecord = {
  id: string;
  userId: string;
  creditType: CreditType;
  reservedCents: number;
  settledCents: number;
  status: string;
  referenceType: string | null;
  referenceId: string | null;
};

export class InsufficientCreditsError extends Error {
  readonly code = "credit_exhausted" as const;

  constructor(
    message = "Tutor credits are exhausted. Review your study materials or request more access.",
  ) {
    super(message);
    this.name = "InsufficientCreditsError";
  }
}

function newReservationId(): string {
  return `cres_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function isCreditExhausted(
  dbClient: DbClient,
  userId: string,
  creditType: CreditType,
  minimumCents: number = TUTOR_TURN_ESTIMATE_CENTS,
): Promise<boolean> {
  const available = await getAvailableCredits(dbClient, userId, creditType);
  return available < minimumCents;
}

export async function createReservation(
  dbClient: DbClient,
  userId: string,
  creditType: CreditType,
  estimatedCents: number,
  referenceType: string,
  referenceId: string,
  ttlSeconds = 15 * 60,
): Promise<CreditReservationRecord> {
  if (!Number.isInteger(estimatedCents) || estimatedCents <= 0) {
    throw new Error("estimatedCents must be a positive integer");
  }

  await expireStaleCreditReservations(dbClient, { userId, creditType });
  return dbClient.db.transaction(async (tx) => {
    const db = { db: tx } as unknown as DbClient;
    const now = new Date();
    await tx
      .insert(userProductState)
      .values({
        userId,
        studyAccess: 1,
        ingestionAccess: 0,
        adminAccess: 0,
        pilotTagsJson: [],
        onboardingJson: {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    await tx
      .select({ userId: userProductState.userId })
      .from(userProductState)
      .where(eq(userProductState.userId, userId))
      .for("update");
    const available = await getAvailableCredits(db, userId, creditType);
    if (available < estimatedCents) {
      throw new InsufficientCreditsError(
        creditType === "ingestion"
          ? "Ingestion credits are exhausted. You can still review your workspace, but uploads and ingestion retries are paused until more credits are available."
          : undefined,
      );
    }

    const id = newReservationId();
    const [reservation] = await tx
      .insert(creditReservations)
      .values({
        id,
        userId,
        creditType,
        reservedCents: estimatedCents,
        settledCents: 0,
        status: "active",
        referenceType,
        referenceId,
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!reservation) {
      throw new Error("Failed to create credit reservation");
    }

    await appendCreditLedgerEntry(db, {
      userId,
      creditType,
      entryType: "reservation_hold",
      amountCents: estimatedCents,
      reservationId: id,
      referenceType,
      referenceId,
      reason: "reservation_hold",
      metadata: { estimatedCents },
    });

    return mapReservation(reservation);
  });
}

export async function settleReservation(
  dbClient: DbClient,
  reservationId: string,
  actualCents: number,
  metadata: Record<string, unknown> = {},
): Promise<CreditReservationRecord> {
  return settleCreditReservation(dbClient, reservationId, actualCents, metadata);
}

export async function releaseReservation(
  dbClient: DbClient,
  reservationId: string,
  metadata: Record<string, unknown> = {},
): Promise<CreditReservationRecord> {
  return releaseCreditReservation(dbClient, reservationId, metadata);
}

export function costCentsFromRuntimeUsage(
  usage: unknown,
  fallbackCents: number = TUTOR_TURN_ESTIMATE_CENTS,
): number {
  const normalized = normalizeTraceUsage(
    usage && typeof usage === "object" && !Array.isArray(usage)
      ? (usage as Record<string, unknown>)
      : undefined,
  );
  const totalDollars = normalized?.cost.total ?? 0;
  if (totalDollars > 0) {
    return Math.max(1, Math.ceil(totalDollars * 100));
  }
  return fallbackCents;
}

function mapReservation(row: typeof creditReservations.$inferSelect): CreditReservationRecord {
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
