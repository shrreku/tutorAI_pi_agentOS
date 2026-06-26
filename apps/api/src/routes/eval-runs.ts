import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  syntheticLearnerEvalRunRecordSchema,
  type SyntheticLearnerEvalRunRecord,
} from "@studyagent/schemas";
import type { AppContext } from "../context.js";
import { withAdminAccess } from "../hosted-beta/route-guards.js";
import { syntheticLearnerEvalRuns } from "@studyagent/db";

const EVAL_RUN_EVENT_CHANNEL = "studyagent_eval_run_events";

type EvalRunSummary = {
  id: string;
  status: SyntheticLearnerEvalRunRecord["status"];
  startedAt: string;
  completedAt?: string | null;
  durationMs: number | null;
  fixtureManifestId: string;
  fixtureVersion: string;
  notebookId: string;
  scenarioRunCount: number;
  passedScenarioCount: number;
  failedScenarioCount: number;
  personaIds: string[];
  scenarioIds: string[];
  notebookRefs: Array<{ refType: string; refId: string }>;
  transcriptLineCount: number;
  updatedAt: string;
};

export async function registerEvalRunRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const notifier = createEvalRunUpdateNotifier(ctx);
  app.addHook("onClose", async () => {
    await notifier.close();
  });

  app.get("/eval/runs", async (request, reply) => {
    return withAdminAccess(ctx, request, reply, async (actor) => {
      const rows = await ctx.db.db
        .select()
        .from(syntheticLearnerEvalRuns)
        .where(eq(syntheticLearnerEvalRuns.ownerId, actor.id))
        .orderBy(desc(syntheticLearnerEvalRuns.startedAt));

      return reply.send({
        runs: rows.map((row) => ({
          summary: summarizeEvalRun(syntheticLearnerEvalRunRecordSchema.parse(row.runJson), row),
          run: syntheticLearnerEvalRunRecordSchema.parse(row.runJson),
        })),
      });
    });
  });

  app.get<{ Querystring: { after?: string } }>("/eval/runs/stream", async (request, reply) => {
    return withAdminAccess(ctx, request, reply, async (actor) => {
      await notifier.ready();

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let closed = false;
      let cursor = parseEvalRunUpdateCursor(request.query.after);

      const flush = async () => {
        if (closed) {
          return;
        }

        const rows = await ctx.db.db
          .select()
          .from(syntheticLearnerEvalRuns)
          .where(
            and(
              eq(syntheticLearnerEvalRuns.ownerId, actor.id),
              gt(syntheticLearnerEvalRuns.updatedAt, cursor),
            ),
          )
          .orderBy(asc(syntheticLearnerEvalRuns.updatedAt))
          .limit(100);

        for (const row of rows) {
          cursor = row.updatedAt;
          writeSse(reply.raw, "eval_run.updated", evalRunUpdateEnvelopeFromRow(row));
        }
      };

      const drain = createSerializedDrain(flush, (error) => {
        if (!closed) {
          writeSse(reply.raw, "eval_run.stream_failed", { message: String(error) });
        }
      });
      const unsubscribe = notifier.subscribe((event) => {
        if (event.ownerId !== actor.id) return;
        cursor = maxDate(cursor, new Date(event.updatedAt));
        writeSse(reply.raw, "eval_run.updated", evalRunUpdateEnvelopeFromNotification(event));
      });

      await drain();

      await new Promise<void>((resolve) => {
        request.raw.on("close", () => {
          closed = true;
          unsubscribe();
          drain.close();
          resolve();
        });
      });
    });
  });

  app.get<{ Params: { runId: string } }>("/eval/runs/:runId", async (request, reply) => {
    return withAdminAccess(ctx, request, reply, async (actor) => {
      const [row] = await ctx.db.db
        .select()
        .from(syntheticLearnerEvalRuns)
        .where(
          and(
            eq(syntheticLearnerEvalRuns.id, request.params.runId),
            eq(syntheticLearnerEvalRuns.ownerId, actor.id),
          ),
        )
        .limit(1);

      if (!row) {
        return reply.status(404).send({ code: "not_found", message: "Eval run not found" });
      }

      const run = syntheticLearnerEvalRunRecordSchema.parse(row.runJson);
      return reply.send({
        summary: summarizeEvalRun(run, row),
        run,
      });
    });
  });

  app.post<{ Body: unknown }>("/eval/runs", async (request, reply) => {
    return withAdminAccess(ctx, request, reply, async (actor) => {
      const run = syntheticLearnerEvalRunRecordSchema.parse(request.body);
      try {
        const summary = await upsertEvalRun(ctx, actor.id, run);
        return reply.status(201).send({ summary, run });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid eval run";
        return reply.status(400).send({ code: "invalid_eval_run", message });
      }
    });
  });

  app.patch<{ Params: { runId: string }; Body: unknown }>(
    "/eval/runs/:runId",
    async (request, reply) => {
      return withAdminAccess(ctx, request, reply, async (actor) => {
        const patch = syntheticLearnerEvalRunRecordSchema
          .partial()
          .extend({
            observationEvents:
              syntheticLearnerEvalRunRecordSchema.shape.observationEvents.optional(),
          })
          .parse(request.body);
        const [existing] = await ctx.db.db
          .select()
          .from(syntheticLearnerEvalRuns)
          .where(
            and(
              eq(syntheticLearnerEvalRuns.id, request.params.runId),
              eq(syntheticLearnerEvalRuns.ownerId, actor.id),
            ),
          )
          .limit(1);

        if (!existing) {
          return reply.status(404).send({ code: "not_found", message: "Eval run not found" });
        }

        const mergedRun = syntheticLearnerEvalRunRecordSchema.parse({
          ...syntheticLearnerEvalRunRecordSchema.parse(existing.runJson),
          ...patch,
          id: request.params.runId,
          observationEvents: mergeObservationEvents(
            syntheticLearnerEvalRunRecordSchema.parse(existing.runJson).observationEvents,
            patch.observationEvents ?? [],
          ),
        });
        const summary = await upsertEvalRun(ctx, actor.id, mergedRun, Boolean(existing));
        return reply.send({ summary, run: mergedRun });
      });
    },
  );
}

