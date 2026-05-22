import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syntheticLearnerEvalRuns } from "@studyagent/db";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerEvalRunRecord,
  syntheticLearnerEvalTracerBulletFixture,
  syntheticLearnerEvalTracerBulletPersonas,
  syntheticLearnerEvalTracerBulletScenarios,
} from "@studyagent/schemas";
import type { AppContext } from "../context.js";
import { registerEvalRunRoutes } from "./eval-runs.js";

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
        traceRefs: [],
        notebookRefs: [{ refType: "notebook", refId: `nb_eval_${index}` }],
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
});
