import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditLedgerEntries } from "@studyagent/db";
import type { AppContext } from "../context.js";
import {
  buildCheckoutIdempotencyKey,
  createStripeCheckoutSession,
  grantPaymentBackedCreditsIdempotent,
  handleCheckoutSessionCompleted,
  registerStripeCheckoutRoutes,
  verifyStripeWebhookSignature,
} from "./stripe-checkout.js";

const { requireActor } = vi.hoisted(() => ({
  requireActor: vi.fn(async () => ({ id: "usr_1", email: "learner@studyagent.local" })),
  requireBetaConsent: vi.fn(async () => ({ consentVersion: "2026-06-17" })),
}));

vi.mock("../auth.js", () => ({
  requireActor,
  AuthError: class AuthError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly statusCode = 401,
    ) {
      super(message);
    }
  },
}));

vi.mock("../hosted-beta/entitlements.js", () => ({
  requireBetaConsent: vi.fn(async () => ({ consentVersion: "2026-06-17" })),
  sendAuthOrEntitlementError: vi.fn((_reply, error: unknown) => {
    throw error;
  }),
}));

type LedgerRow = typeof creditLedgerEntries.$inferSelect;

function createStripeTestContext(options?: {
  checkoutEnabled?: boolean;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
}) {
  const ledgerRows: LedgerRow[] = [];

  const db = {
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                limit(count: number) {
                  if (table === creditLedgerEntries) {
                    return Promise.resolve(ledgerRows.slice(0, count));
                  }
                  return Promise.resolve([]);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(row: LedgerRow) {
          if (table === creditLedgerEntries) {
            ledgerRows.push(row);
          }
          return {
            returning: async () => [row],
          };
        },
      };
    },
    transaction: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
  } as unknown as AppContext["db"]["db"];

  const ctx = {
    env: {
      PAID_CREDIT_CHECKOUT_ENABLED: options?.checkoutEnabled ?? false,
      STRIPE_SECRET_KEY: options?.stripeSecretKey,
      STRIPE_WEBHOOK_SECRET: options?.stripeWebhookSecret ?? "whsec_test",
      PUBLIC_WEB_BASE_URL: "http://localhost:5173",
    },
    db: { db },
  } as unknown as AppContext;

  return { ctx, ledgerRows };
}

