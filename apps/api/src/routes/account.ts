import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { accountDeletionRequests, notebooks, sources } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { AuthError, resolveActor } from "../auth.js";
import { ensureUserProductState, sendAuthOrEntitlementError } from "../hosted-beta/entitlements.js";
import { recordProductAnalytics } from "../hosted-beta/product-analytics.js";

async function requireAdmin(ctx: AppContext, userId: string): Promise<boolean> {
  const state = await ensureUserProductState(ctx, userId);
  return state.adminAccess > 0;
}

async function deleteStorageObject(ctx: AppContext, objectKey: string): Promise<void> {
  if (!ctx.s3) {
    return;
  }
  await ctx.s3.send(
    new DeleteObjectCommand({
      Bucket: ctx.env.OBJECT_STORAGE_BUCKET,
      Key: objectKey,
    }),
  );
}

export async function deleteOwnedPersonalWorkspace(
  ctx: AppContext,
  ownerId: string,
  notebookId: string,
): Promise<"not_found" | "forbidden" | "deleted"> {
  const [workspace] = await ctx.db.db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, ownerId)))
    .limit(1);

  if (!workspace) {
    return "not_found";
  }

  if (workspace.workspaceType !== "personal_learner") {
    return "forbidden";
  }

  const sourceRows = await ctx.db.db
    .select({ originalObjectKey: sources.originalObjectKey })
    .from(sources)
    .where(eq(sources.notebookId, notebookId));

  for (const source of sourceRows) {
    await deleteStorageObject(ctx, source.originalObjectKey);
  }

  await ctx.db.db.delete(notebooks).where(eq(notebooks.id, notebookId));
  return "deleted";
}

export async function deleteOwnedPrivateSource(
  ctx: AppContext,
  ownerId: string,
  sourceId: string,
): Promise<"not_found" | "deleted"> {
  const [source] = await ctx.db.db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) {
    return "not_found";
  }

  const [ownedNotebook] = await ctx.db.db
    .select({ id: notebooks.id })
    .from(notebooks)
    .where(and(eq(notebooks.id, source.notebookId), eq(notebooks.ownerId, ownerId)))
    .limit(1);

  if (!ownedNotebook) {
    return "not_found";
  }

  await deleteStorageObject(ctx, source.originalObjectKey);
  await ctx.db.db.delete(sources).where(eq(sources.id, sourceId));
  return "deleted";
}

export async function registerAccountRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.delete<{ Params: { notebookId: string } }>("/workspaces/:notebookId", async (request, reply) => {
    try {
      const actor = await resolveActor(ctx, request);
      const outcome = await deleteOwnedPersonalWorkspace(ctx, actor.id, request.params.notebookId);
      if (outcome === "not_found") {
        return reply.status(404).send({ code: "not_found", message: "Workspace not found" });
      }
      if (outcome === "forbidden") {
        return reply.status(403).send({ code: "forbidden", message: "Only personal learner workspaces can be deleted" });
      }
      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: "workspace_deleted",
        properties: { notebookId: request.params.notebookId, tombstone: true },
      }).catch(() => undefined);
      return reply.status(204).send();
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.delete<{ Params: { sourceId: string } }>("/sources/:sourceId", async (request, reply) => {
    try {
      const actor = await resolveActor(ctx, request);
      const outcome = await deleteOwnedPrivateSource(ctx, actor.id, request.params.sourceId);
      if (outcome === "not_found") {
        return reply.status(404).send({ code: "not_found", message: "Source not found" });
      }
      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: "source_deleted",
        properties: { sourceId: request.params.sourceId, tombstone: true },
      }).catch(() => undefined);
      return reply.status(204).send();
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.post<{ Body: { notes?: string } }>("/account/deletion-request", async (request, reply) => {
    try {
      const actor = await resolveActor(ctx, request);
      const notes = typeof request.body?.notes === "string" ? request.body.notes.trim() : "";

      const [existingOpen] = await ctx.db.db
        .select()
        .from(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.userId, actor.id),
            inArray(accountDeletionRequests.status, ["requested", "in_progress"]),
          ),
        )
        .orderBy(desc(accountDeletionRequests.requestedAt))
        .limit(1);

      if (existingOpen) {
        return reply.send({ request: existingOpen });
      }

      const id = `adr_${crypto.randomUUID().replaceAll("-", "")}`;
      const now = new Date();

      await ctx.db.db.insert(accountDeletionRequests).values({
        id,
        userId: actor.id,
        status: "requested",
        notes: notes.length > 0 ? notes : null,
        requestedAt: now,
        completedAt: null,
      });

      const [created] = await ctx.db.db
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.id, id))
        .limit(1);

      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: "account_deletion_requested",
        properties: { requestId: id },
      }).catch(() => undefined);

      return reply.status(201).send({ request: created });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.get("/admin/account-deletion-requests", async (request, reply) => {
    try {
      const actor = await resolveActor(ctx, request);
      if (!(await requireAdmin(ctx, actor.id))) {
        return reply.status(403).send({ code: "forbidden", message: "Admin access required" });
      }

      const rows = await ctx.db.db
        .select()
        .from(accountDeletionRequests)
        .orderBy(desc(accountDeletionRequests.requestedAt));

      return reply.send({ requests: rows });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({ code: error.code, message: error.message });
      }
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { status?: string; notes?: string };
  }>("/admin/account-deletion-requests/:id", async (request, reply) => {
    try {
      const actor = await resolveActor(ctx, request);
      if (!(await requireAdmin(ctx, actor.id))) {
        return reply.status(403).send({ code: "forbidden", message: "Admin access required" });
      }

      const { id } = request.params;
      const [existing] = await ctx.db.db
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ code: "not_found", message: "Deletion request not found" });
      }

      const nextStatus = typeof request.body?.status === "string" ? request.body.status.trim() : existing.status;
      const allowedStatuses = new Set(["requested", "in_progress", "completed", "cancelled"]);
      if (!allowedStatuses.has(nextStatus)) {
        return reply.status(400).send({ code: "bad_request", message: "Invalid status" });
      }

      const nextNotes =
        typeof request.body?.notes === "string" ? request.body.notes.trim() : (existing.notes ?? "");
      const completedAt = nextStatus === "completed" ? new Date() : existing.completedAt;

      await ctx.db.db
        .update(accountDeletionRequests)
        .set({
          status: nextStatus,
          notes: nextNotes.length > 0 ? nextNotes : null,
          completedAt,
        })
        .where(eq(accountDeletionRequests.id, id));

      const [updated] = await ctx.db.db
        .select()
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.id, id))
        .limit(1);

      await recordProductAnalytics(ctx, {
        userId: existing.userId,
        eventName: "account_deletion_status_updated",
        properties: {
          requestId: id,
          status: nextStatus,
          reviewedByUserId: actor.id,
        },
      }).catch(() => undefined);

      return reply.send({ request: updated });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({ code: error.code, message: error.message });
      }
      return sendAuthOrEntitlementError(reply, error);
    }
  });
}
