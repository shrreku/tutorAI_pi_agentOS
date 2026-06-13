import type { StudyAgentEnv } from "@studyagent/config";
import type { DbClient } from "@studyagent/db";
import { appendEvent, wikiPages } from "@studyagent/db";
import { and, eq } from "drizzle-orm";
import { recordGenerationMetric } from "./generation-metrics.js";
import { executeWikiPagePolish } from "./wiki-polish-executor.js";

type BackgroundPolishRequest = {
  pageType?: "concept" | "topic";
  title?: string;
  conceptId?: string;
  trigger?: string;
};

function isBackgroundPolishPending(structured: Record<string, unknown> | null | undefined): boolean {
  const status = structured?.backgroundPolishStatus;
  return status === "pending" || status === "enqueued";
}

export async function resumePendingBackgroundWikiPolishes(
  env: StudyAgentEnv,
  dbClient: DbClient,
  options: { maxPages?: number; notebookId?: string; pageId?: string } = {},
): Promise<{ processed: number; completed: number; failed: number }> {
  const maxPages = options.maxPages ?? 5;
  const filters = [
    ...(options.notebookId ? [eq(wikiPages.notebookId, options.notebookId)] : []),
    ...(options.pageId ? [eq(wikiPages.id, options.pageId)] : []),
  ];

  const baseQuery = dbClient.db.select().from(wikiPages);
  const rows =
    filters.length > 0
      ? await baseQuery
          .where(and(...filters))
          .limit(options.notebookId || options.pageId ? 50 : 500)
      : await baseQuery.limit(500);

  const pending = rows
    .filter((row) => isBackgroundPolishPending(row.structuredJson ?? {}))
    .slice(0, maxPages);

  let completed = 0;
  let failed = 0;

  for (const page of pending) {
    const structured = page.structuredJson ?? {};
    const request = (structured.backgroundPolishRequest ?? {}) as BackgroundPolishRequest;
    const pageType =
      request.pageType ??
      (page.pageType === "concept" || page.pageType === "topic" ? page.pageType : null);
    if (!pageType || (pageType !== "concept" && pageType !== "topic")) continue;

    const now = new Date();
    await dbClient.db
      .update(wikiPages)
      .set({
        structuredJson: {
          ...structured,
          backgroundPolishStatus: "in_progress",
          backgroundPolishStartedAt: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(wikiPages.id, page.id));

    const result = await executeWikiPagePolish(env, dbClient, {
      notebookId: page.notebookId,
      pageId: page.id,
      pageKey: page.pageKey,
      pageType,
      title: request.title ?? page.title,
      generationMode: "tutor_touch",
      trigger: "wiki_polish_enqueue",
      ...(request.conceptId ? { conceptId: request.conceptId } : {}),
      idempotencyKey: `bg:${page.notebookId}:${page.pageKey}:tutor_touch`,
    });

    if (result.ok && result.applied) {
      completed += 1;
      recordGenerationMetric({
        eventType: "generation.touch.completed",
        outcome: "success",
        generationMode: "tutor_touch",
        trigger: "wiki_polish_enqueue",
      });
      await appendEvent(dbClient, {
        notebookId: page.notebookId,
        eventType: "generation.touch.completed",
        payload: {
          pageId: page.id,
          pageKey: page.pageKey,
          foregroundCompleted: false,
          backgroundContinues: false,
          resumedBy: "worker",
          safeMessage: "Background page polish completed.",
        },
      });
    } else if (result.reason === "superseded_by_background_polish") {
      continue;
    } else if (result.ok && !result.applied) {
      continue;
    } else {
      failed += 1;
      await dbClient.db
        .update(wikiPages)
        .set({
          structuredJson: {
            ...(page.structuredJson ?? {}),
            backgroundPolishStatus: "failed",
            backgroundPolishFailedAt: new Date().toISOString(),
            backgroundPolishFailureReason: result.reason ?? "polish_failed",
          },
          updatedAt: new Date(),
        })
        .where(eq(wikiPages.id, page.id));
      recordGenerationMetric({
        eventType: "generation.touch.failed",
        outcome: "failure",
        generationMode: "tutor_touch",
        trigger: "wiki_polish_enqueue",
      });
      await appendEvent(dbClient, {
        notebookId: page.notebookId,
        eventType: "generation.touch.failed",
        payload: {
          pageId: page.id,
          foregroundCompleted: false,
          backgroundContinues: false,
          resumedBy: "worker",
          reason: result.reason ?? "polish_failed",
          safeMessage: "Background polish failed quality checks.",
        },
      });
    }
  }

  return { processed: pending.length, completed, failed };
}
