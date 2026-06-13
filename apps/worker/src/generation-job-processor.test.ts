import { describe, expect, it, vi } from "vitest";

const {
  claimNextGenerationJob,
  completeGenerationJob,
  failGenerationJob,
  runInitialBuild,
  runRollingModuleBuild,
  resumePendingBackgroundWikiPolishes,
} = vi.hoisted(() => ({
  claimNextGenerationJob: vi.fn(),
  completeGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  runInitialBuild: vi.fn(async () => ({ ok: true })),
  runRollingModuleBuild: vi.fn(async () => ({ ok: true, moduleId: "mod_2" })),
  resumePendingBackgroundWikiPolishes: vi.fn(async () => ({ processed: 0, completed: 0, failed: 0 })),
}));

vi.mock("@studyagent/db", () => ({
  claimNextGenerationJob,
  completeGenerationJob,
  failGenerationJob,
}));

vi.mock("@studyagent/wiki-generation", () => ({
  runInitialBuild,
  runRollingModuleBuild,
  resumePendingBackgroundWikiPolishes,
}));

vi.mock("@studyagent/observability", () => ({
  recordGenerationLifecycleMetric: vi.fn(),
}));

import { processNextGenerationJob } from "./generation-job-processor.js";

const env = {} as never;
const dbClient = {} as never;

describe("processNextGenerationJob", () => {
  it("runs initial build with claimed job id", async () => {
    claimNextGenerationJob.mockResolvedValueOnce({
      id: "gjob_1",
      jobName: "initial_build",
      notebookId: "nb_1",
      payloadJson: { curriculumId: "cur_1", moduleId: "mod_1", sourceId: "src_1" },
    });

    const result = await processNextGenerationJob(env, dbClient, { workerId: "worker_test" });

    expect(result.processed).toBe(true);
    expect(runInitialBuild).toHaveBeenCalledWith(
      env,
      dbClient,
      expect.objectContaining({ generationJobId: "gjob_1", notebookId: "nb_1" }),
    );
    expect(completeGenerationJob).not.toHaveBeenCalled();
  });

  it("completes wiki_touch_background jobs after resume", async () => {
    claimNextGenerationJob.mockResolvedValueOnce({
      id: "gjob_touch",
      jobName: "wiki_touch_background",
      notebookId: "nb_1",
      payloadJson: { pageId: "wp_1" },
    });

    await processNextGenerationJob(env, dbClient, { workerId: "worker_test" });

    expect(resumePendingBackgroundWikiPolishes).toHaveBeenCalledWith(env, dbClient, {
      maxPages: 1,
      notebookId: "nb_1",
      pageId: "wp_1",
    });
    expect(completeGenerationJob).toHaveBeenCalledWith(dbClient, {
      jobId: "gjob_touch",
      resultJson: { ok: true, resumed: true },
    });
  });

  it("fails jobs that throw unexpectedly", async () => {
    claimNextGenerationJob.mockResolvedValueOnce({
      id: "gjob_fail",
      jobName: "initial_build",
      notebookId: "nb_1",
      payloadJson: {},
    });
    runInitialBuild.mockRejectedValueOnce(new Error("boom"));

    await processNextGenerationJob(env, dbClient, { workerId: "worker_test" });

    expect(failGenerationJob).toHaveBeenCalledWith(dbClient, {
      jobId: "gjob_fail",
      error: "boom",
    });
  });
});
