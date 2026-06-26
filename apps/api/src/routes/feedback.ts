import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  grantCredits,
  learningFeedback,
  masteryEvidence,
  notebooks,
  quizAttempts,
  supportReports,
  tutorSessions,
} from "@studyagent/db";
import type { AppContext } from "../context.js";
import { requireActor } from "../auth.js";
import {
  requireAdminAccess,
  requireBetaConsent,
  requireStudyAccess,
  sendAuthOrEntitlementError,
} from "../hosted-beta/entitlements.js";
import { recordProductAnalytics } from "../hosted-beta/product-analytics.js";

export const SUPPORT_REPORT_CATEGORIES = [
  "learning_feedback",
  "wrong_tutor_answer",
  "ingestion_problem",
  "privacy_delete",
  "credit_access",
  "bug_ux",
] as const;

export type SupportReportCategory = (typeof SUPPORT_REPORT_CATEGORIES)[number];

function newLearningFeedbackId(): string {
  return `lfb_${crypto.randomUUID().replaceAll("-", "")}`;
}

function newSupportReportId(): string {
  return `srp_${crypto.randomUUID().replaceAll("-", "")}`;
}

function safeRequestContext(request: FastifyRequest): Record<string, unknown> {
  const userAgent = request.headers["user-agent"];
  const browser = typeof userAgent === "string" ? userAgent.slice(0, 512) : null;
  return {
    browser,
    requestId: request.id,
    path: request.url.split("?", 1)[0],
  };
}

function sanitizeSupportContext(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input) return {};
  const allowedKeys = new Set([
    "notebookId",
    "workspaceId",
    "sourceId",
    "sourceVersionId",
    "jobId",
    "sessionId",
    "runId",
    "traceId",
    "requestId",
    "screenshotUrl",
    "replayUrl",
    "route",
  ]);
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key, value]) => allowedKeys.has(key) && typeof value === "string")
      .map(([key, value]) => [key, String(value).slice(0, 500)]),
  );
}

async function resolveFeedbackStudyContext(
  ctx: AppContext,
  userId: string,
  requestedNotebookId?: string,
): Promise<{ notebookId: string | null; meaningfulStudy: boolean } | null> {
  const owned = await ctx.db.db
    .select({ id: notebooks.id })
    .from(notebooks)
    .where(
      requestedNotebookId
        ? and(eq(notebooks.id, requestedNotebookId), eq(notebooks.ownerId, userId))
        : eq(notebooks.ownerId, userId),
    )
    .orderBy(desc(notebooks.updatedAt))
    .limit(requestedNotebookId ? 1 : 10);

  if (requestedNotebookId && owned.length === 0) {
    return null;
  }
  if (owned.length === 0) {
    return { notebookId: null, meaningfulStudy: false };
  }

  for (const notebook of owned) {
    const [[session], [mastery], [quiz]] = await Promise.all([
      ctx.db.db
        .select({ id: tutorSessions.id })
        .from(tutorSessions)
        .where(and(eq(tutorSessions.notebookId, notebook.id), eq(tutorSessions.userId, userId)))
        .limit(1),
      ctx.db.db
        .select({ id: masteryEvidence.id })
        .from(masteryEvidence)
        .where(
          and(
            eq(masteryEvidence.notebookId, notebook.id),
            eq(masteryEvidence.userId, userId),
            sql`${masteryEvidence.evidenceJson}->>'evidenceType' = 'mastery_check'`,
          ),
        )
        .limit(1),
      ctx.db.db
        .select({ id: quizAttempts.id })
        .from(quizAttempts)
        .where(and(eq(quizAttempts.notebookId, notebook.id), eq(quizAttempts.userId, userId)))
        .limit(1),
    ]);
    if (session && (mastery || quiz)) {
      return { notebookId: notebook.id, meaningfulStudy: true };
    }
  }
  return { notebookId: owned[0]?.id ?? null, meaningfulStudy: false };
}

async function requireLearner(ctx: AppContext, request: FastifyRequest) {
  const { actor } = await requireStudyAccess(ctx, request);
  await requireBetaConsent(ctx, request);
  return actor;
}

