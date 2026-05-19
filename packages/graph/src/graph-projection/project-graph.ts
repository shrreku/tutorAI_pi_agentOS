import type { DbClient } from "@studyagent/db";
import type { ProjectionError } from "@studyagent/schemas";
import type { Driver } from "neo4j-driver";
import { createNeo4jDriver, verifyNeo4jProjection } from "../neo4j-projection.js";
import { applyProjectionPlan } from "./apply-projection-plan.js";
import { buildProjectionPlan } from "./build-projection-plan.js";
import { clearNotebookProjectionScope, clearSourceProjectionScope } from "./clear-projection-scope.js";
import { loadCanonicalProjectionSnapshot } from "./load-canonical-snapshot.js";
import { upsertNotebookProjectionHealth, upsertSourceProjectionHealth } from "./projection-health.js";

export type ProjectGraphEnv = {
  neo4jUri: string;
  neo4jUsername: string;
  neo4jPassword: string;
};

export type ProjectGraphInput = {
  notebookId: string;
  scope: "notebook" | "source";
  sourceId?: string | undefined;
  userId?: string | undefined;
  rebuild?: boolean;
};

export type ProjectGraphResult =
  | { ok: true; operationCount: number }
  | { ok: false; error: ProjectionError };

async function withNeo4jSession<T>(
  env: ProjectGraphEnv,
  fn: (session: import("neo4j-driver").Session) => Promise<T>,
): Promise<T> {
  const driver = createNeo4jDriver(env.neo4jUri, env.neo4jUsername, env.neo4jPassword);
  const session = driver.session();
  try {
    const verified = await verifyNeo4jProjection(session);
    if (!verified.ok) {
      throw new Error(verified.message);
    }
    return await fn(session);
  } finally {
    await session.close();
    await driver.close();
  }
}

export async function projectGraphFromCanonical(
  dbClient: DbClient,
  env: ProjectGraphEnv,
  input: ProjectGraphInput,
): Promise<ProjectGraphResult> {
  const snapshot = await loadCanonicalProjectionSnapshot(dbClient, {
    notebookId: input.notebookId,
    scope: input.scope,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
  });

  if (input.scope === "source" && input.sourceId && snapshot.sources.length === 0) {
    return {
      ok: false,
      error: {
        code: "source_not_found",
        message: `Source ${input.sourceId} not found in notebook ${input.notebookId}`,
        scope: "source",
        notebookId: input.notebookId,
        sourceId: input.sourceId,
      },
    };
  }

  const plan = buildProjectionPlan(snapshot);

  try {
    await withNeo4jSession(env, async (session) => {
      if (input.rebuild) {
        if (input.scope === "source" && input.sourceId) {
          await clearSourceProjectionScope(session, input.notebookId, input.sourceId);
        } else {
          await clearNotebookProjectionScope(session, input.notebookId);
        }
      }
      await applyProjectionPlan(session, plan);
    });

    const now = new Date();
    if (input.scope === "source" && input.sourceId) {
      await upsertSourceProjectionHealth(dbClient, {
        notebookId: input.notebookId,
        sourceId: input.sourceId,
        status: "healthy",
        lastProjectedAt: now,
        failureReason: null,
      });
    }
    await upsertNotebookProjectionHealth(dbClient, {
      notebookId: input.notebookId,
      status: "healthy",
      lastProjectedAt: now,
      failureReason: null,
    });

    return { ok: true, operationCount: plan.operations.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (input.scope === "source" && input.sourceId) {
      await upsertSourceProjectionHealth(dbClient, {
        notebookId: input.notebookId,
        sourceId: input.sourceId,
        status: "failed",
        failureReason: message,
      });
    }
    await upsertNotebookProjectionHealth(dbClient, {
      notebookId: input.notebookId,
      status: "failed",
      failureReason: message,
    });
    return {
      ok: false,
      error: {
        code: "projection_failed",
        message,
        scope: input.scope,
        notebookId: input.notebookId,
        sourceId: input.sourceId,
      },
    };
  }
}

export async function rebuildNotebookProjection(
  dbClient: DbClient,
  env: ProjectGraphEnv,
  notebookId: string,
  userId?: string,
): Promise<ProjectGraphResult> {
  return projectGraphFromCanonical(dbClient, env, {
    notebookId,
    scope: "notebook",
    userId,
    rebuild: true,
  });
}

export async function rebuildSourceProjection(
  dbClient: DbClient,
  env: ProjectGraphEnv,
  notebookId: string,
  sourceId: string,
  userId?: string,
): Promise<ProjectGraphResult> {
  return projectGraphFromCanonical(dbClient, env, {
    notebookId,
    scope: "source",
    sourceId,
    ...(userId ? { userId } : {}),
    rebuild: true,
  });
}
