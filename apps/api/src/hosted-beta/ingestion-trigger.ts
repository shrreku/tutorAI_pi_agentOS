import { desc, eq, sql } from "drizzle-orm";
import { ingestionTriggerRuns } from "@studyagent/db";
import type { AppContext } from "../context.js";

export type IngestionTriggerResult = {
  runId: string;
  status: "started" | "completed" | "failed" | "skipped";
  jobsClaimed?: number;
  jobsCompleted?: number;
  jobsFailed?: number;
  jobsSkipped?: number;
  error?: string;
};

export async function triggerIngestionWorker(
  ctx: AppContext,
  triggeredBy: string,
  userId?: string,
): Promise<IngestionTriggerResult> {
  const runId = `itr_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date();
  const mode = ctx.env.INGESTION_TRIGGER_MODE;
  const maxJobs = ctx.env.INGESTION_TRIGGER_MAX_JOBS ?? 5;
  const minIntervalSeconds = ctx.env.INGESTION_TRIGGER_MIN_INTERVAL_SECONDS ?? 0;

  if (mode !== "disabled" && triggeredBy !== "admin_manual" && minIntervalSeconds > 0) {
    const recent = await findRecentTriggerRun(ctx, minIntervalSeconds);
    if (recent) {
      const reason = `Skipped because ingestion trigger ${recent.id} started within the last ${minIntervalSeconds} seconds.`;
      await ctx.db.db.insert(ingestionTriggerRuns).values({
        id: runId,
        triggeredBy,
        triggeredByUserId: userId ?? null,
        status: "skipped",
        error: reason,
        startedAt: now,
        completedAt: now,
      });
      return { runId, status: "skipped", error: reason };
    }
  }

  await ctx.db.db.insert(ingestionTriggerRuns).values({
    id: runId,
    triggeredBy,
    triggeredByUserId: userId ?? null,
    status: "started",
    startedAt: now,
  });

  if (mode === "disabled") {
    await ctx.db.db
      .update(ingestionTriggerRuns)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(ingestionTriggerRuns.id, runId));
    return { runId, status: "skipped" };
  }

  if (mode === "external") {
    const triggerUrl = ctx.env.INGESTION_TRIGGER_URL;
    const triggerToken = ctx.env.INGESTION_TRIGGER_TOKEN;
    if (!triggerUrl || !triggerToken) {
      return markTriggerFailed(ctx, runId, "External ingestion trigger is not configured.");
    }
    try {
      const response = await fetch(triggerUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${triggerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runId,
          triggeredBy,
          triggeredByUserId: userId ?? null,
          command: ["--one-shot", `--max-jobs=${maxJobs}`],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        return markTriggerFailed(
          ctx,
          runId,
          `External ingestion trigger returned ${response.status}${detail ? `: ${detail}` : ""}`,
        );
      }
      return { runId, status: "started" };
    } catch (error) {
      return markTriggerFailed(ctx, runId, error instanceof Error ? error.message : String(error));
    }
  }

  try {
    const { runOneShotDrain } = await import("@studyagent/worker/one-shot-drain.js");
    const drain = await runOneShotDrain(ctx.env, {
      maxJobs,
      dbClient: ctx.db,
      workerId: `inline_${runId}`,
    });

    await ctx.db.db
      .update(ingestionTriggerRuns)
      .set({
        status: "completed",
        jobsClaimed: drain.jobsClaimed,
        jobsCompleted: drain.jobsCompleted,
        jobsFailed: drain.jobsFailed,
        completedAt: new Date(),
      })
      .where(eq(ingestionTriggerRuns.id, runId));

    return {
      runId,
      status: "completed",
      jobsClaimed: drain.jobsClaimed,
      jobsCompleted: drain.jobsCompleted,
      jobsFailed: drain.jobsFailed,
      jobsSkipped: drain.jobsSkipped,
    };
  } catch (error) {
    return markTriggerFailed(ctx, runId, error instanceof Error ? error.message : String(error));
  }
}

async function markTriggerFailed(
  ctx: AppContext,
  runId: string,
  message: string,
): Promise<IngestionTriggerResult> {
  await ctx.db.db
    .update(ingestionTriggerRuns)
    .set({
      status: "failed",
      error: message,
      completedAt: new Date(),
    })
    .where(eq(ingestionTriggerRuns.id, runId));
  return { runId, status: "failed", error: message };
}

async function findRecentTriggerRun(
  ctx: AppContext,
  minIntervalSeconds: number,
): Promise<{ id: string } | null> {
  const rows = await ctx.db.db
    .select({ id: ingestionTriggerRuns.id })
    .from(ingestionTriggerRuns)
    .where(
      sql`
      ${ingestionTriggerRuns.status} in ('started', 'completed')
      and ${ingestionTriggerRuns.startedAt} > now() - (${minIntervalSeconds} * interval '1 second')
    `,
    )
    .orderBy(desc(ingestionTriggerRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}
