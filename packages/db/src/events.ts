import { eq, max, sql } from "drizzle-orm";
import { validateEventPayload } from "@studyagent/schemas";
import type { DbClient } from "./client.js";
import { events } from "./schema/index.js";

export const NOTEBOOK_EVENT_CHANNEL = "studyagent_notebook_events";

export type AppendEventInput = {
  notebookId: string;
  sessionId?: string;
  runId?: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export async function appendEvent(
  { db }: Pick<DbClient, "db">,
  input: AppendEventInput,
): Promise<{ id: string; sequenceNo: number }> {
  const validated = validateEventPayload(input.eventType, input.payload);
  const payload = validated.success ? validated.data : input.payload;

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.notebookId}))`);

    const [row] = await tx
      .select({ m: max(events.sequenceNo) })
      .from(events)
      .where(eq(events.notebookId, input.notebookId));

    const nextSeq = (row?.m ?? 0) + 1;
    const id = `evt_${crypto.randomUUID().replaceAll("-", "")}`;

    await tx.insert(events).values({
      id,
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      runId: input.runId,
      eventType: input.eventType,
      sequenceNo: nextSeq,
      payloadJson: payload,
    });

    await tx.execute(
      sql`select pg_notify(${NOTEBOOK_EVENT_CHANNEL}, ${JSON.stringify({
        notebookId: input.notebookId,
        sessionId: input.sessionId ?? null,
        sequenceNo: nextSeq,
        eventType: input.eventType,
      })})`,
    );

    return { id, sequenceNo: nextSeq };
  });
}