export async function registerFeedbackRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post<{
    Body: {
      studyGoal: string;
      helped: boolean;
      confusionText?: string;
      alternativeWorkflow?: string;
      contactPermission: boolean;
      notebookId?: string;
    };
  }>("/feedback/learning", async (request, reply) => {
    try {
      const actor = await requireLearner(ctx, request);
      const body = request.body;
      if (!body?.studyGoal || typeof body.studyGoal !== "string") {
        return reply.status(400).send({ code: "bad_request", message: "studyGoal is required" });
      }
      if (typeof body.helped !== "boolean") {
        return reply.status(400).send({ code: "bad_request", message: "helped must be a boolean" });
      }
      if (typeof body.contactPermission !== "boolean") {
        return reply
          .status(400)
          .send({ code: "bad_request", message: "contactPermission must be a boolean" });
      }
      const studyContext = await resolveFeedbackStudyContext(ctx, actor.id, body.notebookId);
      if (!studyContext) {
        return reply.status(404).send({ code: "not_found", message: "Workspace not found" });
      }
      const notebookId = studyContext.notebookId;

      const id = newLearningFeedbackId();
      const now = new Date();
      await ctx.db.db.insert(learningFeedback).values({
        id,
        userId: actor.id,
        notebookId: notebookId ?? null,
        studyGoal: body.studyGoal,
        helped: body.helped ? 1 : 0,
        confusionText: body.confusionText ?? null,
        alternativeWorkflow: body.alternativeWorkflow ?? null,
        contactPermission: body.contactPermission ? 1 : 0,
        status: "submitted",
        createdAt: now,
        updatedAt: now,
      });

      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: studyContext.meaningfulStudy
          ? "learning_feedback_submitted"
          : "learning_feedback_submitted_early",
        properties: {
          helped: body.helped,
          contactPermission: body.contactPermission,
          notebookId,
          activationEligible: studyContext.meaningfulStudy,
          ...safeRequestContext(request),
        },
      });

      const [created] = await ctx.db.db
        .select()
        .from(learningFeedback)
        .where(eq(learningFeedback.id, id))
        .limit(1);

      return reply.status(201).send({ feedback: created });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.post<{
    Body: {
      category: string;
      message: string;
      contextJson?: Record<string, unknown>;
    };
  }>("/feedback/support", async (request, reply) => {
    try {
      const actor = await requireLearner(ctx, request);
      const body = request.body;
      if (!body?.message || typeof body.message !== "string") {
        return reply.status(400).send({ code: "bad_request", message: "message is required" });
      }
      if (
        !body.category ||
        !SUPPORT_REPORT_CATEGORIES.includes(body.category as SupportReportCategory)
      ) {
        return reply
          .status(400)
          .send({ code: "bad_request", message: "Invalid support report category" });
      }

      const id = newSupportReportId();
      const now = new Date();
      const contextJson = {
        ...sanitizeSupportContext(body.contextJson),
        ...safeRequestContext(request),
        userId: actor.id,
      };

      await ctx.db.db.insert(supportReports).values({
        id,
        userId: actor.id,
        category: body.category,
        message: body.message,
        contextJson,
        status: "submitted",
        createdAt: now,
        updatedAt: now,
      });

      const [created] = await ctx.db.db
        .select()
        .from(supportReports)
        .where(eq(supportReports.id, id))
        .limit(1);

      return reply.status(201).send({ report: created });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.get("/admin/feedback", async (request, reply) => {
    try {
      await requireAdminAccess(ctx, request);
      const [feedbackRows, supportRows] = await Promise.all([
        ctx.db.db
          .select()
          .from(learningFeedback)
          .orderBy(desc(learningFeedback.createdAt))
          .limit(200),
        ctx.db.db.select().from(supportReports).orderBy(desc(supportReports.createdAt)).limit(200),
      ]);
      return reply.send({
        feedback: feedbackRows,
        learningFeedback: feedbackRows,
        supportReports: supportRows,
      });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.get("/admin/support-reports", async (request, reply) => {
    try {
      await requireAdminAccess(ctx, request);
      const rows = await ctx.db.db
        .select()
        .from(supportReports)
        .orderBy(desc(supportReports.createdAt))
        .limit(200);
      return reply.send({ reports: rows });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { status: string };
  }>("/admin/feedback/:id", async (request, reply) => {
    try {
      await requireAdminAccess(ctx, request);
      const status = request.body?.status;
      if (!status || typeof status !== "string") {
        return reply.status(400).send({ code: "bad_request", message: "status is required" });
      }

      const [updated] = await ctx.db.db
        .update(learningFeedback)
        .set({ status, updatedAt: new Date() })
        .where(eq(learningFeedback.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ code: "not_found", message: "Feedback not found" });
      }
      return reply.send({ feedback: updated });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.post<{
    Params: { id: string };
    Body: { creditType?: "tutor" | "ingestion"; amountCents: number; reason?: string };
  }>("/admin/feedback/:id/grant", async (request, reply) => {
    try {
      const { actor } = await requireAdminAccess(ctx, request);
      const [feedback] = await ctx.db.db
        .select()
        .from(learningFeedback)
        .where(eq(learningFeedback.id, request.params.id))
        .limit(1);
      if (!feedback) {
        return reply.status(404).send({ code: "not_found", message: "Feedback not found" });
      }
      if (feedback.status !== "reviewed") {
        return reply.status(409).send({
          code: "feedback_review_required",
          message: "Review the feedback before granting credits.",
        });
      }
      const amountCents = Math.trunc(request.body?.amountCents ?? 0);
      if (amountCents <= 0) {
        return reply
          .status(400)
          .send({ code: "bad_request", message: "amountCents must be positive" });
      }
      const creditType = request.body?.creditType ?? "tutor";
      const entry = await grantCredits(
        ctx.db,
        feedback.userId,
        creditType,
        amountCents,
        request.body?.reason?.trim() || "feedback_grant",
        {
          source: "feedback_grant",
          feedbackId: feedback.id,
          grantedBy: actor.id,
        },
      );
      const [updated] = await ctx.db.db
        .update(learningFeedback)
        .set({ status: "granted", updatedAt: new Date() })
        .where(eq(learningFeedback.id, feedback.id))
        .returning();
      await recordProductAnalytics(ctx, {
        userId: feedback.userId,
        eventName: "credit_top_up",
        properties: {
          source: "feedback_grant",
          feedbackId: feedback.id,
          creditType,
          amountCents,
        },
      }).catch(() => undefined);
      return reply.status(201).send({ feedback: updated, entry });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { status: string };
  }>("/admin/support-reports/:id", async (request, reply) => {
    try {
      await requireAdminAccess(ctx, request);
      const status = request.body?.status;
      if (!status || typeof status !== "string") {
        return reply.status(400).send({ code: "bad_request", message: "status is required" });
      }

      const now = new Date();
      const [updated] = await ctx.db.db
        .update(supportReports)
        .set({
          status,
          reviewedAt: status === "reviewed" ? now : null,
          updatedAt: now,
        })
        .where(eq(supportReports.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ code: "not_found", message: "Support report not found" });
      }
      return reply.send({ report: updated });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });
}
