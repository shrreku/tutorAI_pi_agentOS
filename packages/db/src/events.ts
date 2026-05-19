import { eq, max, sql } from "drizzle-orm";
import type { DbClient } from "./client.js";
import { events } from "./schema/index.js";

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
      payloadJson: input.payload,
    });

    return { id, sequenceNo: nextSeq };
  });
}
