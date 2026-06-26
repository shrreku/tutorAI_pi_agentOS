import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  learningFeedback,
  masteryEvidence,
  notebooks,
  quizAttempts,
  supportReports,
  tutorSessions,
} from "@studyagent/db";
import type { AppContext } from "../context.js";
import { EntitlementError } from "../hosted-beta/entitlements.js";
import { registerFeedbackRoutes, SUPPORT_REPORT_CATEGORIES } from "./feedback.js";

const { recordProductAnalytics } = vi.hoisted(() => ({
  recordProductAnalytics: vi.fn(async () => ({ id: "pae_test" })),
}));

vi.mock("../auth.js", () => ({
  requireActor: vi.fn(async () => ({ id: "usr_1", email: "learner@studyagent.local" })),
}));

vi.mock("../hosted-beta/entitlements.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hosted-beta/entitlements.js")>();
  return {
    ...actual,
    requireStudyAccess: vi.fn(async () => ({
      actor: { id: "usr_1", email: "learner@studyagent.local" },
      productState: { studyAccess: 1, ingestionAccess: 0, adminAccess: 0 },
    })),
    requireBetaConsent: vi.fn(async () => ({
      actor: { id: "usr_1", email: "learner@studyagent.local" },
      consentVersion: "2026-06-17",
    })),
    requireAdminAccess: vi.fn(async () => ({
      actor: { id: "usr_admin", email: "admin@studyagent.local" },
      productState: { studyAccess: 1, ingestionAccess: 1, adminAccess: 1 },
    })),
  };
});

vi.mock("../hosted-beta/product-analytics.js", () => ({
  recordProductAnalytics,
}));

type FeedbackRow = typeof learningFeedback.$inferSelect;
type SupportRow = typeof supportReports.$inferSelect;

function createFeedbackDb(options?: { meaningfulStudy?: boolean }) {
  const feedbackRows: FeedbackRow[] = [];
  const supportRows: SupportRow[] = [];

  const db = {
    insert(table: unknown) {
      return {
        values: async (row: FeedbackRow | SupportRow) => {
          if (table === learningFeedback) {
            feedbackRows.push(row as FeedbackRow);
          } else if (table === supportReports) {
            supportRows.push(row as SupportRow);
          }
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          const chain = {
            where() {
              return chain;
            },
            orderBy() {
              return chain;
            },
            limit(count: number) {
              if (table === notebooks) {
                return Promise.resolve([{ id: "nb_1" }].slice(0, count));
              }
              if (table === tutorSessions) {
                return Promise.resolve(
                  (options?.meaningfulStudy === false ? [] : [{ id: "sess_1" }]).slice(0, count),
                );
              }
              if (table === masteryEvidence) {
                return Promise.resolve(
                  (options?.meaningfulStudy === false ? [] : [{ id: "mev_1" }]).slice(0, count),
                );
              }
              if (table === quizAttempts) {
                return Promise.resolve([]);
              }
              if (table === learningFeedback) {
                return Promise.resolve(feedbackRows.slice(0, count));
              }
              if (table === supportReports) {
                return Promise.resolve(supportRows.slice(0, count));
              }
              return Promise.resolve([]);
            },
            then(onFulfilled: (value: unknown[]) => unknown) {
              if (table === learningFeedback) {
                return Promise.resolve(feedbackRows).then(onFulfilled);
              }
              if (table === supportReports) {
                return Promise.resolve(supportRows).then(onFulfilled);
              }
              return Promise.resolve([]).then(onFulfilled);
            },
          };
          return chain;
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Partial<FeedbackRow | SupportRow>) {
          return {
            where() {
              return {
                returning: async () => {
                  if (table === learningFeedback && feedbackRows[0]) {
                    feedbackRows[0] = { ...feedbackRows[0], ...values } as FeedbackRow;
                    return [feedbackRows[0]];
                  }
                  if (table === supportReports && supportRows[0]) {
                    supportRows[0] = { ...supportRows[0], ...values } as SupportRow;
                    return [supportRows[0]];
                  }
                  return [];
                },
              };
            },
          };
        },
      };
    },
  };

  return { db, feedbackRows, supportRows };
}

describe("feedback routes", () => {
  let app = Fastify();
  let feedbackRows: FeedbackRow[] = [];
  let supportRows: SupportRow[] = [];

  beforeEach(async () => {
    recordProductAnalytics.mockClear();
    const store = createFeedbackDb();
    feedbackRows = store.feedbackRows;
    supportRows = store.supportRows;
    app = Fastify();
    await registerFeedbackRoutes(app, {
      db: store,
      env: { BETA_CONSENT_VERSION: "2026-06-17" },
    } as unknown as AppContext);
  });

  afterEach(async () => {
    await app.close();
  });

  it("exposes the expected support categories", () => {
    expect(SUPPORT_REPORT_CATEGORIES).toEqual([
      "learning_feedback",
      "wrong_tutor_answer",
      "ingestion_problem",
      "privacy_delete",
      "credit_access",
      "bug_ux",
    ]);
  });

  it("creates learning feedback and tracks analytics", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/feedback/learning",
      headers: { "user-agent": "vitest" },
      payload: {
        studyGoal: "Understand limits",
        helped: true,
        confusionText: "Chain rule felt abrupt",
        contactPermission: true,
        notebookId: "nb_1",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(feedbackRows).toHaveLength(1);
    expect(feedbackRows[0]).toMatchObject({
      userId: "usr_1",
      studyGoal: "Understand limits",
      helped: 1,
      contactPermission: 1,
      notebookId: "nb_1",
    });
    expect(recordProductAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "usr_1",
        eventName: "learning_feedback_submitted",
      }),
    );
  });

  it("creates support reports with safe request context", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/feedback/support",
      headers: { "user-agent": "vitest-browser" },
      payload: {
        category: "bug_ux",
        message: "Button did not respond",
        contextJson: { notebookId: "nb_1" },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(supportRows).toHaveLength(1);
    expect(supportRows[0]?.contextJson).toMatchObject({
      userId: "usr_1",
      browser: "vitest-browser",
      notebookId: "nb_1",
    });
  });

  it("rejects invalid support categories", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/feedback/support",
      payload: {
        category: "not_real",
        message: "hello",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("lists and updates admin feedback", async () => {
    feedbackRows.push({
      id: "lfb_1",
      userId: "usr_1",
      notebookId: null,
      studyGoal: "Goal",
      helped: 1,
      confusionText: null,
      alternativeWorkflow: null,
      contactPermission: 0,
      status: "submitted",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const list = await app.inject({ method: "GET", url: "/admin/feedback" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ feedback: [{ id: "lfb_1" }] });

    const patch = await app.inject({
      method: "PATCH",
      url: "/admin/feedback/lfb_1",
      payload: { status: "reviewed" },
    });
    expect(patch.statusCode).toBe(200);
    expect(feedbackRows[0]?.status).toBe("reviewed");
  });
});

describe("feedback entitlement errors", () => {
  it("maps entitlement failures to 403 responses", () => {
    const error = new EntitlementError("beta_consent_required", "consent needed", 403);
    expect(error.code).toBe("beta_consent_required");
  });
});
