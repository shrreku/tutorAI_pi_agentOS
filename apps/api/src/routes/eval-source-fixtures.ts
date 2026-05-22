import type { FastifyInstance } from "fastify";
import {
  chunks,
  concepts,
  curricula,
  curriculumModules,
  notebooks,
  objectiveLists,
  objectives,
  sessionPlans,
  sourceVersions,
  sources,
  wikiPages,
  type DbClient,
} from "@studyagent/db";
import {
  syntheticLearnerEvalSourceFixtures,
  type EvalSourceFixtureManifest,
} from "@studyagent/schemas";
import { resolveActor } from "../auth.js";
import type { AppContext } from "../context.js";

type EvalSourceFixtureSeedState = {
  notebook: {
    title: string;
    description?: string | null;
    goal?: string | null;
    defaultMode?: string;
    settingsJson?: Record<string, unknown>;
  };
  sources: Array<{
    id: string;
    title: string;
    sourceType: string;
    originalObjectKey: string;
    status?: string;
    metadataJson?: Record<string, unknown>;
  }>;
  sourceVersions: Array<{
    id: string;
    sourceId: string;
    version: number;
    parserName?: string | null;
    parserVersion?: string | null;
    contentHash?: string | null;
    parseConfidence?: number | null;
    documentTreeJson?: unknown;
    createdAt?: string;
  }>;
  chunks: Array<{
    id: string;
    sourceVersionId: string;
    parentChunkId?: string | null;
    chunkType: string;
    text: string;
    tokenCount?: number | null;
    sourceSpanJson?: Record<string, unknown>;
    pageStart?: number | null;
    pageEnd?: number | null;
    headingPath?: string[];
    metadataJson?: Record<string, unknown>;
  }>;
  concepts: Array<{
    id: string;
    canonicalName: string;
    aliases?: string[];
    conceptType?: string | null;
    description?: string | null;
    confidence?: number | null;
    metadataJson?: Record<string, unknown>;
  }>;
  curricula: Array<{
    id: string;
    title: string;
    curriculumType: string;
    scopeJson?: Record<string, unknown>;
    status?: string;
    activeModuleId?: string | null;
    sourceIds?: string[];
    coverageSummaryJson?: Record<string, unknown> | null;
    confidence?: number | null;
  }>;
  curriculumModules: Array<{
    id: string;
    curriculumId: string;
    title: string;
    summary?: string | null;
    orderIndex?: number;
    status?: string;
    sourceRefsJson?: unknown[];
    targetConceptIds?: string[];
    prerequisiteModuleIds?: string[];
    estimatedSessionCount?: number;
    coverageRequirementsJson?: Record<string, unknown>;
    masteryGateJson?: Record<string, unknown>;
  }>;
  objectiveLists: Array<{
    id: string;
    curriculumId: string;
    moduleId: string;
    title: string;
    status?: string;
    currentObjectiveId?: string | null;
    objectiveIdsOrdered?: string[];
    coverageSnapshotJson?: Record<string, unknown>;
  }>;
  objectives: Array<{
    id: string;
    curriculumId: string;
    title: string;
    status?: string;
    orderIndex?: number;
    prerequisiteConceptIds?: string[];
    targetConceptIds?: string[];
    successCriteriaJson?: Record<string, unknown>;
    sourceRefsJson?: unknown[];
    suggestedMode?: string | null;
    readinessScore?: number | null;
  }>;
  sessionPlans: Array<{
    id: string;
    curriculumId: string;
    moduleId: string;
    objectiveListId: string;
    title: string;
    status?: string;
    sessionGoal?: string | null;
    plannedObjectiveIds?: string[];
    openerJson?: Record<string, unknown>;
    diagnosticQuestionIds?: string[];
    teachingArcIds?: string[];
    artifactRefsJson?: unknown[];
    exitCriteriaJson?: Record<string, unknown>;
    recommendationReasonJson?: Record<string, unknown>;
  }>;
  wikiPages: Array<{
    id: string;
    pageType: string;
    pageKey: string;
    title: string;
    version?: number;
    status?: string;
    structuredJson?: Record<string, unknown>;
    markdown?: string;
    sourceClaimIds?: string[];
    sourceChunkIds?: string[];
    confidenceSummaryJson?: Record<string, unknown> | null;
    qualityScore?: number | null;
  }>;
};

export async function registerEvalSourceFixtureRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post<{ Params: { fixtureId: string }; Body: { title?: string } }>(
    "/eval/source-fixtures/:fixtureId/notebooks",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const fixture = syntheticLearnerEvalSourceFixtures[request.params.fixtureId as keyof typeof syntheticLearnerEvalSourceFixtures];

      if (!fixture) {
        return reply.status(404).send({ code: "not_found", message: "Fixture not found" });
      }

      if (!fixture.compatibilityStatus || fixture.compatibilityStatus !== "compatible" || !fixture.compatible) {
        return reply.status(409).send({ code: "fixture_incompatible", message: "Fixture is not importable" });
      }

      if (fixture.readinessChecks.some((check) => !check.passed)) {
        return reply.status(409).send({ code: "fixture_not_ready", message: "Fixture readiness checks did not pass" });
      }

      const imported = await seedEvalSourceFixtureNotebook(ctx.db, fixture, actor.id, {
        ...(typeof request.body?.title === "string" ? { title: request.body.title } : {}),
      });

      return reply.status(201).send(imported);
    },
  );
}

