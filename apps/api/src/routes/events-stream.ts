import { and, asc, eq, gt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { events, notebooks, NOTEBOOK_EVENT_CHANNEL } from "@studyagent/db";
import { workspaceRefreshHintForEvent, type EventEnvelope } from "@studyagent/schemas";
import type { AppContext } from "../context.js";
import { resolveActor } from "../auth.js";
import {
  mapEventEnvelopeToRuntimeStreamChunks,
  serializeStreamChunkToSse,
} from "@studyagent/agent-runtime";

export async function registerEventStreamRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  const notifier = createNotebookEventNotifier(ctx);
  app.addHook("onClose", async () => {
    await notifier.close();
  });

  app.get<{ Params: { notebookId: string }; Querystring: { after?: string } }>(
    "/notebooks/:notebookId/events/stream",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;
      const after = Number(request.query.after ?? "0");
      const afterSeq = Number.isFinite(after) ? after : 0;

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      await notifier.ready();

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let closed = false;
      let cursor = afterSeq;

      const flush = async () => {
        if (closed) {
          return;
        }

        const rows = await ctx.db.db
          .select()
          .from(events)
          .where(and(eq(events.notebookId, notebookId), gt(events.sequenceNo, cursor)))
          .orderBy(asc(events.sequenceNo))
          .limit(100);

        for (const row of rows) {
          cursor = row.sequenceNo;
          writeSse(reply.raw, row.eventType, eventEnvelopeFromRow(row));
        }
      };

      const drain = createSerializedDrain(flush, (err) => {
        if (!closed) {
          writeSse(reply.raw, "ingestion.job.failed", { message: String(err) });
        }
      });
      const unsubscribe = notifier.subscribe((event) => {
        if (event.notebookId !== notebookId || event.sequenceNo <= cursor) return;
        drain();
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
    },
  );

  app.get<{ Params: { notebookId: string; sessionId: string }; Querystring: { after?: string } }>(
    "/notebooks/:notebookId/sessions/:sessionId/events/stream",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId, sessionId } = request.params;
      const after = Number(request.query.after ?? "0");
      const afterSeq = Number.isFinite(after) ? after : 0;

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      await notifier.ready();

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let closed = false;
      let cursor = afterSeq;

      const flush = async () => {
        if (closed) {
          return;
        }

        const rows = await ctx.db.db
          .select()
          .from(events)
          .where(and(eq(events.notebookId, notebookId), eq(events.sessionId, sessionId), gt(events.sequenceNo, cursor)))
          .orderBy(asc(events.sequenceNo))
          .limit(100);

        for (const row of rows) {
          cursor = row.sequenceNo;
          const envelope = eventEnvelopeFromRow(row);

          const chunks = mapEventEnvelopeToRuntimeStreamChunks(envelope);
          if (chunks.length === 0) {
            writeSse(reply.raw, row.eventType, envelope);
            continue;
          }

          for (const chunk of chunks) {
            reply.raw.write(serializeStreamChunkToSse(chunk));
            reply.raw.write("\n");
          }
        }
      };

      const drain = createSerializedDrain(flush, (err) => {
        if (!closed) {
          writeSse(reply.raw, "agent.run.failed", { message: String(err) });
        }
      });
      const unsubscribe = notifier.subscribe((event) => {
        if (event.notebookId !== notebookId || event.sessionId !== sessionId || event.sequenceNo <= cursor) return;
        drain();
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
    },
  );
}

type PersistedEventRow = {
  id: string;
  notebookId: string;
  sessionId: string | null;
  runId: string | null;
  eventType: string;
  sequenceNo: number;
  createdAt: Date;
  payloadJson: Record<string, unknown> | null;
};

export function eventEnvelopeFromRow(row: PersistedEventRow): EventEnvelope {
  return {
    id: row.id,
    notebookId: row.notebookId,
    sessionId: row.sessionId ?? undefined,
    runId: row.runId ?? undefined,
    eventType: row.eventType as EventEnvelope["eventType"],
    sequenceNo: row.sequenceNo,
    createdAt: row.createdAt.toISOString(),
    payload: row.payloadJson ?? {},
    refreshHint: workspaceRefreshHintForEvent(row.eventType, row.payloadJson ?? {}),
  };
}

type EventNotification = {
  notebookId: string;
  sessionId: string | null;
  sequenceNo: number;
  eventType: string;
};

type NotebookEventNotifier = {
  ready(): Promise<void>;
  subscribe(handler: (event: EventNotification) => void): () => void;
  close(): Promise<void>;
};

function createNotebookEventNotifier(ctx: AppContext): NotebookEventNotifier {
  const subscribers = new Set<(event: EventNotification) => void>();
  let readyPromise: Promise<void> | null = null;
  let listenerHandle: { unlisten(): Promise<void> } | null = null;

  const ready = async () => {
    if (!readyPromise) {
      readyPromise = ctx.db.sql
        .listen(NOTEBOOK_EVENT_CHANNEL, (payload) => {
          const event = parseEventNotificationPayload(String(payload));
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

export function parseEventNotificationPayload(payload: string): EventNotification | null {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (typeof parsed.notebookId !== "string" || !parsed.notebookId) return null;
    if (typeof parsed.sequenceNo !== "number" || !Number.isFinite(parsed.sequenceNo)) return null;
    if (typeof parsed.eventType !== "string" || !parsed.eventType) return null;
    const sessionId = parsed.sessionId == null ? null : typeof parsed.sessionId === "string" ? parsed.sessionId : null;
    return {
      notebookId: parsed.notebookId,
      sessionId,
      sequenceNo: parsed.sequenceNo,
      eventType: parsed.eventType,
    };
  } catch {
    return null;
  }
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