async function upsertEvalRun(
  ctx: AppContext,
  ownerId: string,
  run: SyntheticLearnerEvalRunRecord,
  isUpdate = false,
): Promise<EvalRunSummary> {
  const now = new Date();
  const personaIds = uniqueValues(run.scenarioRuns.map((scenarioRun) => scenarioRun.personaId));
  const scenarioIds = uniqueValues(run.scenarioRuns.map((scenarioRun) => scenarioRun.scenarioId));
  const failedScenarioCount = run.scenarioRuns.filter(
    (scenarioRun) => scenarioRun.status === "failed",
  ).length;
  const notebookId = run.notebookRefs[0]?.refId ?? run.seededNotebookId;
  if (!notebookId) {
    throw new Error("Eval run is missing a notebook reference");
  }

  const values = {
    id: run.id,
    ownerId,
    notebookId,
    fixtureManifestId: run.fixtureManifestId,
    fixtureVersion: run.fixtureVersion,
    status: run.status,
    startedAt: new Date(run.startedAt),
    completedAt: run.completedAt ? new Date(run.completedAt) : null,
    durationMs: run.durationMs ?? null,
    scenarioRunCount: run.scenarioRuns.length,
    failedScenarioCount,
    personaCoverageJson: personaIds,
    scenarioCoverageJson: scenarioIds,
    notebookRefsJson: run.notebookRefs,
    runJson: run as unknown as Record<string, unknown>,
    updatedAt: now,
  };

  if (isUpdate) {
    await ctx.db.db
      .update(syntheticLearnerEvalRuns)
      .set(values)
      .where(
        and(eq(syntheticLearnerEvalRuns.id, run.id), eq(syntheticLearnerEvalRuns.ownerId, ownerId)),
      );
  } else {
    await ctx.db.db.insert(syntheticLearnerEvalRuns).values({
      ...values,
      createdAt: now,
    });
  }
  await notifyEvalRunUpdated(ctx, {
    runId: run.id,
    ownerId,
    status: run.status,
    updatedAt: now.toISOString(),
  });

  return summarizeEvalRun(run, {
    id: run.id,
    ownerId,
    notebookId,
    fixtureManifestId: run.fixtureManifestId,
    fixtureVersion: run.fixtureVersion,
    status: run.status,
    startedAt: new Date(run.startedAt),
    completedAt: run.completedAt ? new Date(run.completedAt) : null,
    durationMs: run.durationMs ?? null,
    scenarioRunCount: run.scenarioRuns.length,
    failedScenarioCount,
    personaCoverageJson: personaIds,
    scenarioCoverageJson: scenarioIds,
    notebookRefsJson: run.notebookRefs,
    runJson: run as unknown as Record<string, unknown>,
    updatedAt: now,
  });
}

