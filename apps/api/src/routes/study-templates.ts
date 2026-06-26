import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { studyTemplates } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { recordProductAnalytics } from "../hosted-beta/product-analytics.js";
import { requireAdminAccess, sendAuthOrEntitlementError } from "../hosted-beta/entitlements.js";
import { requireLearner } from "../hosted-beta/learner-gate.js";

type StudyTemplateRow = typeof studyTemplates.$inferSelect;

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type TemplateReadinessAudit = {
  readySources: number;
  chunks: number;
  wikiPages: number;
  concepts: number;
  claims: number;
  curricula: number;
  modules: number;
  objectives: number;
  sessionPlans: number;
};

const TEMPLATE_READINESS_REQUIREMENTS: Record<keyof TemplateReadinessAudit, number> = {
  readySources: 1,
  chunks: 1,
  wikiPages: 1,
  concepts: 1,
  claims: 1,
  curricula: 1,
  modules: 1,
  objectives: 1,
  sessionPlans: 1,
};

const TEMPLATE_READINESS_LABELS: Record<keyof TemplateReadinessAudit, string> = {
  readySources: "ready source",
  chunks: "retrieval chunk",
  wikiPages: "published wiki page",
  concepts: "concept",
  claims: "source-backed claim",
  curricula: "active curriculum",
  modules: "active curriculum module",
  objectives: "active objective",
  sessionPlans: "active session plan",
};

export function isTemplateReadinessComplete(readinessJson: Record<string, unknown>): boolean {
  return readinessJson.status === "ready";
}

export function isSourceRightsReviewed(sourceRightsJson: Record<string, unknown>): boolean {
  return sourceRightsJson.status === "reviewed";
}

export function isLearnerVisibleTemplate(template: StudyTemplateRow): boolean {
  if (template.status !== "published") {
    return false;
  }
  const readiness = isJsonRecord(template.readinessJson) ? template.readinessJson : {};
  const sourceRights = isJsonRecord(template.sourceRightsJson) ? template.sourceRightsJson : {};
  return isTemplateReadinessComplete(readiness) && isSourceRightsReviewed(sourceRights);
}

