import { appendEvent, masteryEvidence as masteryEvidenceTable, type DbClient } from "@studyagent/db";
import { masteryEvidenceSchema, type MasteryEvidence } from "@studyagent/schemas";

export async function persistMasteryEvidence(
  dbClient: DbClient,
  evidence: MasteryEvidence,
): Promise<{ evidenceId: string; eventId: string }> {
  const parsed = masteryEvidenceSchema.parse(evidence);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const record = { ...parsed, createdAt };

  await dbClient.db.insert(masteryEvidenceTable).values({
    id: record.id,
    notebookId: record.notebookId,
    userId: record.userId,
    sessionId: record.sessionId ?? null,
    turnId: record.turnId ?? null,
    runId: record.runId ?? null,
    evidenceJson: record as unknown as Record<string, unknown>,
  });

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

  return { evidenceId: record.id, eventId: event.id };
}