async function notifyEvalRunUpdated(
  ctx: AppContext,
  event: EvalRunUpdateNotification,
): Promise<void> {
  const db = ctx.db.db as unknown as { execute?: (query: unknown) => Promise<unknown> };
  if (typeof db.execute !== "function") {
    return;
  }
  await db.execute(sql`select pg_notify(${EVAL_RUN_EVENT_CHANNEL}, ${JSON.stringify(event)})`);
}

function mergeObservationEvents(
  existing: SyntheticLearnerEvalRunRecord["observationEvents"],
  incoming: SyntheticLearnerEvalRunRecord["observationEvents"],
): SyntheticLearnerEvalRunRecord["observationEvents"] {
  const seen = new Set(existing.map((event) => event.id));
  return [...existing, ...incoming.filter((event) => !seen.has(event.id))];
}

function summarizeEvalRun(
  run: SyntheticLearnerEvalRunRecord,
  row: {
    id: string;
    notebookId: string;
    ownerId: string;
    fixtureManifestId: string;
    fixtureVersion: string;
    status: string;
    startedAt: Date | string;
    completedAt: Date | string | null;
    durationMs: number | null;
    scenarioRunCount: number;
    failedScenarioCount: number;
    personaCoverageJson: string[];
    scenarioCoverageJson: string[];
    notebookRefsJson: Array<{ refType: string; refId: string }>;
    runJson: Record<string, unknown>;
    updatedAt: Date | string;
  },
): EvalRunSummary {
  return {
    id: row.id,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt ?? null,
    durationMs: run.durationMs ?? null,
    fixtureManifestId: row.fixtureManifestId,
    fixtureVersion: row.fixtureVersion,
    notebookId: row.notebookId,
    scenarioRunCount: row.scenarioRunCount || run.scenarioRuns.length,
    passedScenarioCount: run.scenarioRuns.filter((scenarioRun) => scenarioRun.status === "passed")
      .length,
    failedScenarioCount:
      row.failedScenarioCount ||
      run.scenarioRuns.filter((scenarioRun) => scenarioRun.status === "failed").length,
    personaIds: row.personaCoverageJson.length
      ? row.personaCoverageJson
      : uniqueValues(run.scenarioRuns.map((scenarioRun) => scenarioRun.personaId)),
    scenarioIds: row.scenarioCoverageJson.length
      ? row.scenarioCoverageJson
      : uniqueValues(run.scenarioRuns.map((scenarioRun) => scenarioRun.scenarioId)),
    notebookRefs: row.notebookRefsJson.length ? row.notebookRefsJson : run.notebookRefs,
    transcriptLineCount: run.transcript.length,
    updatedAt: toIsoString(row.updatedAt),
  };
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}

type EvalRunUpdateNotification = {
  runId: string;
  ownerId: string;
  status: SyntheticLearnerEvalRunRecord["status"];
  updatedAt: string;
};

type EvalRunUpdateEnvelope = {
  eventType: "eval_run.updated";
  runId: string;
  status: SyntheticLearnerEvalRunRecord["status"];
  updatedAt: string;
  summary?: EvalRunSummary;
};

type EvalRunUpdateNotifier = {
  ready(): Promise<void>;
  subscribe(handler: (event: EvalRunUpdateNotification) => void): () => void;
  close(): Promise<void>;
};

