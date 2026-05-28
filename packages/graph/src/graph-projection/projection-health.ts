import type { DbClient } from "@studyagent/db";
import { neo4jProjectionState, neo4jSourceProjectionState } from "@studyagent/db";
import type { ProjectionHealth, ProjectionHealthStatus } from "@studyagent/schemas";
import { and, eq } from "drizzle-orm";
import { maxCanonicalUpdatedAt } from "./load-canonical-snapshot.js";

const STALE_LAG_SECONDS = 300;

export function computeProjectionLagSeconds(
  lastProjectedAt: Date | null,
  canonicalUpdatedAt: Date | null,
): number | null {
  if (!canonicalUpdatedAt) return null;
  if (!lastProjectedAt) return Math.max(0, Math.floor((Date.now() - canonicalUpdatedAt.getTime()) / 1000));
  const lagMs = canonicalUpdatedAt.getTime() - lastProjectedAt.getTime();
  if (lagMs <= 0) return 0;
  return Math.floor(lagMs / 1000);
}

export function deriveHealthStatus(
  status: string,
  lagSeconds: number | null,
  failureReason: string | null,
): ProjectionHealthStatus {
  if (failureReason || status === "failed") return "failed";
  if (lagSeconds !== null && lagSeconds > STALE_LAG_SECONDS) return "stale";
  if (status === "healthy" || status === "idle") return lagSeconds !== null && lagSeconds > STALE_LAG_SECONDS ? "stale" : "healthy";
  return status === "stale" ? "stale" : "idle";
}

export function learnerWarningForHealth(health: Pick<ProjectionHealth, "status" | "scope">): string | null {
  if (health.status === "failed") {
    return health.scope === "source"
      ? "Source Wiki is temporarily unavailable while we refresh it."
      : "Study Map is temporarily unavailable while we refresh your workspace.";
  }
  if (health.status === "stale") {
    return health.scope === "source"
      ? "Source Wiki may be a little behind your latest uploads."
      : "Study Map may be a little behind your latest uploads.";
  }
  return null;
}

export async function upsertNotebookProjectionHealth(
  dbClient: DbClient,
  input: {
    notebookId: string;
    status: ProjectionHealthStatus;
    lastProjectedAt?: Date | null;
    failureReason?: string | null;
    canonicalUpdatedAt?: Date | null;
    projectionScope?: "notebook" | "source";
  },
): Promise<void> {
  const now = new Date();
  const canonicalUpdatedAt = input.canonicalUpdatedAt ?? (await maxCanonicalUpdatedAt(dbClient, input.notebookId));
  const lastProjectedAt = input.lastProjectedAt ?? (input.status === "healthy" ? now : null);
  const lagSeconds = computeProjectionLagSeconds(lastProjectedAt, canonicalUpdatedAt);
  const status = deriveHealthStatus(input.status, lagSeconds, input.failureReason ?? null);

  const [existing] = await dbClient.db
    .select({ id: neo4jProjectionState.id })
    .from(neo4jProjectionState)
    .where(eq(neo4jProjectionState.notebookId, input.notebookId))
    .limit(1);

  const row = {
    notebookId: input.notebookId,
    status,
    lagSeconds,
    lastProjectedAt: input.status === "healthy" ? (lastProjectedAt ?? now) : lastProjectedAt,
    lastFailureAt: input.status === "failed" ? now : null,
    failureReason: input.failureReason ?? null,
    canonicalUpdatedAt,
    lastProjectionScope: input.projectionScope ?? "notebook",
    updatedAt: now,
  };

  if (existing) {
    await dbClient.db.update(neo4jProjectionState).set(row).where(eq(neo4jProjectionState.id, existing.id));
  } else {
    await dbClient.db.insert(neo4jProjectionState).values({
      id: `proj_nb_${input.notebookId}`,
      ...row,
    });
  }
}

