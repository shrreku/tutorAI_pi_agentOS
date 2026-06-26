import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  creditLedgerEntries,
  grantCredits,
  type CreditLedgerEntry,
  type CreditType,
  type DbClient,
} from "@studyagent/db";
import type { AppContext } from "../context.js";
import { AuthError, requireActor } from "../auth.js";
import { requireBetaConsent, sendAuthOrEntitlementError } from "../hosted-beta/entitlements.js";
import { recordProductAnalytics } from "../hosted-beta/product-analytics.js";

export type CreditPack = {
  id: string;
  label: string;
  creditType: CreditType;
  amountCents: number;
  priceCents: number;
  currency: "usd";
};

export const CREDIT_PACKS: Record<string, CreditPack> = {
  tutor_500: {
    id: "tutor_500",
    label: "Tutor credits ($5)",
    creditType: "tutor",
    amountCents: 500,
    priceCents: 500,
    currency: "usd",
  },
  ingestion_500: {
    id: "ingestion_500",
    label: "Ingestion credits ($5)",
    creditType: "ingestion",
    amountCents: 500,
    priceCents: 500,
    currency: "usd",
  },
};

export function isPaidCreditCheckoutEnabled(ctx: AppContext): boolean {
  return ctx.env.PAID_CREDIT_CHECKOUT_ENABLED === true;
}

export function isPaidCreditCheckoutConfigured(ctx: AppContext): boolean {
  return isPaidCreditCheckoutEnabled(ctx) && Boolean(ctx.env.STRIPE_SECRET_KEY);
}

export function getCreditPack(packId: string): CreditPack | null {
  return CREDIT_PACKS[packId] ?? null;
}

export type LearnerCreditPackView = {
  id: string;
  label: string;
  creditType: CreditType;
  priceCents: number;
  currency: "usd";
  description: string;
};

export function listLearnerCreditPacks(): LearnerCreditPackView[] {
  return Object.values(CREDIT_PACKS).map((pack) => ({
    id: pack.id,
    label: pack.label,
    creditType: pack.creditType,
    priceCents: pack.priceCents,
    currency: pack.currency,
    description:
      pack.creditType === "tutor"
        ? "Top up your tutor budget for AI study sessions."
        : "Top up credits for uploading and processing private sources.",
  }));
}

export function buildCheckoutIdempotencyKey(sessionId: string): string {
  return `stripe_checkout:${sessionId}`;
}

type StripeCheckoutSessionResponse = {
  id: string;
  url: string | null;
};

type StripeCheckoutCompletedEvent = {
  type: string;
  data: {
    object: {
      id: string;
      payment_status?: string;
      client_reference_id?: string | null;
      metadata?: Record<string, string>;
    };
  };
};