function createEvalRunUpdateNotifier(ctx: AppContext): EvalRunUpdateNotifier {
  const subscribers = new Set<(event: EvalRunUpdateNotification) => void>();
  let readyPromise: Promise<void> | null = null;
  let listenerHandle: { unlisten(): Promise<void> } | null = null;

  const ready = async () => {
    if (!readyPromise) {
      readyPromise = ctx.db.sql
        .listen(EVAL_RUN_EVENT_CHANNEL, (payload) => {
          const event = parseEvalRunUpdateNotificationPayload(String(payload));
          if (!event) return;
          for (const subscriber of subscribers) {
            subscriber(event);
          }
        })
        .then((handle) => {
          listenerHandle = handle;
        });
    }
    await readyPromise;
  };

  return {
    ready,
    subscribe(handler) {
      subscribers.add(handler);
      return () => {
        subscribers.delete(handler);
      };
    },
    async close() {
      subscribers.clear();
      await listenerHandle?.unlisten();
      listenerHandle = null;
      readyPromise = null;
    },
  };
}

export function parseEvalRunUpdateNotificationPayload(
  payload: string,
): EvalRunUpdateNotification | null {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (typeof parsed.runId !== "string" || !parsed.runId) return null;
    if (typeof parsed.ownerId !== "string" || !parsed.ownerId) return null;
    if (typeof parsed.status !== "string" || !parsed.status) return null;
    if (typeof parsed.updatedAt !== "string" || Number.isNaN(Date.parse(parsed.updatedAt)))
      return null;
    return {
      runId: parsed.runId,
      ownerId: parsed.ownerId,
      status: parsed.status as SyntheticLearnerEvalRunRecord["status"],
      updatedAt: new Date(parsed.updatedAt).toISOString(),
    };
  } catch {
    return null;
  }
}

function evalRunUpdateEnvelopeFromRow(row: {
  id: string;
  notebookId: string;
  ownerId: string;
  fixtureManifestId: string;
  fixtureVersion: string;
  status: string;
  startedAt: Date | string;
  completedAt: Date | string | null;
  durationMs: number | null;
  scenarioRunCount: number;
  failedScenarioCount: number;
  personaCoverageJson: string[];
  scenarioCoverageJson: string[];
  notebookRefsJson: Array<{ refType: string; refId: string }>;
  runJson: Record<string, unknown>;
  updatedAt: Date | string;
}): EvalRunUpdateEnvelope {
  const run = syntheticLearnerEvalRunRecordSchema.parse(row.runJson);
  return {
    eventType: "eval_run.updated",
    runId: row.id,
    status: run.status,
    updatedAt: toIsoString(row.updatedAt),
    summary: summarizeEvalRun(run, row),
  };
}

function evalRunUpdateEnvelopeFromNotification(
  event: EvalRunUpdateNotification,
): EvalRunUpdateEnvelope {
  return {
    eventType: "eval_run.updated",
    runId: event.runId,
    status: event.status,
    updatedAt: event.updatedAt,
  };
}

function parseEvalRunUpdateCursor(cursor: string | undefined): Date {
  if (!cursor) return new Date(0);
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) return new Date(0);
  return parsed;
}

function maxDate(left: Date, right: Date): Date {
  return left > right ? left : right;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function createSerializedDrain(
  flush: () => Promise<void>,
  onError: (error: unknown) => void,
): (() => Promise<void>) & { close(): void } {
  let closed = false;
  let draining = false;
  let pending = false;

  const drain = async () => {
    if (closed) return;
    if (draining) {
      pending = true;
      return;
    }

    draining = true;
    try {
      do {
        pending = false;
        await flush();
      } while (pending && !closed);
    } catch (error) {
      onError(error);
    } finally {
      draining = false;
      if (pending && !closed) {
        await drain();
      }
    }
  };

  return Object.assign(drain, {
    close() {
      closed = true;
      pending = false;
    },
  });
}

function writeSse(stream: NodeJS.WritableStream, eventType: string, data: unknown): void {
  stream.write(`event: ${eventType}\n`);
  stream.write(`data: ${JSON.stringify(data)}\n\n`);
}