export async function upsertSourceProjectionHealth(
  dbClient: DbClient,
  input: {
    notebookId: string;
    sourceId: string;
    status: ProjectionHealthStatus;
    lastProjectedAt?: Date | null;
    failureReason?: string | null;
    canonicalUpdatedAt?: Date | null;
    sourceVersionId?: string | null;
  },
): Promise<void> {
  const now = new Date();
  const canonicalUpdatedAt =
    input.canonicalUpdatedAt ?? (await maxCanonicalUpdatedAt(dbClient, input.notebookId, input.sourceId));
  const lastProjectedAt = input.lastProjectedAt ?? (input.status === "healthy" ? now : null);
  const lagSeconds = computeProjectionLagSeconds(lastProjectedAt, canonicalUpdatedAt);
  const status = deriveHealthStatus(input.status, lagSeconds, input.failureReason ?? null);

  const [existing] = await dbClient.db
    .select({ id: neo4jSourceProjectionState.id })
    .from(neo4jSourceProjectionState)
    .where(
      and(
        eq(neo4jSourceProjectionState.notebookId, input.notebookId),
        eq(neo4jSourceProjectionState.sourceId, input.sourceId),
      ),
    )
    .limit(1);

  const row = {
    notebookId: input.notebookId,
    sourceId: input.sourceId,
    status,
    lagSeconds,
    lastProjectedAt: input.status === "healthy" ? (lastProjectedAt ?? now) : lastProjectedAt,
    lastFailureAt: input.status === "failed" ? now : null,
    failureReason: input.failureReason ?? null,
    canonicalUpdatedAt,
    lastProjectionScope: "source",
    lastSourceVersionId: input.sourceVersionId ?? null,
    updatedAt: now,
  };

  if (existing) {
    await dbClient.db.update(neo4jSourceProjectionState).set(row).where(eq(neo4jSourceProjectionState.id, existing.id));
  } else {
    await dbClient.db.insert(neo4jSourceProjectionState).values({
      id: `proj_src_${input.sourceId}`,
      ...row,
    });
  }
}

export async function loadNotebookProjectionHealth(
  dbClient: DbClient,
  notebookId: string,
  devMode: boolean,
): Promise<ProjectionHealth> {
  const [row] = await dbClient.db
    .select()
    .from(neo4jProjectionState)
    .where(eq(neo4jProjectionState.notebookId, notebookId))
    .limit(1);

  const canonicalUpdatedAt = row?.canonicalUpdatedAt ?? (await maxCanonicalUpdatedAt(dbClient, notebookId));
  const lastProjectedAt = row?.lastProjectedAt ?? null;
  const lagSeconds = computeProjectionLagSeconds(lastProjectedAt, canonicalUpdatedAt);
  const status = deriveHealthStatus(row?.status ?? "idle", lagSeconds, row?.failureReason ?? null);

  const health: ProjectionHealth = {
    scope: "notebook",
    notebookId,
    status,
    lagSeconds,
    lastProjectedAt: lastProjectedAt?.toISOString() ?? null,
    lastFailureAt: row?.lastFailureAt?.toISOString() ?? null,
    failureReason: row?.failureReason ?? null,
    learnerWarning: learnerWarningForHealth({ scope: "notebook", status }),
    lastProjectionScope: row?.lastProjectionScope === "source" ? "source" : "notebook",
    developerDetail: devMode
      ? [
          row?.failureReason ? `failure: ${row.failureReason}` : null,
          lagSeconds !== null ? `lagSeconds: ${lagSeconds}` : null,
          canonicalUpdatedAt ? `canonicalUpdatedAt: ${canonicalUpdatedAt.toISOString()}` : null,
        ]
          .filter(Boolean)
          .join("; ") || null
      : null,
  };
  return health;
}

export async function loadSourceProjectionHealth(
  dbClient: DbClient,
  notebookId: string,
  sourceId: string,
  devMode: boolean,
): Promise<ProjectionHealth> {
  const [row] = await dbClient.db
    .select()
    .from(neo4jSourceProjectionState)
    .where(
      and(eq(neo4jSourceProjectionState.notebookId, notebookId), eq(neo4jSourceProjectionState.sourceId, sourceId)),
    )
    .limit(1);

  const canonicalUpdatedAt = row?.canonicalUpdatedAt ?? (await maxCanonicalUpdatedAt(dbClient, notebookId, sourceId));
  const lastProjectedAt = row?.lastProjectedAt ?? null;
  const lagSeconds = computeProjectionLagSeconds(lastProjectedAt, canonicalUpdatedAt);
  const status = deriveHealthStatus(row?.status ?? "idle", lagSeconds, row?.failureReason ?? null);

  return {
    scope: "source",
    notebookId,
    sourceId,
    sourceVersionId: row?.lastSourceVersionId ?? undefined,
    status,
    lagSeconds,
    lastProjectedAt: lastProjectedAt?.toISOString() ?? null,
    lastFailureAt: row?.lastFailureAt?.toISOString() ?? null,
    failureReason: row?.failureReason ?? null,
    learnerWarning: learnerWarningForHealth({ scope: "source", status }),
    lastProjectionScope: "source",
    developerDetail: devMode
      ? [
          row?.failureReason ? `failure: ${row.failureReason}` : null,
          lagSeconds !== null ? `lagSeconds: ${lagSeconds}` : null,
        ]
          .filter(Boolean)
          .join("; ") || null
      : null,
  };
}