function signStripePayload(payload: string, secret: string, timestamp?: string): string {
  const ts = timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${ts}.${payload}`, "utf8").digest("hex");
  return `t=${ts},v1=${signature}`;
}

describe("stripe checkout routes", () => {
  beforeEach(() => {
    requireActor.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns feature_disabled when checkout flag is off", async () => {
    const app = Fastify();
    const { ctx } = createStripeTestContext({ checkoutEnabled: false });
    await registerStripeCheckoutRoutes(app, ctx);

    const packs = await app.inject({
      method: "GET",
      url: "/checkout/credits/packs",
    });
    expect(packs.statusCode).toBe(404);
    expect(packs.json()).toMatchObject({ code: "feature_disabled" });

    const checkout = await app.inject({
      method: "POST",
      url: "/checkout/credits",
      payload: { packId: "tutor_500" },
    });

    expect(checkout.statusCode).toBe(404);
    expect(checkout.json()).toMatchObject({ code: "feature_disabled" });
    await app.close();
  });

  it("lists credit packs when checkout is enabled", async () => {
    const app = Fastify();
    const { ctx } = createStripeTestContext({ checkoutEnabled: true });
    await registerStripeCheckoutRoutes(app, ctx);

    const response = await app.inject({
      method: "GET",
      url: "/checkout/credits/packs",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      packs: expect.arrayContaining([
        expect.objectContaining({ id: "tutor_500", creditType: "tutor" }),
        expect.objectContaining({ id: "ingestion_500", creditType: "ingestion" }),
      ]),
    });
    await app.close();
  });

  it("creates a Stripe Checkout session when enabled", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      return Response.json({ id: "cs_test_123", url: "https://checkout.stripe.test/cs_test_123" });
    });

    const app = Fastify();
    const { ctx } = createStripeTestContext({
      checkoutEnabled: true,
      stripeSecretKey: "sk_test_123",
    });
    await registerStripeCheckoutRoutes(app, ctx);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const response = await app.inject({
        method: "POST",
        url: "/checkout/credits",
        payload: { packId: "tutor_500" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        sessionId: "cs_test_123",
        checkoutUrl: "https://checkout.stripe.test/cs_test_123",
        packId: "tutor_500",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const init = fetchCalls[0]?.init;
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      expect(String(init?.body)).toContain("metadata%5BuserId%5D=usr_1");
      expect(String(init?.body)).toContain("metadata%5BpackId%5D=tutor_500");
    } finally {
      globalThis.fetch = originalFetch;
    }

    await app.close();
  });

  it("grants credits once for checkout.session.completed webhook", async () => {
    const app = Fastify();
    const { ctx, ledgerRows } = createStripeTestContext({
      checkoutEnabled: true,
      stripeWebhookSecret: "whsec_test",
    });
    await registerStripeCheckoutRoutes(app, ctx);

    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          payment_status: "paid",
          client_reference_id: "usr_1",
          metadata: {
            userId: "usr_1",
            packId: "tutor_500",
            creditType: "tutor",
            amountCents: "500",
          },
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = signStripePayload(payload, "whsec_test");

    const first = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ received: true, granted: true });
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toMatchObject({
      userId: "usr_1",
      creditType: "tutor",
      amountCents: 500,
      reason: "paid_credit_checkout",
      metadataJson: {
        idempotencyKey: buildCheckoutIdempotencyKey("cs_test_123"),
        stripeSessionId: "cs_test_123",
        packId: "tutor_500",
      },
    });

    const second = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      payload,
    });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ received: true, granted: false });
    expect(ledgerRows).toHaveLength(1);
    await app.close();
  });

  it("ignores non-paid checkout sessions", async () => {
    const { ctx, ledgerRows } = createStripeTestContext({ checkoutEnabled: true });
    const result = await handleCheckoutSessionCompleted(ctx, {
      id: "cs_unpaid",
      payment_status: "unpaid",
      metadata: {
        userId: "usr_1",
        packId: "tutor_500",
        creditType: "tutor",
        amountCents: "500",
      },
    });

    expect(result).toEqual({ granted: false, entry: null });
    expect(ledgerRows).toHaveLength(0);
  });

  it("rejects webhook requests with invalid signatures", async () => {
    const app = Fastify();
    const { ctx } = createStripeTestContext({
      checkoutEnabled: true,
      stripeWebhookSecret: "whsec_test",
    });
    await registerStripeCheckoutRoutes(app, ctx);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1710000000,v1=bad",
      },
      payload: JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { id: "cs_bad" } },
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "invalid_signature" });
    await app.close();
  });
});

describe("stripe checkout helpers", () => {
  it("verifies Stripe webhook signatures", () => {
    const secret = "whsec_test";
    const payload = JSON.stringify({ hello: "world" });
    const signature = signStripePayload(payload, secret);

    expect(verifyStripeWebhookSignature(payload, signature, secret)).toBe(true);
    expect(verifyStripeWebhookSignature(payload, "t=1,v1=deadbeef", secret)).toBe(false);
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
    const staleSignature = signStripePayload(payload, secret, staleTimestamp);
    expect(verifyStripeWebhookSignature(payload, staleSignature, secret)).toBe(false);
  });

  it("creates checkout sessions via fetch", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "cs_unit", url: "https://checkout.stripe.test/cs_unit" }),
    );
    const { ctx } = createStripeTestContext({
      checkoutEnabled: true,
      stripeSecretKey: "sk_test",
    });

    const session = await createStripeCheckoutSession(
      ctx,
      { userId: "usr_1", packId: "ingestion_500" },
      fetchMock as typeof fetch,
    );

    expect(session).toEqual({ id: "cs_unit", url: "https://checkout.stripe.test/cs_unit" });
  });

  it("grants payment-backed credits idempotently", async () => {
    const { ctx, ledgerRows } = createStripeTestContext({ checkoutEnabled: true });
    const input = {
      userId: "usr_1",
      creditType: "tutor" as const,
      amountCents: 500,
      idempotencyKey: buildCheckoutIdempotencyKey("cs_idempotent"),
      stripeSessionId: "cs_idempotent",
      packId: "tutor_500",
    };

    const first = await grantPaymentBackedCreditsIdempotent(ctx.db, input);
    const second = await grantPaymentBackedCreditsIdempotent(ctx.db, input);

    expect(first.granted).toBe(true);
    expect(second.granted).toBe(false);
    expect(first.entry.id).toBe(second.entry.id);
    expect(ledgerRows).toHaveLength(1);
  });
});