export async function seedEvalSourceFixtureNotebook(
  dbClient: DbClient,
  fixture: EvalSourceFixtureManifest,
  ownerId: string,
  options?: { title?: string; notebookId?: string },
): Promise<{
  notebook: Record<string, unknown>;
  seededRowCounts: Record<string, number>;
}> {
  const seedState = fixture.tutoringReadyState as EvalSourceFixtureSeedState;
  const notebookId = options?.notebookId ?? `nb_eval_${fixture.id}_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date(fixture.generatedAt);

  const scopeId = (id: string) => `${notebookId}__${id}`;
  const sourceIdMap = new Map(seedState.sources.map((row) => [row.id, scopeId(row.id)]));
  const sourceVersionIdMap = new Map(seedState.sourceVersions.map((row) => [row.id, scopeId(row.id)]));
  const chunkIdMap = new Map(seedState.chunks.map((row) => [row.id, scopeId(row.id)]));
  const conceptIdMap = new Map(seedState.concepts.map((row) => [row.id, scopeId(row.id)]));
  const curriculumIdMap = new Map(seedState.curricula.map((row) => [row.id, scopeId(row.id)]));
  const moduleIdMap = new Map(seedState.curriculumModules.map((row) => [row.id, scopeId(row.id)]));
  const objectiveListIdMap = new Map(seedState.objectiveLists.map((row) => [row.id, scopeId(row.id)]));
  const objectiveIdMap = new Map(seedState.objectives.map((row) => [row.id, scopeId(row.id)]));
  const sessionPlanIdMap = new Map(seedState.sessionPlans.map((row) => [row.id, scopeId(row.id)]));
  const wikiPageIdMap = new Map(seedState.wikiPages.map((row) => [row.id, scopeId(row.id)]));

  const notebook = {
    id: notebookId,
    ownerId,
    title: options?.title?.trim() || seedState.notebook.title,
    description: seedState.notebook.description ?? null,
    goal: seedState.notebook.goal ?? null,
    defaultMode: seedState.notebook.defaultMode ?? "tutor",
    settingsJson: {
      ...(seedState.notebook.settingsJson ?? {}),
      evalSourceFixture: {
        fixtureId: fixture.id,
        version: fixture.version,
        sourceContentHash: fixture.sourceContentHash,
        compatibilityStatus: fixture.compatibilityStatus,
        generatedAt: fixture.generatedAt,
      },
    },
    createdAt: now,
    updatedAt: now,
  };

  const seededRowCounts: Record<string, number> = {};

  await dbClient.db.transaction(async (tx) => {
    await tx.insert(notebooks).values(notebook);
    seededRowCounts.notebooks = 1;

    await insertRows(tx, sources, seedState.sources.map((row) => ({
      ...row,
      id: sourceIdMap.get(row.id) ?? row.id,
      notebookId,
      status: row.status ?? "ready",
      metadataJson: row.metadataJson ?? {},
      createdAt: now,
      updatedAt: now,
    })));
    seededRowCounts.sources = seedState.sources.length;

    await insertRows(tx, sourceVersions, seedState.sourceVersions.map((row) => ({
      ...row,
      id: sourceVersionIdMap.get(row.id) ?? row.id,
      sourceId: sourceIdMap.get(row.sourceId) ?? row.sourceId,
      createdAt: row.createdAt ? new Date(row.createdAt) : now,
    })));
    seededRowCounts.sourceVersions = seedState.sourceVersions.length;

    await insertRows(tx, chunks, seedState.chunks.map((row) => ({
      ...row,
      id: chunkIdMap.get(row.id) ?? row.id,
      sourceVersionId: sourceVersionIdMap.get(row.sourceVersionId) ?? row.sourceVersionId,
      parentChunkId: row.parentChunkId ? (chunkIdMap.get(row.parentChunkId) ?? row.parentChunkId) : null,
      headingPath: row.headingPath ?? [],
      metadataJson: row.metadataJson ?? {},
      createdAt: now,
      updatedAt: now,
    })));
    seededRowCounts.chunks = seedState.chunks.length;

    await insertRows(tx, concepts, seedState.concepts.map((row) => ({
      ...row,
      id: conceptIdMap.get(row.id) ?? row.id,
      notebookId,
      aliases: row.aliases ?? [],
      conceptType: row.conceptType ?? null,
      description: row.description ?? null,
      confidence: row.confidence ?? null,
      metadataJson: row.metadataJson ?? {},
      createdAt: now,
      updatedAt: now,
    })));
    seededRowCounts.concepts = seedState.concepts.length;

    await insertRows(tx, curricula, seedState.curricula.map((row) => ({
      ...row,
      id: curriculumIdMap.get(row.id) ?? row.id,
      notebookId,
      activeModuleId: row.activeModuleId ? (moduleIdMap.get(row.activeModuleId) ?? row.activeModuleId) : null,
      sourceIds: (row.sourceIds ?? []).map((sourceId) => sourceIdMap.get(sourceId) ?? sourceId),
      coverageSummaryJson: row.coverageSummaryJson ?? null,
      confidence: row.confidence ?? null,
      createdByRunId: null,
      createdAt: now,
      updatedAt: now,
    })));
    seededRowCounts.curricula = seedState.curricula.length;

    await insertRows(tx, curriculumModules, seedState.curriculumModules.map((row) => ({
      ...row,
      id: moduleIdMap.get(row.id) ?? row.id,
      notebookId,
      curriculumId: curriculumIdMap.get(row.curriculumId) ?? row.curriculumId,
      sourceRefsJson: row.sourceRefsJson ?? [],
      targetConceptIds: (row.targetConceptIds ?? []).map((conceptId) => conceptIdMap.get(conceptId) ?? conceptId),
      prerequisiteModuleIds: (row.prerequisiteModuleIds ?? []).map((moduleId) => moduleIdMap.get(moduleId) ?? moduleId),
      coverageRequirementsJson: row.coverageRequirementsJson ?? {},
      masteryGateJson: row.masteryGateJson ?? {},
      createdAt: now,
      updatedAt: now,
    })));
    seededRowCounts.curriculumModules = seedState.curriculumModules.length;

    await insertRows(tx, objectiveLists, seedState.objectiveLists.map((row) => ({
      ...row,
      id: objectiveListIdMap.get(row.id) ?? row.id,
      notebookId,
      curriculumId: curriculumIdMap.get(row.curriculumId) ?? row.curriculumId,
      moduleId: moduleIdMap.get(row.moduleId) ?? row.moduleId,
      currentObjectiveId: row.currentObjectiveId ? (objectiveIdMap.get(row.currentObjectiveId) ?? row.currentObjectiveId) : null,
      objectiveIdsOrdered: (row.objectiveIdsOrdered ?? []).map((objectiveId) => objectiveIdMap.get(objectiveId) ?? objectiveId),
      coverageSnapshotJson: row.coverageSnapshotJson ?? {},
      createdByRunId: null,
      createdAt: now,
      updatedAt: now,
    })));
    seededRowCounts.objectiveLists = seedState.objectiveLists.length;

    await insertRows(tx, objectives, seedState.objectives.map((row) => ({
      ...row,
      id: objectiveIdMap.get(row.id) ?? row.id,
      notebookId,
      curriculumId: curriculumIdMap.get(row.curriculumId) ?? row.curriculumId,
      prerequisiteConceptIds: (row.prerequisiteConceptIds ?? []).map((conceptId) => conceptIdMap.get(conceptId) ?? conceptId),
      targetConceptIds: (row.targetConceptIds ?? []).map((conceptId) => conceptIdMap.get(conceptId) ?? conceptId),
      sourceRefsJson: row.sourceRefsJson ?? [],
      suggestedMode: row.suggestedMode ?? null,
      readinessScore: row.readinessScore ?? null,
      createdAt: now,
      updatedAt: now,
    })));
    seededRowCounts.objectives = seedState.objectives.length;

    await insertRows(tx, sessionPlans, seedState.sessionPlans.map((row) => ({
      ...row,
      id: sessionPlanIdMap.get(row.id) ?? row.id,
      notebookId,
      curriculumId: curriculumIdMap.get(row.curriculumId) ?? row.curriculumId,
      moduleId: moduleIdMap.get(row.moduleId) ?? row.moduleId,
      objectiveListId: objectiveListIdMap.get(row.objectiveListId) ?? row.objectiveListId,
      plannedObjectiveIds: (row.plannedObjectiveIds ?? []).map((objectiveId) => objectiveIdMap.get(objectiveId) ?? objectiveId),
      teachingArcIds: row.teachingArcIds ?? [],
      artifactRefsJson: row.artifactRefsJson ?? [],
      exitCriteriaJson: row.exitCriteriaJson ?? {},
      recommendationReasonJson: row.recommendationReasonJson ?? {},
      createdByRunId: null,
      createdAt: now,
      updatedAt: now,
    })));
    seededRowCounts.sessionPlans = seedState.sessionPlans.length;

    await insertRows(tx, wikiPages, seedState.wikiPages.map((row) => ({
      ...row,
      id: wikiPageIdMap.get(row.id) ?? row.id,
      notebookId,
      version: row.version ?? 1,
      status: row.status ?? "published",
      structuredJson: row.structuredJson ?? {},
      markdown: row.markdown ?? "",
      sourceClaimIds: row.sourceClaimIds ?? [],
      sourceChunkIds: (row.sourceChunkIds ?? []).map((chunkId) => chunkIdMap.get(chunkId) ?? chunkId),
      confidenceSummaryJson: row.confidenceSummaryJson ?? null,
      qualityScore: row.qualityScore ?? null,
      createdAt: now,
      updatedAt: now,
    })));
    seededRowCounts.wikiPages = seedState.wikiPages.length;
  });

  return {
    notebook,
    seededRowCounts,
  };
}

async function insertRows(tx: any, table: any, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(table).values(rows);
}
