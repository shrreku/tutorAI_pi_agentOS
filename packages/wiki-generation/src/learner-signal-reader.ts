import type { DbClient } from "@studyagent/db";
import { learningState, masteryEvidence } from "@studyagent/db";
import { desc, eq } from "drizzle-orm";

export function conceptIdsFromMasteryEvidence(evidenceJson: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const direct = evidenceJson.conceptId;
  if (typeof direct === "string") ids.push(direct);
  const targetConceptIds = evidenceJson.targetConceptIds;
  if (Array.isArray(targetConceptIds)) {
    for (const id of targetConceptIds) {
      if (typeof id === "string") ids.push(id);
    }
  }
  const conceptRefs = evidenceJson.conceptRefs;
  if (Array.isArray(conceptRefs)) {
    for (const ref of conceptRefs) {
      if (ref && typeof ref === "object" && typeof (ref as { refId?: string }).refId === "string") {
        ids.push((ref as { refId: string }).refId);
      }
    }
  }
  return ids;
}

export async function gatherRollingLearnerSignals(
  dbClient: DbClient,
  notebookId: string,
  studyPlanWeakConceptIds: string[] = [],
): Promise<{
  weakConceptIds: string[];
  lowMasteryConceptIds: string[];
  recentMistakeConceptIds: string[];
}> {
  const masteryRows = await dbClient.db
    .select({ conceptId: learningState.conceptId, masteryScore: learningState.masteryScore })
    .from(learningState)
    .where(eq(learningState.notebookId, notebookId))
    .limit(200);
  const lowMasteryConceptIds = masteryRows
    .filter((row) => (row.masteryScore ?? 0) < 0.45)
    .map((row) => row.conceptId);

  const evidenceRows = await dbClient.db
    .select({ evidenceJson: masteryEvidence.evidenceJson })
    .from(masteryEvidence)
    .where(eq(masteryEvidence.notebookId, notebookId))
    .orderBy(desc(masteryEvidence.createdAt))
    .limit(40);
  const recentMistakeConceptIds = [
    ...new Set(
      evidenceRows.flatMap((row) => {
        const json = row.evidenceJson ?? {};
        const overallScore = typeof json.overallScore === "number" ? json.overallScore : null;
        const correctness = typeof json.correctness === "string" ? json.correctness : null;
        const isWeak =
          (overallScore != null && overallScore < 0.55) ||
          correctness === "incorrect" ||
          correctness === "partial";
        return isWeak ? conceptIdsFromMasteryEvidence(json) : [];
      }),
    ),
  ];

  const weakConceptIds = [
    ...new Set([...studyPlanWeakConceptIds, ...lowMasteryConceptIds, ...recentMistakeConceptIds]),
  ];
  return { weakConceptIds, lowMasteryConceptIds, recentMistakeConceptIds };
}
