import type { DbClient } from "@studyagent/db";
import { claims } from "@studyagent/db";
import { and, gt, lt, notInArray, sql } from "drizzle-orm";

/** Scheduled decay for stale claims (GF-0405). */
export async function applyClaimDecay(dbClient: DbClient): Promise<{ updated: number }> {
  const res = await dbClient.db
    .update(claims)
    .set({
      retrievalWeight: sql`GREATEST(0.12, retrieval_weight * 0.88)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        lt(claims.updatedAt, sql`(now() - interval '14 days')`),
        notInArray(claims.status, ["superseded", "deprecated", "archived"]),
        gt(claims.retrievalWeight, 0.12),
      ),
    )
    .returning({ id: claims.id });

  return { updated: res.length };
}
