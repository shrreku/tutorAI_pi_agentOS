import { and, asc, eq, gt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { events, notebooks } from "@studyagent/db";
import type { EventEnvelope } from "@studyagent/schemas";
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

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let closed = false;
      let cursor = afterSeq;

      const tick = async () => {
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
          writeSse(reply.raw, row.eventType, {
            id: row.id,
            notebookId: row.notebookId,
            sessionId: row.sessionId ?? undefined,
            runId: row.runId ?? undefined,
            eventType: row.eventType,
            sequenceNo: row.sequenceNo,
            createdAt: row.createdAt.toISOString(),
            payload: row.payloadJson,
          });
        }
      };

      await tick();
      const interval = setInterval(() => {
        void tick().catch((err) => {
          if (!closed) {
            writeSse(reply.raw, "ingestion.job.failed", { message: String(err) });
          }
        });
      }, 750);

      await new Promise<void>((resolve) => {
        request.raw.on("close", () => {
          closed = true;
          clearInterval(interval);
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

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let closed = false;
      let cursor = afterSeq;

      const tick = async () => {
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
          const envelope: EventEnvelope = {
            id: row.id,
            notebookId: row.notebookId,
            sessionId: row.sessionId ?? undefined,
            runId: row.runId ?? undefined,
            eventType: row.eventType as EventEnvelope["eventType"],
            sequenceNo: row.sequenceNo,
            createdAt: row.createdAt.toISOString(),
            payload: row.payloadJson,
          };

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

      await tick();
      const interval = setInterval(() => {
        void tick().catch((err) => {
          if (!closed) {
            writeSse(reply.raw, "agent.run.failed", { message: String(err) });
          }
        });
      }, 750);

      await new Promise<void>((resolve) => {
        request.raw.on("close", () => {
          closed = true;
          clearInterval(interval);
          resolve();
        });
      });
    },
  );
}

function writeSse(stream: NodeJS.WritableStream, eventType: string, data: unknown): void {
  stream.write(`event: ${eventType}\n`);
  stream.write(`data: ${JSON.stringify(data)}\n\n`);
}
