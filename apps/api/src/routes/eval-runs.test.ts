import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syntheticLearnerEvalRuns } from "@studyagent/db";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerEvalRunRecord,
  planSyntheticLearnerEvalRun,
  buildEvalEvidenceSnapshot,
  syntheticLearnerEvalTracerBulletFixture,
  syntheticLearnerEvalTracerBulletPersonas,
  syntheticLearnerEvalTracerBulletScenarios,
} from "@studyagent/schemas";
import type { AppContext } from "../context.js";
import { parseEvalRunUpdateNotificationPayload, registerEvalRunRoutes } from "./eval-runs.js";

vi.mock("../auth.js", () => ({
  resolveActor: vi.fn(async () => ({ id: "user_eval_1" })),
}));

class FakeQuery {
  constructor(private rows: Array<Record<string, unknown>>) {}

  where() {
    return this;
  }

  orderBy() {
    return this;
  }

  limit(count: number) {
    this.rows = this.rows.slice(0, count);
    return this;
  }

  then<TResult1 = Array<Record<string, unknown>>, TResult2 = never>(
    onfulfilled?: ((value: Array<Record<string, unknown>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.rows).then(onfulfilled, onrejected);
  }
}

class FakeDb {
  inserted = new Map<unknown, Array<Record<string, unknown>>>();

  transaction<T>(fn: (tx: FakeDb) => Promise<T>): Promise<T> {
    return fn(this);
  }

  select() {
    return {
      from: (table: unknown) => new FakeQuery(this.inserted.get(table) ?? []),
    };
  }

  insert(table: unknown) {
    return {
      values: async (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const rows = Array.isArray(values) ? values : [values];
        const existing = this.inserted.get(table) ?? [];
        existing.push(...rows);
        this.inserted.set(table, existing);
      },
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          const rows = this.inserted.get(table) ?? [];
          const id = values.id;
          const index = rows.findIndex((row) => row.id === id);
          if (index >= 0) {
            rows[index] = { ...rows[index], ...values };
          }
        },
      }),
    };
  }
}

