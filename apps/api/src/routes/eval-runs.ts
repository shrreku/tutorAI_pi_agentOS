import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { syntheticLearnerEvalRunRecordSchema, type SyntheticLearnerEvalRunRecord } from "@studyagent/schemas";
import type { AppContext } from "../context.js";
import { resolveActor } from "../auth.js";
import { syntheticLearnerEvalRuns } from "@studyagent/db";

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
};

export async function registerEvalRunRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/eval/runs", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
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

  app.get<{ Params: { runId: string } }>("/eval/runs/:runId", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const [row] = await ctx.db.db
      .select()
      .from(syntheticLearnerEvalRuns)
      .where(and(eq(syntheticLearnerEvalRuns.id, request.params.runId), eq(syntheticLearnerEvalRuns.ownerId, actor.id)))
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

  app.post<{ Body: unknown }>("/eval/runs", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const run = syntheticLearnerEvalRunRecordSchema.parse(request.body);
    const now = new Date();
    const personaIds = uniqueValues(run.scenarioRuns.map((scenarioRun) => scenarioRun.personaId));
    const scenarioIds = uniqueValues(run.scenarioRuns.map((scenarioRun) => scenarioRun.scenarioId));
    const failedScenarioCount = run.scenarioRuns.filter((scenarioRun) => scenarioRun.status === "failed").length;
    const notebookId = run.notebookRefs[0]?.refId ?? run.seededNotebookId;
    if (!notebookId) {
      return reply.status(400).send({ code: "invalid_eval_run", message: "Eval run is missing a notebook reference" });
    }

    await ctx.db.db.insert(syntheticLearnerEvalRuns).values({
      id: run.id,
      ownerId: actor.id,
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
      createdAt: now,
      updatedAt: now,
    });

    return reply.status(201).send({
      summary: summarizeEvalRun(run, {
        id: run.id,
        ownerId: actor.id,
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
      }),
      run,
    });
  });
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
    passedScenarioCount: run.scenarioRuns.filter((scenarioRun) => scenarioRun.status === "passed").length,
    failedScenarioCount: row.failedScenarioCount || run.scenarioRuns.filter((scenarioRun) => scenarioRun.status === "failed").length,
    personaIds: row.personaCoverageJson.length ? row.personaCoverageJson : uniqueValues(run.scenarioRuns.map((scenarioRun) => scenarioRun.personaId)),
    scenarioIds: row.scenarioCoverageJson.length ? row.scenarioCoverageJson : uniqueValues(run.scenarioRuns.map((scenarioRun) => scenarioRun.scenarioId)),
    notebookRefs: row.notebookRefsJson.length ? row.notebookRefsJson : run.notebookRefs,
    transcriptLineCount: run.transcript.length,
  };
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}
