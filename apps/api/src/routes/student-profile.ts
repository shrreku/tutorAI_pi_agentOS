import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { notebooks } from "@studyagent/db";
import { studentProfileUpdatePreferencesInputSchema } from "@studyagent/tools";
import type { AppContext } from "../context.js";
import { resolveActor } from "../auth.js";
import { readStudentProfile, upsertStudentProfile } from "../student-profile.js";

async function ensureNotebookOwner(ctx: AppContext, notebookId: string, userId: string): Promise<boolean> {
  const [row] = await ctx.db.db
    .select({ id: notebooks.id })
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function registerStudentProfileRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: { notebookId: string } }>("/notebooks/:notebookId/student-profile", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    if (!(await ensureNotebookOwner(ctx, notebookId, actor.id))) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }
    const profile = await readStudentProfile(ctx.db, notebookId, actor.id);
    return reply.send({ studentProfile: profile });
  });

  app.patch<{ Params: { notebookId: string } }>("/notebooks/:notebookId/student-profile", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    if (!(await ensureNotebookOwner(ctx, notebookId, actor.id))) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }
    const parsed = studentProfileUpdatePreferencesInputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({ code: "bad_request", message: parsed.error.flatten() });
    }

    const result = await upsertStudentProfile(ctx.db, {
      notebookId,
      userId: parsed.data.userId ?? actor.id,
      patch: parsed.data,
    });

    return reply.send({ studentProfile: result.profile });
  });
}