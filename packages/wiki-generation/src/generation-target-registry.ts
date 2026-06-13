import type { DbClient } from "@studyagent/db";
import { wikiPages } from "@studyagent/db";
import { eq } from "drizzle-orm";

/** Test-only no-op; generation completion is durable via wiki page structuredJson. */
export function resetGenerationTargetCacheForTests(): void {}

/** Records completion on the wiki page via callers; kept for API compatibility. */
export function markGenerationTargetComplete(_idempotencyKey: string): void {}

export async function isTargetAlreadyComplete(
  dbClient: DbClient,
  notebookId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const rows = await dbClient.db
    .select({ structuredJson: wikiPages.structuredJson, pageType: wikiPages.pageType })
    .from(wikiPages)
    .where(eq(wikiPages.notebookId, notebookId));
  return rows.some((row) => {
    const structured = row.structuredJson ?? {};
    if (structured.lastGenerationTargetKey !== idempotencyKey) return false;
    const mode = structured.generationMode;
    if (typeof mode !== "string" || mode === "heuristic") return false;
    // Initial build completion is anchored on the module page only; concept/topic
    // pages may still be heuristic while the module page is already polished.
    if (idempotencyKey.includes(":initial_build:") && row.pageType !== "module") return false;
    return true;
  });
}
