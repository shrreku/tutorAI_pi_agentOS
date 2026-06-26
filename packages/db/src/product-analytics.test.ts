import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, productAnalyticsEvents, users } from "./index.js";
import {
  getActivationStatus,
  getActivationSummary,
  isActivatedLearner,
  trackProductEvent,
  sanitizeProductAnalyticsProperties,
} from "./product-analytics.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://studyagent:studyagent@127.0.0.1:5433/studyagent";
const shouldRun = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe("product analytics unit", () => {
  it("recursively removes private study content", () => {
    expect(
      sanitizeProductAnalyticsProperties({
        templateId: "st_1",
        nested: {
          sourceText: "private source",
          safeCount: 2,
        },
        transcript: "private transcript",
      }),
    ).toEqual({
      templateId: "st_1",
      nested: { safeCount: 2 },
    });
  });

  it("marks activated learners when all funnel events exist", async () => {
    if (!shouldRun) return;

    const dbClient = createDb(DATABASE_URL);
    const suffix = `${Date.now()}`;
    const userId = `usr_pae_${suffix}`;
    const now = new Date();

    try {
      await dbClient.db.insert(users).values({
        id: userId,
        email: `pae_${suffix}@example.com`,
        displayName: "Analytics Test User",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });

      expect(await isActivatedLearner(dbClient, userId)).toBe(false);

      for (const eventName of [
        "template_start",
        "tutor_session",
        "mastery_check",
        "learning_feedback_submitted",
      ]) {
        await trackProductEvent(dbClient, { userId, eventName, properties: { step: eventName } });
      }

      const status = await getActivationStatus(dbClient, userId);
      expect(status).toMatchObject({
        templateStart: true,
        tutorSession: true,
        masteryCheck: true,
        learningFeedbackSubmitted: true,
        activated: true,
      });
      expect(await isActivatedLearner(dbClient, userId)).toBe(true);

      const summary = await getActivationSummary(dbClient);
      expect(summary.activated).toBeGreaterThanOrEqual(1);
      expect(summary.templateStart).toBeGreaterThanOrEqual(1);
    } finally {
      await dbClient.db
        .delete(productAnalyticsEvents)
        .where(eq(productAnalyticsEvents.userId, userId));
      await dbClient.db.delete(users).where(eq(users.id, userId));
      await dbClient.sql.end();
    }
  });
});
