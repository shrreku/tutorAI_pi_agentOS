import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "./client.js";
import { productAnalyticsEvents } from "./schema/index.js";

const ACTIVATION_RELEVANT_EVENT_NAMES = [
  "template_start",
  "tutor_session",
  "mastery_check",
  "quiz_interaction",
  "learning_feedback_submitted",
] as const;

export type ActivationEventName = (typeof ACTIVATION_RELEVANT_EVENT_NAMES)[number];

export type ProductEventInput = {
  userId?: string;
  eventName: string;
  properties?: Record<string, unknown>;
};

export type ActivationStatus = {
  templateStart: boolean;
  tutorSession: boolean;
  masteryCheck: boolean;
  learningFeedbackSubmitted: boolean;
  activated: boolean;
};

export type ActivationSummary = {
  trackedUsers: number;
  templateStart: number;
  tutorSession: number;
  masteryCheck: number;
  learningFeedbackSubmitted: number;
  activated: number;
};

const SENSITIVE_ANALYTICS_KEY =
  /source.?text|transcript|mastery.?detail|learning.?state|user.?message|assistant.?message|raw.?content|chunk.?text|citation.?text|message.?content|markdown|prompt|uploaded.?file|file.?content|authorization|cookie|password|secret|token/i;

function newEventId(): string {
  return `pae_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function trackProductEvent(
  dbClient: DbClient,
  input: ProductEventInput,
): Promise<{ id: string }> {
  const id = newEventId();
  await dbClient.db.insert(productAnalyticsEvents).values({
    id,
    userId: input.userId ?? null,
    eventName: input.eventName,
    propertiesJson: sanitizeProductAnalyticsProperties(input.properties ?? {}),
    createdAt: new Date(),
  });
  return { id };
}

export function sanitizeProductAnalyticsProperties(
  properties: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth > 4) {
    return {};
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties).slice(0, 100)) {
    if (SENSITIVE_ANALYTICS_KEY.test(key)) {
      continue;
    }
    const next = sanitizeAnalyticsValue(value, depth + 1);
    if (next !== undefined) {
      sanitized[key] = next;
    }
  }
  return sanitized;
}

function sanitizeAnalyticsValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return value.slice(0, 500);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeAnalyticsValue(entry, depth)).filter((entry) => entry !== undefined);
  }
  if (typeof value === "object") {
    return sanitizeProductAnalyticsProperties(value as Record<string, unknown>, depth);
  }
  return undefined;
}

export async function getActivationStatus(dbClient: DbClient, userId: string): Promise<ActivationStatus> {
  const rows = await dbClient.db
    .select({ eventName: productAnalyticsEvents.eventName })
    .from(productAnalyticsEvents)
    .where(
      and(
        eq(productAnalyticsEvents.userId, userId),
        inArray(productAnalyticsEvents.eventName, [...ACTIVATION_RELEVANT_EVENT_NAMES]),
      ),
    );

  const seen = new Set(rows.map((row) => row.eventName));
  const status: ActivationStatus = {
    templateStart: seen.has("template_start"),
    tutorSession: seen.has("tutor_session"),
    masteryCheck: seen.has("mastery_check") || seen.has("quiz_interaction"),
    learningFeedbackSubmitted: seen.has("learning_feedback_submitted"),
    activated: false,
  };
  status.activated =
    status.templateStart &&
    status.tutorSession &&
    status.masteryCheck &&
    status.learningFeedbackSubmitted;
  return status;
}

export async function isActivatedLearner(dbClient: DbClient, userId: string): Promise<boolean> {
  const status = await getActivationStatus(dbClient, userId);
  return status.activated;
}

export async function getActivationSummary(dbClient: DbClient): Promise<ActivationSummary> {
  const [trackedUsersRow, templateRows, tutorRows, assessmentRows, feedbackRows] = await Promise.all([
    dbClient.db
      .select({
        count: sql<number>`count(distinct ${productAnalyticsEvents.userId})`,
      })
      .from(productAnalyticsEvents)
      .where(sql`${productAnalyticsEvents.userId} is not null`),
    dbClient.db
      .select({ count: sql<number>`count(distinct ${productAnalyticsEvents.userId})` })
      .from(productAnalyticsEvents)
      .where(
        and(eq(productAnalyticsEvents.eventName, "template_start"), sql`${productAnalyticsEvents.userId} is not null`),
      ),
    dbClient.db
      .select({ count: sql<number>`count(distinct ${productAnalyticsEvents.userId})` })
      .from(productAnalyticsEvents)
      .where(
        and(eq(productAnalyticsEvents.eventName, "tutor_session"), sql`${productAnalyticsEvents.userId} is not null`),
      ),
    dbClient.db
      .select({ count: sql<number>`count(distinct ${productAnalyticsEvents.userId})` })
      .from(productAnalyticsEvents)
      .where(
        and(
          inArray(productAnalyticsEvents.eventName, ["mastery_check", "quiz_interaction"]),
          sql`${productAnalyticsEvents.userId} is not null`,
        ),
      ),
    dbClient.db
      .select({ count: sql<number>`count(distinct ${productAnalyticsEvents.userId})` })
      .from(productAnalyticsEvents)
      .where(
        and(
          eq(productAnalyticsEvents.eventName, "learning_feedback_submitted"),
          sql`${productAnalyticsEvents.userId} is not null`,
        ),
      ),
  ]);

  const templateStart = Number(templateRows[0]?.count ?? 0);
  const tutorSession = Number(tutorRows[0]?.count ?? 0);
  const masteryCheck = Number(assessmentRows[0]?.count ?? 0);
  const learningFeedbackSubmitted = Number(feedbackRows[0]?.count ?? 0);

  const activatedRows = await dbClient.db
    .select({ userId: productAnalyticsEvents.userId })
    .from(productAnalyticsEvents)
    .where(
      and(
        inArray(productAnalyticsEvents.eventName, [...ACTIVATION_RELEVANT_EVENT_NAMES]),
        sql`${productAnalyticsEvents.userId} is not null`,
      ),
    )
    .groupBy(productAnalyticsEvents.userId)
    .having(sql`
      count(*) filter (where ${productAnalyticsEvents.eventName} = 'template_start') > 0
      and count(*) filter (where ${productAnalyticsEvents.eventName} = 'tutor_session') > 0
      and count(*) filter (
        where ${productAnalyticsEvents.eventName} in ('mastery_check', 'quiz_interaction')
      ) > 0
      and count(*) filter (
        where ${productAnalyticsEvents.eventName} = 'learning_feedback_submitted'
      ) > 0
    `);

  return {
    trackedUsers: Number(trackedUsersRow[0]?.count ?? 0),
    templateStart,
    tutorSession,
    masteryCheck,
    learningFeedbackSubmitted,
    activated: activatedRows.length,
  };
}
