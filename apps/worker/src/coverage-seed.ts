import type { DbClient } from "@studyagent/db";
import { coverageItems, coverageRecords } from "@studyagent/db";

export type CoverageSeedItem = {
  itemFamily: string;
  title: string;
  description: string | null;
  conceptId?: string | null;
  claimId?: string | null;
  metadataJson?: Record<string, unknown>;
};

export async function seedCoverageForSource(
  dbClient: DbClient,
  params: {
    notebookId: string;
    sourceId: string;
    sourceVersionId: string;
    curriculumId: string | null | undefined;
    moduleId: string | null | undefined;
    objectiveListId: string | null | undefined;
    sessionPlanId: string | null | undefined;
    coverageSeedItems: CoverageSeedItem[];
    objectiveCoverageFamilies: string[][];
    now: Date;
  },
) {
  const {
    notebookId,
    sourceId,
    sourceVersionId,
    curriculumId,
    moduleId,
    objectiveListId,
    sessionPlanId,
    coverageSeedItems,
    objectiveCoverageFamilies,
    now,
  } = params;

  const coverageByFamily = new Map<string, string[]>();
  const conceptIdsByObjective: Array<Set<string>> = objectiveCoverageFamilies.map(
    () => new Set<string>(),
  );

  for (const item of coverageSeedItems) {
    const coverageItemId = `cov_${crypto.randomUUID().replaceAll("-", "")}`;
    const coverageRecordId = `covrec_${crypto.randomUUID().replaceAll("-", "")}`;
    const familyItems = coverageByFamily.get(item.itemFamily) ?? [];
    familyItems.push(coverageItemId);
    coverageByFamily.set(item.itemFamily, familyItems);

    await dbClient.db.insert(coverageItems).values({
      id: coverageItemId,
      notebookId,
      sourceId,
      sourceVersionId,
      itemFamily: item.itemFamily,
      title: item.title,
      description: item.description,
      conceptId: item.conceptId ?? null,
      claimId: item.claimId ?? null,
      sourceRefsJson: [{ sourceId }],
      metadataJson: item.metadataJson,
      createdAt: now,
      updatedAt: now,
    });

    await dbClient.db.insert(coverageRecords).values({
      id: coverageRecordId,
      notebookId,
      coverageItemId,
      curriculumId: curriculumId ?? null,
      moduleId: moduleId ?? null,
      objectiveListId: objectiveListId ?? null,
      sessionPlanId: sessionPlanId ?? null,
      status: "planned",
      evidenceJson: { sourceId },
      updatedByRunId: null,
      createdAt: now,
      updatedAt: now,
    });

    if (item.conceptId) {
      for (
        let objectiveIndex = 0;
        objectiveIndex < objectiveCoverageFamilies.length;
        objectiveIndex += 1
      ) {
        const families = objectiveCoverageFamilies[objectiveIndex]!;
        if (families.includes(item.itemFamily)) {
          conceptIdsByObjective[objectiveIndex]!.add(item.conceptId);
        }
      }
    }
  }

  return { coverageByFamily, conceptIdsByObjective };
}
