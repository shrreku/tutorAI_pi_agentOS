import type { StudyAgentEnv } from "@studyagent/config";
import {
  concepts,
  createDb,
  curricula,
  curriculumModules,
  events,
  generationJobs,
  notebooks,
  objectives,
  objectiveLists,
  users,
  wikiPages,
} from "@studyagent/db";
import { buildGenerationIdempotencyKey } from "@studyagent/schemas";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { beginGenerationJob } from "./generation-job-lifecycle.js";
import {
  resetGenerationTargetCacheForTests,
  runInitialBuild,
  runRollingModuleBuild,
} from "./rolling-generation.js";
import type { WikiPolishExecutorResult } from "./wiki-polish-executor.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://studyagent:studyagent@127.0.0.1:5433/studyagent";
const shouldRun = process.env.RUN_POSTGRES_INTEGRATION === "1";

const { mockExecuteWikiPagePolish } = vi.hoisted(() => ({
  mockExecuteWikiPagePolish: vi.fn<() => Promise<WikiPolishExecutorResult>>(async () => ({
    ok: true,
    pageId: "wp_mock",
    pageKey: "mock",
    applied: true,
    fallbackUsed: false,
    pageReadiness: "ready_to_study" as const,
    learnerStatusLabel: "Ready to study",
    qualityIssues: [],
  })),
}));

vi.mock("./wiki-polish-executor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./wiki-polish-executor.js")>();
  return {
    ...actual,
    executeWikiPagePolish: mockExecuteWikiPagePolish,
  };
});

