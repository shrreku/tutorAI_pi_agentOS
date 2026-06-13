import type { StudyAgentEnv } from "@studyagent/config";
import type { DbClient } from "@studyagent/db";
import { curriculumModules, curricula, sources, wikiPages } from "@studyagent/db";
import { enqueueInitialBuildJob } from "@studyagent/wiki-generation";
import { and, asc, eq, sql } from "drizzle-orm";

/** Re-enqueue initial build when module pages are still heuristic after a prior degraded run. */
export async function enqueueDegradedInitialBuildRetries(
  env: StudyAgentEnv,
  dbClient: DbClient,
): Promise<number> {
  if (!env.OPENROUTER_API_KEY) return 0;

  const degradedModules = await dbClient.db
    .select({
      notebookId: wikiPages.notebookId,
      moduleId: sql<string>`replace(${wikiPages.pageKey}, 'module:', '')`.as("module_id"),
    })
    .from(wikiPages)
    .where(
      and(
        eq(wikiPages.pageType, "module"),
        sql`coalesce(${wikiPages.structuredJson}->>'generationMode', 'heuristic') = 'heuristic'`,
      ),
    );

  const staleConceptNotebooks = await dbClient.db
    .select({ notebookId: wikiPages.notebookId })
    .from(wikiPages)
    .where(
      and(
        eq(wikiPages.pageType, "concept"),
        sql`coalesce(${wikiPages.structuredJson}->>'generationMode', 'heuristic') = 'heuristic'`,
      ),
    );

  const notebookIds = new Set([
    ...degradedModules.map((row) => row.notebookId),
    ...staleConceptNotebooks.map((row) => row.notebookId),
  ]);

  let enqueued = 0;
  for (const notebookId of notebookIds) {
    const moduleRow =
      degradedModules.find((row) => row.notebookId === notebookId) ??
      (await dbClient.db
        .select({
          notebookId: wikiPages.notebookId,
          moduleId: sql<string>`replace(${wikiPages.pageKey}, 'module:', '')`.as("module_id"),
        })
        .from(wikiPages)
        .where(and(eq(wikiPages.notebookId, notebookId), eq(wikiPages.pageType, "module")))
        .orderBy(asc(wikiPages.createdAt))
        .limit(1))[0];
    if (!moduleRow) continue;
    const row = { notebookId, moduleId: moduleRow.moduleId };
    const [curriculum] = await dbClient.db
      .select({ id: curricula.id })
      .from(curricula)
      .where(and(eq(curricula.notebookId, row.notebookId), eq(curricula.status, "active")))
      .orderBy(asc(curricula.createdAt))
      .limit(1);
    if (!curriculum) continue;

    const [module] = await dbClient.db
      .select({ id: curriculumModules.id })
      .from(curriculumModules)
      .where(
        and(
          eq(curriculumModules.notebookId, row.notebookId),
          eq(curriculumModules.curriculumId, curriculum.id),
          eq(curriculumModules.id, row.moduleId),
        ),
      )
      .limit(1);
    if (!module) continue;

    const [source] = await dbClient.db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.notebookId, row.notebookId))
      .orderBy(asc(sources.createdAt))
      .limit(1);
    if (!source) continue;

    const result = await enqueueInitialBuildJob(dbClient, {
      notebookId: row.notebookId,
      curriculumId: curriculum.id,
      moduleId: module.id,
      sourceId: source.id,
    });
    if (result.enqueued) {
      enqueued += 1;
      console.info("generation retry enqueued for degraded initial build", {
        notebookId: row.notebookId,
        moduleId: module.id,
        jobId: result.jobId,
      });
    }
  }

  return enqueued;
}
