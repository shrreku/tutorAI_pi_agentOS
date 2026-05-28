import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
} from "@studyagent/db";
import { syntheticLearnerEvalTracerBulletFixture } from "@studyagent/schemas";
import type { AppContext } from "../context.js";
import { registerEvalSourceFixtureRoutes } from "./eval-source-fixtures.js";

vi.mock("../auth.js", () => ({
  resolveActor: vi.fn(async () => ({ id: "user_eval_1" })),
}));

class FakeDb {
  inserted = new Map<unknown, Array<Record<string, unknown>>>();
  updates = new Map<unknown, Array<Record<string, unknown>>>();

  transaction<T>(fn: (tx: FakeDb) => Promise<T>): Promise<T> {
    return fn(this);
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
          const existing = this.updates.get(table) ?? [];
          existing.push(values);
          this.updates.set(table, existing);
        },
      }),
    };
  }
}

describe("eval source fixture import route", () => {
  let app = Fastify();
  let fakeDb: FakeDb;

  beforeEach(async () => {
    fakeDb = new FakeDb();
    app = Fastify();
    const ctx = {
      db: { db: fakeDb },
      env: {},
    } as unknown as AppContext;
    await registerEvalSourceFixtureRoutes(app, ctx);
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates an eval-owned notebook from the fixture without mutating the fixture", async () => {
    const before = structuredClone(syntheticLearnerEvalTracerBulletFixture);

    const response = await app.inject({
      method: "POST",
      url: "/eval/source-fixtures/fixture_synthetic_learner_001/notebooks",
      payload: { title: "Eval Imported Notebook" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      notebook: { id: string; ownerId: string; title: string; settingsJson: Record<string, unknown> };
      seededRowCounts: Record<string, number>;
    };

    expect(body.notebook.ownerId).toBe("user_eval_1");
    expect(body.notebook.title).toBe("Eval Imported Notebook");
    expect(body.notebook.id).toMatch(/^nb_eval_fixture_synthetic_learner_001_/);
    expect(body.notebook.settingsJson).toMatchObject({
      evalSourceFixture: {
        fixtureId: syntheticLearnerEvalTracerBulletFixture.id,
        compatibilityStatus: "compatible",
      },
    });
    expect(body.seededRowCounts).toMatchObject({
      notebooks: 1,
      sources: 1,
      sourceVersions: 1,
      chunks: 1,
      concepts: 1,
      curricula: 1,
      curriculumModules: 1,
      objectiveLists: 1,
      objectives: 1,
      sessionPlans: 1,
      wikiPages: 1,
    });

    expect(fakeDb.inserted.get(notebooks)).toHaveLength(1);
    expect(fakeDb.inserted.get(sources)).toHaveLength(1);
    expect(fakeDb.inserted.get(sourceVersions)).toHaveLength(1);
    expect(fakeDb.inserted.get(chunks)).toHaveLength(1);
    expect(fakeDb.inserted.get(concepts)).toHaveLength(1);
    expect(fakeDb.inserted.get(curricula)).toHaveLength(1);
    expect(fakeDb.inserted.get(curricula)?.[0]?.activeModuleId).toBeNull();
    expect(fakeDb.inserted.get(curriculumModules)).toHaveLength(1);
    expect(fakeDb.inserted.get(objectiveLists)).toHaveLength(1);
    expect(fakeDb.inserted.get(objectives)).toHaveLength(1);
    expect(fakeDb.inserted.get(sessionPlans)).toHaveLength(1);
    expect(fakeDb.inserted.get(wikiPages)).toHaveLength(1);

    const notebookId = body.notebook.id;
    expect(fakeDb.updates.get(curricula)?.[0]?.activeModuleId).toContain(notebookId);
    expect(fakeDb.inserted.get(sources)?.[0]?.notebookId).toBe(notebookId);
    expect(fakeDb.inserted.get(sourceVersions)?.[0]?.sourceId).toContain(notebookId);
    expect(fakeDb.inserted.get(chunks)?.[0]?.sourceVersionId).toContain(notebookId);
    expect(fakeDb.inserted.get(concepts)?.[0]?.notebookId).toBe(notebookId);
    expect(fakeDb.inserted.get(curricula)?.[0]?.notebookId).toBe(notebookId);
    expect(fakeDb.inserted.get(curriculumModules)?.[0]?.notebookId).toBe(notebookId);
    expect(fakeDb.inserted.get(objectiveLists)?.[0]?.notebookId).toBe(notebookId);
    expect(fakeDb.inserted.get(objectives)?.[0]?.notebookId).toBe(notebookId);
    expect(fakeDb.inserted.get(sessionPlans)?.[0]?.notebookId).toBe(notebookId);
    expect(fakeDb.inserted.get(wikiPages)?.[0]?.notebookId).toBe(notebookId);

    expect(syntheticLearnerEvalTracerBulletFixture).toEqual(before);
  });
});
