import { events, masteryEvidence as masteryEvidenceTable, type DbClient } from "@studyagent/db";
import { masteryEvidenceSchema, type MasteryEvidence } from "@studyagent/schemas";
import { and, desc, eq, sql } from "drizzle-orm";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";

export async function readMasteryEvidenceById(
  dbClient: DbClient,
  evidenceId: string,
): Promise<MasteryEvidence | null> {
  const [row] = await dbClient.db
    .select({ evidenceJson: masteryEvidenceTable.evidenceJson })
    .from(masteryEvidenceTable)
    .where(eq(masteryEvidenceTable.id, evidenceId))
    .limit(1);
  if (!row) return null;
  return masteryEvidenceSchema.parse(row.evidenceJson);
}

async function readRecordedEventId(
  dbClient: DbClient,
  notebookId: string,
  evidenceId: string,
): Promise<string> {
  const [row] = await dbClient.db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.notebookId, notebookId),
        eq(events.eventType, "learning.mastery_evidence.recorded"),
        sql`${events.payloadJson}->>'masteryEvidenceId' = ${evidenceId}`,
      ),
    )
    .orderBy(desc(events.sequenceNo))
    .limit(1);
  if (!row) {
    throw new Error(`Mastery evidence ${evidenceId} exists without its recorded event`);
  }
  return row.id;
}

export async function persistMasteryEvidence(
  dbClient: DbClient,
  evidence: MasteryEvidence,
): Promise<{ evidenceId: string; eventId: string; inserted: boolean }> {
  const parsed = masteryEvidenceSchema.parse(evidence);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const record = { ...parsed, createdAt };

  const inserted = await dbClient.db
    .insert(masteryEvidenceTable)
    .values({
      id: record.id,
      notebookId: record.notebookId,
      userId: record.userId,
      sessionId: record.sessionId ?? null,
      turnId: record.turnId ?? null,
      runId: record.runId ?? null,
      evidenceJson: record as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: masteryEvidenceTable.id })
    .returning({ id: masteryEvidenceTable.id });

  if (inserted.length === 0) {
    return {
      evidenceId: record.id,
      eventId: await readRecordedEventId(dbClient, record.notebookId, record.id),
      inserted: false,
    };
  }

  const event = await appendEvent(dbClient, {
    notebookId: record.notebookId,
    ...(record.sessionId ? { sessionId: record.sessionId } : {}),
    ...(record.runId ? { runId: record.runId } : {}),
    eventType: "learning.mastery_evidence.recorded",
    payload: {
      masteryEvidenceId: record.id,
      correctnessLabel: record.correctnessLabel,
      evidenceType: record.evidenceType,
      triggerSource: record.triggerSource,
      conceptIds: record.conceptScores.map((entry) => entry.conceptId),
      confidence: record.confidence,
      uncertainty: record.uncertainty,
    },
  });

  return { evidenceId: record.id, eventId: event.id, inserted: true };
}
