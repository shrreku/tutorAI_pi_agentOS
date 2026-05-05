import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { AppContext } from "./context.js";
import { users } from "@studyagent/db";

export type Actor = { id: string; email: string };

let cachedActor: Actor | null = null;

export async function resolveActor(ctx: AppContext, request: FastifyRequest): Promise<Actor> {
  if (!ctx.env.DISABLE_AUTH) {
    throw new Error("Auth is not implemented yet; set DISABLE_AUTH=true for local development.");
  }

  const headerUserId = request.headers["x-user-id"];
  if (typeof headerUserId === "string" && headerUserId.length > 0) {
    const [row] = await ctx.db.db.select().from(users).where(eq(users.id, headerUserId)).limit(1);
    if (!row) {
      throw new Error(`Unknown X-User-Id: ${headerUserId}`);
    }
    return { id: row.id, email: row.email };
  }

  if (cachedActor) {
    return cachedActor;
  }

  const [row] = await ctx.db.db
    .select()
    .from(users)
    .where(eq(users.email, ctx.env.DEV_USER_EMAIL))
    .limit(1);

  if (!row) {
    throw new Error(
      `No user found for DEV_USER_EMAIL=${ctx.env.DEV_USER_EMAIL}. Run: pnpm --filter @studyagent/db seed`,
    );
  }

  cachedActor = { id: row.id, email: row.email };
  return cachedActor;
}
