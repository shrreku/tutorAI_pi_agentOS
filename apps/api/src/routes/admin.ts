import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  appendCreditLedgerEntry,
  betaConsents,
  getActivationSummary,
  getCreditLedgerForAdmin,
  getCreditSummaryForLearner,
  grantCredits,
  ingestionJobs,
  ingestionTriggerRuns,
  learningFeedback,
  notebooks,
  productAnalyticsEvents,
  sources,
  studyTemplates,
  supportReports,
  userProductState,
  users,
} from "@studyagent/db";
import type { AppContext } from "../context.js";
import { requireAdminAccess, sendAuthOrEntitlementError } from "../hosted-beta/entitlements.js";
import { triggerIngestionWorker } from "../hosted-beta/ingestion-trigger.js";
import { recordProductAnalytics } from "../hosted-beta/product-analytics.js";

async function requireAdmin(ctx: AppContext, request: FastifyRequest, reply: FastifyReply) {
  try {
    const { actor } = await requireAdminAccess(ctx, request);
    return actor;
  } catch (error) {
    return sendAuthOrEntitlementError(reply, error);
  }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function registerAdminRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/admin/overview", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const [[userCount], activationSummary, [creditExhaustedCount], [failedIngestionCount], [pendingFeedbackCount], [supportPending]] =
      await Promise.all([
        ctx.db.db.select({ value: count() }).from(users),
        getActivationSummary(ctx.db),
        ctx.db.db.execute(sql`
          select count(distinct u.id)::int as value
          from users u
          left join lateral (
            select coalesce(sum(case when entry_type in ('grant','debit','adjustment') then amount_cents else 0 end), 0) as balance
            from credit_ledger_entries
            where user_id = u.id and credit_type = 'tutor'
          ) tutor on true
          left join lateral (
            select coalesce(sum(reserved_cents - settled_cents), 0) as reserved
            from credit_reservations
            where user_id = u.id and credit_type = 'tutor' and status = 'active'
          ) reserved on true
          where coalesce(tutor.balance, 0) - coalesce(reserved.reserved, 0) <= 0
        `),
        ctx.db.db
          .select({ value: count() })
          .from(sources)
          .where(inArray(sources.status, ["failed", "ingestion_review"])),
        ctx.db.db
          .select({ value: count() })
          .from(learningFeedback)
          .where(eq(learningFeedback.status, "submitted")),
        ctx.db.db
          .select({ value: count() })
          .from(supportReports)
          .where(eq(supportReports.status, "submitted")),
      ]);

    const creditExhaustedRow = (creditExhaustedCount as unknown as { value: number }[])[0];

    return reply.send({
      counts: {
        users: Number(userCount?.value ?? 0),
        activatedLearners: activationSummary.activated,
        creditExhausted: Number(creditExhaustedRow?.value ?? 0),
        failedIngestion: Number(failedIngestionCount?.value ?? 0),
        pendingFeedback: Number(pendingFeedbackCount?.value ?? 0) + Number(supportPending?.value ?? 0),
      },
    });
  });

  app.get("/admin/users", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const rows = await ctx.db.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        disabledAt: users.disabledAt,
        createdAt: users.createdAt,
        studyAccess: userProductState.studyAccess,
        ingestionAccess: userProductState.ingestionAccess,
        adminAccess: userProductState.adminAccess,
      })
      .from(users)
      .leftJoin(userProductState, eq(userProductState.userId, users.id))
      .orderBy(desc(users.createdAt))
      .limit(200);

    return reply.send({ users: rows });
  });

  app.get<{ Params: { userId: string } }>("/admin/users/:userId", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const { userId } = request.params;
    const [user] = await ctx.db.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return reply.status(404).send({ code: "not_found", message: "User not found" });
    }

    const [productState] = await ctx.db.db
      .select()
      .from(userProductState)
      .where(eq(userProductState.userId, userId))
      .limit(1);
    const consents = await ctx.db.db
      .select()
      .from(betaConsents)
      .where(eq(betaConsents.userId, userId))
      .orderBy(desc(betaConsents.acceptedAt));
    const credits = await getCreditSummaryForLearner(ctx.db, userId);
    const workspaceCount = await ctx.db.db
      .select({ value: count() })
      .from(notebooks)
      .where(eq(notebooks.ownerId, userId));

    return reply.send({
      user,
      productState: productState ?? null,
      consents,
      credits,
      workspaceCount: Number(workspaceCount[0]?.value ?? 0),
    });
  });

  app.patch<{
    Params: { userId: string };
    Body: {
      studyAccess?: boolean;
      ingestionAccess?: boolean;
      adminAccess?: boolean;
      disabled?: boolean;
    };
  }>("/admin/users/:userId", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const { userId } = request.params;
    const body = request.body ?? {};
    const [user] = await ctx.db.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return reply.status(404).send({ code: "not_found", message: "User not found" });
    }

    const now = new Date();
    if (typeof body.disabled === "boolean") {
      await ctx.db.db
        .update(users)
        .set({ disabledAt: body.disabled ? now : null, updatedAt: now })
        .where(eq(users.id, userId));
    }

    if (typeof body.ingestionAccess === "boolean" || typeof body.adminAccess === "boolean" || typeof body.studyAccess === "boolean") {
      const [existing] = await ctx.db.db
        .select()
        .from(userProductState)
        .where(eq(userProductState.userId, userId))
        .limit(1);

      const updates: Partial<typeof userProductState.$inferInsert> = { updatedAt: now };
      if (typeof body.studyAccess === "boolean") {
        updates.studyAccess = body.studyAccess ? 1 : 0;
      }
      if (typeof body.ingestionAccess === "boolean") {
        updates.ingestionAccess = body.ingestionAccess ? 1 : 0;
      }
      if (typeof body.adminAccess === "boolean") {
        updates.adminAccess = body.adminAccess ? 1 : 0;
      }

      if (existing) {
        await ctx.db.db.update(userProductState).set(updates).where(eq(userProductState.userId, userId));
      } else {
        await ctx.db.db.insert(userProductState).values({
          userId,
          studyAccess: 1,
          ingestionAccess: body.ingestionAccess ? 1 : 0,
          adminAccess: body.adminAccess ? 1 : 0,
          pilotTagsJson: [],
          onboardingJson: {},
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const [updatedUser] = await ctx.db.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [productState] = await ctx.db.db
      .select()
      .from(userProductState)
      .where(eq(userProductState.userId, userId))
      .limit(1);

    return reply.send({ user: updatedUser, productState: productState ?? null });
  });

  app.get("/admin/workspaces", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const rows = await ctx.db.db
      .select({
        id: notebooks.id,
        title: notebooks.title,
        ownerId: notebooks.ownerId,
        ownerEmail: users.email,
        workspaceType: notebooks.workspaceType,
        studyTemplateId: notebooks.studyTemplateId,
        disabledAt: notebooks.disabledAt,
        createdAt: notebooks.createdAt,
      })
      .from(notebooks)
      .innerJoin(users, eq(users.id, notebooks.ownerId))
      .orderBy(desc(notebooks.createdAt))
      .limit(200);

    return reply.send({ workspaces: rows });
  });

  app.get<{ Params: { notebookId: string } }>("/admin/workspaces/:notebookId", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const { notebookId } = request.params;
    const [notebook] = await ctx.db.db.select().from(notebooks).where(eq(notebooks.id, notebookId)).limit(1);
    if (!notebook) {
      return reply.status(404).send({ code: "not_found", message: "Workspace not found" });
    }

    const [owner] = await ctx.db.db.select().from(users).where(eq(users.id, notebook.ownerId)).limit(1);
    const sourceRows = await ctx.db.db
      .select()
      .from(sources)
      .where(eq(sources.notebookId, notebookId))
      .orderBy(desc(sources.createdAt));
    const jobRows = await ctx.db.db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.notebookId, notebookId))
      .orderBy(desc(ingestionJobs.createdAt))
      .limit(50);

    return reply.send({
      workspace: notebook,
      owner: owner ?? null,
      sources: sourceRows,
      ingestionJobs: jobRows,
    });
  });

  app.patch<{
    Params: { notebookId: string };
    Body: { disabled?: boolean };
  }>("/admin/workspaces/:notebookId", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const { notebookId } = request.params;
    const [notebook] = await ctx.db.db.select().from(notebooks).where(eq(notebooks.id, notebookId)).limit(1);
    if (!notebook) {
      return reply.status(404).send({ code: "not_found", message: "Workspace not found" });
    }

    if (typeof request.body?.disabled === "boolean") {
      const now = new Date();
      await ctx.db.db
        .update(notebooks)
        .set({ disabledAt: request.body.disabled ? now : null, updatedAt: now })
        .where(eq(notebooks.id, notebookId));
    }

    const [updated] = await ctx.db.db.select().from(notebooks).where(eq(notebooks.id, notebookId)).limit(1);
    return reply.send({ workspace: updated });
  });

  app.get("/admin/study-templates", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const templates = await ctx.db.db.select().from(studyTemplates).orderBy(studyTemplates.sortOrder);
    return reply.send({ templates });
  });

  app.get<{ Params: { userId: string } }>("/admin/credits/:userId", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const ledger = await getCreditLedgerForAdmin(ctx.db, request.params.userId, 200);
    const summary = await getCreditSummaryForLearner(ctx.db, request.params.userId);
    return reply.send({ userId: request.params.userId, summary, ledger });
  });

  app.post<{
    Params: { userId: string };
    Body: {
      creditType: "tutor" | "ingestion";
      amountCents: number;
      reason: string;
      entryType?: "grant" | "adjustment";
    };
  }>("/admin/credits/:userId/adjust", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const { userId } = request.params;
    const body = request.body;
    if (!body?.reason?.trim() || typeof body.amountCents !== "number" || !body.creditType) {
      return reply.status(400).send({ code: "bad_request", message: "creditType, amountCents, and reason are required" });
    }

    const [user] = await ctx.db.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return reply.status(404).send({ code: "not_found", message: "User not found" });
    }

    const entryType = body.entryType ?? (body.amountCents > 0 ? "grant" : "adjustment");
    const amountCents = Math.abs(Math.trunc(body.amountCents));
    const signedAmount = entryType === "adjustment" && body.amountCents < 0 ? -amountCents : amountCents;

    const entry =
      entryType === "grant" && signedAmount > 0
        ? await grantCredits(ctx.db, userId, body.creditType, signedAmount, body.reason.trim(), {
            adjustedBy: actor.id,
          })
        : await appendCreditLedgerEntry(ctx.db, {
            userId,
            creditType: body.creditType,
            entryType,
            amountCents: signedAmount,
            reason: body.reason.trim(),
            metadata: { adjustedBy: actor.id },
          });

    const summary = await getCreditSummaryForLearner(ctx.db, userId);
    await recordProductAnalytics(ctx, {
      userId,
      eventName: signedAmount > 0 ? "credit_top_up" : "credit_adjustment",
      properties: {
        creditType: body.creditType,
        amountCents: signedAmount,
        reason: body.reason.trim(),
        source: "admin",
        adminUserId: actor.id,
      },
    }).catch(() => undefined);
    return reply.status(201).send({ entry, summary });
  });

  app.get("/admin/ingestion/sources", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const rows = await ctx.db.db
      .select({
        source: sources,
        notebookTitle: notebooks.title,
        ownerId: notebooks.ownerId,
        ownerEmail: users.email,
      })
      .from(sources)
      .innerJoin(notebooks, eq(notebooks.id, sources.notebookId))
      .innerJoin(users, eq(users.id, notebooks.ownerId))
      .where(
        or(
          inArray(sources.status, ["failed", "ingestion_review", "uploaded"]),
          sql`exists (
            select 1 from ingestion_jobs j
            where j.source_id = ${sources.id}
              and j.status in ('queued', 'running')
          )`,
        ),
      )
      .orderBy(desc(sources.updatedAt))
      .limit(200);

    return reply.send({ sources: rows });
  });

  app.get("/admin/ingestion/trigger-runs", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const runs = await ctx.db.db
      .select()
      .from(ingestionTriggerRuns)
      .orderBy(desc(ingestionTriggerRuns.startedAt))
      .limit(100);
    return reply.send({ runs });
  });

  app.post("/admin/ingestion/trigger", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const result = await triggerIngestionWorker(ctx, "admin_manual", actor.id);
    return reply.status(result.status === "failed" ? 502 : 202).send(result);
  });

  app.get("/admin/analytics/summary", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const rows = await ctx.db.db
      .select({
        eventName: productAnalyticsEvents.eventName,
        count: count(),
      })
      .from(productAnalyticsEvents)
      .groupBy(productAnalyticsEvents.eventName)
      .orderBy(desc(count()));

    const recent = await ctx.db.db
      .select()
      .from(productAnalyticsEvents)
      .orderBy(desc(productAnalyticsEvents.createdAt))
      .limit(50);

    return reply.send({ eventCounts: rows, recentEvents: recent });
  });
}