describe("rolling generation postgres integration", () => {
  const suffix = `${Date.now()}`;
  const notebookId = `nb_roll_pg_${suffix}`;
  const curriculumId = `cur_roll_pg_${suffix}`;
  const module1Id = `mod_roll_1_${suffix}`;
  const module2Id = `mod_roll_2_${suffix}`;
  const sourceId = `src_roll_pg_${suffix}`;
  const concept1Id = `cnc_roll_1_${suffix}`;
  const concept2Id = `cnc_roll_2_${suffix}`;
  let dbClient: ReturnType<typeof createDb>;
  let connected = false;

  beforeAll(async () => {
    if (!shouldRun) return;
    try {
      dbClient = createDb(DATABASE_URL);
      await dbClient.db.select({ id: users.id }).from(users).limit(1);
      connected = true;
      const now = new Date();
      await dbClient.db.insert(users).values({
        id: `usr_roll_pg_${suffix}`,
        email: `roll_pg_${suffix}@example.com`,
        displayName: "Rolling PG Test",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });
      await dbClient.db.insert(notebooks).values({
        id: notebookId,
        ownerId: `usr_roll_pg_${suffix}`,
        title: "Rolling PG Notebook",
        defaultMode: "explore",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });
      await dbClient.db.insert(curricula).values({
        id: curriculumId,
        notebookId,
        title: "Heat transfer path",
        curriculumType: "from_sources",
        scopeJson: {},
        status: "active",
        activeModuleId: module1Id,
        sourceIds: [sourceId],
        coverageSummaryJson: {},
        confidence: 0.7,
        createdAt: now,
        updatedAt: now,
      });
      await dbClient.db.insert(curriculumModules).values([
        {
          id: module1Id,
          notebookId,
          curriculumId,
          title: "Module 1",
          summary: "Conduction basics",
          orderIndex: 0,
          status: "active",
          targetConceptIds: [concept1Id],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: module2Id,
          notebookId,
          curriculumId,
          title: "Module 2",
          summary: "Advanced transfer",
          orderIndex: 1,
          status: "not_started",
          targetConceptIds: [concept2Id],
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await dbClient.db.insert(concepts).values([
        {
          id: concept1Id,
          notebookId,
          canonicalName: "Conduction",
          conceptType: "concept",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: concept2Id,
          notebookId,
          canonicalName: "Radiation",
          conceptType: "concept",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await dbClient.db.insert(wikiPages).values([
        {
          id: `wp_mod1_${suffix}`,
          notebookId,
          pageType: "module",
          pageKey: `module:${module1Id}`,
          title: "Module 1",
          markdown: "# Module 1",
          structuredJson: { moduleId: module1Id, deepBuilt: false },
          sourceClaimIds: [],
          sourceChunkIds: [],
          qualityScore: 0.5,
          status: "draft",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `wp_mod2_${suffix}`,
          notebookId,
          pageType: "module",
          pageKey: `module:${module2Id}`,
          title: "Module 2",
          markdown: "# Module 2",
          structuredJson: { moduleId: module2Id, deepBuilt: false },
          sourceClaimIds: [],
          sourceChunkIds: [],
          qualityScore: 0.5,
          status: "draft",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `wp_cnc2_${suffix}`,
          notebookId,
          pageType: "concept",
          pageKey: `concept:${concept2Id}`,
          title: "Concept Radiation",
          markdown: "# Radiation",
          structuredJson: { conceptId: concept2Id },
          sourceClaimIds: [],
          sourceChunkIds: [],
          qualityScore: 0.5,
          status: "draft",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    } catch {
      connected = false;
    }
  }, 30_000);

  afterAll(async () => {
    if (!connected) return;
    await dbClient.db.delete(notebooks).where(eq(notebooks.id, notebookId));
    await dbClient.sql.end();
  });

  it("runs initial build for module 1 and records a completed generation job", async () => {
    if (!shouldRun || !connected) return;
    resetGenerationTargetCacheForTests();
    mockExecuteWikiPagePolish.mockClear();
    mockExecuteWikiPagePolish.mockResolvedValueOnce({
      ok: false,
      pageId: `wp_mod1_${suffix}`,
      pageKey: `module:${module1Id}`,
      applied: false,
      fallbackUsed: true,
      pageReadiness: "still_improving",
      learnerStatusLabel: "Still improving",
      qualityIssues: [
        { code: "llm_unavailable", message: "LLM polish unavailable.", severity: "error" },
      ],
      reason: "llm_unavailable:wiki_polish timed out after 8000ms",
    });

    const env = { OPENROUTER_API_KEY: "" } as StudyAgentEnv;
    const result = await runInitialBuild(env, dbClient, {
      notebookId,
      curriculumId,
      moduleId: module1Id,
      sourceId,
    });

    expect(result.ok).toBe(true);
    expect(mockExecuteWikiPagePolish.mock.calls.length).toBeGreaterThan(0);

    const moduleObjectives = await dbClient.db
      .select()
      .from(objectives)
      .where(eq(objectives.notebookId, notebookId));
    expect(moduleObjectives.length).toBeGreaterThan(0);

    const [modulePage] = await dbClient.db
      .select({ structuredJson: wikiPages.structuredJson })
      .from(wikiPages)
      .where(eq(wikiPages.pageKey, `module:${module1Id}`))
      .limit(1);
    expect(modulePage?.structuredJson?.deepBuilt).toBe(true);

    const idempotencyKey = buildGenerationIdempotencyKey({
      notebookId,
      targetType: "initial_build",
      targetRef: module1Id,
      generationMode: "initial_build",
      trigger: "initial_build",
    });
    const [job] = await dbClient.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.idempotencyKey, idempotencyKey))
      .limit(1);
    expect(job?.status).toBe("completed");
    expect(job?.resultJson?.degraded).toBe(true);
    expect(job?.resultJson?.polishFailureCount).toBe(1);

    const buildEvents = await dbClient.db
      .select({ eventType: events.eventType, payloadJson: events.payloadJson })
      .from(events)
      .where(eq(events.notebookId, notebookId));
    const completed = buildEvents.find(
      (event) => event.eventType === "generation.initial_build.completed",
    );
    expect(completed?.payloadJson?.degraded).toBe(true);
    expect(completed?.payloadJson?.polishFailureCount).toBe(1);
  });

  it("requeues a failed idempotent generation job with attempts reset", async () => {
    if (!shouldRun || !connected) return;
    const idempotencyKey = `nb_roll_pg_${suffix}:initial_build:retry:initial_build:initial_build`;
    const input = {
      jobName: "initial_build" as const,
      notebookId,
      idempotencyKey,
      targetType: "initial_build" as const,
      generationMode: "initial_build" as const,
      trigger: "initial_build" as const,
      payloadJson: { curriculumId, moduleId: module1Id, sourceId },
    };
    const first = await beginGenerationJob(dbClient, input);
    await dbClient.db
      .update(generationJobs)
      .set({
        status: "failed",
        attemptsStarted: 3,
        lockedAt: new Date(),
        lockedBy: "test_worker",
        lastError: "wiki_polish timed out after 8000ms",
        runAt: new Date(Date.now() + 60_000),
      })
      .where(eq(generationJobs.id, first.job.id));

    const retried = await beginGenerationJob(dbClient, input);

    expect(retried.skip).toBe(false);
    expect(retried.job.id).toBe(first.job.id);
    expect(retried.job.status).toBe("queued");
    expect(retried.job.attemptsStarted).toBe(0);
  });

  it("deep-builds module 2 after module 1 milestone via rolling module build", async () => {
    if (!shouldRun || !connected) return;
    resetGenerationTargetCacheForTests();
    mockExecuteWikiPagePolish.mockClear();

    const env = { OPENROUTER_API_KEY: "" } as StudyAgentEnv;
    const result = await runRollingModuleBuild(env, dbClient, {
      notebookId,
      curriculumId,
      completedModuleId: module1Id,
      sourceId,
      trigger: "module_milestone",
    });

    expect(result.ok).toBe(true);
    expect(result.moduleId).toBe(module2Id);

    const module2Objectives = await dbClient.db
      .select()
      .from(objectives)
      .where(eq(objectives.notebookId, notebookId));
    const module2ObjectiveList = await dbClient.db
      .select()
      .from(objectiveLists)
      .where(eq(objectiveLists.moduleId, module2Id))
      .limit(1);

    expect(module2Objectives.some((row) => row.title.length > 0)).toBe(true);
    expect(module2ObjectiveList[0]?.objectiveIdsOrdered.length).toBeGreaterThan(0);

    const [module2Page] = await dbClient.db
      .select({ structuredJson: wikiPages.structuredJson })
      .from(wikiPages)
      .where(eq(wikiPages.pageKey, `module:${module2Id}`))
      .limit(1);
    expect(module2Page?.structuredJson?.deepBuilt).toBe(true);
    expect(module2Page?.structuredJson?.lastGenerationTargetKey).toBeTruthy();
  });
});