function numberFromDb(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

function normalizeTemplateReadinessAudit(
  row: Partial<Record<keyof TemplateReadinessAudit, unknown>> | undefined,
): TemplateReadinessAudit {
  return {
    readySources: numberFromDb(row?.readySources),
    chunks: numberFromDb(row?.chunks),
    wikiPages: numberFromDb(row?.wikiPages),
    concepts: numberFromDb(row?.concepts),
    claims: numberFromDb(row?.claims),
    curricula: numberFromDb(row?.curricula),
    modules: numberFromDb(row?.modules),
    objectives: numberFromDb(row?.objectives),
    sessionPlans: numberFromDb(row?.sessionPlans),
  };
}

export function missingTemplateReadinessRequirements(audit: TemplateReadinessAudit): string[] {
  return (Object.keys(TEMPLATE_READINESS_REQUIREMENTS) as Array<keyof TemplateReadinessAudit>)
    .filter((key) => audit[key] < TEMPLATE_READINESS_REQUIREMENTS[key])
    .map((key) => TEMPLATE_READINESS_LABELS[key]);
}

export function isTemplateContentReady(audit: TemplateReadinessAudit): boolean {
  return missingTemplateReadinessRequirements(audit).length === 0;
}

export async function loadTemplateReadinessAudit(
  ctx: AppContext,
  notebookId: string,
): Promise<TemplateReadinessAudit> {
  const rows = await ctx.db.sql<
    Array<Partial<Record<keyof TemplateReadinessAudit, number | string>>>
  >`
    with input as (select ${notebookId}::text as notebook_id)
    select
      (
        select count(*)::int
        from sources s
        where s.notebook_id = input.notebook_id
          and s.status in ('tutoring_ready', 'ready')
      ) as "readySources",
      (
        select count(*)::int
        from chunks ch
        join source_versions sv on sv.id = ch.source_version_id
        join sources s on s.id = sv.source_id
        where s.notebook_id = input.notebook_id
      ) as "chunks",
      (
        select count(*)::int
        from wiki_pages wp
        where wp.notebook_id = input.notebook_id
          and wp.status in ('published', 'ready', 'active')
      ) as "wikiPages",
      (
        select count(*)::int
        from concepts c
        where c.notebook_id = input.notebook_id
      ) as "concepts",
      (
        select count(*)::int
        from claims cl
        where cl.notebook_id = input.notebook_id
      ) as "claims",
      (
        select count(*)::int
        from curricula cur
        where cur.notebook_id = input.notebook_id
          and cur.status = 'active'
      ) as "curricula",
      (
        select count(*)::int
        from curriculum_modules cm
        where cm.notebook_id = input.notebook_id
          and cm.status = 'active'
      ) as "modules",
      (
        select count(*)::int
        from objectives obj
        where obj.notebook_id = input.notebook_id
          and obj.status = 'active'
      ) as "objectives",
      (
        select count(*)::int
        from session_plans sp
        where sp.notebook_id = input.notebook_id
          and sp.status = 'active'
      ) as "sessionPlans"
    from input
  `;
  return normalizeTemplateReadinessAudit(rows[0]);
}

export function isTemplateAccessibleToLearner(
  template: StudyTemplateRow,
  onboardingJson: Record<string, unknown> | null | undefined,
): boolean {
  if (!isLearnerVisibleTemplate(template)) {
    return false;
  }
  const readiness = isJsonRecord(template.readinessJson) ? template.readinessJson : {};
  if (readiness.requiresAccessGrant !== true) {
    return true;
  }
  const grantedTemplateIds = Array.isArray(onboardingJson?.grantedTemplateIds)
    ? onboardingJson.grantedTemplateIds.filter((id): id is string => typeof id === "string")
    : [];
  return grantedTemplateIds.includes(template.id);
}

export function toTemplateSummary(template: StudyTemplateRow) {
  return {
    id: template.id,
    slug: template.slug,
    title: template.title,
    topic: template.topic,
    sourceLevel: template.sourceLevel,
    estimatedMinutes: template.estimatedMinutes,
    studyMode: template.studyMode,
    expectedOutcome: template.expectedOutcome,
  };
}

async function requireAdmin(ctx: AppContext, request: FastifyRequest, reply: FastifyReply) {
  try {
    const { actor } = await requireAdminAccess(ctx, request);
    return actor;
  } catch {
    reply.status(403).send({ code: "forbidden", message: "Admin access required" });
    return null;
  }
}

export async function registerStudyTemplateRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/study-templates", async (request, reply) => {
    try {
      const { productState } = await requireLearner(ctx, request);
      const rows = await ctx.db.db.select().from(studyTemplates);
      const templates = [];
      for (const template of rows) {
        if (!isTemplateAccessibleToLearner(template, productState.onboardingJson)) {
          continue;
        }
        const audit = await loadTemplateReadinessAudit(ctx, template.notebookId);
        if (isTemplateContentReady(audit)) {
          templates.push(toTemplateSummary(template));
        }
      }
      templates.sort((a, b) => a.title.localeCompare(b.title));
      return reply.send({ templates });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.get<{ Params: { id: string } }>("/study-templates/:id", async (request, reply) => {
    try {
      const { actor, productState } = await requireLearner(ctx, request);
      const { id } = request.params;
      const [row] = await ctx.db.db
        .select()
        .from(studyTemplates)
        .where(eq(studyTemplates.id, id))
        .limit(1);
      if (!row || !isTemplateAccessibleToLearner(row, productState.onboardingJson)) {
        return reply.status(404).send({ code: "not_found", message: "Study template not found" });
      }
      const audit = await loadTemplateReadinessAudit(ctx, row.notebookId);
      if (!isTemplateContentReady(audit)) {
        return reply.status(404).send({ code: "not_found", message: "Study template not found" });
      }

      await recordProductAnalytics(ctx, {
        userId: actor.id,
        eventName: "template_view",
        properties: {
          templateId: row.id,
          slug: row.slug,
        },
      });

      return reply.send({ template: toTemplateSummary(row) });
    } catch (error) {
      return sendAuthOrEntitlementError(reply, error);
    }
  });

  app.post<{
    Body: {
      slug: string;
      title: string;
      topic: string;
      sourceLevel: string;
      estimatedMinutes: number;
      studyMode: string;
      expectedOutcome: string;
      notebookId: string;
      sortOrder?: number;
    };
  }>("/admin/study-templates", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const body = request.body;
    if (
      !body?.slug ||
      !body.title ||
      !body.topic ||
      !body.sourceLevel ||
      !body.studyMode ||
      !body.expectedOutcome ||
      !body.notebookId ||
      typeof body.estimatedMinutes !== "number"
    ) {
      return reply
        .status(400)
        .send({ code: "bad_request", message: "Missing required template fields" });
    }

    const id = `st_${crypto.randomUUID().replaceAll("-", "")}`;
    const now = new Date();
    await ctx.db.db.insert(studyTemplates).values({
      id,
      slug: body.slug,
      title: body.title,
      topic: body.topic,
      sourceLevel: body.sourceLevel,
      estimatedMinutes: body.estimatedMinutes,
      studyMode: body.studyMode,
      expectedOutcome: body.expectedOutcome,
      status: "draft",
      notebookId: body.notebookId,
      readinessJson: { status: "pending" },
      sourceRightsJson: { status: "pending" },
      sortOrder: body.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });

    const [created] = await ctx.db.db
      .select()
      .from(studyTemplates)
      .where(eq(studyTemplates.id, id))
      .limit(1);
    return reply.status(201).send({ template: created });
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      slug: string;
      title: string;
      topic: string;
      sourceLevel: string;
      estimatedMinutes: number;
      studyMode: string;
      expectedOutcome: string;
      status: "draft" | "published";
      readinessJson: Record<string, unknown>;
      sourceRightsJson: Record<string, unknown>;
      sortOrder: number;
    }>;
  }>("/admin/study-templates/:id", async (request, reply) => {
    const actor = await requireAdmin(ctx, request, reply);
    if (!actor) return;

    const { id } = request.params;
    const [existing] = await ctx.db.db
      .select()
      .from(studyTemplates)
      .where(eq(studyTemplates.id, id))
      .limit(1);
    if (!existing) {
      return reply.status(404).send({ code: "not_found", message: "Study template not found" });
    }

    const body = request.body ?? {};
    if (body.status === "published") {
      const readiness = isJsonRecord(body.readinessJson)
        ? body.readinessJson
        : isJsonRecord(existing.readinessJson)
          ? existing.readinessJson
          : {};
      const sourceRights = isJsonRecord(body.sourceRightsJson)
        ? body.sourceRightsJson
        : isJsonRecord(existing.sourceRightsJson)
          ? existing.sourceRightsJson
          : {};
      if (!isTemplateReadinessComplete(readiness) || !isSourceRightsReviewed(sourceRights)) {
        return reply.status(400).send({
          code: "bad_request",
          message:
            "Published templates require readiness status ready and source rights status reviewed",
        });
      }
      const audit = await loadTemplateReadinessAudit(ctx, existing.notebookId);
      const missingRequirements = missingTemplateReadinessRequirements(audit);
      if (missingRequirements.length > 0) {
        return reply.status(400).send({
          code: "template_not_ready",
          message:
            "Published templates require generated study content, not only readiness metadata.",
          missingRequirements,
          audit,
        });
      }
    }

    const updates: Partial<StudyTemplateRow> = {
      updatedAt: new Date(),
    };
    if (typeof body.slug === "string") updates.slug = body.slug;
    if (typeof body.title === "string") updates.title = body.title;
    if (typeof body.topic === "string") updates.topic = body.topic;
    if (typeof body.sourceLevel === "string") updates.sourceLevel = body.sourceLevel;
    if (typeof body.estimatedMinutes === "number") updates.estimatedMinutes = body.estimatedMinutes;
    if (typeof body.studyMode === "string") updates.studyMode = body.studyMode;
    if (typeof body.expectedOutcome === "string") updates.expectedOutcome = body.expectedOutcome;
    if (typeof body.status === "string") updates.status = body.status;
    if (isJsonRecord(body.readinessJson)) updates.readinessJson = body.readinessJson;
    if (isJsonRecord(body.sourceRightsJson)) updates.sourceRightsJson = body.sourceRightsJson;
    if (typeof body.sortOrder === "number") updates.sortOrder = body.sortOrder;

    await ctx.db.db.update(studyTemplates).set(updates).where(eq(studyTemplates.id, id));
    const [updated] = await ctx.db.db
      .select()
      .from(studyTemplates)
      .where(eq(studyTemplates.id, id))
      .limit(1);
    return reply.send({ template: updated });
  });
}