describe("eval run routes", () => {
  let app = Fastify();
  let fakeDb: FakeDb;

  beforeEach(async () => {
    fakeDb = new FakeDb();
    app = Fastify();
    const ctx = {
      db: { db: fakeDb },
      env: {},
    } as unknown as AppContext;
    await registerEvalRunRoutes(app, ctx);
  });

  afterEach(async () => {
    await app.close();
  });

  it("persists a completed suite run and exposes dashboard summaries", async () => {
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 2),
      scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 2),
    });

    const runRecord = buildSyntheticLearnerEvalRunRecord({
      matrix,
      runId: "slrun_eval_dashboard_001",
      startedAt: "2026-05-22T00:00:00.000Z",
      completedAt: "2026-05-22T00:02:00.000Z",
      notebookRefs: [{ refType: "notebook", refId: "nb_eval_fixture_001" }],
      transcript: ["RUN STARTED: slrun_eval_dashboard_001", "FINAL: failed - 1 scenario run failed."],
      scenarioRuns: matrix.runs.slice(0, 4).map((run, index) => ({
        ...run,
        id: `slrun_eval_dashboard_001_${index}`,
        runId: "slrun_eval_dashboard_001",
        fixtureVersion: matrix.fixture.version,
        status: index === 3 ? "failed" : "passed",
        startedAt: `2026-05-22T00:0${index}:00.000Z`,
        completedAt: `2026-05-22T00:0${index}:30.000Z`,
        durationMs: 30_000,
        steps: [],
        assertions: index === 3
          ? [
              {
                id: "learner_visible_no_id_leak",
                category: "learner_visible",
                description: "Tutor text does not leak raw IDs.",
                status: "failed",
                passed: false,
                failureMessage: "Tutor text leaks machine-generated content: [object Object]",
                evidenceRefs: [],
                details: {},
              },
            ]
          : [],
        artifactRefs: [],
        screenshotRefs: [],
        traceRefs: [],
        notebookRefs: [{ refType: "notebook", refId: `nb_eval_${index}` }],
        evalEvidenceSnapshots: [],
        runKind: "regression",
        rubricResults: [],
        finalState: {
          passed: index !== 3,
          summary: index === 3 ? "Scenario failed." : "Scenario passed.",
        },
      })),
    });

    const postResponse = await app.inject({
      method: "POST",
      url: "/eval/runs",
      payload: runRecord,
    });

    expect(postResponse.statusCode).toBe(201);
    const postBody = postResponse.json() as {
      summary: {
        id: string;
        status: string;
        scenarioRunCount: number;
        failedScenarioCount: number;
        personaIds: string[];
        scenarioIds: string[];
      };
      run: { transcript: string[] };
    };
    expect(postBody.summary.id).toBe("slrun_eval_dashboard_001");
    expect(postBody.summary.status).toBe("failed");
    expect(postBody.summary.scenarioRunCount).toBe(4);
    expect(postBody.summary.failedScenarioCount).toBe(1);
    expect(postBody.summary.personaIds).toEqual(expect.arrayContaining(syntheticLearnerEvalTracerBulletPersonas.slice(0, 2).map((persona) => persona.id)));
    expect(postBody.run.transcript).toContain("RUN STARTED: slrun_eval_dashboard_001");

    expect(fakeDb.inserted.get(syntheticLearnerEvalRuns)).toHaveLength(1);

    const listResponse = await app.inject({
      method: "GET",
      url: "/eval/runs",
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json() as { runs: Array<{ summary: { id: string; scenarioRunCount: number; failedScenarioCount: number } }> };
    expect(listBody.runs).toHaveLength(1);
    expect(listBody.runs[0]?.summary.id).toBe("slrun_eval_dashboard_001");
    expect(listBody.runs[0]?.summary.failedScenarioCount).toBe(1);

    const detailResponse = await app.inject({
      method: "GET",
      url: "/eval/runs/slrun_eval_dashboard_001",
    });
    expect(detailResponse.statusCode).toBe(200);
    const detailBody = detailResponse.json() as {
      summary: { id: string; transcriptLineCount: number };
      run: { id: string; transcript: string[]; scenarioRuns: Array<{ personaId: string; scenarioId: string }> };
    };
    expect(detailBody.summary.id).toBe("slrun_eval_dashboard_001");
    expect(detailBody.summary.transcriptLineCount).toBeGreaterThan(0);
    expect(detailBody.run.scenarioRuns).toHaveLength(4);
  });

  it("persists eval plans and evidence snapshot refs on POST", async () => {
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
      scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 1),
    });
    const evalPlan = planSyntheticLearnerEvalRun({
      scenario: { ...matrix.scenarios[0]!, runKind: "scenario_autonomous" },
      persona: matrix.personas[0]!,
      learnerMode: "scenario_autonomous_llm",
    });
    const snapshot = buildEvalEvidenceSnapshot({
      id: "snap_eval_post_001",
      notebookId: matrix.fixture.seededNotebookId,
      capturedAt: "2026-05-22T00:01:00.000Z",
      masteryEvidence: [{ ref: { refType: "turn", refId: "turn_post_001" }, overallScore: 0.8, confidence: 0.9 }],
    });
    const runRecord = buildSyntheticLearnerEvalRunRecord({
      matrix,
      runId: "slrun_eval_snapshot_refs",
      startedAt: "2026-05-22T00:00:00.000Z",
      completedAt: "2026-05-22T00:01:00.000Z",
      scenarioRuns: matrix.runs.slice(0, 1).map((run) => ({
        ...run,
        id: "slrun_eval_snapshot_refs_0",
        runId: "slrun_eval_snapshot_refs",
        fixtureVersion: matrix.fixture.version,
        status: "passed",
        startedAt: "2026-05-22T00:00:00.000Z",
        completedAt: "2026-05-22T00:01:00.000Z",
        durationMs: 60_000,
        steps: [],
        assertions: [],
        artifactRefs: [],
        screenshotRefs: [],
        traceRefs: [],
        notebookRefs: [{ refType: "notebook", refId: matrix.fixture.seededNotebookId }],
        runKind: "scenario_autonomous",
        learnerMode: "scenario_autonomous_llm",
        gatingPolicy: "non_ci_gating",
        rubricResults: [],
        evalEvidenceSnapshotRefs: snapshot.snapshotRefs,
        evalEvidenceSnapshots: [snapshot],
        evalPlan,
        finalState: { passed: true, summary: "Scenario passed." },
      })),
    });

    const postResponse = await app.inject({
      method: "POST",
      url: "/eval/runs",
      payload: runRecord,
    });
    expect(postResponse.statusCode).toBe(201);
    const postBody = postResponse.json() as {
      run: {
        evalPlans: Array<{ scenarioId: string }>;
        evalEvidenceSnapshotRefs: Array<{ refType: string; refId: string }>;
        evalEvidenceSnapshots: Array<{ id: string }>;
      };
    };
    expect(postBody.run.evalPlans).toHaveLength(1);
    expect(postBody.run.evalEvidenceSnapshotRefs).toEqual(
      expect.arrayContaining([{ refType: "eval_evidence_snapshot", refId: "snap_eval_post_001" }]),
    );
    expect(postBody.run.evalEvidenceSnapshots[0]?.id).toBe("snap_eval_post_001");
  });

  it("accepts live observation patches while a run is still executing", async () => {
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
      scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 1),
    });
    const runningRun = buildSyntheticLearnerEvalRunRecord({
      matrix,
      runId: "slrun_live_observation",
      status: "running",
      startedAt: "2026-05-22T00:00:00.000Z",
      transcript: ["RUN STARTED: slrun_live_observation"],
      observationEvents: [
        {
          id: "obs_live_1",
          runId: "slrun_live_observation",
          timestamp: "2026-05-22T00:00:01.000Z",
          kind: "run",
          status: "running",
          message: "Eval Run slrun_live_observation started.",
          payload: {},
          evidenceRefs: [],
        },
      ],
      scenarioRuns: [
        {
          ...matrix.runs[0]!,
          id: "slrun_live_observation_0",
          runId: "slrun_live_observation",
          fixtureVersion: matrix.fixture.version,
          status: "running",
          startedAt: "2026-05-22T00:00:00.000Z",
          steps: [],
          assertions: [],
          artifactRefs: [],
          screenshotRefs: [],
          traceRefs: [],
          notebookRefs: [{ refType: "notebook", refId: matrix.fixture.seededNotebookId }],
          evalEvidenceSnapshots: [],
          runKind: "regression",
          rubricResults: [],
          finalState: { passed: false, summary: "Eval Run is still executing." },
        },
      ],
    });

    const postResponse = await app.inject({
      method: "POST",
      url: "/eval/runs",
      payload: runningRun,
    });
    expect(postResponse.statusCode).toBe(201);

    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/eval/runs/slrun_live_observation",
      payload: {
        status: "running",
        observationEvents: [
          {
            id: "obs_live_2",
            runId: "slrun_live_observation",
            timestamp: "2026-05-22T00:00:02.000Z",
            kind: "student",
            message: "Teach me the topic.",
            payload: {},
            evidenceRefs: [],
          },
        ],
      },
    });
    expect(patchResponse.statusCode).toBe(200);
    const patchBody = patchResponse.json() as { run: { status: string; observationEvents: Array<{ id: string }> } };
    expect(patchBody.run.status).toBe("running");
    expect(patchBody.run.observationEvents.map((event) => event.id)).toEqual(["obs_live_1", "obs_live_2"]);
  });

  it("parses compact eval run update notifications", () => {
    expect(
      parseEvalRunUpdateNotificationPayload(JSON.stringify({
        runId: "slrun_notify_1",
        ownerId: "user_eval_1",
        status: "running",
        updatedAt: "2026-05-22T00:00:02.000Z",
      })),
    ).toEqual({
      runId: "slrun_notify_1",
      ownerId: "user_eval_1",
      status: "running",
      updatedAt: "2026-05-22T00:00:02.000Z",
    });
  });

  it("rejects malformed eval run update notifications", () => {
    expect(parseEvalRunUpdateNotificationPayload("not-json")).toBeNull();
    expect(parseEvalRunUpdateNotificationPayload(JSON.stringify({ runId: "slrun_missing_owner" }))).toBeNull();
    expect(
      parseEvalRunUpdateNotificationPayload(JSON.stringify({
        runId: "slrun_bad_date",
        ownerId: "user_eval_1",
        status: "running",
        updatedAt: "nope",
      })),
    ).toBeNull();
  });
});
