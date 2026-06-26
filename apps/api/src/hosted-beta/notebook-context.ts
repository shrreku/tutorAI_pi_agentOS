import { and, eq, isNull, sql } from "drizzle-orm";
import { notebooks } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { EntitlementError, hasAdminAccess } from "./entitlements.js";

export type OwnedNotebookContext = {
  notebook: typeof notebooks.$inferSelect;
  learnerNotebookId: string;
  contentNotebookId: string;
  templateNotebookId: string | null;
  templateId: string | null;
};

function readTemplateNotebookId(settingsJson: Record<string, unknown>): string | null {
  const value = settingsJson.templateNotebookId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getContentNotebookId(
  notebookId: string,
  settingsJson: Record<string, unknown> | null | undefined,
): string {
  const templateNotebookId = readTemplateNotebookId(settingsJson ?? {});
  return templateNotebookId ?? notebookId;
}

export async function requireOwnedNotebook(
  ctx: AppContext,
  actorId: string,
  notebookId: string,
): Promise<OwnedNotebookContext> {
  const [notebook] = await ctx.db.db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actorId)))
    .limit(1);

  if (!notebook) {
    throw new EntitlementError("not_found", "Notebook not found.", 404);
  }

  if (notebook.disabledAt) {
    throw new EntitlementError("workspace_disabled", "This workspace has been disabled.", 403);
  }

  const templateNotebookId = readTemplateNotebookId(notebook.settingsJson ?? {});
  const contentNotebookId = templateNotebookId ?? notebook.id;

  return {
    notebook,
    learnerNotebookId: notebook.id,
    contentNotebookId,
    templateNotebookId,
    templateId: notebook.studyTemplateId,
  };
}

export async function countPersonalLearnerWorkspaces(
  ctx: AppContext,
  actorId: string,
): Promise<number> {
  const [row] = await ctx.db.db
    .select({ count: sql<number>`count(*)::int` })
    .from(notebooks)
    .where(
      and(
        eq(notebooks.ownerId, actorId),
        eq(notebooks.workspaceType, "personal_learner"),
        isNull(notebooks.disabledAt),
      ),
    );
  return Number(row?.count ?? 0);
}

export async function requirePersonalWorkspaceCapacity(
  ctx: AppContext,
  actorId: string,
): Promise<void> {
  if (await hasAdminAccess(ctx, actorId)) {
    return;
  }
  const limit = ctx.env.MAX_WORKSPACES_PER_LEARNER ?? 5;
  const current = await countPersonalLearnerWorkspaces(ctx, actorId);
  if (current >= limit) {
    throw new EntitlementError(
      "workspace_limit_reached",
      `You can create at most ${limit} personal learner workspaces.`,
      409,
    );
  }
}
