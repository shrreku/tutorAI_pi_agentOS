import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { betaConsents, userProductState, users } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { AuthError, resetCachedDevActorForTests } from "../auth.js";
import {
  acceptBetaConsent,
  ensureUserProductState,
  EntitlementError,
  hasAcceptedBetaConsent,
  hasAdminAccess,
  hasIngestionAccess,
  hasStudyAccess,
  isUserDisabled,
  requireAdminAccess,
  requireBetaConsent,
  requireIngestionAccess,
  requireStudyAccess,
} from "./entitlements.js";
import { registerHostedBetaRoutes } from "../routes/hosted-beta.js";
import * as dbCredits from "@studyagent/db";

vi.mock("../hosted-beta/product-analytics.js", () => ({
  recordProductAnalytics: vi.fn().mockResolvedValue({ id: "pae_test" }),
}));

type UserRow = {
  id: string;
  email: string;
  disabledAt?: Date | null;
};

type ProductStateRow = {
  userId: string;
  studyAccess: number;
  ingestionAccess: number;
  adminAccess: number;
  pilotTagsJson: string[];
  onboardingJson: Record<string, unknown>;
  trialBudgetGrantedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ConsentRow = {
  id: string;
  userId: string;
  consentVersion: string;
  acceptedAt: Date;
};

function createEntitlementsContext(options?: {
  disableAuth?: boolean;
  consentVersion?: string;
  initialProductState?: Partial<ProductStateRow>;
  disabled?: boolean;
  consentRows?: ConsentRow[];
}) {
  const userRows: UserRow[] = [
    { id: "usr_1", email: "learner@studyagent.local", disabledAt: null },
  ];
  if (options?.disabled) {
    userRows[0]!.disabledAt = new Date();
  }

  const productStateRows: ProductStateRow[] = [];
  if (options?.initialProductState) {
    productStateRows.push({
      userId: "usr_1",
      studyAccess: 1,
      ingestionAccess: 0,
      adminAccess: 0,
      pilotTagsJson: [],
      onboardingJson: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...options.initialProductState,
    });
  }

  const consentRows: ConsentRow[] = options?.consentRows ?? [];

  const db = {
    select() {
      return {
        from(table: unknown) {
          return {
            where(condition: unknown) {
              void condition;
              if (table === users) {
                return {
                  limit: async (count: number) => userRows.slice(0, count),
                };
              }
              if (table === userProductState) {
                return {
                  limit: async (count: number) => productStateRows.slice(0, count),
                };
              }
              if (table === betaConsents) {
                return {
                  limit: async (count: number) => consentRows.slice(0, count),
                  orderBy(_order: unknown) {
                    return {
                      limit: async (count: number) =>
                        [...consentRows]
                          .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime())
                          .slice(0, count),
                    };
                  },
                };
              }
              return {
                limit: async () => [],
              };
            },
            orderBy(_order: unknown) {
              return {
                limit: async (count: number) => {
                  if (table === betaConsents) {
                    return [...consentRows]
                      .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime())
                      .slice(0, count);
                  }
                  return productStateRows.slice(0, count);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          const insertRow = async () => {
            if (table === userProductState) {
              productStateRows.push(row as ProductStateRow);
            }
            if (table === betaConsents) {
              const candidate = row as ConsentRow;
              if (
                !consentRows.some(
                  (existing) =>
                    existing.userId === candidate.userId &&
                    existing.consentVersion === candidate.consentVersion,
                )
              ) {
                consentRows.push(candidate);
              }
            }
          };

          return {
            onConflictDoNothing: async () => {
              await insertRow();
            },
            then(
              onFulfilled: (value: unknown) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) {
              return insertRow().then(onFulfilled, onRejected);
            },
          };
        },
      };
    },
  };

  const ctx = {
    env: {
      DISABLE_AUTH: options?.disableAuth ?? true,
      DEV_USER_EMAIL: "learner@studyagent.local",
      SESSION_SECRET: "studyagent-local-session-secret",
      BETA_CONSENT_VERSION: options?.consentVersion ?? "2026-06-17",
    },
    db: { db },
  } as unknown as AppContext;

  return { ctx, productStateRows, consentRows };
}

describe("entitlements", () => {
  it("creates default study access product state", async () => {
    const { ctx, productStateRows } = createEntitlementsContext();
    const state = await ensureUserProductState(ctx, "usr_1");

    expect(state.studyAccess).toBe(1);
    expect(state.ingestionAccess).toBe(0);
    expect(state.adminAccess).toBe(0);
    expect(productStateRows).toHaveLength(1);
  });

  it("evaluates study, ingestion, and admin access flags", async () => {
    const { ctx } = createEntitlementsContext({
      initialProductState: {
        studyAccess: 1,
        ingestionAccess: 1,
        adminAccess: 1,
      },
    });

    await expect(hasStudyAccess(ctx, "usr_1")).resolves.toBe(true);
    await expect(hasIngestionAccess(ctx, "usr_1")).resolves.toBe(true);
    await expect(hasAdminAccess(ctx, "usr_1")).resolves.toBe(true);
  });

  it("denies access for disabled users", async () => {
    const { ctx } = createEntitlementsContext({
      disabled: true,
      initialProductState: { studyAccess: 1, ingestionAccess: 1, adminAccess: 1 },
    });

    await expect(isUserDisabled(ctx, "usr_1")).resolves.toBe(true);
    await expect(hasStudyAccess(ctx, "usr_1")).resolves.toBe(false);
  });

  it("records and checks beta consent by version", async () => {
    const { ctx } = createEntitlementsContext();
    await expect(hasAcceptedBetaConsent(ctx, "usr_1")).resolves.toBe(false);

    const consent = await acceptBetaConsent(ctx, "usr_1");
    expect(consent.consentVersion).toBe("2026-06-17");
    await expect(hasAcceptedBetaConsent(ctx, "usr_1")).resolves.toBe(true);
  });

  it("requires study access for protected helpers", async () => {
    const { ctx } = createEntitlementsContext({
      initialProductState: { studyAccess: 0 },
    });
    const request = { headers: {} } as Parameters<typeof requireStudyAccess>[1];

    await expect(requireStudyAccess(ctx, request)).rejects.toBeInstanceOf(EntitlementError);
  });

  it("requires ingestion and admin access separately", async () => {
    const { ctx } = createEntitlementsContext({
      initialProductState: { studyAccess: 1, ingestionAccess: 0, adminAccess: 0 },
    });
    const request = { headers: {} } as Parameters<typeof requireIngestionAccess>[1];

    await expect(requireIngestionAccess(ctx, request)).rejects.toMatchObject({
      code: "ingestion_access_required",
    });
    await expect(requireAdminAccess(ctx, request)).rejects.toMatchObject({
      code: "admin_access_required",
    });
  });

  it("requires current beta consent", async () => {
    const { ctx } = createEntitlementsContext();
    const request = { headers: {} } as Parameters<typeof requireBetaConsent>[1];

    await expect(requireBetaConsent(ctx, request)).rejects.toMatchObject({
      code: "beta_consent_required",
    });
  });
});

describe("hosted-beta routes", () => {
  let app = Fastify();

  beforeEach(() => {
    resetCachedDevActorForTests();
    app = Fastify();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns me payload with consent and credit summary", async () => {
    const grantSpy = vi
      .spyOn(dbCredits, "grantTrialBudgetIfNeeded")
      .mockResolvedValue({ granted: false, amountCents: 0 });
    const summarySpy = vi.spyOn(dbCredits, "getCreditSummaryForLearner").mockResolvedValue({
      percentRemaining: 100,
      exhausted: false,
      tutorCreditsCents: 100,
      ingestionCreditsCents: 0,
    });

    const { ctx } = createEntitlementsContext({
      initialProductState: { studyAccess: 1 },
    });
    await registerHostedBetaRoutes(app, ctx);

    const response = await app.inject({ method: "GET", url: "/me" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      actor: { id: string };
      productState: { studyAccess: number };
      consent: { accepted: boolean; requiredVersion: string };
      credits: { percentRemaining: number; exhausted: boolean };
    };

    expect(body.actor.id).toBe("usr_1");
    expect(body.productState.studyAccess).toBe(1);
    expect(body.consent.requiredVersion).toBe("2026-06-17");
    expect(body.consent.accepted).toBe(false);
    expect(body.credits.percentRemaining).toBe(100);
    expect(body.credits.exhausted).toBe(false);
    expect(body.credits).not.toHaveProperty("tutorCreditsCents");

    grantSpy.mockRestore();
    summarySpy.mockRestore();
  });

  it("accepts beta consent and reports status", async () => {
    const { ctx, consentRows } = createEntitlementsContext({
      initialProductState: { studyAccess: 1 },
    });
    await registerHostedBetaRoutes(app, ctx);

    const accept = await app.inject({ method: "POST", url: "/consent" });
    expect(accept.statusCode).toBe(201);
    expect(consentRows).toHaveLength(1);

    const status = await app.inject({ method: "GET", url: "/consent/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      accepted: true,
      requiredVersion: "2026-06-17",
    });
  });

  it("returns auth errors in hosted mode without a session", async () => {
    const { ctx } = createEntitlementsContext({ disableAuth: false });
    await registerHostedBetaRoutes(app, ctx);

    const response = await app.inject({ method: "GET", url: "/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });
});

describe("EntitlementError", () => {
  it("carries code and status", () => {
    const error = new EntitlementError("beta_consent_required", "consent needed", 403);
    expect(error.code).toBe("beta_consent_required");
    expect(error.statusCode).toBe(403);
  });
});

describe("AuthError integration", () => {
  it("is distinct from entitlement failures", () => {
    expect(new AuthError("unauthenticated", "nope").name).toBe("AuthError");
    expect(new EntitlementError("study_access_required", "nope").name).toBe("EntitlementError");
  });
});
