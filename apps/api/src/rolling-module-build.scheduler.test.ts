import { describe, expect, it, vi } from "vitest";

const { enqueueRollingModuleBuildJob } = vi.hoisted(() => ({
  enqueueRollingModuleBuildJob: vi.fn(async () => ({ enqueued: true, jobId: "gjob_1" })),
}));

vi.mock("@studyagent/wiki-generation", () => ({
  enqueueRollingModuleBuildJob,
}));

vi.mock("@studyagent/observability", () => ({
  recordGenerationLifecycleMetric: vi.fn(),
}));

import { scheduleRollingModuleBuild } from "./rolling-module-build-scheduler.js";

function mockDbWithModules(
  completedModule: { id: string; orderIndex: number },
  nextModule: { id: string; orderIndex: number },
) {
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([completedModule]),
        orderBy: vi.fn().mockResolvedValue([completedModule, nextModule]),
      }),
    }),
  });
  return { db: { select } } as never;
}

describe("scheduleRollingModuleBuild", () => {
  it("enqueues learner jump triggers for rolling module build", async () => {
    const dbClient = mockDbWithModules(
      { id: "mod_1", orderIndex: 0 },
      { id: "mod_2", orderIndex: 1 },
    );
    await scheduleRollingModuleBuild(dbClient, {
      notebookId: "nb_1",
      curriculumId: "cur_1",
      completedModuleId: "mod_1",
      trigger: "learner_jump",
    });
    expect(enqueueRollingModuleBuildJob).toHaveBeenCalledWith(
      dbClient,
      expect.objectContaining({
        notebookId: "nb_1",
        curriculumId: "cur_1",
        completedModuleId: "mod_1",
        nextModuleId: "mod_2",
        trigger: "learner_jump",
      }),
    );
  });
});