export async function createStripeCheckoutSession(
  ctx: AppContext,
  input: {
    userId: string;
    packId: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<StripeCheckoutSessionResponse> {
  const pack = getCreditPack(input.packId);
  if (!pack) {
    throw new CheckoutError("invalid_pack", "Unknown credit pack", 400);
  }

  const secretKey = ctx.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new CheckoutError("stripe_unconfigured", "Stripe is not configured", 503);
  }

  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${ctx.env.PUBLIC_WEB_BASE_URL}/app/credits?checkout=success`,
    cancel_url: `${ctx.env.PUBLIC_WEB_BASE_URL}/app/credits?checkout=cancelled`,
    client_reference_id: input.userId,
    "metadata[userId]": input.userId,
    "metadata[packId]": pack.id,
    "metadata[creditType]": pack.creditType,
    "metadata[amountCents]": String(pack.amountCents),
    "line_items[0][price_data][currency]": pack.currency,
    "line_items[0][price_data][product_data][name]": pack.label,
    "line_items[0][price_data][unit_amount]": String(pack.priceCents),
    "line_items[0][quantity]": "1",
  });

  const response = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const payload = (await response.json()) as StripeCheckoutSessionResponse & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new CheckoutError(
      "stripe_checkout_failed",
      payload.error?.message ?? "Failed to create Stripe Checkout session",
      502,
    );
  }

  return { id: payload.id, url: payload.url };
}

export async function findCreditGrantByIdempotencyKey(
  dbClient: DbClient,
  idempotencyKey: string,
): Promise<CreditLedgerEntry | null> {
  const [row] = await dbClient.db
    .select()
    .from(creditLedgerEntries)
    .where(
      and(
        eq(creditLedgerEntries.entryType, "grant"),
        sql`${creditLedgerEntries.metadataJson}->>'idempotencyKey' = ${idempotencyKey}`,
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.userId,
    creditType: row.creditType as CreditType,
    entryType: row.entryType as CreditLedgerEntry["entryType"],
    amountCents: row.amountCents,
    reservationId: row.reservationId,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    reason: row.reason,
    metadataJson: row.metadataJson,
    createdAt: row.createdAt,
  };
}

export async function grantPaymentBackedCreditsIdempotent(
  dbClient: DbClient,
  input: {
    userId: string;
    creditType: CreditType;
    amountCents: number;
    idempotencyKey: string;
    stripeSessionId: string;
    packId: string;
  },
): Promise<{ granted: boolean; entry: CreditLedgerEntry }> {
  return dbClient.db.transaction(async (tx) => {
    const db = { db: tx } as unknown as DbClient;
    const existing = await findCreditGrantByIdempotencyKey(db, input.idempotencyKey);
    if (existing) {
      return { granted: false, entry: existing };
    }

    const entry = await grantCredits(
      db,
      input.userId,
      input.creditType,
      input.amountCents,
      "paid_credit_checkout",
      {
        source: "stripe_checkout",
        idempotencyKey: input.idempotencyKey,
        stripeSessionId: input.stripeSessionId,
        packId: input.packId,
      },
    );

    return { granted: true, entry };
  });
}

export function verifyStripeWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  webhookSecret: string | undefined,
): boolean {
  if (!webhookSecret || !signatureHeader) {
    return false;
  }

  const payload = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));

  if (!timestampPart || signatures.length === 0) {
    return false;
  }

  const timestamp = timestampPart.slice(2);
  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > 300) {
    return false;
  }
  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", webhookSecret).update(signedPayload, "utf8").digest("hex");

  return signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  });
}

export async function handleCheckoutSessionCompleted(
  ctx: AppContext,
  session: StripeCheckoutCompletedEvent["data"]["object"],
): Promise<{ granted: boolean; entry: CreditLedgerEntry | null }> {
  if (session.payment_status !== "paid") {
    return { granted: false, entry: null };
  }

  const metadata = session.metadata ?? {};
  const userId = metadata.userId ?? session.client_reference_id ?? null;
  const packId = metadata.packId ?? null;
  const creditType =
    metadata.creditType === "ingestion"
      ? "ingestion"
      : metadata.creditType === "tutor"
        ? "tutor"
        : null;
  const amountCents = Number.parseInt(metadata.amountCents ?? "", 10);
  const idempotencyKey = buildCheckoutIdempotencyKey(session.id);

  if (!userId || !packId || !creditType || !Number.isInteger(amountCents) || amountCents <= 0) {
    throw new CheckoutError(
      "invalid_session_metadata",
      "Checkout session metadata is incomplete",
      400,
    );
  }

  const result = await grantPaymentBackedCreditsIdempotent(ctx.db, {
    userId,
    creditType,
    amountCents,
    idempotencyKey,
    stripeSessionId: session.id,
    packId,
  });
  if (result.granted) {
    await recordProductAnalytics(ctx, {
      userId,
      eventName: "credit_top_up",
      properties: {
        source: "stripe_checkout",
        stripeSessionId: session.id,
        packId,
        creditType,
        amountCents,
      },
    }).catch(() => undefined);
  }

  return { granted: result.granted, entry: result.entry };
}

export class CheckoutError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

function sendFeatureDisabled(reply: {
  status: (code: number) => { send: (body: unknown) => unknown };
}): unknown {
  return reply
    .status(404)
    .send({ code: "feature_disabled", message: "Paid credit checkout is not enabled" });
}

export async function registerStripeCheckoutRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/checkout/credits/packs", async (request, reply) => {
    if (!isPaidCreditCheckoutEnabled(ctx)) {
      return sendFeatureDisabled(reply);
    }

    try {
      await requireActor(ctx, request);
      await requireBetaConsent(ctx, request);
      return reply.send({ packs: listLearnerCreditPacks() });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({ code: error.code, message: error.message });
      }
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.post<{ Body: { packId?: string } }>("/checkout/credits", async (request, reply) => {
    if (!isPaidCreditCheckoutEnabled(ctx)) {
      return sendFeatureDisabled(reply);
    }

    try {
      const actor = await requireActor(ctx, request);
      await requireBetaConsent(ctx, request);
      if (!ctx.env.STRIPE_SECRET_KEY) {
        return reply
          .status(503)
          .send({ code: "stripe_unconfigured", message: "Stripe is not configured" });
      }

      const packId = typeof request.body?.packId === "string" ? request.body.packId.trim() : "";
      if (!packId || !getCreditPack(packId)) {
        return reply.status(400).send({ code: "invalid_pack", message: "Unknown credit pack" });
      }

      const session = await createStripeCheckoutSession(ctx, {
        userId: actor.id,
        packId,
      });

      return reply.status(201).send({
        sessionId: session.id,
        checkoutUrl: session.url,
        packId,
      });
    } catch (error) {
      if (error instanceof CheckoutError) {
        return reply.status(error.statusCode).send({ code: error.code, message: error.message });
      }
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({ code: error.code, message: error.message });
      }
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  // Stripe signature verification requires the raw request body. Fastify parses JSON by default,
  // so this route registers a buffer parser in an isolated scope. Production deployments should
  // ensure no upstream middleware rewrites the body before it reaches this handler.
  await app.register(async (webhookApp) => {
    webhookApp.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_request, body, done) => {
        done(null, body);
      },
    );

    webhookApp.post("/webhooks/stripe", async (request, reply) => {
      if (!isPaidCreditCheckoutEnabled(ctx)) {
        return sendFeatureDisabled(reply);
      }

      const rawBody = request.body;
      if (!(rawBody instanceof Buffer)) {
        return reply.status(400).send({ code: "invalid_body", message: "Expected raw JSON body" });
      }

      const signatureHeader = request.headers["stripe-signature"];
      const verified = verifyStripeWebhookSignature(
        rawBody,
        typeof signatureHeader === "string" ? signatureHeader : undefined,
        ctx.env.STRIPE_WEBHOOK_SECRET,
      );

      if (!verified) {
        return reply.status(400).send({
          code: "invalid_signature",
          message: "Stripe webhook signature verification failed",
        });
      }

      let event: StripeCheckoutCompletedEvent;
      try {
        event = JSON.parse(rawBody.toString("utf8")) as StripeCheckoutCompletedEvent;
      } catch {
        return reply
          .status(400)
          .send({ code: "invalid_json", message: "Webhook body must be valid JSON" });
      }

      if (event.type !== "checkout.session.completed") {
        return reply.send({ received: true, ignored: true, type: event.type });
      }

      try {
        const result = await handleCheckoutSessionCompleted(ctx, event.data.object);
        return reply.send({
          received: true,
          granted: result.granted,
          entryId: result.entry?.id ?? null,
        });
      } catch (error) {
        if (error instanceof CheckoutError) {
          return reply.status(error.statusCode).send({ code: error.code, message: error.message });
        }
        throw error;
      }
    });
  });
}
