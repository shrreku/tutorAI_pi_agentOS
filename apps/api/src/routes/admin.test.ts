import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../context.js";
import { EntitlementError } from "../hosted-beta/entitlements.js";
import { registerAdminRoutes } from "./admin.js";

vi.mock("../hosted-beta/entitlements.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hosted-beta/entitlements.js")>();
  return {
    ...actual,
    requireAdminAccess: vi.fn(),
  };
});

vi.mock("../hosted-beta/ingestion-trigger.js", () => ({
  triggerIngestionWorker: vi.fn(async () => ({ runId: "itr_test", status: "completed" })),
}));

import { requireAdminAccess } from "../hosted-beta/entitlements.js";

function createAdminContext() {
  const db = {
    select() {
      return {
        from() {
          return {
            innerJoin() {
              return {
                where() {
                  return Promise.resolve([{ value: 3 }]);
                },
                orderBy() {
                  return {
                    limit: async () => [{ value: 3 }],
                  };
                },
              };
            },
            where() {
              return {
                orderBy() {
                  return {
                    limit: async () => [],
                  };
                },
                limit: async () => [{ value: 0 }],
              };
            },
            orderBy() {
              return {
                limit: async () => [],
              };
            },
            groupBy() {
              return {
                orderBy: async () => [],
              };
            },
          };
        },
      };
    },
    execute: async () => [{ value: 1 }],
  };

  return {
    env: { BETA_CONSENT_VERSION: "2026-06-17" },
    db: { db },
  } as unknown as AppContext;
}

describe("admin routes", () => {
  let app = Fastify();

  beforeEach(async () => {
    app = Fastify();
    vi.mocked(requireAdminAccess).mockReset();
    await registerAdminRoutes(app, createAdminContext());
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects non-admin users", async () => {
    vi.mocked(requireAdminAccess).mockRejectedValue(
      new EntitlementError("admin_access_required", "Admin access is required.", 403),
    );

    const response = await app.inject({ method: "GET", url: "/admin/overview" });
    expect(response.statusCode).toBe(403);
  });

  it("allows admin manual ingestion trigger", async () => {
    vi.mocked(requireAdminAccess).mockResolvedValue({
      actor: { id: "adm_1", email: "admin@studyagent.local" },
      productState: {
        userId: "adm_1",
        studyAccess: 1,
        ingestionAccess: 1,
        adminAccess: 1,
        pilotTagsJson: [],
        onboardingJson: {},
        trialBudgetGrantedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const response = await app.inject({ method: "POST", url: "/admin/ingestion/trigger" });
    expect(response.statusCode).toBe(202);
    const body = response.json() as { runId: string };
    expect(body.runId).toBe("itr_test");
  });
});
