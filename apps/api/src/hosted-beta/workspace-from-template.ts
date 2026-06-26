import { and, desc, eq, isNull } from "drizzle-orm";
import { notebooks, studyTemplates } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "../agentic-cache-invalidation.js";
import { recordProductAnalytics } from "./product-analytics.js";
import { isTemplateAccessibleToLearner, toTemplateSummary } from "../routes/study-templates.js";
import { requirePersonalWorkspaceCapacity } from "./notebook-context.js";
import { ensureUserProductState } from "./entitlements.js";

export class WorkspaceFromTemplateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "WorkspaceFromTemplateError";
  }
}

export type PersonalWorkspaceSummary = {
  id: string;
  title: string;
  studyTemplateId: string | null;
  templateNotebookId: string | null;
  createdAt: Date;
  updatedAt: Date;
  template: ReturnType<typeof toTemplateSummary> | null;
};

async function recordProductAnalyticsEvent(
  ctx: AppContext,
  userId: string,
  eventName: string,
  properties: Record<string, unknown>,
): Promise<void> {
  await recordProductAnalytics(ctx, { userId, eventName, properties });
}

export async function createWorkspaceFromTemplate(
  ctx: AppContext,
  actorId: string,
  templateId: string,
): Promise<string> {
  await requirePersonalWorkspaceCapacity(ctx, actorId);
  const productState = await ensureUserProductState(ctx, actorId);
  const [template] = await ctx.db.db
    .select()
    .from(studyTemplates)
    .where(eq(studyTemplates.id, templateId))
    .limit(1);

  if (!template || !isTemplateAccessibleToLearner(template, productState.onboardingJson)) {
    throw new WorkspaceFromTemplateError("template_not_found", "Study template not found or not available.", 404);
  }

  const id = `nb_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date();
  const settingsJson = {
    templateNotebookId: template.notebookId,
    templateId: template.id,
  };

  await ctx.db.db.insert(notebooks).values({
    id,
    ownerId: actorId,
    title: template.title,
    description: template.expectedOutcome,
    goal: null,
    defaultMode: "explore",
    workspaceType: "personal_learner",
    studyTemplateId: template.id,
    settingsJson,
    createdAt: now,
    updatedAt: now,
  });

  await appendEvent(ctx.db, {
    notebookId: id,
    eventType: "graph.node.created",
    payload: { kind: "workspace", notebookId: id, studyTemplateId: template.id, templateNotebookId: template.notebookId },
  });

  await recordProductAnalyticsEvent(ctx, actorId, "workspace_created_from_template", {
    notebookId: id,
    templateId: template.id,
    templateNotebookId: template.notebookId,
    templateSlug: template.slug,
    templateTopic: template.topic,
  });
  await recordProductAnalyticsEvent(ctx, actorId, "template_start", {
    notebookId: id,
    templateId: template.id,
    templateNotebookId: template.notebookId,
    templateSlug: template.slug,
    templateTopic: template.topic,
  });

  return id;
}

export async function listPersonalWorkspaces(
  ctx: AppContext,
  actorId: string,
): Promise<PersonalWorkspaceSummary[]> {
  const rows = await ctx.db.db
    .select()
    .from(notebooks)
    .where(
      and(
        eq(notebooks.ownerId, actorId),
        eq(notebooks.workspaceType, "personal_learner"),
        isNull(notebooks.disabledAt),
      ),
    )
    .orderBy(desc(notebooks.updatedAt));

  const templateIds = [...new Set(rows.map((row) => row.studyTemplateId).filter(Boolean))] as string[];
  const templateById = new Map<string, ReturnType<typeof toTemplateSummary>>();

  if (templateIds.length > 0) {
    const templateRows = await ctx.db.db.select().from(studyTemplates);
    for (const template of templateRows) {
      if (templateIds.includes(template.id)) {
        templateById.set(template.id, toTemplateSummary(template));
      }
    }
  }

  return rows.map((row) => {
    const settings = row.settingsJson ?? {};
    const templateNotebookId =
      typeof settings.templateNotebookId === "string" ? settings.templateNotebookId : null;
    return {
      id: row.id,
      title: row.title,
      studyTemplateId: row.studyTemplateId,
      templateNotebookId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      template: row.studyTemplateId ? (templateById.get(row.studyTemplateId) ?? null) : null,
    };
  });
}

export function sendWorkspaceFromTemplateError(
  reply: import("fastify").FastifyReply,
  error: unknown,
): import("fastify").FastifyReply {
  if (error instanceof WorkspaceFromTemplateError) {
    return reply.status(error.statusCode).send({ code: error.code, message: error.message });
  }
  throw error;
}
